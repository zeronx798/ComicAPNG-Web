import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
if (major < 22) {
  throw new Error("Node.js 22 or newer is required");
}
for (const relative of ["package.json", "package-lock.json", "node_modules/.package-lock.json"]) {
  if (!existsSync(resolve(root, relative))) {
    throw new Error(`Required dependency file is missing: ${relative}`);
  }
}
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
for (const dependency of ["react", "apng-js", "fflate", "vite", "@playwright/test"]) {
  if (!packageJson.dependencies?.[dependency] && !packageJson.devDependencies?.[dependency]) {
    throw new Error(`Required dependency is not declared: ${dependency}`);
  }
}
console.log(`Environment ready: Node ${process.versions.node}`);
