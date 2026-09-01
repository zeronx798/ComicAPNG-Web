import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative } from "node:path";
import { zipSync } from "fflate";
import {
  PROJECT_ROOT,
  readCanonicalVersion,
  releaseTagFromEnvironment,
  resolveProjectVersion,
} from "./version.mjs";

const explicitTag = process.argv[2];
const resolvedVersion = resolveProjectVersion(
  readCanonicalVersion(),
  explicitTag ?? releaseTagFromEnvironment(),
);
const root = PROJECT_ROOT;
const dist = join(root, "dist");
const release = join(root, "release");
const files = {};

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) collect(absolute);
    else files[relative(dist, absolute).replaceAll("\\", "/")] = new Uint8Array(readFileSync(absolute));
  }
}

if (!existsSync(dist) || !statSync(dist).isDirectory()) {
  throw new Error("Production dist directory is missing");
}
const descriptor = JSON.parse(readFileSync(join(dist, "version.json"), "utf8"));
if (descriptor.version !== resolvedVersion.version) {
  throw new Error(
    `Built version ${descriptor.version} does not match requested package ${resolvedVersion.version}`,
  );
}
collect(dist);
rmSync(release, { recursive: true, force: true });
mkdirSync(release, { recursive: true });
const archiveName = resolvedVersion.archiveName;
const archivePath = join(release, archiveName);
writeFileSync(archivePath, zipSync(files, { level: 9 }));
const digest = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
writeFileSync(join(release, "SHA256SUMS.txt"), `${digest}  ${basename(archivePath)}\n`, "ascii");
console.log(`Created ${archiveName} and SHA256SUMS.txt`);
