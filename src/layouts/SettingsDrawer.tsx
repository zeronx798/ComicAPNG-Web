import {
  Check,
  CloudOff,
  ExternalLink,
  Info,
  Languages,
  RefreshCw,
  ShieldCheck,
  WifiOff,
  X,
} from "lucide-react";
import { useI18n, type Locale } from "../i18n";
import { useUpdate, type UpdateStatus } from "../services/update";
import { IconButton } from "../components/IconButton";

const updateKeys: Record<UpdateStatus, string> = {
  latest: "settings.update_latest",
  update_available: "settings.update_available",
  offline: "settings.update_offline",
  check_failed: "settings.update_failed",
};

export function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { locale, setLocale, t } = useI18n();
  const update = useUpdate();
  return (
    <div className={`drawer-layer ${open ? "open" : ""}`} aria-hidden={!open}>
      <button className="drawer-scrim" type="button" onClick={onClose} tabIndex={open ? 0 : -1} />
      <aside className="settings-drawer" role="dialog" aria-modal="true" aria-label={t("settings.title")}>
        <header className="drawer-header">
          <div>
            <span className="eyebrow">{t("app.name")}</span>
            <h2>{t("settings.title")}</h2>
          </div>
          <IconButton icon={X} label={t("aria.close_settings")} compact onClick={onClose} />
        </header>

        <div className="drawer-scroll">
          <section className="settings-section">
            <div className="settings-heading">
              <Languages aria-hidden="true" size={20} />
              <h3>{t("settings.language")}</h3>
            </div>
            <div className="segmented-control">
              {([
                ["en", "settings.english"],
                ["zh-CN", "settings.chinese"],
              ] as Array<[Locale, string]>).map(([value, key]) => (
                <button
                  type="button"
                  className={locale === value ? "active" : ""}
                  key={value}
                  onClick={() => setLocale(value)}
                >
                  {locale === value && <Check aria-hidden="true" size={16} />}
                  <span>{t(key)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section callout">
            <div className="settings-heading">
              <ShieldCheck aria-hidden="true" size={20} />
              <h3>{t("settings.privacy_title")}</h3>
            </div>
            <p>{t("settings.privacy_body")}</p>
          </section>

          <section className="settings-section">
            <div className="settings-heading">
              <CloudOff aria-hidden="true" size={20} />
              <h3>{t("settings.offline_title")}</h3>
            </div>
            <p>{t("settings.offline_body")}</p>
          </section>

          <section className="settings-section">
            <div className="settings-heading">
              <RefreshCw aria-hidden="true" size={20} />
              <h3>{t("settings.update_title")}</h3>
            </div>
            <div className={`update-message ${update.status}`}>
              {update.status === "offline" ? (
                <WifiOff aria-hidden="true" size={18} />
              ) : update.status === "latest" ? (
                <Check aria-hidden="true" size={18} />
              ) : (
                <Info aria-hidden="true" size={18} />
              )}
              <span>{t(updateKeys[update.status])}</span>
            </div>
            <div className="settings-actions">
              <button type="button" className="button" onClick={() => void update.check()}>
                <RefreshCw aria-hidden="true" size={18} />
                <span>{t("settings.update_check")}</span>
              </button>
              {update.status === "update_available" && (
                <button
                  type="button"
                  className="button primary"
                  onClick={() => void update.reloadToUpdate()}
                >
                  <RefreshCw aria-hidden="true" size={18} />
                  <span>{t("settings.update_reload")}</span>
                </button>
              )}
            </div>
          </section>

          <section className="settings-section build-information">
            <div className="settings-heading">
              <Info aria-hidden="true" size={20} />
              <h3>{t("app.name")}</h3>
            </div>
            <dl>
              <div>
                <dt>{t("settings.version")}</dt>
                <dd data-testid="app-version">{__APP_VERSION__}</dd>
              </div>
              <div>
                <dt>{t("settings.commit")}</dt>
                <dd>{__APP_COMMIT__}</dd>
              </div>
              <div>
                <dt>{t("settings.build_date")}</dt>
                <dd>{new Date(__BUILD_DATE__).toLocaleString(locale)}</dd>
              </div>
            </dl>
            <a href="https://github.com/zeronx798/ComicAPNG" target="_blank" rel="noreferrer">
              <span>{t("settings.desktop_link")}</span>
              <ExternalLink aria-hidden="true" size={16} />
            </a>
            <a href="https://github.com/zeronx798/ComicAPNG-Web" target="_blank" rel="noreferrer">
              <span>{t("settings.source_link")}</span>
              <ExternalLink aria-hidden="true" size={16} />
            </a>
          </section>
        </div>
      </aside>
    </div>
  );
}
