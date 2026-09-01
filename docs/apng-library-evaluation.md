# APNG Library Evaluation

## Decision

The MVP uses `apng-js` 1.1.5 behind the internal decoder adapter and a small project-owned PNG/APNG chunk writer backed by `fflate` 0.8.3. React features depend only on `src/core/apng` and worker protocols; they never call either library directly.

This split was selected because no evaluated package combined dependable generic APNG compositing, exact ComicAPNG full-canvas encoding controls, metadata chunk access, and bounded per-page export memory in one API.

Evaluation date: 2026-09-01.

## Candidates

| Candidate | License and activity | Decode | Encode | Metadata and raw bytes | Worker and memory fit | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| `apng-js` 1.1.5 | MIT; release published in January 2025 | APNG frame rectangles, timing, alpha, disposal, and blend operations; static PNG is intentionally reported separately | No | Parses the supplied bytes and exposes per-frame PNG blobs; no EXIF or text editing API | Browser-oriented. Parsing can run in a worker and each compressed subframe can be decoded sequentially with `createImageBitmap` | Selected for decoding |
| Photopea `UPNG.js` 2.1.0 | MIT; upstream npm release is old, while the codec remains used by Photopea | Broad PNG/APNG color and depth support and RGBA frame conversion | Lossless and quantized PNG/APNG | Exposes some PNG tables and accepts raw bytes, but has no stable general metadata editing abstraction | Simple API, but normal APNG use materializes arrays of full RGBA frames and the encoder owns frame optimization decisions | Not selected for the MVP adapter |
| `lib-upng` 3.0.0 | MIT; ESM packaging of UPNG with `pako` 2.1.0, last release in 2022 | Same underlying UPNG behavior | Same underlying UPNG behavior | Same metadata limitations | Better module packaging does not change the all-frame memory model or exact frame-control concern | Not selected |
| `fast-png` 8.0.0 | MIT; actively maintained in 2025-2026 | Static PNG | Static PNG | Supports basic Latin-1 `tEXt`; does not provide APNG or complete EXIF/private chunk policy | Browser-capable and useful for still PNG work | Not selected because APNG is out of scope |
| Browser `ImageDecoder` | Browser API, no package license | Can decode animated images in supporting browsers | No | Input bytes remain accessible to the application, but chunk editing is outside the API | Potentially efficient and replaceable through feature detection, but not a uniform baseline across the three target engines | Deferred progressive enhancement |

Primary references:

- [apng-js repository and API](https://github.com/davidmz/apng-js)
- [UPNG.js repository and API](https://github.com/photopea/UPNG.js)
- [lib-upng repository](https://github.com/fisker/lib-upng)
- [fast-png repository](https://github.com/image-js/fast-png)
- [fflate repository](https://github.com/101arrowz/fflate)

## Requirement Review

### Multiple frames, duration, and alpha

`apng-js` parses `fcTL`, `fdAT`, frame geometry, delay fractions, disposal, and blend operations. The worker composites those frame rectangles in order on a transparent `OffscreenCanvas`. Comic reading remains manual; timing is inspected from raw `fcTL` bytes and is not used to auto-advance.

The project encoder writes every logical page as an 8-bit RGBA full-canvas frame. Each `fcTL` uses the complete canvas at offset zero, disposal `0`, and blend `0`. Durations are stored as reduced APNG numerator and denominator pairs.

### Fixed canvas and scaling

The worker calculates the maximum oriented source width and height before encoding. It opens only the current source bitmap, draws it with one contain scale onto a cleared transparent canvas, compresses that frame, and closes the bitmap. Artwork is never independently scaled per axis, cropped to fill, or placed over an opaque color.

### Large images and memory

Creation keeps original `File` objects plus small thumbnail blobs. During export it keeps one decoded source bitmap, one RGBA canvas, one filtered scanline buffer, and accumulated compressed output. It does not retain every source page as RGBA.

Generic APNG decoding processes subframe PNG blobs sequentially and retains compressed full-page PNG blobs for reader navigation or extraction. It therefore avoids retaining all pages as raw RGBA, but opening a very large comic can still require substantial compressed-memory and browser image-decoder resources. A 100 million pixel per-canvas guard is present. Giant-comic performance is not claimed.

### PNG text, EXIF, and private metadata

The internal chunk adapter reads uncompressed and compressed PNG text chunks, separates the reserved `ComicAPNG.Metadata` iTXt entry, and exposes raw `eXIf` bytes. Creation writes user Title and Author values as iTXt plus schema version 1 private geometry, timing, cover, and reading-direction data. Extraction preserves valid user text and raw PNG `eXIf` data while omitting container-private JSON from each page.

Arbitrary EXIF field decoding and editing are not implemented. Source-image EXIF records are not merged into a new comic. This limitation is deliberate and does not affect APNG correctness.

### Custom chunk integration

The project adapter retains raw PNG/APNG bytes and owns chunk parsing, CRC generation, iTXt insertion, `eXIf` placement, APNG control chunks, and chunk splitting. `fflate` supplies zlib/DEFLATE. The project does not reimplement DEFLATE, general PNG filtering, color conversion, JPEG/WebP decoding, or a complete image codec.

### Browser compatibility

The implementation uses standard files, Blob URLs, Canvas, Web Workers, `createImageBitmap`, and `OffscreenCanvas`. Chromium receives the complete automated suite. Firefox and WebKit receive focused Create, generic Extract, Reader, shell, and navigation smoke coverage. WebKit currently lacks `OffscreenCanvas`, so the same adapter uses a cooperative HTML Canvas path there and yields between frames. Standard file inputs and downloads remain the baseline; Chromium folder access is only a progressive enhancement.

## Replacement Boundary

The stable project boundary is:

```text
src/core/apng/
  encoder.ts
  inspect.ts
  png.ts
  types.ts

src/workers/
  client.ts
  image.worker.ts
  protocol.ts
```

A future decoder can replace `apng-js` inside the worker without changing React state or feature components. A future streaming encoder can replace `ApngEncoder` while preserving the same worker request and full-canvas contract.
