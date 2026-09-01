import * as apngJs from "apng-js";
import type { APNG } from "apng-js";

export function parseApngBuffer(buffer: ArrayBuffer): APNG | Error {
  let candidate: unknown = (apngJs as unknown as { default?: unknown }).default ?? apngJs;
  if (candidate && typeof candidate === "object" && "default" in candidate) {
    candidate = (candidate as { default: unknown }).default;
  }
  if (typeof candidate !== "function") throw new Error("apng.parser_unavailable");
  return (candidate as (value: ArrayBuffer) => APNG | Error)(buffer);
}
