import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Fullscreen,
  GalleryVerticalEnd,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  Scan,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
} from "react";
import { inspectApng } from "../../core/apng/inspect";
import type { ApngInfo } from "../../core/apng/types";
import type { ReadingDirection } from "../../core/comic/types";
import { DropSurface } from "../../components/DropSurface";
import { FeatureHeader } from "../../components/FeatureHeader";
import { IconButton } from "../../components/IconButton";
import { ProgressBar } from "../../components/ProgressBar";
import { useI18n } from "../../i18n";
import {
  fingerprintFile,
  loadReaderProgress,
  saveReaderProgress,
} from "../../services/readerProgress";
import { readDirection, writeDirection } from "../../services/settings";
import { decodeComic, type ProgressValue } from "../../workers/client";

type FitMode = "page" | "width";

interface ReaderDocument {
  name: string;
  info: ApngInfo;
  frameUrls: string[];
  thumbnailUrls: string[];
  fingerprint: string;
}

interface PointerPosition {
  x: number;
  y: number;
}

function releaseDocument(document: ReaderDocument | null): void {
  document?.frameUrls.forEach(URL.revokeObjectURL);
  document?.thumbnailUrls.forEach(URL.revokeObjectURL);
}

function clampZoom(value: number): number {
  return Math.max(0.25, Math.min(4, value));
}

export function ReaderFeature() {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const thumbnailList = useRef<HTMLDivElement>(null);
  const activeThumbnail = useRef<HTMLButtonElement>(null);
  const thumbnailScrollState = useRef<{ document: ReaderDocument | null; current: number }>({
    document: null,
    current: -1,
  });
  const thumbnailScrollPending = useRef(false);
  const pointers = useRef(new Map<number, PointerPosition>());
  const swipeStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const pinched = useRef(false);
  const documentRef = useRef<ReaderDocument | null>(null);
  const [document, setDocument] = useState<ReaderDocument | null>(null);
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<ReadingDirection>(readDirection);
  const [fitMode, setFitMode] = useState<FitMode>("page");
  const [zoom, setZoom] = useState(1);
  const [thumbnailsVisible, setThumbnailsVisible] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressValue | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(
    () => () => {
      releaseDocument(documentRef.current);
    },
    [],
  );

  const pageCount = document?.frameUrls.length ?? 0;
  const previous = () => setCurrent((value) => Math.max(0, value - 1));
  const next = () => setCurrent((value) => Math.min(pageCount - 1, value + 1));

  useEffect(() => {
    if (document) void saveReaderProgress(document.fingerprint, current);
  }, [current, document]);

  useLayoutEffect(() => {
    if (
      thumbnailScrollState.current.document !== document ||
      thumbnailScrollState.current.current !== current
    ) {
      thumbnailScrollState.current = { document, current };
      thumbnailScrollPending.current = document !== null;
    }
    if (!thumbnailScrollPending.current) return;
    const container = thumbnailList.current;
    const thumbnail = activeThumbnail.current;
    if (!container || !thumbnail || container.clientWidth === 0 || container.clientHeight === 0) {
      return;
    }
    const viewport = container.getBoundingClientRect();
    const active = thumbnail.getBoundingClientRect();
    let top = container.scrollTop;
    let left = container.scrollLeft;
    if (active.top < viewport.top) top -= viewport.top - active.top;
    else if (active.bottom > viewport.bottom) top += active.bottom - viewport.bottom;
    if (active.left < viewport.left) left -= viewport.left - active.left;
    else if (active.right > viewport.right) left += active.right - viewport.right;
    if (top !== container.scrollTop || left !== container.scrollLeft) {
      container.scrollTo({ top, left, behavior: "auto" });
    }
    thumbnailScrollPending.current = false;
  }, [controlsVisible, current, document, thumbnailsVisible]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!document || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
        return;
      }
      if (event.key === "ArrowLeft") {
        if (direction === "ltr") previous();
        else next();
      } else if (event.key === "ArrowRight") {
        if (direction === "ltr") next();
        else previous();
      } else if (event.key === "PageUp") {
        previous();
      } else if (event.key === "PageDown") {
        next();
      } else if (event.key === "Home") {
        setCurrent(0);
      } else if (event.key === "End") {
        setCurrent(pageCount - 1);
      } else {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const choose = () => input.current?.click();

  const openFile = async (files: File[]) => {
    const file = files[0];
    if (!file || busy) return;
    setBusy(true);
    setMessage("");
    setProgress({ current: 0, total: 1 });
    try {
      const [buffer, fingerprint] = await Promise.all([file.arrayBuffer(), fingerprintFile(file)]);
      const info = inspectApng(new Uint8Array(buffer));
      setProgress({ current: 0, total: info.frameCount });
      const decoded = await decodeComic(
        buffer,
        { thumbnails: true, preserveMetadata: false },
        setProgress,
      ).promise;
      const frameUrls = decoded.frames.map((frame) =>
        URL.createObjectURL(new Blob([frame.png], { type: "image/png" })),
      );
      const thumbnailUrls = decoded.frames.map((frame) =>
        URL.createObjectURL(new Blob([frame.thumbnail ?? frame.png], { type: "image/png" })),
      );
      const nextDocument: ReaderDocument = {
        name: file.name,
        info: decoded.info,
        frameUrls,
        thumbnailUrls,
        fingerprint,
      };
      const restored = await loadReaderProgress(fingerprint, frameUrls.length);
      const privateDirection = decoded.info.metadata.privateMetadata.reading_direction;
      if (privateDirection === "ltr" || privateDirection === "rtl") {
        setDirection(privateDirection);
        writeDirection(privateDirection);
      }
      setDocument((existing) => {
        releaseDocument(existing);
        return nextDocument;
      });
      setCurrent(restored);
      setZoom(1);
      setFitMode("page");
      if (restored > 0) setMessage(t("reader.progress_restored"));
    } catch {
      setMessage(t("error.reader_failed"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const fileChanged = (event: ChangeEvent<HTMLInputElement>) => {
    void openFile([...(event.target.files ?? [])]);
    event.target.value = "";
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void openFile([...event.dataTransfer.files]);
  };

  const changeDirection = (value: ReadingDirection) => {
    setDirection(value);
    writeDirection(value);
  };

  const fullscreen = async () => {
    if (!root.current?.requestFullscreen) return;
    try {
      await root.current.requestFullscreen();
    } catch {
      return;
    }
  };

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      swipeStart.current = { x: event.clientX, y: event.clientY, time: Date.now() };
      pinched.current = false;
    } else if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      if (first && second) {
        pinch.current = { distance: Math.hypot(second.x - first.x, second.y - first.y), zoom };
        pinched.current = true;
      }
    }
  };

  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [first, second] = [...pointers.current.values()];
      if (first && second) {
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        if (pinch.current.distance > 0) {
          setZoom(clampZoom(pinch.current.zoom * (distance / pinch.current.distance)));
        }
      }
    }
  };

  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (
      pointers.current.size === 0 &&
      start &&
      !pinched.current &&
      Date.now() - start.time < 700
    ) {
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      if (Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
        const physicalNext = deltaX < 0;
        const shouldAdvance = direction === "ltr" ? physicalNext : !physicalNext;
        if (shouldAdvance) next();
        else previous();
      }
    }
    if (pointers.current.size === 0) swipeStart.current = null;
  };

  const physicalLeft = direction === "ltr" ? previous : next;
  const physicalRight = direction === "ltr" ? next : previous;

  return (
    <div
      ref={root}
      className={`feature reader-feature ${controlsVisible ? "controls-visible" : "controls-hidden"}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
    >
      <FeatureHeader
        title={t("reader.title")}
        subtitle={t("reader.subtitle")}
        actions={
          <>
            <button type="button" className="button" onClick={choose} disabled={busy}>
              <BookOpen aria-hidden="true" size={19} />
              <span>{t("reader.open")}</span>
            </button>
            {document && (
              <button
                type="button"
                className="button reader-control-toggle"
                onClick={() => setControlsVisible((value) => !value)}
              >
                {controlsVisible ? <EyeOff aria-hidden="true" size={19} /> : <Eye aria-hidden="true" size={19} />}
                <span>{t(controlsVisible ? "reader.hide_controls" : "reader.show_controls")}</span>
              </button>
            )}
          </>
        }
      />
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept="image/png,.png,.apng"
        onChange={fileChanged}
      />
      {message && <div className="inline-message reader-message" role="status">{message}</div>}
      {progress && (
        <ProgressBar
          {...progress}
          label={t("reader.loading", {
            current: progress.current,
            total: progress.total,
          })}
        />
      )}

      {!document ? (
        <div className="reader-empty">
          <DropSurface
            title={t("reader.drop_title")}
            help={t("reader.drop_help")}
            action={t("reader.open")}
            onChoose={choose}
            onFiles={(files) => void openFile(files)}
          />
        </div>
      ) : (
        <div className="reader-workspace">
          <aside className={`reader-thumbnails ${thumbnailsVisible ? "open" : ""}`} aria-label={t("reader.thumbnails")}>
            <div className="reader-thumbnail-heading">
              <span>{t("reader.thumbnails")}</span>
              <strong>{t("common.pages", { count: pageCount })}</strong>
            </div>
            <div className="reader-thumbnail-list" ref={thumbnailList}>
              {document.thumbnailUrls.map((url, index) => (
                <button
                  type="button"
                  key={url}
                  ref={current === index ? activeThumbnail : null}
                  className={current === index ? "active" : ""}
                  aria-label={t("common.page", { number: index + 1 })}
                  aria-current={current === index ? "page" : undefined}
                  onClick={() => setCurrent(index)}
                >
                  <img src={url} alt="" />
                  <span>{index + 1}</span>
                </button>
              ))}
            </div>
          </aside>

          <div
            className={`reader-stage fit-${fitMode}`}
            style={{ touchAction: zoom > 1 ? "none" : "pan-y" }}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            data-testid="reader-stage"
          >
            <button
              type="button"
              className="reader-tap-zone left"
              aria-label={t(direction === "ltr" ? "reader.previous" : "reader.next")}
              onClick={physicalLeft}
            />
            <div className="reader-image-shell">
              <img
                className="reader-image"
                src={document.frameUrls[current]}
                alt={t("common.page", { number: current + 1 })}
                draggable={false}
                style={{ transform: `scale(${zoom})` }}
              />
            </div>
            <button
              type="button"
              className="reader-tap-zone right"
              aria-label={t(direction === "ltr" ? "reader.next" : "reader.previous")}
              onClick={physicalRight}
            />
          </div>

          <div className="reader-toolbar" role="toolbar">
            <IconButton
              icon={thumbnailsVisible ? PanelLeftClose : PanelLeftOpen}
              label={t(thumbnailsVisible ? "reader.hide_controls" : "reader.show_thumbnails")}
              compact
              onClick={() => setThumbnailsVisible((value) => !value)}
            />
            <div className="reader-navigation-controls">
              <IconButton
                icon={ChevronLeft}
                label={t("reader.previous")}
                compact
                disabled={current === 0}
                onClick={previous}
              />
              <span className="reader-counter">
                {t("reader.page_counter", { current: current + 1, total: pageCount })}
              </span>
              <label className="page-jump">
                <span className="visually-hidden">{t("reader.jump")}</span>
                <input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={current + 1}
                  onChange={(event) =>
                    setCurrent(Math.max(0, Math.min(pageCount - 1, Number(event.target.value) - 1)))
                  }
                />
              </label>
              <IconButton
                icon={ChevronRight}
                label={t("reader.next")}
                compact
                disabled={current === pageCount - 1}
                onClick={next}
              />
            </div>
            <div className="reader-view-controls">
              <IconButton
                icon={ZoomOut}
                label={t("reader.zoom_out")}
                compact
                onClick={() => setZoom((value) => clampZoom(value - 0.25))}
              />
              <span>{t("common.zoom_percent", { value: Math.round(zoom * 100) })}</span>
              <IconButton
                icon={ZoomIn}
                label={t("reader.zoom_in")}
                compact
                onClick={() => setZoom((value) => clampZoom(value + 0.25))}
              />
              <IconButton
                icon={Scan}
                label={t("reader.fit_page")}
                compact
                className={fitMode === "page" ? "active" : ""}
                onClick={() => {
                  setFitMode("page");
                  setZoom(1);
                }}
              />
              <IconButton
                icon={GalleryVerticalEnd}
                label={t("reader.fit_width")}
                compact
                className={fitMode === "width" ? "active" : ""}
                onClick={() => {
                  setFitMode("width");
                  setZoom(1);
                }}
              />
              <IconButton icon={Maximize2} label={t("reader.fullscreen")} compact onClick={() => void fullscreen()} />
            </div>
            <label className="direction-control">
              <span>{t("reader.direction")}</span>
              <select
                value={direction}
                onChange={(event) => changeDirection(event.target.value as ReadingDirection)}
              >
                <option value="ltr">{t("reader.direction_ltr")}</option>
                <option value="rtl">{t("reader.direction_rtl")}</option>
              </select>
            </label>
            <IconButton icon={Fullscreen} label={t("reader.fullscreen")} compact className="fullscreen-compact" onClick={() => void fullscreen()} />
          </div>
        </div>
      )}
    </div>
  );
}
