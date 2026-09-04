# ComicAPNG Web Technical Specifications

## Product Boundary

ComicAPNG Web is a browser-native PWA sibling of ComicAPNG Desktop. It has no backend, server image processing, authentication, cloud storage, analytics, telemetry, plugin framework, scraper, or downloader. Runtime dependencies and icons are bundled into the production build. Comic bytes remain local to the browser.

## Stack and Architecture

- TypeScript, React, Vite, and CSS media queries implement the application.
- `vite-plugin-pwa` generates a Workbox service worker for the application shell.
- Web Workers perform APNG encoding, generic APNG compositing, thumbnail generation, and extraction encoding where `OffscreenCanvas` is available. WebKit uses the same adapter through a cooperative HTML Canvas fallback and yields between frames.
- `apng-js` parses generic APNG subframes; `fflate` provides zlib and ZIP primitives.
- Local storage holds lightweight language, duration, direction, and update-check settings.
- Vitest covers pure models and APNG binary behavior. Playwright covers browser workflows, responsive structure, compatibility smoke tests, and offline reload.

Feature components depend on internal adapters, not third-party codec APIs. Create, Extract, and Read remain mounted when navigation changes so in-progress local state is not discarded.

## Create

Image files are sorted naturally by filename. Import creates an oriented browser bitmap, records its dimensions, produces a bounded thumbnail, then closes the full bitmap. The original `File` remains the full-resolution source.

Animated PNG import composites frames in order and materializes them as ordinary editable PNG pages with their frame durations. Valid ComicAPNG geometry restores original page bounds; generic APNG uses the composited canvas. Supported ZIP image entries are decoded in memory. Archives without metadata use natural filename order. Version 1 `metadata.json` page bindings must exactly match every supported image filename before order, cover, timing, direction, Title, or Author data is restored.

ZIP import validates every entry before decompression. Absolute, drive-qualified, parent-traversal, backslash, duplicate, encrypted, oversized, and unsupported-compression image entries are rejected. Only PNG, JPEG, WebP, and BMP entries are considered pages; unrelated files are ignored. No archive entry is written to a local path.

Desktop supports Ctrl or Command selection, Shift range selection, rubber-band selection, and drag reorder. Touch layouts expose selection mode, Select All, Delete, Set Cover, Move Earlier, Move Later, Move to Beginning, and Move to End. Drag is never the only reorder method.

The cover is unique. Export moves it to logical frame zero without duplication. Default cover duration is 10,000 milliseconds and default body duration is 5,000 milliseconds. Inputs display seconds with three decimals while the model retains integer milliseconds.

## Fixed Canvas Encoding

For oriented sources:

```text
canvas_width  = max(source_width)
canvas_height = max(source_height)
scale = min(canvas_width / source_width, canvas_height / source_height)
```

Rounded rendered dimensions remain bounded by the canvas. Each source is centered. A cleared RGBA canvas provides fully transparent unused pixels. Enlargement is allowed. Independent axis stretching, cropping, opaque fills, and variable logical-frame rectangles are prohibited.

The encoder emits PNG signature, RGBA8 `IHDR`, optional metadata, `acTL`, one `fcTL` per page, first-frame `IDAT`, later `fdAT`, and `IEND`. Every `fcTL` declares the complete canvas with offset zero, disposal zero, and source blending. Zlib-compressed payloads are split at 1 MiB. Loop count is zero.

## Decode, Extract, and Read

Raw chunk inspection determines dimensions, animation frame count, durations, and metadata without private-data dependence. Static PNG is treated as a one-page comic.

Generic APNG subframes are decoded and composited sequentially according to disposal and blend operations. Extraction emits fully composited `1.png` through `N.png`. Chromium users may select a writable directory; other browsers receive a ZIP containing those exact numeric names.

The reader uses compressed page and thumbnail Blob URLs. It provides previous/next, direct page input, thumbnail navigation, zoom from 25 to 400 percent, fit-page, fit-width, fullscreen, physical tap zones, swipe navigation, pinch zoom, and LTR/RTL gesture mapping. Stored APNG durations never force page advancement.

## Metadata

Metadata categories remain independent and optional:

- PNG text: `tEXt`, `zTXt`, and `iTXt` are read. Creation writes UTF-8 iTXt Title and Author values. Valid text is preserved on extraction.
- ComicAPNG private data: the reserved iTXt key is `ComicAPNG.Metadata`. Schema version 1 records format, version, cover index, reading direction, and per-page source/render geometry and duration.
- EXIF: raw PNG `eXIf` bytes are detected and preserved on extracted frames. Arbitrary EXIF decoding, merging, and editing are deferred.

Malformed private JSON is treated as absent. Create, Extract, and Read never require metadata.

## Responsive Presentation

- Desktop 1440x900: full 184px navigation rail, feature header actions, main workspace, and persistent Create inspector.
- Tablet landscape 1024x768: compact 86px icon navigation rail and narrower shared-state inspector.
- Tablet portrait 768x1024: top app bar, bottom primary navigation, and sheet-based Create settings.
- Phone portrait 390x844: thumbnail-first Create layout, explicit selection mode, bottom Add/Select/Settings/Export actions, stacked Extract cards, and a resizing Reader thumbnail drawer.
- Phone landscape 844x390: compact creator chrome; Reader hides global navigation and uses content-first overlays and hideable controls.

Touch targets grow under coarse pointers. Hover, right click, modifier keys, and drag are never required for a core action.

## PWA, Offline, and Updates

Production uses the `/ComicAPNG-Web/` base, scope, start URL, and asset paths. Workbox precaches HTML, JavaScript, CSS, workers, manifest, and local icons. Playwright first loads online, waits for service-worker readiness and control, switches the browser context offline, reloads, and verifies all workflow navigation.

The update checker reads the static `version.json` no more than once per six-hour cooldown unless manually requested. It tracks latest, update available, offline, and check failed states. Only a small status indicator and Settings text are shown. Reload is always user initiated, so edits are not discarded automatically.

Builds inject the resolved display version, commit SHA, and build date. Generated `version.json` contains `version`, `commit`, and `buildDate` from the same build information. It uses network-first runtime caching and does not require GitHub API access.

## Version Identity and Artifacts

The `version` field in `package.json` is the one canonical project version and uses `x.y.z` without a leading `v`. `scripts/version.mjs` reads it and owns release-tag grammar, tag/package consistency, display identity, release titles, and archive names.

A non-tag build resolves to `v<package-version>-dirty`. In this project, `dirty` means "not an official tagged release build"; it does not describe the literal Git working tree. Local builds, pull requests, main pushes, and manual workflow runs therefore resolve to `v0.1.1-dirty` while the package version is `0.1.1`.

Matching stable and RC tags remove the suffix. For example, package version `0.2.0` accepts `v0.2.0` and `v0.2.0-rc.1`, but rejects either tag when the package version is different. Malformed `v*` tags also fail. Generated archives use `ComicAPNG-Web-<resolved-version>.zip`, and `SHA256SUMS.txt` names that exact archive.

To update the project version without creating a tag, run:

```sh
npm version 0.2.0 --no-git-tag-version
```

Version editing and release tagging are separate operations; no other project version string needs manual editing.

## Source and Localization Policy

Primary TypeScript, JavaScript, CSS, HTML, scripts, workflow YAML, tests, and configuration are ASCII-only. Documentation and localization JSON are UTF-8 without BOM and may contain natural-language Unicode. Emoji are prohibited everywhere. English and Simplified Chinese localization files must have identical keys.

Lucide supplies interface icons. Runtime fonts and images are local.

## Validation

Local development:

```sh
npm install
npm run dev
```

Complete validation:

```sh
npm run ci
```

The Node orchestrator runs environment and version validation, character/BOM/emoji policy, lint, TypeScript, unit tests, APNG core tests, production build, PWA/artifact validation, Playwright browser provisioning, complete Chromium E2E/responsive/offline tests, Firefox and WebKit smoke tests, versioned archive creation, and checksum/archive validation.

GitHub Actions uses `ubuntu-latest`, Node 22, `npm ci`, Playwright system dependency setup, and the same `npm run ci` entry point.

## Release Policy

Stable tags match `^v[0-9]+\.[0-9]+\.[0-9]+$`. RC tags match `^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$`. Malformed `v*` tags fail before publication.

Pull requests, main pushes, and manual dispatch run full CI and upload a `ComicAPNG-Web-vX.Y.Z-dirty` build artifact, but do not create a GitHub Release or deploy Pages. Valid RC tags create a prerelease titled `ComicAPNG Web vX.Y.Z-rc.N` with the matching ZIP and `SHA256SUMS.txt`, but never deploy Pages. Valid stable tags create a release titled `ComicAPNG Web vX.Y.Z` and deploy the exact tested `dist` directory to GitHub Pages. No rebuild occurs between validation, release archiving, and Pages upload.

## Known MVP Limits

- Arbitrary EXIF viewing and editing are not implemented.
- Source EXIF is not merged into a newly created comic.
- Reader preparation retains compressed full-page PNG blobs and may be expensive for giant comics.
- File System Access folder output is a Chromium enhancement; ZIP download is the portable fallback.
- The application does not offer timed playback or dual-page reading in this MVP.
- Pinch zoom and fullscreen depend on browser support and may differ under iOS browser chrome.
- Complete functional automation runs on Chromium; Firefox and WebKit receive focused Create, generic Extract, Reader, shell, and navigation smoke coverage.
- No WASM is used or required.
