/** Closed outer-lip contour landmark indices (MediaPipe Face Mesh). */
export const LIP_LANDMARK_INDICES = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
] as const;

/** Closed nose region landmark indices (MediaPipe Face Mesh). */
export const NOSE_LANDMARK_INDICES = [1, 2, 98, 327, 168, 197] as const;

export type FacialFeature = "lips" | "nose";

export const FEATURE_LANDMARK_MAP: Record<FacialFeature, readonly number[]> = {
  lips: LIP_LANDMARK_INDICES,
  nose: NOSE_LANDMARK_INDICES,
};
