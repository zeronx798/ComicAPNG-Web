import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveBuildInfo } from "./version.mjs";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const required = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "version.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];
for (const path of required) {
  const absolute = join(dist, path);
  if (!existsSync(absolute) || statSync(absolute).size === 0) {
    throw new Error(`Production artifact is missing: ${path}`);
  }
}
const index = readFileSync(join(dist, "index.html"), "utf8");
if (!index.includes("/ComicAPNG-Web/assets/")) {
  throw new Error("Production assets do not use the GitHub Pages repository subpath");
}
const manifest = JSON.parse(readFileSync(join(dist, "manifest.webmanifest"), "utf8"));
if (manifest.start_url !== "/ComicAPNG-Web/" || manifest.scope !== "/ComicAPNG-Web/") {
  throw new Error("PWA manifest has an invalid Pages start URL or scope");
}
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) {
  throw new Error("PWA manifest icons are incomplete");
}
const version = JSON.parse(readFileSync(join(dist, "version.json"), "utf8"));
if (!version.version || !version.commit || !version.buildDate) {
  throw new Error("Version descriptor is incomplete");
}
const expectedBuild = resolveBuildInfo({ buildDate: version.buildDate });
if (version.version !== expectedBuild.version || version.commit !== expectedBuild.commit) {
  throw new Error(
    `Version descriptor does not match resolved build ${expectedBuild.version} (${expectedBuild.commit})`,
  );
}
if (Number.isNaN(Date.parse(version.buildDate))) {
  throw new Error("Version descriptor has an invalid build date");
}
const worker = readFileSync(join(dist, "sw.js"), "utf8");
if (!worker.includes("index.html") || !worker.includes("manifest.webmanifest")) {
  throw new Error("Service worker does not precache the application shell");
}
const assetFiles = readdirSync(join(dist, "assets"));
if (!assetFiles.some((name) => name.startsWith("image.worker-") && name.endsWith(".js"))) {
  throw new Error("Production image worker is missing");
}
console.log(`Production artifact validated: ${version.version} (${version.commit})`);
