import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { I18nProvider } from "./i18n";
import { LayoutModeProvider } from "./layouts/LayoutMode";
import { UpdateProvider } from "./services/update";
import "./styles/global.css";

document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <LayoutModeProvider>
        <UpdateProvider>
          <App />
        </UpdateProvider>
      </LayoutModeProvider>
    </I18nProvider>
  </StrictMode>,
);
