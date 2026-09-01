import { gcd } from "../math";
import {
  PNG_SIGNATURE,
  compressRgba,
  concatBytes,
  makeChunk,
  pngHeader,
  splitCompressed,
  uint16,
  uint32,
} from "./png";

function delayFraction(durationMs: number): [number, number] {
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > 65_535_000) {
    throw new Error("apng.invalid_duration");
  }
  const divisor = gcd(durationMs, 1000);
  let numerator = durationMs / divisor;
  let denominator = 1000 / divisor;
  if (numerator > 65_535) {
    numerator = 65_535;
    denominator = Math.max(1, Math.round((numerator * 1000) / durationMs));
  }
  return [numerator, denominator];
}

function frameControl(
  sequence: number,
  width: number,
  height: number,
  durationMs: number,
): Uint8Array {
  const [numerator, denominator] = delayFraction(durationMs);
  return concatBytes([
    uint32(sequence),
    uint32(width),
    uint32(height),
    uint32(0),
    uint32(0),
    uint16(numerator),
    uint16(denominator),
    new Uint8Array([0, 0]),
  ]);
}

export class ApngEncoder {
  private readonly chunks: Uint8Array[];
  private sequence = 0;
  private frameIndex = 0;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly frameCount: number,
    metadataChunks: Uint8Array[] = [],
  ) {
    if (Math.min(width, height, frameCount) <= 0) {
      throw new Error("apng.invalid_dimensions");
    }
    this.chunks = [
      PNG_SIGNATURE,
      makeChunk("IHDR", pngHeader(width, height)),
      ...metadataChunks,
      makeChunk("acTL", concatBytes([uint32(frameCount), uint32(0)])),
    ];
  }

  addFrame(rgba: Uint8Array, durationMs: number): void {
    if (this.frameIndex >= this.frameCount) {
      throw new Error("apng.too_many_frames");
    }
    this.chunks.push(
      makeChunk(
        "fcTL",
        frameControl(this.sequence, this.width, this.height, durationMs),
      ),
    );
    this.sequence += 1;
    const compressed = compressRgba(this.width, this.height, rgba);
    for (const part of splitCompressed(compressed)) {
      if (this.frameIndex === 0) {
        this.chunks.push(makeChunk("IDAT", part));
      } else {
        this.chunks.push(makeChunk("fdAT", concatBytes([uint32(this.sequence), part])));
        this.sequence += 1;
      }
    }
    this.frameIndex += 1;
  }

  finish(): Uint8Array {
    if (this.frameIndex !== this.frameCount) {
      throw new Error("apng.missing_frames");
    }
    return concatBytes([...this.chunks, makeChunk("IEND", new Uint8Array())]);
  }
}
