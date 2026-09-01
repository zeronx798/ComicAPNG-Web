import type { ComicExportRequest } from "../core/comic/types";
import type { ApngInfo, DecodedFrame } from "../core/apng/types";

export interface EncodeRequest {
  kind: "encode";
  request: ComicExportRequest;
}

export interface DecodeRequest {
  kind: "decode";
  buffer: ArrayBuffer;
  thumbnails: boolean;
  preserveMetadata: boolean;
}

export type WorkerRequest = EncodeRequest | DecodeRequest;

export interface ProgressResponse {
  kind: "progress";
  current: number;
  total: number;
}

export interface EncodeResponse {
  kind: "encoded";
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

export interface DecodeResponse {
  kind: "decoded";
  info: ApngInfo;
  frames: DecodedFrame[];
}

export interface ErrorResponse {
  kind: "error";
  code: string;
  detail: string;
}

export type WorkerResponse = ProgressResponse | EncodeResponse | DecodeResponse | ErrorResponse;
