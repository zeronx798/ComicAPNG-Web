import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { registerSW } from "virtual:pwa-register";

export type UpdateStatus = "latest" | "update_available" | "offline" | "check_failed";

interface UpdateValue {
  status: UpdateStatus;
  check: () => Promise<void>;
  reloadToUpdate: () => Promise<void>;
}

interface VersionDescriptor {
  version: string;
  commit: string;
  buildDate?: string;
}

const CHECK_KEY = "comicapng.update.last_check";
const CHECK_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const UpdateContext = createContext<UpdateValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>(navigator.onLine ? "latest" : "offline");
  const updateServiceWorker = useRef<(reloadPage?: boolean) => Promise<void>>(async () => undefined);

  const check = useCallback(async () => {
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}version.json`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("update.http_error");
      const descriptor = (await response.json()) as VersionDescriptor;
      const changed =
        descriptor.version !== __APP_VERSION__ || descriptor.commit !== __APP_COMMIT__;
      setStatus(changed ? "update_available" : "latest");
      localStorage.setItem(CHECK_KEY, String(Date.now()));
    } catch {
      setStatus(navigator.onLine ? "check_failed" : "offline");
    }
  }, []);

  useEffect(() => {
    updateServiceWorker.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setStatus("update_available"),
      onOfflineReady: () => {
        if (!navigator.onLine) setStatus("offline");
      },
      onRegisterError: () => setStatus(navigator.onLine ? "check_failed" : "offline"),
    });
    const online = () => {
      setStatus((current) => (current === "offline" ? "latest" : current));
      void check();
    };
    const offline = () => setStatus("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const lastCheck = Number.parseInt(localStorage.getItem(CHECK_KEY) ?? "0", 10);
    if (navigator.onLine && Date.now() - lastCheck > CHECK_COOLDOWN_MS) {
      void check();
    }
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [check]);

  const reloadToUpdate = useCallback(async () => {
    await updateServiceWorker.current(true);
    window.location.reload();
  }, []);

  const value = useMemo(
    () => ({ status, check, reloadToUpdate }),
    [status, check, reloadToUpdate],
  );
  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdate(): UpdateValue {
  const value = useContext(UpdateContext);
  if (!value) throw new Error("UpdateProvider is missing");
  return value;
}
