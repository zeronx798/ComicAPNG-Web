import { unzlibSync, zlibSync } from "fflate";

export const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const latinDecoder = new TextDecoder("latin1");
const MAX_CHUNK_BYTES = 1_048_576;

export interface PngChunk {
  type: string;
  data: Uint8Array;
}

function crcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(parts: Uint8Array[]): number {
  let crc = 0xffffffff;
  for (const part of parts) {
    for (const byte of part) {
      const tableIndex = (crc ^ byte) & 0xff;
      crc = (CRC_TABLE[tableIndex] ?? 0) ^ (crc >>> 8);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function uint32(value: number): Uint8Array {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setUint32(0, value >>> 0, false);
  return result;
}

export function uint16(value: number): Uint8Array {
  const result = new Uint8Array(2);
  new DataView(result.buffer).setUint16(0, value, false);
  return result;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

export function makeChunk(type: string, data: Uint8Array): Uint8Array {
  if (!/^[A-Za-z]{4}$/.test(type)) {
    throw new Error("png.invalid_chunk_type");
  }
  const typeBytes = encoder.encode(type);
  return concatBytes([uint32(data.byteLength), typeBytes, data, uint32(crc32([typeBytes, data]))]);
}

export function parsePngChunks(bytes: Uint8Array): PngChunk[] {
  if (
    bytes.byteLength < PNG_SIGNATURE.byteLength ||
    PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)
  ) {
    throw new Error("png.invalid_signature");
  }
  const chunks: PngChunk[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.byteLength;
  while (offset + 12 <= bytes.byteLength) {
    const length = view.getUint32(offset, false);
    const end = offset + 12 + length;
    if (end > bytes.byteLength || chunks.length > 100_000) {
      throw new Error("png.invalid_chunk_length");
    }
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    chunks.push({ type, data: bytes.slice(offset + 8, offset + 8 + length) });
    offset = end;
    if (type === "IEND") break;
  }
  if (chunks.length === 0 || chunks.at(-1)?.type !== "IEND") {
    throw new Error("png.missing_iend");
  }
  return chunks;
}

export function makeItext(key: string, value: string): Uint8Array {
  validateTextKey(key);
  const keyBytes = Uint8Array.from([...key].map((character) => character.charCodeAt(0)));
  return concatBytes([keyBytes, new Uint8Array([0, 0, 0, 0, 0]), encoder.encode(value)]);
}

export function validateTextKey(key: string): void {
  if (key.length < 1 || key.length > 79 || key.includes("\0")) {
    throw new Error("metadata.invalid_text_key");
  }
  if (key.startsWith(" ") || key.endsWith(" ") || key.includes("  ")) {
    throw new Error("metadata.invalid_text_key");
  }
  if ([...key].some((character) => character.charCodeAt(0) > 255)) {
    throw new Error("metadata.invalid_text_key");
  }
}

function filteredRows(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const rowBytes = width * 4;
  if (rgba.byteLength !== rowBytes * height) {
    throw new Error("png.invalid_rgba_length");
  }
  const filtered = new Uint8Array((rowBytes + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const outputOffset = row * (rowBytes + 1);
    filtered[outputOffset] = 0;
    filtered.set(rgba.subarray(row * rowBytes, (row + 1) * rowBytes), outputOffset + 1);
  }
  return filtered;
}

export function compressRgba(width: number, height: number, rgba: Uint8Array): Uint8Array {
  return zlibSync(filteredRows(width, height, rgba), { level: 6 });
}

export function splitCompressed(data: Uint8Array): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < data.byteLength; offset += MAX_CHUNK_BYTES) {
    chunks.push(data.slice(offset, Math.min(data.byteLength, offset + MAX_CHUNK_BYTES)));
  }
  return chunks;
}

export function pngHeader(width: number, height: number): Uint8Array {
  return concatBytes([
    uint32(width),
    uint32(height),
    new Uint8Array([8, 6, 0, 0, 0]),
  ]);
}

export function encodeRgbaPng(
  width: number,
  height: number,
  rgba: Uint8Array,
  metadataChunks: Uint8Array[] = [],
): Uint8Array {
  const compressed = compressRgba(width, height, rgba);
  return concatBytes([
    PNG_SIGNATURE,
    makeChunk("IHDR", pngHeader(width, height)),
    ...metadataChunks,
    ...splitCompressed(compressed).map((part) => makeChunk("IDAT", part)),
    makeChunk("IEND", new Uint8Array()),
  ]);
}

export function decodeTextChunk(chunk: PngChunk): [string, string] | null {
  const firstNull = chunk.data.indexOf(0);
  if (firstNull <= 0) return null;
  const key = latinDecoder.decode(chunk.data.subarray(0, firstNull));
  try {
    if (chunk.type === "tEXt") {
      return [key, latinDecoder.decode(chunk.data.subarray(firstNull + 1))];
    }
    if (chunk.type === "zTXt") {
      if (chunk.data[firstNull + 1] !== 0) return null;
      return [key, latinDecoder.decode(unzlibSync(chunk.data.subarray(firstNull + 2)))];
    }
    if (chunk.type === "iTXt") {
      const flag = chunk.data[firstNull + 1];
      const method = chunk.data[firstNull + 2];
      let cursor = firstNull + 3;
      const languageEnd = chunk.data.indexOf(0, cursor);
      if (languageEnd < 0) return null;
      cursor = languageEnd + 1;
      const translatedEnd = chunk.data.indexOf(0, cursor);
      if (translatedEnd < 0) return null;
      cursor = translatedEnd + 1;
      const payload = chunk.data.subarray(cursor);
      if (flag === 0) return [key, decoder.decode(payload)];
      if (flag === 1 && method === 0) return [key, decoder.decode(unzlibSync(payload))];
    }
  } catch {
    return null;
  }
  return null;
}
