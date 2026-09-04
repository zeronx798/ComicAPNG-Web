import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type LayoutMode = "compact" | "comfortable" | "expanded";

export interface ViewportSize {
  width: number;
  height: number;
}

export const LAYOUT_THRESHOLDS = {
  comfortableWidth: 640,
  expandedWidth: 1000,
  expandedHeight: 640,
} as const;

interface LayoutContextValue {
  mode: LayoutMode;
  viewport: ViewportSize;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function classifyLayout({ width, height }: ViewportSize): LayoutMode {
  if (width < LAYOUT_THRESHOLDS.comfortableWidth) return "compact";
  if (
    width >= LAYOUT_THRESHOLDS.expandedWidth &&
    height >= LAYOUT_THRESHOLDS.expandedHeight
  ) {
    return "expanded";
  }
  return "comfortable";
}

function readViewport(): ViewportSize {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function LayoutModeProvider({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    const update = () => setViewport(readViewport());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const value = useMemo<LayoutContextValue>(
    () => ({ mode: classifyLayout(viewport), viewport }),
    [viewport],
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayoutMode(): LayoutMode {
  const context = useContext(LayoutContext);
  if (!context) throw new Error("useLayoutMode must be used within LayoutModeProvider");
  return context.mode;
}
