import type { FacialFeature } from "@/lib/mediapipe/featureIndices";

export type ProcedureType =
  | "lip-enhancement"
  | "rhinoplasty"
  | "chin"
  | "cheeks"
  | "eyebrows"
  | "upperLip"
  | "lowerLip";

/** Procedure IDs used by the main visualizer UI. */
export type ProcedureId =
  | "chin"
  | "cheeks"
  | "rhinoplasty"
  | "eyebrows"
  | "upperLip"
  | "lowerLip";

export const PROCEDURE_ID_FEATURES: Record<ProcedureId, FacialFeature[]> = {
  chin: ["chin"],
  cheeks: ["leftCheek", "rightCheek"],
  rhinoplasty: ["nose"],
  eyebrows: ["leftEyebrow", "rightEyebrow"],
  upperLip: ["upperLip"],
  lowerLip: ["lowerLip"],
};

export const PROCEDURE_FEATURES: Record<ProcedureType, FacialFeature[]> = {
  "lip-enhancement": ["lips"],
  rhinoplasty: ["nose"],
  chin: ["chin"],
  cheeks: ["leftCheek", "rightCheek"],
  eyebrows: ["leftEyebrow", "rightEyebrow"],
  upperLip: ["upperLip"],
  lowerLip: ["lowerLip"],
};

export interface ProcedureOption {
  id: ProcedureType;
  label: string;
  description: string;
}

export interface FaceLandmarkPoint {
  x: number;
  y: number;
  z: number;
}

export interface VisualizationState {
  imageUrl: string | null;
  landmarks: FaceLandmarkPoint[] | null;
  selectedProcedure: ProcedureType | null;
  intensity: number;
  isProcessing: boolean;
}

export const DEFAULT_PROCEDURES: ProcedureOption[] = [
  {
    id: "lip-enhancement",
    label: "Lip Enhancement",
    description: "Subtle volume and definition for naturally fuller lips.",
  },
  {
    id: "rhinoplasty",
    label: "Rhinoplasty",
    description: "Refine nose shape, bridge, and tip proportions.",
  },
  {
    id: "chin",
    label: "Chin",
    description: "Project or refine the mentum and lower-face balance.",
  },
  {
    id: "cheeks",
    label: "Cheeks",
    description: "Malar projection and subzygomatic contour support.",
  },
  {
    id: "eyebrows",
    label: "Eyebrows",
    description: "Lift and reshape brow arch for upper-face balance.",
  },
  {
    id: "upperLip",
    label: "Upper Lip",
    description: "Vermilion definition and cupid's-bow accentuation.",
  },
  {
    id: "lowerLip",
    label: "Lower Lip",
    description: "Lower cushion volume and lip-scale balance.",
  },
];
