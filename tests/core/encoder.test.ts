import { unzlibSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ApngEncoder } from "../../src/core/apng/encoder";
import { inspectApng } from "../../src/core/apng/inspect";
import { makeChunk, makeItext, parsePngChunks } from "../../src/core/apng/png";
import { metadataChunks, PRIVATE_METADATA_KEY } from "../../src/core/metadata";

function solidFrame(width: number, height: number, rgba: [number, number, number, number]) {
  const result = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < result.length; offset += 4) {
    result.set(rgba, offset);
  }
  return result;
}

function decodedFrames(bytes: Uint8Array, width: number, height: number): Uint8Array[] {
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
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const compressed = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      compressed.set(part, offset);
      offset += part.length;
    }
    const filtered = unzlibSync(compressed);
    const rgba = new Uint8Array(width * height * 4);
    const rowBytes = width * 4;
    for (let row = 0; row < height; row += 1) {
      expect(filtered[row * (rowBytes + 1)]).toBe(0);
      rgba.set(
        filtered.subarray(row * (rowBytes + 1) + 1, (row + 1) * (rowBytes + 1)),
        row * rowBytes,
      );
    }
    return rgba;
  });
}

describe("APNG encoder", () => {
  it("writes complete source-blended full-canvas frames with exact timing", () => {
    const encoder = new ApngEncoder(4, 3, 2);
    encoder.addFrame(solidFrame(4, 3, [220, 10, 20, 255]), 3000);
    encoder.addFrame(solidFrame(4, 3, [10, 220, 20, 128]), 1250);
    const bytes = encoder.finish();
    const info = inspectApng(bytes);
    expect(info).toMatchObject({ width: 4, height: 3, frameCount: 2 });
    expect(info.durationsMs).toEqual([3000, 1250]);

    const controls = parsePngChunks(bytes).filter((chunk) => chunk.type === "fcTL");
    expect(controls).toHaveLength(2);
    for (const control of controls) {
      const view = new DataView(control.data.buffer, control.data.byteOffset, control.data.byteLength);
      expect([view.getUint32(4), view.getUint32(8), view.getUint32(12), view.getUint32(16)]).toEqual([
        4,
        3,
        0,
        0,
      ]);
      expect([view.getUint8(24), view.getUint8(25)]).toEqual([0, 0]);
    }
    const frames = decodedFrames(bytes, 4, 3);
    expect([...frames[0]!.slice(0, 4)]).toEqual([220, 10, 20, 255]);
    expect([...frames[1]!.slice(0, 4)]).toEqual([10, 220, 20, 128]);
  });

  it("keeps user text separate from valid ComicAPNG private metadata", () => {
    const chunks = metadataChunks(
      {
        text: { Title: "Example" },
        privateMetadata: { format: "ComicAPNG", version: 1, pages: [] },
      },
      true,
    );
    const encoder = new ApngEncoder(1, 1, 1, chunks);
    encoder.addFrame(new Uint8Array([1, 2, 3, 4]), 1000);
    const metadata = inspectApng(encoder.finish()).metadata;
    expect(metadata.text).toEqual({ Title: "Example" });
    expect(metadata.privateMetadata).toMatchObject({ format: "ComicAPNG", version: 1 });
  });

  it("ignores malformed private JSON without blocking PNG inspection", () => {
    const malformed = makeChunk("iTXt", makeItext(PRIVATE_METADATA_KEY, "{invalid"));
    const encoder = new ApngEncoder(1, 1, 1, [malformed]);
    encoder.addFrame(new Uint8Array([0, 0, 0, 0]), 1000);
    expect(inspectApng(encoder.finish()).metadata.privateMetadata).toEqual({});
  });
});
