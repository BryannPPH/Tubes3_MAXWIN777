import type { DetectionAlgorithmName } from "../detection/types";

export type ContentMessageType =
  | "JUDOL_GET_SCAN_STATE"
  | "JUDOL_RESCAN"
  | "JUDOL_SET_MASK";

export type BackgroundMessageType = "JUDOL_CAPTURE_VISIBLE_TAB";
export type MaskMode = "blur" | "gif";

export interface MaskSettings {
  enabled: boolean;
  mode: MaskMode;
  gifUrl: string;
}

export interface DetectionCount {
  label: string;
  count: number;
}

export interface PopupDebugItem {
  kind: "text" | "image";
  title: string;
  status: string;
  detail: string;
  note?: string;
  meta?: string[];
}

export interface PopupScanDebug {
  scannedTextNodes: number;
  matchedTextNodes: number;
  scannedImages: number;
  matchedImages: number;
  items: PopupDebugItem[];
}

export interface PopupScanSummary {
  scannedAt: number;
  totalDurationMs: number;
  totalMatches: number;
  uniqueDetections: number;
  algorithmMatches: Record<DetectionAlgorithmName, number>;
  algorithmDurationsMs: Record<DetectionAlgorithmName, number>;
  detections: DetectionCount[];
  maskEnabled: boolean;
  maskMode: MaskMode;
  maskGifUrl: string;
  debug: PopupScanDebug;
}

export type PopupScanState =
  | {
      status: "idle";
      summary: null;
      error?: undefined;
    }
  | {
      status: "ready";
      summary: PopupScanSummary;
      error?: undefined;
    }
  | {
      status: "error";
      summary: null;
      error: string;
    };

export interface GetScanStateMessage {
  type: "JUDOL_GET_SCAN_STATE";
}

export interface RescanMessage {
  type: "JUDOL_RESCAN";
}

export interface SetMaskMessage extends MaskSettings {
  type: "JUDOL_SET_MASK";
}

export interface CaptureVisibleTabMessage {
  type: "JUDOL_CAPTURE_VISIBLE_TAB";
}

export type CaptureVisibleTabResponse =
  | {
      ok: true;
      dataUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

export type ContentRequest =
  | GetScanStateMessage
  | RescanMessage
  | SetMaskMessage;

export type BackgroundRequest = CaptureVisibleTabMessage;
