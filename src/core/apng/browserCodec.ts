import { ApngEncoder } from "./encoder";
import { createPrivateMetadata } from "./createMetadata";
import { parseApngBuffer } from "./decoder";
import { inspectApng } from "./inspect";
import { encodeRgbaPng } from "./png";
import type { DecodedDocument, DecodedFrame } from "./types";
import type { ComicExportRequest } from "../comic/types";
import { calculateCanvas, calculateFit } from "../image/layout";
import { metadataChunks, type PngMetadata } from "../metadata";

interface EncodeResult {
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

type ProgressCallback = (value: { current: number; total: number }) => void;
type Cancelled = () => boolean;
const MAX_CANVAS_PIXELS = 100_000_000;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  return result;
}

function contextFor(value: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = value.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!context) throw new Error("image.canvas_unavailable");
  return context;
}

function assertCanvas(width: number, height: number): void {
  if (width <= 0 || height <= 0 || width * height > MAX_CANVAS_PIXELS) {
    throw new Error("image.resource_limit");
  }
}

async function imageSource(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function closeImage(source: ImageBitmap | HTMLImageElement): void {
  if ("close" in source && typeof source.close === "function") source.close();
}

function pngFromCanvas(value: HTMLCanvasElement, metadata: PngMetadata | null): Uint8Array {
  const context = contextFor(value);
  const image = context.getImageData(0, 0, value.width, value.height);
  return encodeRgbaPng(
    value.width,
    value.height,
    new Uint8Array(image.data.buffer),
    metadata ? metadataChunks(metadata, false) : [],
  );
}

function thumbnailFromCanvas(value: HTMLCanvasElement): Uint8Array {
  const scale = Math.min(1, 160 / value.width, 200 / value.height);
  const thumbnail = canvas(
    Math.max(1, Math.round(value.width * scale)),
    Math.max(1, Math.round(value.height * scale)),
  );
  contextFor(thumbnail).drawImage(value, 0, 0, thumbnail.width, thumbnail.height);
  return pngFromCanvas(thumbnail, null);
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function ensureActive(cancelled: Cancelled): void {
  if (cancelled()) throw new Error("worker.cancelled");
}

export async function encodeComicInBrowser(
  request: ComicExportRequest,
  onProgress: ProgressCallback | undefined,
  cancelled: Cancelled,
): Promise<EncodeResult> {
  if (request.pages.length === 0) throw new Error("apng.missing_frames");
  const [width, height] = calculateCanvas(request.pages.map((page) => [page.width, page.height]));
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
  const outputCanvas = canvas(width, height);
  const outputContext = contextFor(outputCanvas);
  for (let index = 0; index < request.pages.length; index += 1) {
    ensureActive(cancelled);
    const page = request.pages[index];
    const layout = layouts[index];
    if (!page || !layout) throw new Error("apng.page_missing");
    const source = await imageSource(page.file);
    try {
      outputContext.clearRect(0, 0, width, height);
      outputContext.drawImage(
        source,
        layout.offsetX,
        layout.offsetY,
        layout.renderWidth,
        layout.renderHeight,
      );
      const image = outputContext.getImageData(0, 0, width, height);
      encoder.addFrame(new Uint8Array(image.data.buffer), page.durationMs);
    } finally {
      closeImage(source);
    }
    onProgress?.({ current: index + 1, total: request.pages.length });
    await yieldToBrowser();
  }
  return { buffer: toArrayBuffer(encoder.finish()), width, height };
}

export async function decodeComicInBrowser(
  buffer: ArrayBuffer,
  options: { thumbnails: boolean; preserveMetadata: boolean },
  onProgress: ProgressCallback | undefined,
  cancelled: Cancelled,
): Promise<DecodedDocument> {
  const info = inspectApng(new Uint8Array(buffer));
  assertCanvas(info.width, info.height);
  const metadataForFrames: PngMetadata | null = options.preserveMetadata
    ? {
        text: info.metadata.text,
        privateMetadata: {},
        ...(info.metadata.rawExif ? { rawExif: info.metadata.rawExif } : {}),
      }
    : null;
  const outputCanvas = canvas(info.width, info.height);
  const outputContext = contextFor(outputCanvas);
  const frames: DecodedFrame[] = [];

  const capture = () => {
    const png = pngFromCanvas(outputCanvas, metadataForFrames);
    const thumbnail = options.thumbnails ? thumbnailFromCanvas(outputCanvas) : undefined;
    frames.push({
      png: toArrayBuffer(png),
      ...(thumbnail ? { thumbnail: toArrayBuffer(thumbnail) } : {}),
    });
  };

  if (!info.isAnimated) {
    ensureActive(cancelled);
    const source = await imageSource(new Blob([buffer], { type: "image/png" }));
    try {
      outputContext.drawImage(source, 0, 0, info.width, info.height);
    } finally {
      closeImage(source);
    }
    capture();
    onProgress?.({ current: 1, total: 1 });
  } else {
    const parsed = parseApngBuffer(buffer);
    if (parsed instanceof Error || parsed.frames.length === 0) {
      throw new Error("apng.decode_failed");
    }
    let previousFrame = null as (typeof parsed.frames)[number] | null;
    let previousRegion: ImageData | null = null;
    for (let index = 0; index < parsed.frames.length; index += 1) {
      ensureActive(cancelled);
      if (previousFrame?.disposeOp === 1) {
        outputContext.clearRect(
          previousFrame.left,
          previousFrame.top,
          previousFrame.width,
          previousFrame.height,
        );
      } else if (previousFrame?.disposeOp === 2 && previousRegion) {
        outputContext.putImageData(previousRegion, previousFrame.left, previousFrame.top);
      }
      const frame = parsed.frames[index];
      if (!frame?.imageData) throw new Error("apng.frame_data_missing");
      previousRegion =
        frame.disposeOp === 2
          ? outputContext.getImageData(frame.left, frame.top, frame.width, frame.height)
          : null;
      if (frame.blendOp === 0) {
        outputContext.clearRect(frame.left, frame.top, frame.width, frame.height);
      }
      const source = await imageSource(frame.imageData);
      try {
        outputContext.drawImage(source, frame.left, frame.top);
      } finally {
        closeImage(source);
      }
      capture();
      previousFrame = frame;
      onProgress?.({ current: index + 1, total: parsed.frames.length });
      await yieldToBrowser();
    }
  }
  return { info, frames };
}
