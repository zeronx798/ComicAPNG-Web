import type { PngMetadata } from "../metadata/types";

export interface ApngInfo {
  width: number;
  height: number;
  frameCount: number;
  isAnimated: boolean;
  durationsMs: number[];
  metadata: PngMetadata;
}

export interface DecodedFrame {
  png: ArrayBuffer;
  thumbnail?: ArrayBuffer;
}

export interface DecodedDocument {
  info: ApngInfo;
  frames: DecodedFrame[];
}
