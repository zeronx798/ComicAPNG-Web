import { BookOpen, Images, PackageOpen, Settings, ShieldCheck, WifiOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { useUpdate } from "../services/update";
import { useLayoutMode } from "./LayoutMode";
import { SettingsDrawer } from "./SettingsDrawer";

export type FeatureId = "create" | "extract" | "read";

const destinations = [
  { id: "create", key: "nav.create", icon: Images },
  { id: "extract", key: "nav.extract", icon: PackageOpen },
  { id: "read", key: "nav.read", icon: BookOpen },
] as const;

function Navigation({ active, onChange }: { active: FeatureId; onChange: (id: FeatureId) => void }) {
  const { t } = useI18n();
  return (
    <nav className="primary-navigation" aria-label={t("aria.primary_navigation")}>
      {destinations.map(({ id, key, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={active === id ? "active" : ""}
          aria-current={active === id ? "page" : undefined}
          onClick={() => onChange(id)}
          data-testid={`nav-${id}`}
        >
          <Icon aria-hidden="true" size={22} strokeWidth={1.8} />
          <span>{t(key)}</span>
        </button>
      ))}
    </nav>
  );
}

function Status() {
  const { t } = useI18n();
  const { status } = useUpdate();
  const offline = status === "offline";
  const label =
    status === "update_available"
      ? t("status.update")
      : status === "check_failed"
        ? t("status.check_failed")
        : offline
          ? t("status.offline")
          : t("app.local_only");
  return (
    <span className={`app-status ${status}`} aria-label={t("aria.status")}>
      {offline ? <WifiOff aria-hidden="true" size={14} /> : <ShieldCheck aria-hidden="true" size={14} />}
      <span>{label}</span>
      {(status === "update_available" || status === "check_failed") && (
        <span className="status-dot" aria-hidden="true" />
      )}
    </span>
  );
}

export function AppShell({
  active,
  onChange,
  children,
}: {
  active: FeatureId;
  onChange: (id: FeatureId) => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const layoutMode = useLayoutMode();
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className={`app-shell active-${active}`} data-layout={layoutMode}>
      <aside className="sidebar-navigation">
        <div className="brand-block">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
          <div>
            <strong>{t("app.name")}</strong>
            <span>{t("app.tagline")}</span>
          </div>
        </div>
        <Navigation active={active} onChange={onChange} />
        <div className="sidebar-footer">
          <Status />
          <button type="button" onClick={() => setSettingsOpen(true)}>
            <Settings aria-hidden="true" size={19} />
            <span>{t("common.settings")}</span>
            <small>{__APP_VERSION__}</small>
          </button>
        </div>
      </aside>

      <header className="top-app-bar">
        <div className="app-bar-brand">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
          <strong>{t("app.name")}</strong>
        </div>
        <Status />
        <button
          type="button"
          className="app-bar-button"
          aria-label={t("aria.open_settings")}
          onClick={() => setSettingsOpen(true)}
        >
          <Settings aria-hidden="true" size={21} />
        </button>
      </header>

      <main className="app-main">{children}</main>
      <div className="bottom-navigation">
        <Navigation active={active} onChange={onChange} />
      </div>
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
