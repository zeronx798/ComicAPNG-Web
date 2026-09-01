import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROJECT_ROOT,
  readCanonicalVersion,
  releaseTagFromEnvironment,
  resolveProjectVersion,
} from "./version.mjs";

const canonicalVersion = readCanonicalVersion();
const lock = JSON.parse(readFileSync(resolve(PROJECT_ROOT, "package-lock.json"), "utf8"));
if (lock.version !== canonicalVersion || lock.packages?.[""]?.version !== canonicalVersion) {
  throw new Error("package-lock.json version does not match package.json");
}
const resolved = resolveProjectVersion(canonicalVersion, releaseTagFromEnvironment());
console.log(
  `Version ready: package ${canonicalVersion}, build ${resolved.version}, archive ${resolved.archiveName}`,
);
