import type { ComicExportRequest } from "../comic/types";
import type { PageLayout } from "../image/layout";
import {
  PRIVATE_FORMAT_NAME,
  PRIVATE_SCHEMA_VERSION,
  type ComicPrivateMetadata,
} from "../metadata";

export function createPrivateMetadata(
  request: ComicExportRequest,
  layouts: PageLayout[],
): ComicPrivateMetadata {
  return {
    format: PRIVATE_FORMAT_NAME,
    version: PRIVATE_SCHEMA_VERSION,
    cover_index: 0,
    reading_direction: request.readingDirection,
    cover_duration_ms: request.coverDurationMs,
    body_duration_ms: request.bodyDurationMs,
    pages: request.pages.map((page, index) => {
      const layout = layouts[index];
      if (!layout) throw new Error("apng.layout_missing");
      return {
        source_width: layout.sourceWidth,
        source_height: layout.sourceHeight,
        render_width: layout.renderWidth,
        render_height: layout.renderHeight,
        offset_x: layout.offsetX,
        offset_y: layout.offsetY,
        duration_ms: page.durationMs,
      };
    }),
  };
}
