import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "./en.json";
import zhCn from "./zh-CN.json";

export type Locale = "en" | "zh-CN";
type Parameters = Record<string, string | number>;
type Messages = Record<string, string>;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, parameters?: Parameters) => string;
}

const dictionaries: Record<Locale, Messages> = {
  en,
  "zh-CN": zhCn,
};

function initialLocale(): Locale {
  const saved = localStorage.getItem("comicapng.language");
  if (saved === "en" || saved === "zh-CN") {
    return saved;
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((value: Locale) => {
    localStorage.setItem("comicapng.language", value);
    document.documentElement.lang = value;
    setLocaleState(value);
  }, []);

  const t = useCallback(
    (key: string, parameters: Parameters = {}) => {
      const template = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
      return Object.entries(parameters).reduce(
        (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
        template,
      );
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("I18nProvider is missing");
  }
  return value;
}

export const supportedLocales: Locale[] = ["en", "zh-CN"];
