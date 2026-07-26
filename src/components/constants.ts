export const LIPS_INNER_INDICES = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
export const FEATURE_INDICES: Record<string, number[]> = {
  upper_lip: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78],
  lower_lip: [61, 78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  brows: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
};
export const NOSE_LANDMARKS = [1, 2, 98, 327, 168, 197, 195, 5, 4, 275, 45, 220, 440, 6, 129, 358, 209, 429];
export const CHEEK_LANDMARKS = {
  left: [116, 123, 117, 118, 101, 50, 187, 207, 205, 227, 111, 36, 142, 100],
  right: [345, 352, 346, 347, 330, 280, 411, 427, 425, 447, 340, 266, 371, 329],
};
export const CHIN_LANDMARKS = [152, 377, 400, 378, 379, 365, 397, 288, 361, 18, 83, 18, 132, 58, 172, 136, 150, 149, 176, 148, 152];
export const NOSE_TECHNIQUES = {
  straight_slim: { name: "Straight & Slim Refinement", prompt_suffix: "flawless narrow straight nasal bridge, delicate supratip break, refined defined nasal tip cartilage, subtle alar narrowing, seamless skin texture, photorealistic, 8k resolution", strength: 0.86, pinchRadiusRatio: 0.32, pinchAmount: 0.28 },
  dorsal_hump: { name: "Dorsal Hump Reduction", prompt_suffix: "perfectly straight smooth nasal profile, complete dorsal hump reduction, refined bridge, photorealistic", strength: 0.84, pinchRadiusRatio: 0.25, pinchAmount: 0.20 },
  tip_plasty: { name: "Nasal Tip Refinement", prompt_suffix: "delicate narrow tip cartilage, elevated nasal tip angle, subtle supratip break, photorealistic", strength: 0.83, pinchRadiusRatio: 0.22, pinchAmount: 0.22 },
  alar_reduction: { name: "Alar Base Narrowing", prompt_suffix: "narrowed alar base, reduced nostril flare, tight delicate nasal base, photorealistic", strength: 0.82, pinchRadiusRatio: 0.20, pinchAmount: 0.20 },
  liquid_rhino: { name: "Liquid Non-Surgical Rhinoplasty", prompt_suffix: "non-surgical dermal filler alignment, disguised nasal bump, straight bridge profile, photorealistic", strength: 0.80, pinchRadiusRatio: 0.18, pinchAmount: 0.12 },
};
export const CHEEK_TECHNIQUES = {
  malar_volume: { name: "Zygomatic Arch Projection", prompt_suffix: "defined dermal filler projection over the zygomatic process and arch prominence, elevated high cheekbone apex, smooth transition to infraorbital rim, photorealistic" },
  apple_volume: { name: "Anterior Zygomatic Body Fill", prompt_suffix: "youthful dermal filler volume concentrated over anterior zygomatic body prominence, natural midface projection, seamless skin texture, photorealistic" },
  contour_sculpt: { name: "High Zygomatic Arch Sculpting", prompt_suffix: "chiseled lateral zygomatic arch highlight, elevated cheekbone structure, elegant midface contour, photorealistic" },
};
export const CHEEK_DOSAGE_MAP: Record<string, { strength: number; dilationPx: number; promptLabel: string }> = {
  "0.50ml": { strength: 0.80, dilationPx: 8, promptLabel: "subtle 0.5ml filler highlight over zygomatic prominence" },
  "1.00ml": { strength: 0.84, dilationPx: 14, promptLabel: "moderate 1.0ml dermal filler augmentation centered on zygomatic process and arch" },
  "1.50ml": { strength: 0.88, dilationPx: 20, promptLabel: "pronounced 1.5ml volumetric cheek projection across entire zygomatic structure" },
};
export const CHIN_TECHNIQUES = {
  anterior_projection: { name: "Anterior Projection (Mentoplasty)", prompt_suffix: "strong forward chin projection, prominent pogonion, well-defined chin tip, balanced facial profile line, photorealistic", strength: 0.85, blurPx: 12 },
  chin_lengthening: { name: "Vertical Chin Elongation", prompt_suffix: "elongated lower facial third, vertically extended chin length, defined lower mentum border, sleek proportion, photorealistic", strength: 0.83, blurPx: 12 },
  v_shape_slimming: { name: "V-Line Slimming / T-Osteotomy", prompt_suffix: "slim V-line chin tip, narrowed mental apex, delicate tapered lower jawline, sleek chin contour, photorealistic", strength: 0.86, blurPx: 12 },
  square_jaw_chin: { name: "Broad Square Chin", prompt_suffix: "broad masculine square chin, strong angular mental width, wide chiseled chin border, photorealistic", strength: 0.86, blurPx: 12 },
  cleft_smoothing: { name: "Chin Dimple / Cleft Smoothing", prompt_suffix: "smooth polished chin skin, completely filled chin dimple cleft, relaxed mentalis muscle, seamless chin contour, photorealistic", strength: 0.80, blurPx: 10 },
};
export const BROW_TECHNIQUES = {
  ombre_powder: { name: "Ombré Powder Brows", prompt_suffix: "ombre powder brows, razor-sharp clean lower border, crisp top outline, freshly waxed smooth skin, zero stray hairs outside border, dermaplaned skin, permanent makeup pixel shading, flawless symmetrical shape, photorealistic" },
  microblading: { name: "Microblading", prompt_suffix: "microblading eyebrows, ultra-sharp razor-crisp outer outline border, crisp individual 3D hair strokes inside clean stencil, pristine waxed skin perimeter, no stray hairs, photorealistic" },
  hybrid_tint: { name: "Hybrid Brow Tint", prompt_suffix: "hybrid brow tinting, razor-sharp waxed outline edge, deep skin stain underneath, crisp defined arch tail, smooth hairless surrounding skin, high contrast, photorealistic" },
};
export const LIP_TECHNIQUES = {
  russian: { name: "Russian Lip Technique", prompt_suffix: "Russian lip filler technique, vertical micro-threads, flat profile, heightened cupid's bow, plump volume, clean teeth, natural mouth opening, photorealistic" },
  classic_lip: { name: "Classic Lip Linear", prompt_suffix: "Classic lip filler, anterior 3D projection, horizontal volume enhancement, plump natural pout, clean teeth, photorealistic" },
};
export const DOSAGE_MAP: Record<string, { strength: number; dilationPx: number }> = {
  "0.25ml": { strength: 0.80, dilationPx: 4 },
  "0.50ml": { strength: 0.82, dilationPx: 8 },
  "0.75ml": { strength: 0.85, dilationPx: 12 },
  "1.00ml": { strength: 0.88, dilationPx: 16 },
  "tint_soft": { strength: 0.80, dilationPx: 8 },
  "tint_medium": { strength: 0.84, dilationPx: 14 },
  "tint_bold": { strength: 0.88, dilationPx: 20 },
};
export const BROW_THICKNESS_MAP: Record<string, { stroke: number; padding: number }> = {
  thin: { stroke: 2, padding: 10 },
  medium: { stroke: 5, padding: 16 },
  thick: { stroke: 10, padding: 22 },
};
export type FeatureType = "chin" | "cheeks" | "nose" | "brows" | "upper_lip" | "lower_lip";
export interface LinePositions {
  trichion: number; glabella: number; subnasale: number; menton: number; leftX: number; rightX: number;
}
