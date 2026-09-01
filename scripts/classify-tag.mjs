import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  PROJECT_ROOT,
  readCanonicalVersion,
  releaseTagFromEnvironment,
  resolveProjectVersion,
} from "./version.mjs";

const resolved = resolveProjectVersion(readCanonicalVersion(), releaseTagFromEnvironment());
if (resolved.official) {
  const ancestor = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", "HEAD", "origin/main"],
    { cwd: PROJECT_ROOT },
  );
  if (ancestor.status !== 0) throw new Error("Release tag commit is not contained in origin/main");
}
if (process.env.GITHUB_OUTPUT) {
  const outputs = {
    channel: resolved.channel,
    version: resolved.version,
    artifact_name: resolved.artifactName,
    archive_name: resolved.archiveName,
    release_title: resolved.releaseTitle,
  };
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
  );
}
console.log(`${resolved.channel}: ${resolved.version}`);
