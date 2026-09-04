import {
  MAX_ARCHIVE_FILE_BYTES,
  archiveImageMimeType,
  readZipArchive,
  type ZipImportSettings,
  type ZipMetadataStatus,
} from "../core/archive/zipImport";
import { inspectApng } from "../core/apng/inspect";
import type { ApngInfo, DecodedDocument } from "../core/apng/types";
import {
  DEFAULT_BODY_DURATION_MS,
  DEFAULT_COVER_DURATION_MS,
  type ComicPage,
} from "../core/comic/types";
import { naturalSorted } from "../core/comic/naturalSort";
import {
  importImage,
  importImageRegion,
  releasePage,
  type ImageRegion,
} from "../core/image/importer";
import { PRIVATE_FORMAT_NAME } from "../core/metadata";
import { decodeComic } from "../workers/client";

export type ImportNotice = "zip_metadata_malformed" | "zip_metadata_mismatch";

export interface DocumentImportResult {
  pages: ComicPage[];
  failures: number;
  notices: ImportNotice[];
  settings?: ZipImportSettings;
}

interface ImportedGroup {
  pages: ComicPage[];
  settings?: ZipImportSettings;
  metadataStatus?: ZipMetadataStatus;
}

function isZip(file: File): boolean {
  return /\.zip$/i.test(file.name) || new Set([
    "application/zip",
    "application/x-zip-compressed",
  ]).has(file.type);
}

function isPng(file: File): boolean {
  return /\.(?:apng|png)$/i.test(file.name) || new Set([
    "image/apng",
    "image/png",
  ]).has(file.type);
}

function isImage(file: File): boolean {
  return file.type.startsWith("image/") || /\.(?:apng|bmp|gif|jpe?g|png|webp)$/i.test(file.name);
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function apngSettings(info: ApngInfo): ZipImportSettings {
  const privateMetadata = info.metadata.privateMetadata;
  const trusted = privateMetadata.format === PRIVATE_FORMAT_NAME ? privateMetadata : {};
  return {
    readingDirection: trusted.reading_direction === "rtl" ? "rtl" : "ltr",
    coverDurationMs: positiveInteger(
      trusted.cover_duration_ms,
      DEFAULT_COVER_DURATION_MS,
    ),
    bodyDurationMs: positiveInteger(
      trusted.body_duration_ms,
      DEFAULT_BODY_DURATION_MS,
    ),
    ...(typeof info.metadata.text.Title === "string"
      ? { title: info.metadata.text.Title }
      : {}),
    ...(typeof info.metadata.text.Author === "string"
      ? { author: info.metadata.text.Author }
      : {}),
  };
}

function apngCoverIndex(info: ApngInfo): number {
  const privateMetadata = info.metadata.privateMetadata;
  if (privateMetadata.format !== PRIVATE_FORMAT_NAME) return 0;
  const value = privateMetadata.cover_index;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < info.frameCount
    ? value
    : 0;
}

function frameRegion(info: ApngInfo, index: number): ImageRegion | null {
  const privateMetadata = info.metadata.privateMetadata;
  if (privateMetadata.format !== PRIVATE_FORMAT_NAME) return null;
  const pages: unknown = privateMetadata.pages;
  if (!Array.isArray(pages) || pages.length !== info.frameCount) return null;
  const value: unknown = pages[index];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const page = value as Record<string, unknown>;
  const keys = [
    "source_width",
    "source_height",
    "render_width",
    "render_height",
    "offset_x",
    "offset_y",
  ] as const;
  if (keys.some((key) => typeof page[key] !== "number" || !Number.isInteger(page[key]))) {
    return null;
  }
  const sourceWidth = page.source_width as number;
  const sourceHeight = page.source_height as number;
  const renderWidth = page.render_width as number;
  const renderHeight = page.render_height as number;
  const left = page.offset_x as number;
  const top = page.offset_y as number;
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    renderWidth <= 0 ||
    renderHeight <= 0 ||
    left < 0 ||
    top < 0 ||
    left + renderWidth > info.width ||
    top + renderHeight > info.height
  ) {
    return null;
  }
  return {
    left,
    top,
    width: renderWidth,
    height: renderHeight,
    targetWidth: sourceWidth,
    targetHeight: sourceHeight,
  };
}

function frameName(sourceName: string, index: number): string {
  const stem = sourceName.replace(/\.[^.]*$/, "") || "page";
  return `${stem}-${index + 1}.png`;
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function materializeApng(
  source: File,
  document: DecodedDocument,
  allowCover: boolean,
): Promise<ImportedGroup> {
  if (document.frames.length !== document.info.frameCount || document.frames.length === 0) {
    throw new Error("apng.frame_count_mismatch");
  }
  const pages: ComicPage[] = [];
  const coverIndex = apngCoverIndex(document.info);
  try {
    for (let index = 0; index < document.frames.length; index += 1) {
      const frame = document.frames[index];
      if (!frame) throw new Error("apng.frame_missing");
      const name = frameName(source.name, index);
      const file = new File([frame.png], name, {
        type: "image/png",
        lastModified: source.lastModified,
      });
      const isCover = allowCover && index === coverIndex;
      const region = frameRegion(document.info, index);
      let page: ComicPage;
      if (region) {
        page = await importImageRegion(file, name, region, isCover);
      } else if (frame.thumbnail) {
        page = {
          id: crypto.randomUUID(),
          file,
          name,
          width: document.info.width,
          height: document.info.height,
          thumbnailUrl: URL.createObjectURL(
            new Blob([frame.thumbnail], { type: "image/png" }),
          ),
          isCover,
        };
      } else {
        page = await importImage(file, isCover);
      }
      page.durationMs = document.info.durationsMs[index] ?? 1000;
      pages.push(page);
    }
    return { pages, settings: apngSettings(document.info) };
  } catch (error) {
    pages.forEach(releasePage);
    throw error;
  }
}

async function importPng(file: File, allowCover: boolean): Promise<ImportedGroup> {
  const buffer = await file.arrayBuffer();
  let info: ApngInfo;
  try {
    info = inspectApng(new Uint8Array(buffer));
  } catch (error) {
    if (/\.apng$/i.test(file.name) || file.type === "image/apng") throw error;
    return { pages: [await importImage(file, allowCover)] };
  }
  if (!info.isAnimated) return { pages: [await importImage(file, allowCover)] };
  const document = await decodeComic(
    buffer,
    { thumbnails: true, preserveMetadata: false },
  ).promise;
  return materializeApng(file, document, allowCover);
}

async function importZip(file: File, allowCover: boolean): Promise<ImportedGroup> {
  if (file.size > MAX_ARCHIVE_FILE_BYTES) throw new Error("archive.resource_limit");
  const archive = readZipArchive(new Uint8Array(await file.arrayBuffer()));
  const pages: ComicPage[] = [];
  try {
    for (const value of archive.pages) {
      const mimeType = archiveImageMimeType(value.name);
      if (!mimeType) throw new Error("archive.image_type");
      const page = await importImage(
        new File([ownedArrayBuffer(value.bytes)], value.name, {
          type: mimeType,
          lastModified: file.lastModified,
        }),
        allowCover && value.isCover,
      );
      page.durationMs = value.durationMs;
      pages.push(page);
    }
    return {
      pages,
      metadataStatus: archive.metadataStatus,
      ...(archive.settings ? { settings: archive.settings } : {}),
    };
  } catch (error) {
    pages.forEach(releasePage);
    throw error;
  }
}

async function importGroup(file: File, allowCover: boolean): Promise<ImportedGroup> {
  if (isZip(file)) return importZip(file, allowCover);
  if (isPng(file)) return importPng(file, allowCover);
  if (isImage(file)) return { pages: [await importImage(file, allowCover)] };
  throw new Error("image.unsupported_type");
}

export async function importComicFiles(
  files: File[],
  hasExistingPages: boolean,
): Promise<DocumentImportResult> {
  const pages: ComicPage[] = [];
  const notices = new Set<ImportNotice>();
  let settings: ZipImportSettings | undefined;
  let failures = 0;
  let hasCover = hasExistingPages;
  for (const file of naturalSorted(files)) {
    const wasEmpty = !hasExistingPages && pages.length === 0;
    try {
      const group = await importGroup(file, !hasCover);
      if (wasEmpty && group.settings) settings = group.settings;
      pages.push(...group.pages);
      if (group.pages.some((page) => page.isCover)) hasCover = true;
      if (group.metadataStatus === "mismatch") notices.add("zip_metadata_mismatch");
      if (group.metadataStatus === "malformed") notices.add("zip_metadata_malformed");
    } catch {
      failures += 1;
    }
  }
  return {
    pages,
    failures,
    notices: [...notices],
    ...(settings ? { settings } : {}),
  };
}
