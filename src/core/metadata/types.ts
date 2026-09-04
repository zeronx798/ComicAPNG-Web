export interface ComicPrivatePage {
  source_width: number;
  source_height: number;
  render_width: number;
  render_height: number;
  offset_x: number;
  offset_y: number;
  duration_ms: number;
}

export interface ComicPrivateMetadata extends Record<string, unknown> {
  format?: string;
  version?: number;
  cover_index?: number;
  reading_direction?: "ltr" | "rtl";
  cover_duration_ms?: number;
  body_duration_ms?: number;
  pages?: ComicPrivatePage[];
}

export interface PngMetadata {
  text: Record<string, string>;
  privateMetadata: ComicPrivateMetadata;
  rawExif?: Uint8Array;
}
