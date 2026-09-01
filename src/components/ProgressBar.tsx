import { useI18n } from "../i18n";

interface ProgressBarProps {
  current: number;
  total: number;
  label: string;
}

export function ProgressBar({ current, total, label }: ProgressBarProps) {
  const { t } = useI18n();
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="progress-panel" role="status" aria-live="polite">
      <div className="progress-copy">
        <span>{label}</span>
        <span>{t("common.progress", { current, total })}</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
