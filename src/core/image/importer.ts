import type { ComicPage } from "../comic/types";

const THUMBNAIL_SIZE = 320;
const MAX_IMAGE_PIXELS = 100_000_000;

export interface ImageRegion {
  left: number;
  top: number;
  width: number;
  height: number;
  targetWidth: number;
  targetHeight: number;
}

async function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
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

async function decodedSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in globalThis) {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  return loadHtmlImage(file);
}

function sourceSize(source: ImageBitmap | HTMLImageElement): [number, number] {
  if (source instanceof HTMLImageElement) {
    return [source.naturalWidth, source.naturalHeight];
  }
  return [source.width, source.height];
}

async function thumbnailBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob> {
  const scale = Math.min(1, THUMBNAIL_SIZE / width, THUMBNAIL_SIZE / height);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    throw new Error("image.canvas_unavailable");
  }
  context.drawImage(source, 0, 0, targetWidth, targetHeight);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("image.thumbnail_failed"));
    }, "image/png");
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("image.encode_failed"));
    }, "image/png");
  });
}

export async function importImage(file: File, isCover: boolean): Promise<ComicPage> {
  const source = await decodedSource(file);
  try {
    const [width, height] = sourceSize(source);
    if (width <= 0 || height <= 0) {
      throw new Error("image.invalid_dimensions");
    }
    const thumbnail = await thumbnailBlob(source, width, height);
    return {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      width,
      height,
      thumbnailUrl: URL.createObjectURL(thumbnail),
      isCover,
    };
  } finally {
    if (source instanceof ImageBitmap) {
      source.close();
    }
  }
}

export async function importImageRegion(
  file: File,
  name: string,
  region: ImageRegion,
  isCover: boolean,
): Promise<ComicPage> {
  if (
    region.width <= 0 ||
    region.height <= 0 ||
    region.targetWidth <= 0 ||
    region.targetHeight <= 0 ||
    region.targetWidth * region.targetHeight > MAX_IMAGE_PIXELS
  ) {
    throw new Error("image.invalid_dimensions");
  }
  const source = await decodedSource(file);
  try {
    const [sourceWidth, sourceHeight] = sourceSize(source);
    if (
      region.left < 0 ||
      region.top < 0 ||
      region.left + region.width > sourceWidth ||
      region.top + region.height > sourceHeight
    ) {
      throw new Error("image.invalid_region");
    }
    const canvas = document.createElement("canvas");
    canvas.width = region.targetWidth;
    canvas.height = region.targetHeight;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("image.canvas_unavailable");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      source,
      region.left,
      region.top,
      region.width,
      region.height,
      0,
      0,
      region.targetWidth,
      region.targetHeight,
    );
    const [image, thumbnail] = await Promise.all([
      canvasBlob(canvas),
      thumbnailBlob(canvas, region.targetWidth, region.targetHeight),
    ]);
    const output = new File([image], name, {
      type: "image/png",
      lastModified: file.lastModified,
    });
    return {
      id: crypto.randomUUID(),
      file: output,
      name,
      width: region.targetWidth,
      height: region.targetHeight,
      thumbnailUrl: URL.createObjectURL(thumbnail),
      isCover,
    };
  } finally {
    if (source instanceof ImageBitmap) source.close();
  }
}

export function releasePage(page: ComicPage): void {
  URL.revokeObjectURL(page.thumbnailUrl);
}
