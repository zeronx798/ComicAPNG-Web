import { parsePngChunks } from "./png";
import { readPngMetadata } from "../metadata";
import type { ApngInfo } from "./types";

export function inspectApng(bytes: Uint8Array): ApngInfo {
  const chunks = parsePngChunks(bytes);
  const header = chunks.find((chunk) => chunk.type === "IHDR");
  if (!header || header.data.byteLength !== 13) {
    throw new Error("png.invalid_header");
  }
  const view = new DataView(header.data.buffer, header.data.byteOffset, header.data.byteLength);
  const width = view.getUint32(0, false);
  const height = view.getUint32(4, false);
  if (width <= 0 || height <= 0) {
    throw new Error("png.invalid_dimensions");
  }
  const animation = chunks.find((chunk) => chunk.type === "acTL");
  let frameCount = 1;
  if (animation && animation.data.byteLength === 8) {
    frameCount = new DataView(
      animation.data.buffer,
      animation.data.byteOffset,
      animation.data.byteLength,
    ).getUint32(0, false);
  }
  if (frameCount <= 0 || frameCount > 100_000) {
    throw new Error("apng.invalid_frame_count");
  }
  const durationsMs = chunks
    .filter((chunk) => chunk.type === "fcTL" && chunk.data.byteLength === 26)
    .map((chunk) => {
      const frame = new DataView(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength);
      const numerator = frame.getUint16(20, false);
      const denominator = frame.getUint16(22, false) || 100;
      return Math.max(1, Math.round((numerator * 1000) / denominator));
    });
  while (durationsMs.length < frameCount) durationsMs.push(1000);
  return {
    width,
    height,
    frameCount,
    isAnimated: animation !== undefined,
    durationsMs: durationsMs.slice(0, frameCount),
    metadata: readPngMetadata(bytes),
  };
}
