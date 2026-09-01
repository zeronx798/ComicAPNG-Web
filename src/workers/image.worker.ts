/// <reference lib="webworker" />

import { ApngEncoder } from "../core/apng/encoder";
import { createPrivateMetadata } from "../core/apng/createMetadata";
import { parseApngBuffer } from "../core/apng/decoder";
import { inspectApng } from "../core/apng/inspect";
import { encodeRgbaPng } from "../core/apng/png";
import { calculateCanvas, calculateFit } from "../core/image/layout";
import {
  metadataChunks,
  type PngMetadata,
} from "../core/metadata";
import type { ComicExportRequest } from "../core/comic/types";
import type {
  DecodeRequest,
  DecodeResponse,
  EncodeResponse,
  ErrorResponse,
  ProgressResponse,
  WorkerRequest,
} from "./protocol";

const MAX_CANVAS_PIXELS = 100_000_000;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function postProgress(current: number, total: number): void {
  const response: ProgressResponse = { kind: "progress", current, total };
  self.postMessage(response);
}

function assertCanvas(width: number, height: number): void {
  if (width <= 0 || height <= 0 || width * height > MAX_CANVAS_PIXELS) {
    throw new Error("image.resource_limit");
  }
}

async function encode(request: ComicExportRequest): Promise<void> {
  if (request.pages.length === 0) throw new Error("apng.missing_frames");
  const [width, height] = calculateCanvas(
    request.pages.map((page) => [page.width, page.height]),
  );
  assertCanvas(width, height);
  const layouts = request.pages.map((page) =>
    calculateFit([page.width, page.height], [width, height]),
  );
  const metadata: PngMetadata = {
    text: request.textMetadata,
    privateMetadata: createPrivateMetadata(request, layouts),
  };
  const encoder = new ApngEncoder(
    width,
    height,
    request.pages.length,
    metadataChunks(metadata, true),
  );
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!context) throw new Error("image.canvas_unavailable");

  for (let index = 0; index < request.pages.length; index += 1) {
    const page = request.pages[index];
    const layout = layouts[index];
    if (!page || !layout) throw new Error("apng.page_missing");
    const bitmap = await createImageBitmap(page.file, { imageOrientation: "from-image" });
    try {
      context.clearRect(0, 0, width, height);
      context.drawImage(
        bitmap,
        layout.offsetX,
        layout.offsetY,
        layout.renderWidth,
        layout.renderHeight,
      );
      const frame = context.getImageData(0, 0, width, height);
      encoder.addFrame(new Uint8Array(frame.data.buffer), page.durationMs);
    } finally {
      bitmap.close();
    }
    postProgress(index + 1, request.pages.length);
  }

  const result = encoder.finish();
  const response: EncodeResponse = {
    kind: "encoded",
    buffer: toArrayBuffer(result),
    width,
    height,
  };
  self.postMessage(response, { transfer: [response.buffer] });
}

function framePng(
  canvas: OffscreenCanvas,
  context: OffscreenCanvasRenderingContext2D,
  metadata: PngMetadata | null,
): Uint8Array {
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return encodeRgbaPng(
    canvas.width,
    canvas.height,
    new Uint8Array(image.data.buffer),
    metadata ? metadataChunks(metadata, false) : [],
  );
}

function thumbnailPng(canvas: OffscreenCanvas): Uint8Array {
  const maxWidth = 160;
  const maxHeight = 200;
  const scale = Math.min(1, maxWidth / canvas.width, maxHeight / canvas.height);
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const thumbnail = new OffscreenCanvas(width, height);
  const context = thumbnail.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!context) throw new Error("image.canvas_unavailable");
  context.drawImage(canvas, 0, 0, width, height);
  return framePng(thumbnail, context, null);
}

async function decode(request: DecodeRequest): Promise<void> {
  const input = new Uint8Array(request.buffer);
  const info = inspectApng(input);
  assertCanvas(info.width, info.height);
  const metadataForFrames: PngMetadata | null = request.preserveMetadata
    ? {
        text: info.metadata.text,
        privateMetadata: {},
        ...(info.metadata.rawExif ? { rawExif: info.metadata.rawExif } : {}),
      }
    : null;
  const canvas = new OffscreenCanvas(info.width, info.height);
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!context) throw new Error("image.canvas_unavailable");
  const frames: DecodeResponse["frames"] = [];

  if (!info.isAnimated) {
    const bitmap = await createImageBitmap(new Blob([request.buffer], { type: "image/png" }));
    try {
      context.drawImage(bitmap, 0, 0, info.width, info.height);
    } finally {
      bitmap.close();
    }
    const png = framePng(canvas, context, metadataForFrames);
    const thumbnail = request.thumbnails ? thumbnailPng(canvas) : undefined;
    frames.push({
      png: toArrayBuffer(png),
      ...(thumbnail ? { thumbnail: toArrayBuffer(thumbnail) } : {}),
    });
    postProgress(1, 1);
  } else {
    const parsed = parseApngBuffer(request.buffer);
    if (parsed instanceof Error || parsed.frames.length === 0) {
      throw new Error("apng.decode_failed");
    }
    let previousFrame = null as (typeof parsed.frames)[number] | null;
    let previousRegion: ImageData | null = null;
    for (let index = 0; index < parsed.frames.length; index += 1) {
      if (previousFrame?.disposeOp === 1) {
        context.clearRect(
          previousFrame.left,
          previousFrame.top,
          previousFrame.width,
          previousFrame.height,
        );
      } else if (previousFrame?.disposeOp === 2 && previousRegion) {
        context.putImageData(previousRegion, previousFrame.left, previousFrame.top);
      }
      const frame = parsed.frames[index];
      if (!frame?.imageData) throw new Error("apng.frame_data_missing");
      previousRegion =
        frame.disposeOp === 2
          ? context.getImageData(frame.left, frame.top, frame.width, frame.height)
          : null;
      if (frame.blendOp === 0) {
        context.clearRect(frame.left, frame.top, frame.width, frame.height);
      }
      const bitmap = await createImageBitmap(frame.imageData);
      try {
        context.drawImage(bitmap, frame.left, frame.top);
      } finally {
        bitmap.close();
      }
      const png = framePng(canvas, context, metadataForFrames);
      const thumbnail = request.thumbnails ? thumbnailPng(canvas) : undefined;
      frames.push({
        png: toArrayBuffer(png),
        ...(thumbnail ? { thumbnail: toArrayBuffer(thumbnail) } : {}),
      });
      previousFrame = frame;
      postProgress(index + 1, parsed.frames.length);
    }
  }

  const transfer = frames.flatMap((frame) =>
    frame.thumbnail ? [frame.png, frame.thumbnail] : [frame.png],
  );
  const response: DecodeResponse = { kind: "decoded", info, frames };
  self.postMessage(response, { transfer });
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const operation = event.data.kind === "encode" ? encode(event.data.request) : decode(event.data);
  void operation.catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    const response: ErrorResponse = { kind: "error", code: detail, detail };
    self.postMessage(response);
  });
});
