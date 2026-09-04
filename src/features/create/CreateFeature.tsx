import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Crown,
  FilePlus2,
  Save,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  DEFAULT_BODY_DURATION_MS,
  DEFAULT_COVER_DURATION_MS,
  pagesForExport,
  type ComicPage,
  type ReadingDirection,
} from "../../core/comic/types";
import { releasePage } from "../../core/image/importer";
import { importComicFiles } from "../../services/documentImport";
import { downloadBlob } from "../../services/download";
import { readDirection, readNumber, writeDirection, writeNumber } from "../../services/settings";
import { encodeComic, type ProgressValue } from "../../workers/client";
import { DropSurface } from "../../components/DropSurface";
import { FeatureHeader } from "../../components/FeatureHeader";
import { IconButton } from "../../components/IconButton";
import { ProgressBar } from "../../components/ProgressBar";
import { useI18n } from "../../i18n";
import { useLayoutMode } from "../../layouts/LayoutMode";

interface SelectionBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface RectangleStart {
  clientX: number;
  clientY: number;
  initial: Set<string>;
}

function reorderedPages(pages: ComicPage[], selected: Set<string>, operation: string): ComicPage[] {
  const result = [...pages];
  if (operation === "earlier") {
    for (let index = 1; index < result.length; index += 1) {
      const page = result[index];
      const previous = result[index - 1];
      if (page && previous && selected.has(page.id) && !selected.has(previous.id)) {
        [result[index - 1], result[index]] = [page, previous];
      }
    }
  } else if (operation === "later") {
    for (let index = result.length - 2; index >= 0; index -= 1) {
      const page = result[index];
      const next = result[index + 1];
      if (page && next && selected.has(page.id) && !selected.has(next.id)) {
        [result[index], result[index + 1]] = [next, page];
      }
    }
  } else {
    const moving = result.filter((page) => selected.has(page.id));
    const remaining = result.filter((page) => !selected.has(page.id));
    return operation === "start" ? [...moving, ...remaining] : [...remaining, ...moving];
  }
  return result;
}

function intersects(left: DOMRect, right: DOMRect): boolean {
  return !(
    left.right < right.left ||
    left.left > right.right ||
    left.bottom < right.top ||
    left.top > right.bottom
  );
}

export function CreateFeature() {
  const { t } = useI18n();
  const layoutMode = useLayoutMode();
  const [pages, setPages] = useState<ComicPage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [coverDurationMs, setCoverDurationMs] = useState(() =>
    readNumber("cover_duration", DEFAULT_COVER_DURATION_MS),
  );
  const [bodyDurationMs, setBodyDurationMs] = useState(() =>
    readNumber("body_duration", DEFAULT_BODY_DURATION_MS),
  );
  const [direction, setDirection] = useState<ReadingDirection>(readDirection);
  const [metadataTitle, setMetadataTitle] = useState("");
  const [metadataAuthor, setMetadataAuthor] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressValue | null>(null);
  const [message, setMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<ComicPage[]>([]);
  const anchor = useRef<string | null>(null);
  const rectangleStart = useRef<RectangleStart | null>(null);
  const dragged = useRef<string | null>(null);
  const pointerType = useRef("mouse");

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(
    () => () => {
      pagesRef.current.forEach(releasePage);
    },
    [],
  );

  const chooseFiles = () => fileInput.current?.click();

  const addFiles = async (files: File[]) => {
    if (busy || files.length === 0) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await importComicFiles(files, pages.length > 0);
      setPages((current) => [...current, ...result.pages]);
      if (result.settings) {
        setDirection(result.settings.readingDirection);
        setCoverDurationMs(result.settings.coverDurationMs);
        setBodyDurationMs(result.settings.bodyDurationMs);
        setMetadataTitle(result.settings.title ?? "");
        setMetadataAuthor(result.settings.author ?? "");
      }
      const messages = result.notices.map((notice) => t(`creator.${notice}`));
      if (result.failures > 0) {
        messages.push(t("creator.import_failed", { count: result.failures }));
      }
      setMessage(messages.join(" "));
    } catch {
      setMessage(t("creator.import_failed", { count: files.length }));
    } finally {
      setBusy(false);
    }
  };

  const fileChanged = (event: ChangeEvent<HTMLInputElement>) => {
    void addFiles([...(event.target.files ?? [])]);
    event.target.value = "";
  };

  const pageClicked = (event: MouseEvent, id: string, index: number) => {
    const explicit = selectionMode || event.ctrlKey || event.metaKey || event.shiftKey;
    if (!explicit && event.detail !== 0 && pointerType.current !== "mouse") return;
    setSelected((current) => {
      if (event.shiftKey && anchor.current) {
        const anchorIndex = pages.findIndex((page) => page.id === anchor.current);
        if (anchorIndex >= 0) {
          const start = Math.min(anchorIndex, index);
          const end = Math.max(anchorIndex, index);
          return new Set(pages.slice(start, end + 1).map((page) => page.id));
        }
      }
      if (event.ctrlKey || event.metaKey || selectionMode) {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        anchor.current = id;
        return next;
      }
      anchor.current = id;
      return new Set([id]);
    });
  };

  const clearSelection = () => {
    setSelected(new Set());
    setSelectionMode(false);
    anchor.current = null;
  };

  const selectAll = () => setSelected(new Set(pages.map((page) => page.id)));

  const deleteSelected = () => {
    if (selected.size === 0) return;
    const removed = pages.filter((page) => selected.has(page.id));
    const remaining = pages.filter((page) => !selected.has(page.id));
    removed.forEach(releasePage);
    if (remaining.length > 0 && !remaining.some((page) => page.isCover)) {
      remaining[0] = { ...remaining[0]!, isCover: true };
    }
    setPages(remaining);
    clearSelection();
  };

  const setCover = () => {
    const id = [...selected][0];
    if (!id || selected.size !== 1) return;
    setPages((current) => current.map((page) => ({ ...page, isCover: page.id === id })));
  };

  const move = (operation: "earlier" | "later" | "start" | "end") => {
    setPages((current) => reorderedPages(current, selected, operation));
  };

  const dropOnPage = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    const draggedId = dragged.current;
    if (!draggedId || draggedId === targetId) return;
    setPages((current) => {
      const movingIds = selected.has(draggedId) ? selected : new Set([draggedId]);
      const moving = current.filter((page) => movingIds.has(page.id));
      const remaining = current.filter((page) => !movingIds.has(page.id));
      const target = remaining.findIndex((page) => page.id === targetId);
      if (target < 0) return current;
      return [...remaining.slice(0, target), ...moving, ...remaining.slice(target)];
    });
  };

  const rectangleDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    rectangleStart.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      initial: event.ctrlKey || event.metaKey ? new Set(selected) : new Set(),
    };
    setSelectionBox({ left: event.clientX, top: event.clientY, width: 0, height: 0 });
  };

  const rectangleMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = rectangleStart.current;
    const container = grid.current;
    if (!start || !container) return;
    const clientRect = new DOMRect(
      Math.min(start.clientX, event.clientX),
      Math.min(start.clientY, event.clientY),
      Math.abs(event.clientX - start.clientX),
      Math.abs(event.clientY - start.clientY),
    );
    const containerRect = container.getBoundingClientRect();
    setSelectionBox({
      left: clientRect.left - containerRect.left + container.scrollLeft,
      top: clientRect.top - containerRect.top + container.scrollTop,
      width: clientRect.width,
      height: clientRect.height,
    });
    const next = new Set(start.initial);
    container.querySelectorAll<HTMLElement>("[data-page-id]").forEach((element) => {
      if (intersects(clientRect, element.getBoundingClientRect())) {
        const id = element.dataset.pageId;
        if (id) next.add(id);
      }
    });
    setSelected(next);
  };

  const rectangleUp = () => {
    rectangleStart.current = null;
    setSelectionBox(null);
  };

  const exportComic = async () => {
    if (pages.length === 0 || busy) return;
    setBusy(true);
    setMessage("");
    setProgress({ current: 0, total: pages.length });
    writeNumber("cover_duration", coverDurationMs);
    writeNumber("body_duration", bodyDurationMs);
    writeDirection(direction);
    const textMetadata: Record<string, string> = {};
    if (metadataTitle.trim()) textMetadata.Title = metadataTitle.trim();
    if (metadataAuthor.trim()) textMetadata.Author = metadataAuthor.trim();
    try {
      const result = await encodeComic(
        {
          pages: pagesForExport(pages, coverDurationMs, bodyDurationMs),
          readingDirection: direction,
          coverDurationMs,
          bodyDurationMs,
          textMetadata,
        },
        setProgress,
      ).promise;
      downloadBlob(new Blob([result.buffer], { type: "image/apng" }), t("creator.export_name"));
      setMessage(t("creator.export_ready"));
      setSettingsOpen(false);
    } catch {
      setMessage(t("error.export_failed"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const settingsPresentation =
    layoutMode === "compact" ? "sheet" : layoutMode === "comfortable" ? "collapsible" : "persistent";
  const settingsVisible = layoutMode === "expanded" || settingsOpen;
  const inspector = settingsVisible ? (
    <aside
      id="creator-settings"
      className="creator-inspector"
      data-presentation={settingsPresentation}
      role={layoutMode === "compact" ? "dialog" : undefined}
      aria-modal={layoutMode === "compact" ? true : undefined}
      aria-label={t("creator.settings_title")}
    >
      <div className="inspector-header">
        <div>
          <span className="eyebrow">{t("creator.settings_title")}</span>
          <strong>{t("common.pages", { count: pages.length })}</strong>
        </div>
        {layoutMode !== "expanded" && (
          <IconButton
            icon={X}
            label={t("common.close")}
            compact
            onClick={() => setSettingsOpen(false)}
          />
        )}
      </div>
      <div className="setting-field">
        <label htmlFor="cover-duration">{t("creator.cover_duration")}</label>
        <div className="number-unit">
          <input
            id="cover-duration"
            type="number"
            min="0.001"
            max="65535"
            step="1"
            value={(coverDurationMs / 1000).toFixed(3)}
            onChange={(event) =>
              setCoverDurationMs(Math.max(1, Math.round(Number(event.target.value) * 1000)))
            }
          />
          <span>{t("common.seconds")}</span>
        </div>
      </div>
      <div className="setting-field">
        <label htmlFor="body-duration">{t("creator.body_duration")}</label>
        <div className="number-unit">
          <input
            id="body-duration"
            type="number"
            min="0.001"
            max="65535"
            step="1"
            value={(bodyDurationMs / 1000).toFixed(3)}
            onChange={(event) =>
              setBodyDurationMs(Math.max(1, Math.round(Number(event.target.value) * 1000)))
            }
          />
          <span>{t("common.seconds")}</span>
        </div>
      </div>
      <div className="setting-field">
        <label htmlFor="create-direction">{t("creator.reading_direction")}</label>
        <select
          id="create-direction"
          value={direction}
          onChange={(event) => setDirection(event.target.value as ReadingDirection)}
        >
          <option value="ltr">{t("reader.direction_ltr")}</option>
          <option value="rtl">{t("reader.direction_rtl")}</option>
        </select>
      </div>
      <details className="metadata-fields">
        <summary>
          <span>{t("creator.metadata_title")}</span>
          <small>{t("creator.metadata_optional")}</small>
        </summary>
        <div className="setting-field">
          <label htmlFor="metadata-title">{t("creator.metadata_title_field")}</label>
          <input
            id="metadata-title"
            type="text"
            value={metadataTitle}
            maxLength={500}
            onChange={(event) => setMetadataTitle(event.target.value)}
          />
        </div>
        <div className="setting-field">
          <label htmlFor="metadata-author">{t("creator.metadata_author")}</label>
          <input
            id="metadata-author"
            type="text"
            value={metadataAuthor}
            maxLength={500}
            onChange={(event) => setMetadataAuthor(event.target.value)}
          />
        </div>
      </details>
      <button
        type="button"
        className="button primary wide"
        disabled={pages.length === 0 || busy}
        onClick={() => void exportComic()}
      >
        <Save aria-hidden="true" size={19} />
        <span>{t("creator.export")}</span>
      </button>
    </aside>
  ) : null;

  return (
    <div className="feature create-feature">
      <FeatureHeader
        title={t("creator.title")}
        subtitle={t("creator.subtitle")}
        actions={
          <>
            <button type="button" className="button" onClick={chooseFiles} disabled={busy}>
              <FilePlus2 aria-hidden="true" size={19} />
              <span>{pages.length > 0 ? t("creator.add_more") : t("creator.add_images")}</span>
            </button>
            {layoutMode !== "expanded" && (
              <button
                type="button"
                className="button creator-settings-toggle"
                aria-controls="creator-settings"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((value) => !value)}
              >
                <Settings2 aria-hidden="true" size={19} />
                <span>{t("common.settings")}</span>
              </button>
            )}
            <button
              type="button"
              className="button primary"
              disabled={pages.length === 0 || busy}
              onClick={() => void exportComic()}
            >
              <Save aria-hidden="true" size={19} />
              <span>{t("creator.export")}</span>
            </button>
          </>
        }
      />
      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept="image/*,.apng,.zip,application/zip"
        multiple
        onChange={fileChanged}
      />

      {message && <div className="inline-message" role="status">{message}</div>}
      {progress && (
        <ProgressBar
          {...progress}
          label={t("creator.export_progress", {
            current: progress.current,
            total: progress.total,
          })}
        />
      )}

      <div
        className="creator-layout"
        data-settings-open={settingsVisible}
        data-settings-presentation={settingsPresentation}
      >
        <div className="creator-content">
          {pages.length === 0 ? (
            <DropSurface
              title={t("creator.drop_title")}
              help={t("creator.drop_help")}
              action={t("creator.add_images")}
              onChoose={chooseFiles}
              onFiles={(files) => void addFiles(files)}
            />
          ) : (
            <>
              <div className="creator-toolbar">
                <span>{t("common.pages", { count: pages.length })}</span>
                <span className="toolbar-help">{t("creator.move_help")}</span>
                <button
                  type="button"
                  className={`button ${selectionMode ? "active" : ""}`}
                  onClick={() => {
                    setSelectionMode((value) => !value);
                    setSelected(new Set());
                  }}
                >
                  <CheckSquare aria-hidden="true" size={18} />
                  <span>{t("common.select")}</span>
                </button>
              </div>
              {(selected.size > 0 || selectionMode) && (
                <div className="selection-toolbar" role="toolbar" aria-label={t("creator.selection_mode")}>
                  <strong>{t("common.selected", { count: selected.size })}</strong>
                  <button type="button" className="button subtle" onClick={selectAll}>
                    {t("common.select_all")}
                  </button>
                  <IconButton
                    icon={Crown}
                    label={t("creator.set_cover")}
                    compact
                    disabled={selected.size !== 1}
                    onClick={setCover}
                  />
                  <IconButton
                    icon={ChevronLeft}
                    label={t("common.move_earlier")}
                    compact
                    disabled={selected.size === 0}
                    onClick={() => move("earlier")}
                  />
                  <IconButton
                    icon={ChevronRight}
                    label={t("common.move_later")}
                    compact
                    disabled={selected.size === 0}
                    onClick={() => move("later")}
                  />
                  <IconButton
                    icon={ArrowUp}
                    label={t("common.move_start")}
                    compact
                    disabled={selected.size === 0}
                    onClick={() => move("start")}
                  />
                  <IconButton
                    icon={ArrowDown}
                    label={t("common.move_end")}
                    compact
                    disabled={selected.size === 0}
                    onClick={() => move("end")}
                  />
                  <IconButton
                    icon={Trash2}
                    label={t("common.delete")}
                    compact
                    className="danger"
                    disabled={selected.size === 0}
                    onClick={deleteSelected}
                  />
                  <IconButton
                    icon={X}
                    label={t("creator.selection_cancel")}
                    compact
                    onClick={clearSelection}
                  />
                </div>
              )}
              <div
                ref={grid}
                className="page-grid"
                aria-label={t("aria.page_grid")}
                onPointerDown={rectangleDown}
                onPointerMove={rectangleMove}
                onPointerUp={rectangleUp}
                onPointerCancel={rectangleUp}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  if (event.dataTransfer.files.length > 0) {
                    event.preventDefault();
                    void addFiles([...event.dataTransfer.files]);
                  }
                }}
              >
                {pages.map((page, index) => (
                  <button
                    type="button"
                    className={`page-card ${selected.has(page.id) ? "selected" : ""}`}
                    key={page.id}
                    data-page-id={page.id}
                    draggable
                    aria-pressed={selected.has(page.id)}
                    aria-label={t("aria.select_page", { number: index + 1 })}
                    onPointerDown={(event) => {
                      pointerType.current = event.pointerType;
                    }}
                    onClick={(event) => pageClicked(event, page.id, index)}
                    onDragStart={(event) => {
                      dragged.current = page.id;
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropOnPage(event, page.id)}
                  >
                    <span className="page-image-wrap">
                      <img src={page.thumbnailUrl} alt="" draggable={false} />
                      <span className="page-number">{index + 1}</span>
                      {page.isCover && (
                        <span className="cover-badge">
                          <Crown aria-hidden="true" size={13} />
                          {t("creator.cover")}
                        </span>
                      )}
                      <span className="selection-check" aria-hidden="true">
                        <CheckSquare size={18} />
                      </span>
                    </span>
                    <span className="page-name" title={page.name}>{page.name}</span>
                    <span className="page-size">{page.width} x {page.height}</span>
                  </button>
                ))}
                {selectionBox && (
                  <span
                    className="selection-rectangle"
                    style={{
                      left: selectionBox.left,
                      top: selectionBox.top,
                      width: selectionBox.width,
                      height: selectionBox.height,
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
        {layoutMode === "compact" && settingsOpen && (
          <button
            type="button"
            className="creator-settings-scrim"
            aria-label={t("common.close")}
            onClick={() => setSettingsOpen(false)}
          />
        )}
        {inspector}
      </div>

      {layoutMode === "compact" && (
        <div className="creator-compact-actions">
          <button type="button" onClick={chooseFiles} disabled={busy}>
            <FilePlus2 aria-hidden="true" size={21} />
            <span>{t("common.add")}</span>
          </button>
          <button
            type="button"
            className={selectionMode ? "active" : ""}
            disabled={pages.length === 0}
            onClick={() => {
              setSelectionMode((value) => !value);
              setSelected(new Set());
            }}
          >
            <CheckSquare aria-hidden="true" size={21} />
            <span>{t("common.select")}</span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={t("creator.show_settings")}
            aria-controls="creator-settings"
            aria-expanded={settingsOpen}
          >
            <Settings2 aria-hidden="true" size={21} />
            <span>{t("common.settings")}</span>
          </button>
          <button
            type="button"
            className="primary"
            disabled={pages.length === 0 || busy}
            onClick={() => void exportComic()}
          >
            <Save aria-hidden="true" size={21} />
            <span>{t("creator.export")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
