import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const PROJECT_ROOT = resolve(import.meta.dirname, "..");
export const STABLE_RELEASE_TAG_PATTERN = /^v([0-9]+\.[0-9]+\.[0-9]+)$/;
export const RC_RELEASE_TAG_PATTERN = /^v([0-9]+\.[0-9]+\.[0-9]+)-rc\.([0-9]+)$/;
const CANONICAL_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;

export function validateCanonicalVersion(version) {
  if (!CANONICAL_VERSION_PATTERN.test(version)) {
    throw new Error(`Canonical package version must use x.y.z without a leading v: ${version}`);
  }
  return version;
}

export function readCanonicalVersion(root = PROJECT_ROOT) {
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  if (typeof packageJson.version !== "string") {
    throw new Error("package.json does not contain a string version");
  }
  return validateCanonicalVersion(packageJson.version);
}

export function classifyReleaseTag(value = "") {
  const tag = String(value).trim();
  if (!tag) return { channel: "none", tag: "", baseVersion: null };
  const stable = STABLE_RELEASE_TAG_PATTERN.exec(tag);
  if (stable) return { channel: "stable", tag, baseVersion: stable[1] };
  const rc = RC_RELEASE_TAG_PATTERN.exec(tag);
  if (rc) return { channel: "rc", tag, baseVersion: rc[1] };
  if (tag.startsWith("v")) {
    throw new Error(`Malformed ComicAPNG release tag: ${tag}`);
  }
  return { channel: "none", tag: "", baseVersion: null };
}

export function releaseTagFromEnvironment(environment = process.env) {
  const explicit = environment.COMICAPNG_RELEASE_TAG?.trim();
  if (explicit) return explicit;
  if (environment.GITHUB_REF_TYPE === "tag") {
    return environment.GITHUB_REF_NAME?.trim() ?? "";
  }
  return "";
}

export function resolveProjectVersion(canonicalVersion, tag = "") {
  const canonical = validateCanonicalVersion(canonicalVersion);
  const classified = classifyReleaseTag(tag);
  if (classified.baseVersion && classified.baseVersion !== canonical) {
    throw new Error(
      `Release tag ${classified.tag} has base version ${classified.baseVersion}, ` +
        `but package.json is ${canonical}`,
    );
  }
  const version = classified.channel === "none" ? `v${canonical}-dirty` : classified.tag;
  return {
    canonicalVersion: canonical,
    version,
    channel: classified.channel,
    tag: classified.channel === "none" ? null : classified.tag,
    official: classified.channel !== "none",
    artifactName: `ComicAPNG-Web-${version}`,
    archiveName: `ComicAPNG-Web-${version}.zip`,
    releaseTitle: `ComicAPNG Web ${version}`,
  };
}

export function resolveCommit(root = PROJECT_ROOT, environment = process.env) {
  const githubSha = environment.GITHUB_SHA?.trim();
  if (githubSha) return githubSha.slice(0, 12);
  try {
    const commit = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return commit || "development";
  } catch {
    return "development";
  }
}

export function resolveBuildInfo(options = {}) {
  const root = options.root ?? PROJECT_ROOT;
  const environment = options.environment ?? process.env;
  const canonicalVersion = options.canonicalVersion ?? readCanonicalVersion(root);
  const tag = options.tag ?? releaseTagFromEnvironment(environment);
  return {
    ...resolveProjectVersion(canonicalVersion, tag),
    commit: options.commit ?? resolveCommit(root, environment),
    buildDate: options.buildDate ?? new Date().toISOString(),
  };
}

export function createVersionDescriptor(buildInfo) {
  return {
    version: buildInfo.version,
    commit: buildInfo.commit,
    buildDate: buildInfo.buildDate,
  };
}
