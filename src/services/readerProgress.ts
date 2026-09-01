const DATABASE_NAME = "comicapng-web";
const DATABASE_VERSION = 1;
const STORE_NAME = "reader-progress";

interface ProgressRecord {
  fingerprint: string;
  page: number;
  updatedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "fingerprint" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("idb.open_failed")));
  });
}

export async function fingerprintFile(file: File): Promise<string> {
  const sampleSize = 65_536;
  const beginning = await file.slice(0, sampleSize).arrayBuffer();
  const ending = await file.slice(Math.max(0, file.size - sampleSize)).arrayBuffer();
  const sizeBytes = new TextEncoder().encode(String(file.size));
  const combined = new Uint8Array(beginning.byteLength + ending.byteLength + sizeBytes.byteLength);
  combined.set(new Uint8Array(beginning), 0);
  combined.set(new Uint8Array(ending), beginning.byteLength);
  combined.set(sizeBytes, beginning.byteLength + ending.byteLength);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", combined));
  return [...hash].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function loadReaderProgress(
  fingerprint: string,
  frameCount: number,
): Promise<number> {
  try {
    const database = await openDatabase();
    return await new Promise<number>((resolve) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(fingerprint);
      request.addEventListener("success", () => {
        const record = request.result as ProgressRecord | undefined;
        resolve(record ? Math.max(0, Math.min(frameCount - 1, record.page)) : 0);
      });
      request.addEventListener("error", () => resolve(0));
      transaction.addEventListener("complete", () => database.close());
    });
  } catch {
    return 0;
  }
}

export async function saveReaderProgress(fingerprint: string, page: number): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ fingerprint, page, updatedAt: Date.now() });
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("error", () => reject(transaction.error));
    });
    database.close();
  } catch {
    return;
  }
}
