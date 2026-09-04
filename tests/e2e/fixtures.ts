import { unzlibSync } from "fflate";
import { ApngEncoder } from "../../src/core/apng/encoder";
import { metadataChunks } from "../../src/core/metadata";
import {
  PNG_SIGNATURE,
  compressRgba,
  concatBytes,
  encodeRgbaPng,
  makeChunk,
  parsePngChunks,
  pngHeader,
  uint16,
  uint32,
} from "../../src/core/apng/png";

export function makePng(
  width: number,
  height: number,
  color: [number, number, number, number],
): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) rgba.set(color, offset);
  return Buffer.from(encodeRgbaPng(width, height, rgba));
}

export function makeApng(): Buffer {
  const encoder = new ApngEncoder(6, 4, 2);
  const first = new Uint8Array(6 * 4 * 4);
  const second = new Uint8Array(6 * 4 * 4);
  for (let offset = 0; offset < first.length; offset += 4) {
    first.set([220, 30, 40, 255], offset);
    second.set([30, 200, 80, 255], offset);
  }
  encoder.addFrame(first, 3000);
  encoder.addFrame(second, 1000);
  return Buffer.from(encoder.finish());
}

export function makeSingleFrameApng(): Buffer {
  const encoder = new ApngEncoder(5, 3, 1);
  const frame = new Uint8Array(5 * 3 * 4);
  for (let offset = 0; offset < frame.length; offset += 4) {
    frame.set([60, 100, 220, 255], offset);
  }
  encoder.addFrame(frame, 640);
  return Buffer.from(encoder.finish());
}

export function makeEditableApng(): Buffer {
  const width = 6;
  const height = 4;
  const chunks = metadataChunks({
    text: { Title: "Imported APNG", Author: "Frame author" },
    privateMetadata: {
      format: "ComicAPNG",
      version: 1,
      cover_index: 1,
      reading_direction: "rtl",
      cover_duration_ms: 1800,
      body_duration_ms: 900,
      pages: [
        {
          source_width: 1,
          source_height: 2,
          render_width: 2,
          render_height: 4,
          offset_x: 2,
          offset_y: 0,
          duration_ms: 250,
        },
        {
          source_width: 3,
          source_height: 1,
          render_width: 6,
          render_height: 2,
          offset_x: 0,
          offset_y: 1,
          duration_ms: 750,
        },
      ],
    },
  }, true);
  const encoder = new ApngEncoder(width, height, 2, chunks);
  const first = new Uint8Array(width * height * 4);
  const second = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 2; x < 4; x += 1) {
      first.set([220, 30, 40, 255], (y * width + x) * 4);
    }
  }
  for (let y = 1; y < 3; y += 1) {
    for (let x = 0; x < width; x += 1) {
      second.set([30, 200, 80, 255], (y * width + x) * 4);
    }
  }
  encoder.addFrame(first, 250);
  encoder.addFrame(second, 750);
  return Buffer.from(encoder.finish());
}

export function makeMultiPageApng(frameCount = 24): Buffer {
  const width = 6;
  const height = 4;
  const encoder = new ApngEncoder(width, height, frameCount);
  for (let index = 0; index < frameCount; index += 1) {
    const frame = new Uint8Array(width * height * 4);
    const color: [number, number, number, number] = [
      (index * 47) % 256,
      (index * 83) % 256,
      (index * 131) % 256,
      255,
    ];
    for (let offset = 0; offset < frame.length; offset += 4) frame.set(color, offset);
    encoder.addFrame(frame, 1000);
  }
  return Buffer.from(encoder.finish());
}

function frameControl(
  sequence: number,
  width: number,
  height: number,
  x: number,
  y: number,
  dispose: number,
): Uint8Array {
  return concatBytes([
    uint32(sequence),
    uint32(width),
    uint32(height),
    uint32(x),
    uint32(y),
    uint16(1),
    uint16(10),
    new Uint8Array([dispose, 0]),
  ]);
}

function rgba(width: number, height: number, color: [number, number, number, number]) {
  const data = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(color, offset);
  return data;
}

export function makeGenericPartialApng(): Buffer {
  const red = compressRgba(4, 4, rgba(4, 4, [200, 20, 30, 255]));
  const green = compressRgba(2, 2, rgba(2, 2, [20, 210, 40, 255]));
  const blue = compressRgba(1, 1, rgba(1, 1, [30, 50, 220, 255]));
  return Buffer.from(
    concatBytes([
      PNG_SIGNATURE,
      makeChunk("IHDR", pngHeader(4, 4)),
      makeChunk("acTL", concatBytes([uint32(3), uint32(0)])),
      makeChunk("fcTL", frameControl(0, 4, 4, 0, 0, 0)),
      makeChunk("IDAT", red),
      makeChunk("fcTL", frameControl(1, 2, 2, 1, 1, 1)),
      makeChunk("fdAT", concatBytes([uint32(2), green])),
      makeChunk("fcTL", frameControl(3, 1, 1, 0, 0, 0)),
      makeChunk("fdAT", concatBytes([uint32(4), blue])),
      makeChunk("IEND", new Uint8Array()),
    ]),
  );
}

export function decodeFullCanvasFrames(
  bytes: Uint8Array,
  width: number,
  height: number,
): Uint8Array[] {
  const compressedFrames: Uint8Array[][] = [];
  let current: Uint8Array[] | null = null;
  for (const chunk of parsePngChunks(bytes)) {
    if (chunk.type === "fcTL") {
      current = [];
      compressedFrames.push(current);
    } else if (chunk.type === "IDAT" && current) {
      current.push(chunk.data);
    } else if (chunk.type === "fdAT" && current) {
      current.push(chunk.data.slice(4));
    }
  }
  return compressedFrames.map((parts) => {
    const compressed = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let compressedOffset = 0;
    for (const part of parts) {
      compressed.set(part, compressedOffset);
      compressedOffset += part.length;
    }
    const filtered = unzlibSync(compressed);
    const rowBytes = width * 4;
    const rgba = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row += 1) {
      if (filtered[row * (rowBytes + 1)] !== 0) throw new Error("Unexpected PNG filter");
      rgba.set(
        filtered.subarray(row * (rowBytes + 1) + 1, (row + 1) * (rowBytes + 1)),
        row * rowBytes,
      );
    }
    return rgba;
  });
}

export function pixel(frame: Uint8Array, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4;
  return [...frame.slice(offset, offset + 4)];
}

export function decodeStaticPng(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const chunks = parsePngChunks(bytes);
  const header = chunks.find((chunk) => chunk.type === "IHDR");
  if (!header) throw new Error("Missing PNG header");
  const view = new DataView(header.data.buffer, header.data.byteOffset, header.data.byteLength);
  const width = view.getUint32(0, false);
  const height = view.getUint32(4, false);
  const parts = chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data);
  const compressed = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    compressed.set(part, offset);
    offset += part.length;
  }
  const filtered = unzlibSync(compressed);
  const result = new Uint8Array(width * height * 4);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row += 1) {
    if (filtered[row * (rowBytes + 1)] !== 0) throw new Error("Unexpected PNG filter");
    result.set(
      filtered.subarray(row * (rowBytes + 1) + 1, (row + 1) * (rowBytes + 1)),
      row * rowBytes,
    );
  }
  return { width, height, rgba: result };
}
