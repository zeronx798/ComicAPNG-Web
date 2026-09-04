import { strFromU8, unzipSync, type UnzipFileInfo } from "fflate";
import {
  DEFAULT_BODY_DURATION_MS,
  DEFAULT_COVER_DURATION_MS,
  type ReadingDirection,
} from "../comic/types";
import { naturalCompare } from "../comic/naturalSort";

export const ARCHIVE_METADATA_NAME = "metadata.json";
export const ARCHIVE_FORMAT_NAME = "ComicAPNG";
export const ARCHIVE_SCHEMA_VERSION = 1;
export const MAX_ARCHIVE_FILE_BYTES = 512 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 10_000;
export const MAX_ARCHIVE_ENTRY_BYTES = 512 * 1024 * 1024;
export const MAX_ARCHIVE_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_ARCHIVE_METADATA_BYTES = 8 * 1024 * 1024;

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".bmp": "image/bmp",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const PRIVATE_METADATA_KEY = "ComicAPNG.Metadata";
const MAX_TEXT_FIELDS = 128;
const MAX_TEXT_VALUE_BYTES = 1024 * 1024;
const MAX_TEXT_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_PRIVATE_BYTES = 1024 * 1024;

export type ZipMetadataStatus = "absent" | "valid" | "mismatch" | "malformed";

export type ZipImportErrorCode =
  | "archive.invalid"
  | "archive.no_images"
  | "archive.resource_limit"
  | "archive.unsafe_path"
  | "archive.duplicate_name"
  | "archive.encrypted"
  | "archive.unsupported_compression";

export class ZipImportError extends Error {
  readonly code: ZipImportErrorCode;

  constructor(code: ZipImportErrorCode) {
    super(code);
    this.name = "ZipImportError";
    this.code = code;
  }
}

export interface ZipImportPage {
  name: string;
  bytes: Uint8Array;
  isCover: boolean;
  durationMs?: number;
}

export interface ZipImportSettings {
  readingDirection: ReadingDirection;
  coverDurationMs: number;
  bodyDurationMs: number;
  title?: string;
  author?: string;
}

export interface ZipImportDocument {
  pages: ZipImportPage[];
  metadataStatus: ZipMetadataStatus;
  settings?: ZipImportSettings;
}

interface InspectedEntry extends UnzipFileInfo {
  directory: boolean;
}

interface CentralEntry {
  name: string;
  flags: number;
  compression: number;
}

interface PageRecord {
  filename: string;
  durationMs?: number;
}

interface ParsedMetadata {
  settings: ZipImportSettings;
  pages: PageRecord[];
  cover?: string;
}

function extension(name: string): string {
  const slash = name.lastIndexOf("/");
  const dot = name.lastIndexOf(".");
  return dot > slash ? name.slice(dot).toLowerCase() : "";
}

export function archiveImageMimeType(name: string): string | undefined {
  return IMAGE_MIME_TYPES[extension(name)];
}

export function isSafeArchiveName(name: string): boolean {
  if (!name || name.length > 4096 || name.includes("\0") || name.includes("\\")) {
    return false;
  }
  if (name.startsWith("/")) return false;
  const candidate = name.endsWith("/") ? name.slice(0, -1) : name;
  if (!candidate) return false;
  const parts = candidate.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return false;
  return !parts[0]?.includes(":");
}

function fail(code: ZipImportErrorCode): never {
  throw new ZipImportError(code);
}

function uint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) fail("archive.invalid");
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function uint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) fail("archive.invalid");
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function endOfCentralDirectory(bytes: Uint8Array): number {
  const first = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= first; offset -= 1) {
    if (
      uint32(bytes, offset) === 0x06054b50 &&
      offset + 22 + uint16(bytes, offset + 20) === bytes.byteLength
    ) {
      return offset;
    }
  }
  fail("archive.invalid");
}

function centralEntries(bytes: Uint8Array): CentralEntry[] {
  const end = endOfCentralDirectory(bytes);
  if (uint16(bytes, end + 4) !== 0 || uint16(bytes, end + 6) !== 0) {
    fail("archive.invalid");
  }
  const diskEntries = uint16(bytes, end + 8);
  const entryCount = uint16(bytes, end + 10);
  const centralSize = uint32(bytes, end + 12);
  const centralOffset = uint32(bytes, end + 16);
  if (
    diskEntries !== entryCount ||
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff ||
    entryCount > MAX_ARCHIVE_ENTRIES ||
    centralOffset + centralSize > end
  ) {
    fail(entryCount > MAX_ARCHIVE_ENTRIES ? "archive.resource_limit" : "archive.invalid");
  }
  const entries: CentralEntry[] = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (uint32(bytes, offset) !== 0x02014b50) fail("archive.invalid");
    const flags = uint16(bytes, offset + 8);
    const compression = uint16(bytes, offset + 10);
    const nameLength = uint16(bytes, offset + 28);
    const extraLength = uint16(bytes, offset + 30);
    const commentLength = uint16(bytes, offset + 32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end || next > centralOffset + centralSize) fail("archive.invalid");
    const name = strFromU8(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
      (flags & 0x0800) === 0,
    );
    entries.push({ name, flags, compression });
    offset = next;
  }
  if (offset > centralOffset + centralSize) fail("archive.invalid");
  return entries;
}

function inspectEntries(bytes: Uint8Array): InspectedEntry[] {
  if (bytes.byteLength > MAX_ARCHIVE_FILE_BYTES) fail("archive.resource_limit");
  let central: CentralEntry[];
  try {
    central = centralEntries(bytes);
  } catch (error) {
    if (error instanceof ZipImportError) throw error;
    fail("archive.invalid");
  }
  const names = new Set<string>();
  const entries: InspectedEntry[] = [];
  let totalBytes = 0;
  try {
    unzipSync(bytes, {
      filter: (entry) => {
        const centralEntry = central[entries.length];
        if (
          !centralEntry ||
          centralEntry.name !== entry.name ||
          centralEntry.compression !== entry.compression
        ) {
          fail("archive.invalid");
        }
        if (!isSafeArchiveName(entry.name)) fail("archive.unsafe_path");
        const directory = entry.name.endsWith("/");
        if (!directory) {
          if (names.has(entry.name)) fail("archive.duplicate_name");
          names.add(entry.name);
        }
        if (
          !Number.isSafeInteger(entry.originalSize) ||
          entry.originalSize < 0 ||
          entry.originalSize > MAX_ARCHIVE_ENTRY_BYTES
        ) {
          fail("archive.resource_limit");
        }
        totalBytes += entry.originalSize;
        if (totalBytes > MAX_ARCHIVE_TOTAL_BYTES) fail("archive.resource_limit");
        if (
          !directory &&
          (archiveImageMimeType(entry.name) || entry.name === ARCHIVE_METADATA_NAME) &&
          (centralEntry.flags & 0x0001) !== 0
        ) {
          fail("archive.encrypted");
        }
        if (
          !directory &&
          archiveImageMimeType(entry.name) &&
          entry.compression !== 0 &&
          entry.compression !== 8
        ) {
          fail("archive.unsupported_compression");
        }
        entries.push({ ...entry, directory });
        return false;
      },
    });
  } catch (error) {
    if (error instanceof ZipImportError) throw error;
    fail("archive.invalid");
  }
  if (entries.length !== central.length) fail("archive.invalid");
  return entries;
}

function extractEntries(bytes: Uint8Array, names: Set<string>): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes, { filter: (entry) => names.has(entry.name) });
  } catch {
    fail("archive.invalid");
  }
}

function naturalPages(
  entries: InspectedEntry[],
  extracted: Record<string, Uint8Array>,
): ZipImportPage[] {
  return entries
    .filter((entry) => !entry.directory && archiveImageMimeType(entry.name))
    .sort((left, right) => naturalCompare(left.name, right.name))
    .map((entry, index) => {
      const value = extracted[entry.name];
      if (!value || value.byteLength !== entry.originalSize) fail("archive.invalid");
      return { name: entry.name, bytes: value, isCover: index === 0 };
    });
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error("Invalid positive integer");
  }
  return value;
}

function validateJsonValue(value: unknown, depth = 0): void {
  if (depth > 20) throw new Error("Metadata is nested too deeply");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach((item) => validateJsonValue(item, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => validateJsonValue(item, depth + 1));
    return;
  }
  throw new Error("Metadata contains an invalid value");
}

function validateSource(value: unknown): void {
  if (value === undefined || value === null) return;
  const source = record(value, "Source metadata must be an object");
  if (
    typeof source.plugin_id !== "string" ||
    !source.plugin_id.trim() ||
    typeof source.resource_id !== "string" ||
    !source.resource_id.trim()
  ) {
    throw new Error("Source metadata identifiers are invalid");
  }
  const data = source.data ?? {};
  record(data, "Source metadata data must be an object");
  validateJsonValue(data);
}

function validateText(text: Record<string, unknown>): void {
  if (Object.keys(text).length > MAX_TEXT_FIELDS) throw new Error("Too many text fields");
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const [key, item] of Object.entries(text)) {
    const validKey =
      key.length >= 1 &&
      key.length <= 79 &&
      [...key].every((character) => character.codePointAt(0)! <= 0xff) &&
      !key.includes("\0") &&
      !key.startsWith(" ") &&
      !key.endsWith(" ") &&
      !key.includes("  ");
    const folded = key.toLowerCase();
    if (!validKey || seen.has(folded) || typeof item !== "string") {
      throw new Error("Text metadata is invalid");
    }
    if (key === PRIVATE_METADATA_KEY) throw new Error("Reserved text metadata key");
    seen.add(folded);
    const valueBytes = encoder.encode(item).byteLength;
    if (valueBytes > MAX_TEXT_VALUE_BYTES) throw new Error("Text metadata value is too large");
    totalBytes += key.length + valueBytes;
  }
  if (totalBytes > MAX_TEXT_TOTAL_BYTES) throw new Error("Text metadata is too large");
}

function parseBook(value: unknown, source: unknown): ZipImportSettings {
  const book = value === undefined ? {} : record(value, "Book metadata must be an object");
  const rawDirection = book.reading_direction ?? "ltr";
  if (rawDirection !== "ltr" && rawDirection !== "rtl") {
    throw new Error("Reading direction is invalid");
  }
  const text = book.text === undefined ? {} : record(book.text, "Text metadata must be an object");
  validateText(text);
  if (book.private !== undefined) {
    record(book.private, "Private metadata must be an object");
    validateJsonValue(book.private);
    if (new TextEncoder().encode(JSON.stringify(book.private)).byteLength > MAX_PRIVATE_BYTES) {
      throw new Error("Private metadata is too large");
    }
  }
  if (book.exif !== undefined) {
    const exif = record(book.exif, "EXIF metadata must be an object");
    for (const [tag, rawField] of Object.entries(exif)) {
      const field = record(rawField, "EXIF metadata field is invalid");
      if (
        !/^\d+$/.test(tag) ||
        !new Set(["text", "integer", "rational", "bytes"]).has(String(field.type)) ||
        typeof field.value !== "string"
      ) {
        throw new Error("EXIF metadata is invalid");
      }
    }
  }
  validateSource(source);
  return {
    readingDirection: rawDirection,
    coverDurationMs: positiveInteger(book.cover_duration_ms, DEFAULT_COVER_DURATION_MS),
    bodyDurationMs: positiveInteger(book.body_duration_ms, DEFAULT_BODY_DURATION_MS),
    ...(typeof text.Title === "string" ? { title: text.Title } : {}),
    ...(typeof text.Author === "string" ? { author: text.Author } : {}),
  };
}

function parseMetadata(value: unknown): ParsedMetadata {
  const root = record(value, "Archive metadata must be an object");
  if (root.format !== ARCHIVE_FORMAT_NAME || root.version !== ARCHIVE_SCHEMA_VERSION) {
    throw new Error("Archive metadata format is unsupported");
  }
  const rawPages = root.pages;
  if (!Array.isArray(rawPages) || rawPages.length === 0) {
    throw new Error("Archive page metadata is invalid");
  }
  const pages = rawPages.map((value): PageRecord => {
    const page = record(value, "Archive page metadata is invalid");
    if (typeof page.filename !== "string" || !isSafeArchiveName(page.filename)) {
      throw new Error("Archive page filename is invalid");
    }
    for (const key of ["source_width", "source_height"] as const) {
      if (page[key] !== undefined) positiveInteger(page[key]);
    }
    if (page.source !== undefined) {
      record(page.source, "Archive page source metadata is invalid");
      validateJsonValue(page.source);
    }
    return {
      filename: page.filename,
      ...(page.duration_ms !== undefined
        ? { durationMs: positiveInteger(page.duration_ms) }
        : {}),
    };
  });
  if (root.cover !== undefined && (typeof root.cover !== "string" || !isSafeArchiveName(root.cover))) {
    throw new Error("Archive cover reference is invalid");
  }
  return {
    settings: parseBook(root.book, root.source),
    pages,
    ...(typeof root.cover === "string" ? { cover: root.cover } : {}),
  };
}

function decodeMetadata(bytes: Uint8Array): ParsedMetadata {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return parseMetadata(JSON.parse(text) as unknown);
}

export function readZipArchive(bytes: Uint8Array): ZipImportDocument {
  const entries = inspectEntries(bytes);
  const imageEntries = entries.filter(
    (entry) => !entry.directory && archiveImageMimeType(entry.name),
  );
  if (imageEntries.length === 0) fail("archive.no_images");
  const imageNames = new Set(imageEntries.map((entry) => entry.name));
  const extracted = extractEntries(bytes, imageNames);
  const fallbackPages = naturalPages(imageEntries, extracted);
  const metadataEntry = entries.find(
    (entry) => !entry.directory && entry.name === ARCHIVE_METADATA_NAME,
  );
  if (!metadataEntry) return { pages: fallbackPages, metadataStatus: "absent" };
  if (
    metadataEntry.originalSize > MAX_ARCHIVE_METADATA_BYTES ||
    (metadataEntry.compression !== 0 && metadataEntry.compression !== 8)
  ) {
    return { pages: fallbackPages, metadataStatus: "malformed" };
  }

  let metadata: ParsedMetadata;
  try {
    const values = unzipSync(bytes, {
      filter: (entry) => entry.name === ARCHIVE_METADATA_NAME,
    });
    const value = values[ARCHIVE_METADATA_NAME];
    if (!value || value.byteLength !== metadataEntry.originalSize) {
      return { pages: fallbackPages, metadataStatus: "malformed" };
    }
    metadata = decodeMetadata(value);
  } catch {
    return { pages: fallbackPages, metadataStatus: "malformed" };
  }

  const referenced = metadata.pages.map((page) => page.filename);
  const referencedNames = new Set(referenced);
  const bindingMatches =
    referenced.length === referencedNames.size &&
    referencedNames.size === imageNames.size &&
    [...referencedNames].every((name) => imageNames.has(name)) &&
    (metadata.cover === undefined || referencedNames.has(metadata.cover));
  if (!bindingMatches) return { pages: fallbackPages, metadataStatus: "mismatch" };

  const pages = metadata.pages.map((page) => {
    const value = extracted[page.filename];
    if (!value) fail("archive.invalid");
    return {
      name: page.filename,
      bytes: value,
      isCover: page.filename === metadata.cover,
      ...(page.durationMs === undefined ? {} : { durationMs: page.durationMs }),
    };
  });
  return { pages, metadataStatus: "valid", settings: metadata.settings };
}
