import type { ComicPage } from "../comic/types";
import { naturalSorted } from "../comic/naturalSort";

const THUMBNAIL_SIZE = 320;

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
  source: ImageBitmap | HTMLImageElement,
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

export async function importImages(
  files: File[],
  hasExistingPages: boolean,
): Promise<{ pages: ComicPage[]; failures: number }> {
  const candidates = naturalSorted(
    files.filter((file) => file.type.startsWith("image/") || /\.(png|apng|jpe?g|webp|gif|bmp)$/i.test(file.name)),
  );
  const pages: ComicPage[] = [];
  let failures = 0;
  for (const file of candidates) {
    try {
      pages.push(await importImage(file, !hasExistingPages && pages.length === 0));
    } catch {
      failures += 1;
    }
  }
  return { pages, failures };
}

export function releasePage(page: ComicPage): void {
  URL.revokeObjectURL(page.thumbnailUrl);
}
