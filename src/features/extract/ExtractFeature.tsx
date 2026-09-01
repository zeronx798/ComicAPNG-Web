import {
  Archive,
  FileImage,
  FolderOpen,
  Layers3,
  PackageOpen,
  Ruler,
  Tags,
} from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { inspectApng } from "../../core/apng/inspect";
import type { ApngInfo } from "../../core/apng/types";
import { PRIVATE_FORMAT_NAME } from "../../core/metadata";
import { DropSurface } from "../../components/DropSurface";
import { FeatureHeader } from "../../components/FeatureHeader";
import { ProgressBar } from "../../components/ProgressBar";
import { useI18n } from "../../i18n";
import {
  archiveName,
  downloadPngZip,
  writePngFolder,
} from "../../services/download";
import { decodeComic, type ProgressValue } from "../../workers/client";

interface SourceDocument {
  file: File;
  info: ApngInfo;
}

export function ExtractFeature() {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<SourceDocument | null>(null);
  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressValue | null>(null);
  const [message, setMessage] = useState("");

  const choose = () => input.current?.click();

  const openFile = async (files: File[]) => {
    const file = files[0];
    if (!file || busy) return;
    setMessage("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const info = inspectApng(bytes);
      setSource({ file, info });
      setDirectory(null);
    } catch {
      setSource(null);
      setMessage(t("extractor.invalid"));
    }
  };

  const fileChanged = (event: ChangeEvent<HTMLInputElement>) => {
    void openFile([...(event.target.files ?? [])]);
    event.target.value = "";
  };

  const chooseDirectory = async () => {
    if (!window.showDirectoryPicker) return;
    try {
      setDirectory(await window.showDirectoryPicker({ mode: "readwrite" }));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage(t("error.extract_failed"));
      }
    }
  };

  const extract = async () => {
    if (!source || busy) return;
    setBusy(true);
    setMessage("");
    setProgress({ current: 0, total: source.info.frameCount });
    try {
      const buffer = await source.file.arrayBuffer();
      const document = await decodeComic(
        buffer,
        { thumbnails: false, preserveMetadata: true },
        setProgress,
      ).promise;
      const frames = document.frames.map((frame) => frame.png);
      if (directory) {
        await writePngFolder(directory, frames);
      } else {
        downloadPngZip(frames, archiveName(source.file.name));
      }
      setMessage(t("extractor.complete", { count: frames.length }));
    } catch {
      setMessage(t("error.extract_failed"));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  };

  const privatePresent =
    source?.info.metadata.privateMetadata.format === PRIVATE_FORMAT_NAME ? 1 : 0;

  return (
    <div className="feature extract-feature">
      <FeatureHeader title={t("extractor.title")} subtitle={t("extractor.subtitle")} />
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept="image/png,.png,.apng"
        onChange={fileChanged}
      />
      {message && <div className="inline-message" role="status">{message}</div>}
      {progress && (
        <ProgressBar
          {...progress}
          label={t("extractor.extract_progress", {
            current: progress.current,
            total: progress.total,
          })}
        />
      )}

      <div className="extract-layout">
        <DropSurface
          compact={source !== null}
          title={source ? source.file.name : t("extractor.drop_title")}
          help={source ? t("extractor.drop_help") : t("extractor.drop_help")}
          action={t("extractor.choose")}
          onChoose={choose}
          onFiles={(files) => void openFile(files)}
        />

        {source && (
          <div className="extract-details">
            <section className="detail-grid">
              <article>
                <span className="detail-icon"><FileImage aria-hidden="true" size={20} /></span>
                <div>
                  <span>{t("extractor.type")}</span>
                  <strong>{t(source.info.isAnimated ? "extractor.type_apng" : "extractor.type_static")}</strong>
                </div>
              </article>
              <article>
                <span className="detail-icon"><Layers3 aria-hidden="true" size={20} /></span>
                <div>
                  <span>{t("extractor.frames")}</span>
                  <strong>{source.info.frameCount}</strong>
                </div>
              </article>
              <article>
                <span className="detail-icon"><Ruler aria-hidden="true" size={20} /></span>
                <div>
                  <span>{t("extractor.canvas")}</span>
                  <strong>{source.info.width} x {source.info.height}</strong>
                </div>
              </article>
              <article>
                <span className="detail-icon"><Tags aria-hidden="true" size={20} /></span>
                <div>
                  <span>{t("extractor.metadata")}</span>
                  <strong>
                    {t("extractor.metadata_summary", {
                      text: Object.keys(source.info.metadata.text).length,
                      exif: source.info.metadata.rawExif ? 1 : 0,
                      private: privatePresent,
                    })}
                  </strong>
                </div>
              </article>
            </section>

            <section className="output-panel">
              <div className="output-copy">
                <Archive aria-hidden="true" size={23} />
                <div>
                  <span className="eyebrow">{t("extractor.output")}</span>
                  <strong>
                    {t(directory ? "extractor.output_folder" : "extractor.output_zip")}
                  </strong>
                  <small>
                    {directory
                      ? `${t("extractor.folder_selected")}: ${directory.name}`
                      : t("extractor.folder_unavailable")}
                  </small>
                </div>
              </div>
              <div className="output-actions">
                {window.showDirectoryPicker && (
                  <button type="button" className="button" onClick={() => void chooseDirectory()}>
                    <FolderOpen aria-hidden="true" size={19} />
                    <span>{t("extractor.choose_folder")}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() => void extract()}
                >
                  <PackageOpen aria-hidden="true" size={19} />
                  <span>{t("extractor.extract")}</span>
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
