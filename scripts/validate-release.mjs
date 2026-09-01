import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
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
const releaseDirectory = resolve(PROJECT_ROOT, "release");
const archivePath = resolve(releaseDirectory, resolvedVersion.archiveName);
const checksumPath = resolve(releaseDirectory, "SHA256SUMS.txt");
if (!existsSync(archivePath) || !existsSync(checksumPath)) {
  throw new Error(`Release output is incomplete for ${resolvedVersion.version}`);
}
const releaseFiles = readdirSync(releaseDirectory).sort();
const expectedFiles = ["SHA256SUMS.txt", resolvedVersion.archiveName].sort();
if (JSON.stringify(releaseFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(`Release directory has unexpected files: ${releaseFiles.join(", ")}`);
}
const archive = readFileSync(archivePath);
const digest = createHash("sha256").update(archive).digest("hex");
const checksum = readFileSync(checksumPath, "ascii");
if (checksum !== `${digest}  ${resolvedVersion.archiveName}\n`) {
  throw new Error("SHA256SUMS.txt does not match the versioned archive");
}
const entries = unzipSync(new Uint8Array(archive));
for (const required of ["index.html", "manifest.webmanifest", "sw.js", "version.json"]) {
  if (!entries[required]) throw new Error(`Release archive is missing ${required}`);
}
const descriptor = JSON.parse(new TextDecoder().decode(entries["version.json"]));
if (descriptor.version !== resolvedVersion.version) {
  throw new Error(
    `Archived version ${descriptor.version} does not match ${resolvedVersion.version}`,
  );
}
console.log(`Release artifact validated: ${resolvedVersion.archiveName}`);
