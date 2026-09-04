import { describe, expect, it } from "vitest";
import {
  createVersionDescriptor,
  readCanonicalVersion,
  resolveProjectVersion,
} from "../../scripts/version.mjs";

describe("project version resolution", () => {
  it("reads the canonical package version", () => {
    expect(readCanonicalVersion()).toBe("0.1.1");
  });

  it("marks every non-tag build as dirty", () => {
    expect(resolveProjectVersion("0.1.1")).toMatchObject({
      version: "v0.1.1-dirty",
      channel: "none",
      archiveName: "ComicAPNG-Web-v0.1.1-dirty.zip",
      artifactName: "ComicAPNG-Web-v0.1.1-dirty",
    });
  });

  it("uses a matching stable tag as the official version", () => {
    expect(resolveProjectVersion("0.1.1", "v0.1.1")).toMatchObject({
      version: "v0.1.1",
      channel: "stable",
      archiveName: "ComicAPNG-Web-v0.1.1.zip",
      releaseTitle: "ComicAPNG Web v0.1.1",
    });
  });

  it("uses a matching RC tag as the official version", () => {
    expect(resolveProjectVersion("0.1.1", "v0.1.1-rc.1")).toMatchObject({
      version: "v0.1.1-rc.1",
      channel: "rc",
      archiveName: "ComicAPNG-Web-v0.1.1-rc.1.zip",
      releaseTitle: "ComicAPNG Web v0.1.1-rc.1",
    });
    expect(resolveProjectVersion("0.2.0", "v0.2.0-rc.1").archiveName).toBe(
      "ComicAPNG-Web-v0.2.0-rc.1.zip",
    );
  });

  it("rejects stable and RC tags with a different package base", () => {
    expect(() => resolveProjectVersion("0.1.1", "v0.2.0")).toThrow(/package\.json is 0\.1\.1/);
    expect(() => resolveProjectVersion("0.1.1", "v0.2.0-rc.1")).toThrow(
      /package\.json is 0\.1\.1/,
    );
  });

  it("rejects malformed ComicAPNG release tags", () => {
    for (const tag of ["v0.1", "v0.1.1-beta.1", "vfoo"]) {
      expect(() => resolveProjectVersion("0.1.1", tag)).toThrow(
        `Malformed ComicAPNG release tag: ${tag}`,
      );
    }
  });

  it("creates version.json data from resolved build information", () => {
    const resolved = resolveProjectVersion("0.1.1", "v0.1.1");
    expect(
      createVersionDescriptor({
        ...resolved,
        commit: "abc123def456",
        buildDate: "2026-09-01T00:00:00.000Z",
      }),
    ).toEqual({
      version: "v0.1.1",
      commit: "abc123def456",
      buildDate: "2026-09-01T00:00:00.000Z",
    });
  });
});
