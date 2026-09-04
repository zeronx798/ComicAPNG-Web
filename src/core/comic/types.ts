export type ReadingDirection = "ltr" | "rtl";

export interface ComicPage {
  id: string;
  file: File;
  name: string;
  width: number;
  height: number;
  thumbnailUrl: string;
  isCover: boolean;
  durationMs?: number;
}

export interface ExportPage {
  file: File;
  name: string;
  width: number;
  height: number;
  durationMs: number;
}

export interface ComicExportRequest {
  pages: ExportPage[];
  readingDirection: ReadingDirection;
  coverDurationMs: number;
  bodyDurationMs: number;
  textMetadata: Record<string, string>;
}

export const DEFAULT_COVER_DURATION_MS = 10_000;
export const DEFAULT_BODY_DURATION_MS = 5_000;

export function pagesForExport(
  pages: ComicPage[],
  coverDurationMs: number,
  bodyDurationMs: number,
): ExportPage[] {
  const cover = pages.find((page) => page.isCover);
  const ordered = cover ? [cover, ...pages.filter((page) => page !== cover)] : [...pages];
  return ordered.map((page, index) => ({
    file: page.file,
    name: page.name,
    width: page.width,
    height: page.height,
    durationMs: page.durationMs ?? (index === 0 ? coverDurationMs : bodyDurationMs),
  }));
}
