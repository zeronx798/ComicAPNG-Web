import { zipSync } from "fflate";

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadPngZip(frames: ArrayBuffer[], filename: string): void {
  const files: Record<string, Uint8Array> = {};
  frames.forEach((frame, index) => {
    files[`${index + 1}.png`] = new Uint8Array(frame);
  });
  const archive = zipSync(files, { level: 0 });
  downloadBlob(new Blob([archive], { type: "application/zip" }), filename);
}

export async function writePngFolder(
  directory: FileSystemDirectoryHandle,
  frames: ArrayBuffer[],
): Promise<void> {
  for (let index = 0; index < frames.length; index += 1) {
    const data = frames[index];
    if (!data) continue;
    const handle = await directory.getFileHandle(`${index + 1}.png`, { create: true });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  }
}

export function archiveName(inputName: string): string {
  const stem = inputName.replace(/\.(?:apng|png)$/i, "") || "comic";
  return `${stem}-pages.zip`;
}
