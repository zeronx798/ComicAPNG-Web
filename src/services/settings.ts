import type { ReadingDirection } from "../core/comic/types";

const prefix = "comicapng.settings.";

export function readNumber(key: string, fallback: number): number {
  const value = Number.parseInt(localStorage.getItem(`${prefix}${key}`) ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

export function writeNumber(key: string, value: number): void {
  localStorage.setItem(`${prefix}${key}`, String(value));
}

export function readString(key: string, fallback: string): string {
  return localStorage.getItem(`${prefix}${key}`) ?? fallback;
}

export function writeString(key: string, value: string): void {
  localStorage.setItem(`${prefix}${key}`, value);
}

export function readDirection(): ReadingDirection {
  return readString("reading_direction", "ltr") === "rtl" ? "rtl" : "ltr";
}

export function writeDirection(direction: ReadingDirection): void {
  writeString("reading_direction", direction);
}
