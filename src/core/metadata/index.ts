import {
  decodeTextChunk,
  makeChunk,
  makeItext,
  parsePngChunks,
} from "../apng/png";
import type { ComicPrivateMetadata, PngMetadata } from "./types";

export const PRIVATE_METADATA_KEY = "ComicAPNG.Metadata";
export const PRIVATE_FORMAT_NAME = "ComicAPNG";
export const PRIVATE_SCHEMA_VERSION = 1;
const MAX_TEXT_FIELDS = 128;
const MAX_TEXT_BYTES = 4_194_304;
const MAX_PRIVATE_BYTES = 1_048_576;

export function decodePrivateMetadata(value: string | undefined): ComicPrivateMetadata {
  if (!value || new TextEncoder().encode(value).byteLength > MAX_PRIVATE_BYTES) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ComicPrivateMetadata)
      : {};
  } catch {
    return {};
  }
}

export function readPngMetadata(bytes: Uint8Array): PngMetadata {
  const text: Record<string, string> = {};
  let privateMetadata: ComicPrivateMetadata = {};
  let rawExif: Uint8Array | undefined;
  let totalTextBytes = 0;
  for (const chunk of parsePngChunks(bytes)) {
    if (chunk.type === "eXIf" && rawExif === undefined) {
      rawExif = chunk.data.slice();
      continue;
    }
    if (!new Set(["tEXt", "zTXt", "iTXt"]).has(chunk.type)) continue;
    const decoded = decodeTextChunk(chunk);
    if (!decoded) continue;
    const [key, value] = decoded;
    if (key === PRIVATE_METADATA_KEY) {
      privateMetadata = decodePrivateMetadata(value);
      continue;
    }
    totalTextBytes += new TextEncoder().encode(value).byteLength;
    if (Object.keys(text).length < MAX_TEXT_FIELDS && totalTextBytes <= MAX_TEXT_BYTES) {
      text[key] = value;
    }
  }
  return { text, privateMetadata, ...(rawExif ? { rawExif } : {}) };
}

export function metadataChunks(
  metadata: PngMetadata,
  includePrivate: boolean,
): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  if (metadata.rawExif && metadata.rawExif.byteLength > 0) {
    chunks.push(makeChunk("eXIf", metadata.rawExif));
  }
  for (const [key, value] of Object.entries(metadata.text)) {
    if (key !== PRIVATE_METADATA_KEY) {
      chunks.push(makeChunk("iTXt", makeItext(key, value)));
    }
  }
  if (includePrivate && Object.keys(metadata.privateMetadata).length > 0) {
    chunks.push(
      makeChunk("iTXt", makeItext(PRIVATE_METADATA_KEY, JSON.stringify(metadata.privateMetadata))),
    );
  }
  return chunks;
}

export type { ComicPrivateMetadata, ComicPrivatePage, PngMetadata } from "./types";
