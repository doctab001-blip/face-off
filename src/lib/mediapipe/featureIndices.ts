/** Closed outer-lip contour landmark indices (MediaPipe Face Mesh). */
export const LIP_LANDMARK_INDICES = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14,
  87, 178, 88, 95, 78,
] as const;

/** Upper lip closed contour. */
export const UPPER_LIP_LANDMARK_INDICES = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 308, 415, 310, 311, 312, 13,
  82, 81, 80, 191, 78,
] as const;

/** Lower lip closed contour. */
export const LOWER_LIP_LANDMARK_INDICES = [
  146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14,
  87, 178, 88, 95, 78, 61,
] as const;

/** Compact nose bridge + tip mask for rhinoplasty inpainting. */
export const NOSE_LANDMARK_INDICES = [
  168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 97, 2, 326, 327, 294, 278, 344, 440,
  275, 4, 45, 220, 115, 48, 64, 98,
] as const;

/** Lower-face chin / mentum focus. */
export const CHIN_LANDMARK_INDICES = [
  152, 377, 400, 378, 379, 365, 397, 288, 435, 410, 322, 391, 393, 164, 167,
  164, 393, 391, 322, 410, 435, 288, 397, 365, 379, 378, 400, 377,
] as const;

/** Left cheek / malar region. */
export const LEFT_CHEEK_LANDMARK_INDICES = [
  205, 50, 187, 207, 216, 206, 203, 129, 142, 100, 120, 101, 116, 123, 147, 213,
  192, 214, 212, 216, 207, 187, 50,
] as const;

/** Right cheek / malar region. */
export const RIGHT_CHEEK_LANDMARK_INDICES = [
  425, 280, 411, 427, 436, 426, 423, 358, 371, 329, 349, 330, 345, 352, 376,
  433, 416, 434, 432, 436, 427, 411, 280,
] as const;

/** Left eyebrow. */
export const LEFT_EYEBROW_LANDMARK_INDICES = [
  70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 70,
] as const;

/** Right eyebrow. */
export const RIGHT_EYEBROW_LANDMARK_INDICES = [
  300, 293, 334, 296, 336, 285, 295, 282, 283, 276, 300,
] as const;

export type FacialFeature =
  | "lips"
  | "upperLip"
  | "lowerLip"
  | "nose"
  | "chin"
  | "leftCheek"
  | "rightCheek"
  | "leftEyebrow"
  | "rightEyebrow";

export const FEATURE_LANDMARK_MAP: Record<FacialFeature, readonly number[]> = {
  lips: LIP_LANDMARK_INDICES,
  upperLip: UPPER_LIP_LANDMARK_INDICES,
  lowerLip: LOWER_LIP_LANDMARK_INDICES,
  nose: NOSE_LANDMARK_INDICES,
  chin: CHIN_LANDMARK_INDICES,
  leftCheek: LEFT_CHEEK_LANDMARK_INDICES,
  rightCheek: RIGHT_CHEEK_LANDMARK_INDICES,
  leftEyebrow: LEFT_EYEBROW_LANDMARK_INDICES,
  rightEyebrow: RIGHT_EYEBROW_LANDMARK_INDICES,
};
