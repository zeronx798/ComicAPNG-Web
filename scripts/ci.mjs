import { spawnSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is unavailable; run this pipeline through npm run ci");
const steps = [
  ["environment", ["run", "validate:env"]],
  ["version resolution", ["run", "validate:version"]],
  ["source policy", ["run", "validate:source"]],
  ["lint", ["run", "lint"]],
  ["typecheck", ["run", "typecheck"]],
  ["unit tests", ["run", "test:unit"]],
  ["APNG core tests", ["run", "test:core"]],
  ["production build", ["run", "build"]],
  ["PWA and artifact validation", ["run", "validate:pwa"]],
  ["Playwright browser installation", ["run", "prepare:e2e"]],
  ["functional, responsive, compatibility, and offline tests", ["run", "test:e2e"]],
  ["final artifact validation", ["run", "validate:pwa"]],
  ["versioned static archive", ["run", "package:release"]],
  ["release archive and checksum validation", ["run", "validate:release"]],
];

for (const [label, args] of steps) {
  console.log(`\n[ci] ${label}`);
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("\n[ci] complete");
