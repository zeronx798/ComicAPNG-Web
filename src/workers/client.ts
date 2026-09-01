import type { ComicExportRequest } from "../core/comic/types";
import type { DecodedDocument } from "../core/apng/types";
import { decodeComicInBrowser, encodeComicInBrowser } from "../core/apng/browserCodec";
import type {
  DecodeRequest,
  DecodeResponse,
  EncodeResponse,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

export interface ProgressValue {
  current: number;
  total: number;
}

interface WorkerTask<T> {
  promise: Promise<T>;
  cancel: () => void;
}

function runWorker<T>(
  request: WorkerRequest,
  transfer: Transferable[],
  expectedKind: WorkerResponse["kind"],
  onProgress?: (progress: ProgressValue) => void,
): WorkerTask<T> {
  const worker = new Worker(new URL("./image.worker.ts", import.meta.url), { type: "module" });
  let rejectTask: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    rejectTask = reject;
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.kind === "progress") {
        onProgress?.({ current: response.current, total: response.total });
        return;
      }
      worker.terminate();
      if (response.kind === "error") {
        reject(new Error(response.code));
      } else if (response.kind === expectedKind) {
        resolve(response as T);
      } else {
        reject(new Error("worker.unexpected_response"));
      }
    });
    worker.addEventListener("error", (event) => {
      worker.terminate();
      reject(new Error(event.message || "worker.failed"));
    });
    worker.postMessage(request, { transfer });
  });
  return {
    promise,
    cancel: () => {
      worker.terminate();
      rejectTask(new Error("worker.cancelled"));
    },
  };
}

export function encodeComic(
  request: ComicExportRequest,
  onProgress?: (progress: ProgressValue) => void,
): WorkerTask<EncodeResponse> {
  if (typeof OffscreenCanvas === "undefined") {
    let cancelled = false;
    const promise = encodeComicInBrowser(request, onProgress, () => cancelled).then((result) => ({
      kind: "encoded" as const,
      ...result,
    }));
    return { promise, cancel: () => { cancelled = true; } };
  }
  return runWorker<EncodeResponse>({ kind: "encode", request }, [], "encoded", onProgress);
}

export function decodeComic(
  buffer: ArrayBuffer,
  options: Pick<DecodeRequest, "thumbnails" | "preserveMetadata">,
  onProgress?: (progress: ProgressValue) => void,
): WorkerTask<DecodedDocument> {
  if (typeof OffscreenCanvas === "undefined") {
    let cancelled = false;
    const promise = decodeComicInBrowser(buffer, options, onProgress, () => cancelled);
    return { promise, cancel: () => { cancelled = true; } };
  }
  const task = runWorker<DecodeResponse>(
    { kind: "decode", buffer, ...options },
    [buffer],
    "decoded",
    onProgress,
  );
  return { promise: task.promise, cancel: task.cancel };
}
