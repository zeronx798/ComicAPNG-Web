export type ReleaseChannel = "none" | "stable" | "rc";

export interface VersionResolution {
  canonicalVersion: string;
  version: string;
  channel: ReleaseChannel;
  tag: string | null;
  official: boolean;
  artifactName: string;
  archiveName: string;
  releaseTitle: string;
}

export interface BuildInfo extends VersionResolution {
  commit: string;
  buildDate: string;
}

export interface BuildInfoOptions {
  root?: string;
  environment?: NodeJS.ProcessEnv;
  canonicalVersion?: string;
  tag?: string;
  commit?: string;
  buildDate?: string;
}

export const PROJECT_ROOT: string;
export const STABLE_RELEASE_TAG_PATTERN: RegExp;
export const RC_RELEASE_TAG_PATTERN: RegExp;
export function validateCanonicalVersion(version: string): string;
export function readCanonicalVersion(root?: string): string;
export function classifyReleaseTag(tag?: string): {
  channel: ReleaseChannel;
  tag: string;
  baseVersion: string | null;
};
export function releaseTagFromEnvironment(environment?: NodeJS.ProcessEnv): string;
export function resolveProjectVersion(canonicalVersion: string, tag?: string): VersionResolution;
export function resolveCommit(root?: string, environment?: NodeJS.ProcessEnv): string;
export function resolveBuildInfo(options?: BuildInfoOptions): BuildInfo;
export function createVersionDescriptor(buildInfo: BuildInfo): {
  version: string;
  commit: string;
  buildDate: string;
};
