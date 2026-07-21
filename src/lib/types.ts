import type { FacialFeature } from "@/lib/mediapipe/featureIndices";

export type ProcedureType = "lip-enhancement" | "rhinoplasty";

export const PROCEDURE_FEATURES: Record<ProcedureType, FacialFeature[]> = {
  "lip-enhancement": ["lips"],
  rhinoplasty: ["nose"],
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
];
