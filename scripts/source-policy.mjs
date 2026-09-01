import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "release",
  "test-results",
]);
const textExtensions = new Set([
  ".c",
  ".cjs",
  ".cpp",
  ".css",
  ".h",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".ps1",
  ".scss",
  ".sh",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const primaryExtensions = new Set([
  ".c",
  ".cjs",
  ".cpp",
  ".css",
  ".h",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ps1",
  ".scss",
  ".sh",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const textBasenames = new Set([".gitignore", "LICENSE", "NOTICE"]);
const emojiPattern = new RegExp(
  "[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2300}-\\u{23FF}\\u{2B00}-\\u{2BFF}]",
  "u",
);

function filesIn(directory) {
  const results = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) results.push(...filesIn(join(directory, entry.name)));
    } else {
      results.push(join(directory, entry.name));
    }
  }
  return results;
}

const errors = [];
for (const file of filesIn(root)) {
  const extension = extname(file).toLowerCase();
  if (!textExtensions.has(extension) && !textBasenames.has(entryName(file))) continue;
  const path = relative(root, file).replaceAll("\\", "/");
  const bytes = readFileSync(file);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    errors.push(`${path}: UTF-8 BOM is not allowed`);
  }
  const text = bytes.toString("utf8");
  if (text.includes("\ufffd")) errors.push(`${path}: invalid UTF-8 text`);
  if (emojiPattern.test(text)) errors.push(`${path}: emoji is not allowed`);
  const isI18n = path.startsWith("src/i18n/") && extension === ".json";
  const isDocumentation = extension === ".md";
  const isPrimaryJson = extension === ".json" && !isI18n;
  if ((primaryExtensions.has(extension) || isPrimaryJson) && !isDocumentation && !isI18n) {
    for (let index = 0; index < bytes.length; index += 1) {
      if ((bytes[index] ?? 0) > 0x7f) {
        errors.push(`${path}: primary source must be ASCII-only`);
        break;
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Source character, UTF-8 BOM, and emoji policies passed");

function entryName(path) {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}
