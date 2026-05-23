import type { DetectionAlgorithmName } from "../detection/types";

export type ContentMessageType =
  | "JUDOL_GET_SCAN_STATE"
  | "JUDOL_RESCAN"
  | "JUDOL_SET_BLUR";

export interface DetectionCount {
  label: string;
  count: number;
}

export interface PopupScanSummary {
  scannedAt: number;
  totalMatches: number;
  uniqueDetections: number;
  algorithmMatches: Record<DetectionAlgorithmName, number>;
  algorithmDurationsMs: Record<DetectionAlgorithmName, number>;
  detections: DetectionCount[];
  blurred: boolean;
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

export interface SetBlurMessage {
  type: "JUDOL_SET_BLUR";
  enabled: boolean;
}

export type ContentRequest =
  | GetScanStateMessage
  | RescanMessage
  | SetBlurMessage;