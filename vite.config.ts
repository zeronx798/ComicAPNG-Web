import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { createVersionDescriptor, resolveBuildInfo } from "./scripts/version.mjs";

export default defineConfig(({ mode }) => {
  const buildInfo = resolveBuildInfo();
  const base =
    process.env.COMICAPNG_BASE ?? (mode === "production" ? "/ComicAPNG-Web/" : "/");

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(buildInfo.version),
      __APP_COMMIT__: JSON.stringify(buildInfo.commit),
      __BUILD_DATE__: JSON.stringify(buildInfo.buildDate),
    },
    plugins: [
      react(),
      {
        name: "comicapng-version-descriptor",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "version.json",
            source: `${JSON.stringify(createVersionDescriptor(buildInfo))}\n`,
          });
        },
      },
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
        includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
        manifest: {
          name: "ComicAPNG Web",
          short_name: "ComicAPNG",
          description: "Create, extract, and read APNG comics locally.",
          theme_color: "#15181d",
          background_color: "#15181d",
          display: "standalone",
          start_url: base,
          scope: base,
          icons: [
            {
              src: "icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
          navigateFallback: "index.html",
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /version\.json$/,
              handler: "NetworkFirst",
              options: {
                cacheName: "comicapng-version",
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 2, maxAgeSeconds: 86400 },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    worker: { format: "es" },
    test: {
      environment: "jsdom",
      setupFiles: ["./tests/setup.ts"],
      include: ["tests/**/*.test.{ts,tsx,mjs}"],
      coverage: { reporter: ["text", "html"] },
    },
  };
});
