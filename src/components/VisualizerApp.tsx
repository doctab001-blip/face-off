"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { fal } from "@fal-ai/client";
import { describeSimulationFailure } from "@/lib/falErrors";
import { PROCEDURE_CATALOG, type ServiceCategoryId } from "@/lib/types";

fal.config({ proxyUrl: "/api/fal/proxy" });

const FEATURE_INDICES: Record<string, number[]> = {
  upper_lip: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78],
  lower_lip: [61, 78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  brows: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
};

// Broadened perimeter (adds upper sidewalls, alar wings, and columella base) so FLUX
// gets a wider canvas for bridge + tip reshaping instead of a tiny isolated patch.
const NOSE_LANDMARKS = [
  1, 2, 98, 327, 168, 197, 195, 5, 4, 275, 45, 220, 440, 6, 129, 358, 209, 429, 122, 351, 131, 360,
  164,
];

// Upper-bridge/dorsum-only points from NOSE_LANDMARKS (nasion + bridge midline) — excluded
// for tip/alar-only techniques so a "delicate" tip refinement isn't asking FLUX to also
// redraw the untouched bridge.
const NOSE_BRIDGE_ONLY_POINTS = [168, 197, 195, 6];
const NOSE_TIP_ALAR_LANDMARKS = NOSE_LANDMARKS.filter(
  (idx) => !NOSE_BRIDGE_ONLY_POINTS.includes(idx)
);

// Mask expansion and padding are anatomy-relative: 22% of the inter-alar (nostril base) width.
const NOSE_EXPANSION_RATIO = 0.22;
// Widen the nasal mask 15% horizontally about X_mid so the dorsum and both sidewalls are
// covered uniformly, rather than pinching to a narrow vertical band down the bridge.
const NOSE_HORIZONTAL_EXPANSION = 1.15;
// Gaussian radius for the nasal region; large enough that the seam dissolves into skin.
const NOSE_BLUR_PX = 20;
const NOSE_ALAR_LEFT = 129;
const NOSE_ALAR_RIGHT = 358;
// Subnasale — where the columella meets the upper lip. The inferior limit of the nasal unit.
const NOSE_SUBNASALE = 2;

// Midline anchors: inner eye corners (primary), then nasal bridge root, then nasal tip.
const EYE_INNER_LEFT = 133;
const EYE_INNER_RIGHT = 362;
const NOSE_BRIDGE_ROOT = 168;
const NOSE_TIP = 1;

// Upper/lower lash-line contours for PMU eyeliner. These are MediaPipe's published canonical
// face-mesh eye-contour indices — unlike NOSE_LANDMARKS/CHEEK_LANDMARKS above, they have not
// been empirically re-verified against canonical_face_model.obj in this codebase, so expect a
// visual tuning pass (thickness/blur) once real test renders come back, the same way nose and
// chin needed iteration per git history.
const UPPER_LASH_LINE = {
  left: [246, 161, 160, 159, 158, 157, 173],
  right: [466, 388, 387, 386, 385, 384, 398],
};
const LOWER_LASH_LINE = {
  left: [33, 7, 163, 144, 145, 153, 154, 155],
  right: [263, 249, 390, 373, 374, 380, 381, 382],
};
// Outer canthus per side — anchors the winged-eyeliner extension direction.
const EYE_OUTER_CORNER = { left: 33, right: 263 };

type Point = { x: number; y: number };

// Bilateral pairs taken from NOSE_LANDMARKS. Each is an exact mirror pair in MediaPipe's
// canonical_face_model.obj (x_left === -x_right), so the midpoint of any one of them lies on
// the nasal midline.
const NOSE_SYMMETRY_PAIRS: Array<[number, number]> = [
  [98, 327],
  [45, 275],
  [220, 440],
  [129, 358],
  [209, 429],
  [122, 351],
  [131, 360],
];

// Symmetry axis for the nasal mask specifically.
//
// The inner canthi sit ~3.7 units behind the nasal tip in the canonical model, and a deeper
// point shifts less under perspective than a shallower one. So on a yawed head the canthi
// midpoint no longer projects onto the nose's apparent center: at 8 degrees of yaw it lands
// ~29px off on a 900px-wide face, which reads as a nose mask that is visibly off-center.
// Averaging the nose's own mirror pairs keeps the axis at nasal depth and cuts that drift to
// ~6px. Falls back to the facial midline when the nasal points are unavailable.
function computeNasalMidlineX(points: Array<Point | undefined | null>): number | null {
  const midpoints: number[] = [];
  NOSE_SYMMETRY_PAIRS.forEach(([leftIdx, rightIdx]) => {
    const left = points[leftIdx];
    const right = points[rightIdx];
    if (left && right) midpoints.push((left.x + right.x) / 2);
  });

  if (midpoints.length === 0) return computeFacialMidlineX(points);
  return midpoints.reduce((sum, x) => sum + x, 0) / midpoints.length;
}

// True facial midline (X_mid). The inner canthi are the most stable bilateral pair for
// this axis; the bridge root and tip serve as single-point fallbacks.
function computeFacialMidlineX(points: Array<Point | undefined | null>): number | null {
  const innerLeft = points[EYE_INNER_LEFT];
  const innerRight = points[EYE_INNER_RIGHT];
  if (innerLeft && innerRight) return (innerLeft.x + innerRight.x) / 2;

  const bridgeRoot = points[NOSE_BRIDGE_ROOT];
  if (bridgeRoot) return bridgeRoot.x;

  const tip = points[NOSE_TIP];
  return tip ? tip.x : null;
}

function getLandmarkPoints(indices: number[], points: Array<Point | undefined | null>): Point[] {
  return indices
    .map((idx) => points[idx])
    .filter((pt): pt is Point => Boolean(pt))
    .map((pt) => ({ x: pt.x, y: pt.y }));
}

function getLandmarkMetrics(pts: Point[]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centroid = {
    x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
    y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
  };
  const maxRadius = pts.reduce(
    (acc, p) => Math.max(acc, Math.hypot(p.x - centroid.x, p.y - centroid.y)),
    0
  );
  return {
    width: maxX - minX,
    height: maxY - minY,
    centroid,
    maxRadius,
  };
}

// NOSE_LANDMARKS and CHEEK_LANDMARKS aren't listed in perimeter order (they
// zigzag across the region), so connecting the raw indices with lineTo
// self-intersects into a bowtie shape. Re-derive a simple (non-crossing)
// polygon by sorting the mapped points by angle around their centroid
// before drawing. (Verified against MediaPipe's canonical_face_model.obj:
// nose 13->0 crossings, cheek-left 8->0, cheek-right 8->0. Chin, brows, and
// lips were already simple polygons — no fix needed there.)
function angleSortIndices(
  indices: number[],
  points: Array<{ x: number; y: number } | undefined | null>,
): number[] {
  const withPts = indices
    .map((idx) => ({ idx, pt: points[idx] }))
    .filter((e): e is { idx: number; pt: { x: number; y: number } } => Boolean(e.pt));
  if (withPts.length < 3) return indices;

  const centroid = withPts.reduce(
    (acc, e) => ({ x: acc.x + e.pt.x / withPts.length, y: acc.y + e.pt.y / withPts.length }),
    { x: 0, y: 0 },
  );

  return [...withPts]
    .sort(
      (a, b) =>
        Math.atan2(a.pt.y - centroid.y, a.pt.x - centroid.x) -
        Math.atan2(b.pt.y - centroid.y, b.pt.x - centroid.x),
    )
    .map((e) => e.idx);
}

// Angle-sort raw points (same rationale as angleSortIndices) into a simple perimeter.
function angleSortPoints(pts: Point[]): Point[] {
  if (pts.length < 3) return pts;
  const centroid = {
    x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
    y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
  };
  return [...pts].sort(
    (a, b) =>
      Math.atan2(a.y - centroid.y, a.x - centroid.x) -
      Math.atan2(b.y - centroid.y, b.x - centroid.x)
  );
}

// Force bilateral symmetry about X_mid: every landmark contributes its own position and its
// mirrored counterpart, so any lateral drift in the raw mesh cancels out. The resulting
// polygon's horizontal bounding-box center is then pinned exactly to X_mid.
function buildMidlineSymmetricPolygon(pts: Point[], midlineX: number): Point[] {
  if (pts.length < 3) return pts;

  const deduped = new Map<string, Point>();
  pts.forEach((pt) => {
    [pt, { x: 2 * midlineX - pt.x, y: pt.y }].forEach((candidate) => {
      const key = `${candidate.x.toFixed(2)}:${candidate.y.toFixed(2)}`;
      if (!deduped.has(key)) deduped.set(key, candidate);
    });
  });

  const symmetric = angleSortPoints([...deduped.values()]);
  const xs = symmetric.map((p) => p.x);
  const boxCenterX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const correction = midlineX - boxCenterX;

  return symmetric.map((p) => ({ x: p.x + correction, y: p.y }));
}

// Truncate drawing at the nasal base, so no mask pixel lands on the philtrum.
//
// NOSE_LANDMARKS already includes 164, which sits below the subnasale, and the 22% dilation
// carries the mask a further ~72px past it on a 900px-wide face — close enough to the
// vermilion to cover the philtrum entirely. That spare canvas is what lets FLUX erase the
// existing tip and redraw it higher, which reads as a shortened, rotated nose with septal
// artifacts beneath it. The boundary is the lowest of the subnasale and the two alar bases,
// so a flared ala is never clipped off.
function clipToNasalBase(
  ctx: CanvasRenderingContext2D,
  points: Array<Point | undefined | null>,
  width: number,
  height: number,
): void {
  const anchors = [points[NOSE_SUBNASALE], points[NOSE_ALAR_LEFT], points[NOSE_ALAR_RIGHT]].filter(
    (pt): pt is Point => Boolean(pt),
  );
  if (anchors.length === 0) return;

  const baseY = Math.max(...anchors.map((pt) => pt.y));
  ctx.beginPath();
  ctx.rect(-width, -height, width * 3, baseY + height);
  ctx.clip();
}

// Scale horizontal offsets about X_mid. Applied to an already-symmetric polygon this widens
// both sides by the same amount, so the midline anchor and bilateral symmetry are preserved.
function expandHorizontallyAboutMidline(pts: Point[], midlineX: number, factor: number): Point[] {
  return pts.map((pt) => ({ x: midlineX + (pt.x - midlineX) * factor, y: pt.y }));
}

// Outer temple landmarks — bizygomatic (facial) width reference.
const FACE_LATERAL_LEFT = 234;
const FACE_LATERAL_RIGHT = 454;

// Perioral exclusion anchors: tragus (ear attachment) and mouth commissure per side.
const TRAGUS_LEFT = 234;
const TRAGUS_RIGHT = 454;
const COMMISSURE_LEFT = 61;
const COMMISSURE_RIGHT = 291;
// Inferior border of the lower lip. A straight tragus->commissure line still admits the
// lower lip (it hangs below the mouth corners), so the boundary dips under this point.
const LOWER_LIP_INFERIOR = 17;
// Nasolabial fold origin (alar crease) per side — masks stay lateral to these.
const NASOLABIAL_LEFT = 129;
const NASOLABIAL_RIGHT = 358;

// Clip to the region strictly inferior to the tragus -> commissure -> sub-labial boundary.
// Lower-face masks bleed generously, so without this the mandibular stroke and buccal pads
// reach the vermilion border and FLUX redraws the mouth.
function clipInferiorToCommissureLine(
  ctx: CanvasRenderingContext2D,
  points: Array<Point | undefined | null>,
  width: number,
  height: number,
  marginPx: number
) {
  const tragusLeft = points[TRAGUS_LEFT];
  const tragusRight = points[TRAGUS_RIGHT];
  const commissureLeft = points[COMMISSURE_LEFT];
  const commissureRight = points[COMMISSURE_RIGHT];
  if (!tragusLeft || !tragusRight || !commissureLeft || !commissureRight) return;

  // Order left-to-right in image space so the polyline never doubles back.
  const [nearTragus, farTragus] =
    tragusLeft.x <= tragusRight.x ? [tragusLeft, tragusRight] : [tragusRight, tragusLeft];
  const [nearCommissure, farCommissure] =
    commissureLeft.x <= commissureRight.x
      ? [commissureLeft, commissureRight]
      : [commissureRight, commissureLeft];

  const subLabial = points[LOWER_LIP_INFERIOR];
  const centerX = (nearCommissure.x + farCommissure.x) / 2;
  const centerY =
    (subLabial?.y ?? Math.max(nearCommissure.y, farCommissure.y)) + marginPx;

  const pad = Math.max(width, height);
  ctx.beginPath();
  ctx.moveTo(-pad, nearTragus.y);
  ctx.lineTo(nearTragus.x, nearTragus.y);
  ctx.lineTo(nearCommissure.x, nearCommissure.y + marginPx);
  ctx.lineTo(centerX, centerY);
  ctx.lineTo(farCommissure.x, farCommissure.y + marginPx);
  ctx.lineTo(farTragus.x, farTragus.y);
  ctx.lineTo(width + pad, farTragus.y);
  ctx.lineTo(width + pad, height + pad);
  ctx.lineTo(-pad, height + pad);
  ctx.closePath();
  ctx.clip();
}

// Clip to the half-plane lateral of one nasolabial fold, keeping buccal fills out of the
// perioral zone between the fold and the mouth corner.
function clipLateralToNasolabialFold(
  ctx: CanvasRenderingContext2D,
  foldPoint: Point | undefined | null,
  midlineX: number | null,
  width: number,
  height: number
) {
  if (!foldPoint || midlineX === null) return;

  const pad = Math.max(width, height);
  const isLeftOfMidline = foldPoint.x < midlineX;
  ctx.beginPath();
  if (isLeftOfMidline) {
    ctx.rect(-pad, -pad, foldPoint.x + pad, height + 2 * pad);
  } else {
    ctx.rect(foldPoint.x, -pad, width + pad - foldPoint.x, height + 2 * pad);
  }
  ctx.clip();
}

const CHEEK_LANDMARKS = {
  left: [116, 123, 147, 213, 192, 137, 123, 50, 205, 187],
  right: [345, 352, 376, 433, 416, 366, 352, 280, 425, 411],
};

// Central mental shield — the sub-labial midline (18) and chin apex (152) joined by four
// mirror-paired points down each side of the mentum.
//
// This list previously ran the entire mandibular arc out to 361/132, which sit at the jaw
// angles beside the ears — 95% of half the facial width and 6.5 units above the chin apex.
// Selecting "chin" therefore masked both lower cheeks, and FLUX rendered them as dark
// hollows. Measured against canonical_face_model.obj, this set reaches 53% of half-width
// (mental tubercles, short of the jaw), is bilaterally balanced at four points per side,
// and forms a simple polygon with zero self-intersections.
const CHIN_LANDMARKS = [18, 379, 378, 400, 377, 152, 148, 176, 149, 150];

// Buccal fat pad hollow (below the cheekbone, lateral to the nasolabial
// fold, above the jaw). Derived and verified against MediaPipe's
// canonical_face_model.obj: angle-sorted, each side has 0 self-crossing
// edges (was 1 in raw list order). Mirror pairs confirmed via exact
// coordinate reflection (x -> -x), not assumed from memory.
const BUCCAL_LANDMARKS = {
  left: [205, 207, 187, 147, 213, 192, 138, 135, 169, 211, 210, 214, 212, 216, 57, 202],
  right: [425, 427, 411, 376, 433, 416, 367, 364, 394, 431, 430, 434, 432, 436, 287, 422],
};

// Lower-face contour from ear to ear via the jaw and chin — a contiguous arc
// of MediaPipe's well-known face-oval loop (forehead points excluded). This
// is a valid simple (non-self-crossing) path in its natural order, verified
// against canonical_face_model.obj, so it's used as-is rather than run
// through angleSortIndices (which is for closed hollow fills, not an open
// edge path).
const JAWLINE_LANDMARKS = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454];

// --- CLINICAL LIPS & CHEEKS MASK & STRENGTH REFINEMENT ---
// Calibrated denoise ceilings. Above these, FLUX flattens skin texture and smears
// volumetric edges, so the dosage tables may raise strength only up to these values.
//
// RAISED from 0.42/0.38. In inpainting, `strength` is how much of the masked region the
// model may redraw: 0.42 means "keep most of the original pixels", which is why every
// simulation was returning a near-identical face. These ceilings still sit below 1.0 so
// skin texture is preserved, but they now leave real headroom for volumetric change.
// If results ever look overcooked or plastic, LOWER these numbers first — they are the
// single most effective dial in the app.
const PROCEDURE_STRENGTH_MAP: Record<string, number> = {
  cheeks: 0.78, // Volumetric projection needs room to actually build malar height
  upper_lip: 0.70, // Vermilion eversion without washing out mucosal texture
  lower_lip: 0.70,
};

// PMU lip work is a color/pigment tint, not a volume change — these ceilings sit well below
// the volumetric lip-filler ceiling above so FLUX cannot reshape the lip while "tinting" it.
const LIP_PMU_MAX_STRENGTH = 0.42;
// Eyeliner is a thin pigment line, not a skin-reshaping region — kept low so the eyelid itself
// is never redrawn, only the line along the lash margin.
const EYELINER_MAX_STRENGTH = 0.5;

// Upper bound on a single inpainting round-trip. Past this the request is aborted
// rather than left polling, so the UI can never deadlock on a hung queue.
// 90s rather than 30s: FLUX inpainting usually returns in 10-15s, but a fal cold start or a
// busy queue pushes a heavy multi-procedure run past 30s, and the abort was killing renders
// that would have succeeded.
const SIMULATION_TIMEOUT_MS = 90000;

// The crop and its mask travel to fal as base64 data URIs inside one JSON body, and
// base64 inflates bytes by ~33%. A native-resolution phone crop blows past the 4.5 MB
// serverless request limit and is rejected before it ever reaches the model, so the
// crop is capped on its longest side. JPEG keeps the photo small; the mask stays PNG
// because its soft falloff must survive without compression artifacts.
const MAX_SIMULATION_DIMENSION = 1536;
const CROP_JPEG_QUALITY = 0.92;

// Fallback strength when no procedure registers one (defensive; a feature is always selected).
const DEFAULT_STRENGTH = 0.65;

// Lip gradient as a fraction of measured commissure-to-commissure width — tight enough
// to preserve mucosal texture.
const LIP_BLUR_RATIO = 0.08;

// --- CLINICAL FACIAL SIMULATION & MASK CALIBRATION ENGINE ---
// Per-procedure calibration. blurMultiplier is a fraction of measured bizygomatic
// (facial) width, so gradients stay proportional across crop sizes. maxStrength caps
// denoise per region: lower-face masks abut cheek skin, and higher values make FLUX
// invent grain and freckles. Raised alongside PROCEDURE_STRENGTH_MAP for the same reason.
const FACIAL_CALIBRATION_CONFIG = {
  buccal: {
    maxStrength: 0.74,
    blurMultiplier: 0.055, // 5.5% of total bizygomatic width for natural sub-malar gradient
    prompt:
      "sub-malar buccal fat pad volume reduction, natural lower cheek contouring, smooth facial taper, photorealistic, identical skin texture, exact skin tone, zero texture modification, same lighting",
  },
  jawline: {
    // Lowered from 0.76 after V-Line slimming produced smeared, hallucinated edges where the
    // narrowed jaw meets the background. 0.76 was tuned for skin-only regions (see comment
    // above), but this mask also covers real background pixels the model must repaint, and at
    // 0.76 it discarded too much of that background detail before it had reconstructed it.
    // Still well above the old 0.42/0.38 baseline that caused near-identical results, so this
    // should not reintroduce that problem.
    maxStrength: 0.66,
    // Widened from 7.0% so the mandibular stroke's soft halo reaches further into the
    // background beyond the jaw, giving the model more repainted room to blend into instead of
    // stopping right at the old anatomical edge.
    blurMultiplier: 0.095,
    prompt:
      "refined mandibular angle contour, subtle V-line lower face slimming, smooth jawline definition, photorealistic, identical skin texture, exact skin tone, zero texturing artifacts, same lighting, seamlessly reconstruct and extend the original background texture, color and pattern into any area behind the new jawline, no smearing, no distortion of background elements, clean natural edge",
  },
} as const;

type CalibrationKey = keyof typeof FACIAL_CALIBRATION_CONFIG;

// Texture lock appended to chin prompts (the jawline prompts carry their own).
const LOWER_FACE_PRESERVATION =
  "subtle contouring only, exactly same skin texture, same skin tone, same lighting, no freckles, no texture change, zero perioral distortion, photorealistic";

// Each preset selects which calibrated regions participate. `category` tags which
// service-line bundle unlocks the technique; `promptSuffix` layers extra wording on top of
// the shared calibration prompt so techniques sharing a calibration (e.g. jawline_slim vs.
// masseter_reduction, both ["jawline"]) don't read identically.
const JAWLINE_TECHNIQUES: Record<
  string,
  { name: string; calibrations: readonly CalibrationKey[]; category: ServiceCategoryId; promptSuffix?: string }
> = {
  buccal_fat_removal: {
    name: "Buccal Fat Pad Removal",
    calibrations: ["buccal"],
    category: "plastic_surgery",
  },
  jawline_slim: {
    name: "Jawline Slimming (V-Line)",
    calibrations: ["jawline"],
    category: "injectables",
  },
  masseter_reduction: {
    name: "Masseter Reduction (Botox)",
    calibrations: ["jawline"],
    category: "injectables",
    promptSuffix:
      "masseter muscle relaxation, subtle lower jaw slimming without surgical alteration, preserved bone structure",
  },
  combined_contour: {
    name: "Combined Lower Face Contour",
    calibrations: ["buccal", "jawline"],
    category: "plastic_surgery",
  },
};

const NOSE_TECHNIQUES = {
  straight_slim: {
    name: "Straight & Slim Refinement",
    prompt_suffix: "straightened nasal dorsum, narrowed alar base, strictly preserve original nasal length, strictly preserve columella position, identical skin texture, photorealistic",
    strength: 0.72,
    category: "plastic_surgery" as ServiceCategoryId,
  },
  dorsal_hump: {
    name: "Dorsal Hump Reduction",
    prompt_suffix: "perfectly straight smooth nasal profile, complete dorsal hump reduction, refined bridge, photorealistic",
    strength: 0.70,
    category: "plastic_surgery" as ServiceCategoryId,
  },
  tip_plasty: {
    name: "Nasal Tip Refinement",
    prompt_suffix: "delicate narrow tip cartilage, elevated nasal tip angle, subtle supratip break, photorealistic",
    // Lowered from 0.68 alongside the tighter tip/alar-only mask (NOSE_TIP_ALAR_LANDMARKS) —
    // a full-strength edit concentrated on a much smaller region reads as more aggressive,
    // not less, so the mask and strength were tuned down together.
    strength: 0.60,
    category: "plastic_surgery" as ServiceCategoryId,
  },
  alar_reduction: {
    name: "Alar Base Narrowing",
    prompt_suffix: "narrowed alar base, reduced nostril flare, tight delicate nasal base, photorealistic",
    // Lowered from 0.64 alongside the tighter tip/alar-only mask, same rationale as tip_plasty.
    strength: 0.58,
    category: "plastic_surgery" as ServiceCategoryId,
  },
  liquid_rhino: {
    name: "Liquid Non-Surgical Rhinoplasty",
    prompt_suffix:
      "subtle dermal filler injection to the nasal dorsum, add volume to radix, elevate nasal tip, straighten dorsal line, maintain original nasal width, photorealistic medical simulation",
    // Lowered from 0.58. This is filler volume added on top of the existing structure, not a
    // reshape — combined with the narrow radix/tip-only mask below (no sidewall coverage at
    // all), a lower denoise keeps the change readable as "added volume" instead of the model
    // reinterpreting a wide mask as license to redraw the whole nose.
    strength: 0.38,
    category: "injectables" as ServiceCategoryId,
  },
};

const CHEEK_TECHNIQUES = {
  malar_volume: {
    name: "Zygomatic Arch Projection",
    prompt_suffix: "defined dermal filler projection over the zygomatic process and arch prominence, elevated high cheekbone apex, smooth transition to infraorbital rim, photorealistic",
    category: "injectables" as ServiceCategoryId,
  },
  apple_volume: {
    name: "Anterior Zygomatic Body Fill",
    prompt_suffix: "youthful dermal filler volume concentrated over anterior zygomatic body prominence, natural midface projection, seamless skin texture, photorealistic",
    category: "injectables" as ServiceCategoryId,
  },
  contour_sculpt: {
    name: "High Zygomatic Arch Sculpting",
    prompt_suffix: "chiseled lateral zygomatic arch highlight, elevated cheekbone structure, elegant midface contour, photorealistic",
    category: "injectables" as ServiceCategoryId,
  },
};

// Volumetric cheek parameter matrix: dosage → inference strength, Gaussian blur radius, dilation.
// Strengths raised so the mL selector produces a visibly different result at each step; they
// now sit below the 0.78 cheek ceiling rather than all being clamped flat to 0.42.
const CHEEK_DOSAGE_MAP: Record<
  string,
  { strength: number; blurRadius: number; dilationPx: number; promptLabel: string }
> = {
  "0.50ml": { strength: 0.58, blurRadius: 12, dilationPx: 8, promptLabel: "subtle 0.5ml filler highlight over zygomatic prominence" },
  "1.00ml": { strength: 0.68, blurRadius: 16, dilationPx: 12, promptLabel: "moderate 1.0ml dermal filler augmentation centered on zygomatic process and arch" },
  "1.50ml": { strength: 0.78, blurRadius: 20, dilationPx: 16, promptLabel: "pronounced 1.5ml volumetric cheek projection across entire zygomatic structure" },
};

const CHIN_TECHNIQUES = {
  anterior_projection: {
    name: "Anterior Projection (Mentoplasty)",
    prompt_suffix: `strong forward chin projection, prominent pogonion, well-defined chin tip, balanced facial profile line, ${LOWER_FACE_PRESERVATION}`,
    strength: 0.74,
    blurPx: 14,
    category: "plastic_surgery" as ServiceCategoryId,
  },
  chin_lengthening: {
    name: "Vertical Chin Elongation",
    prompt_suffix: `elongated lower facial third, vertically extended chin length, defined lower mentum border, sleek proportion, ${LOWER_FACE_PRESERVATION}`,
    strength: 0.72,
    blurPx: 14,
    category: "plastic_surgery" as ServiceCategoryId,
  },
  v_shape_slimming: {
    name: "V-Line Slimming / T-Osteotomy",
    prompt_suffix: `slim V-line chin tip, narrowed mental apex, delicate tapered lower jawline, sleek chin contour, ${LOWER_FACE_PRESERVATION}`,
    strength: 0.74,
    blurPx: 14,
    category: "plastic_surgery" as ServiceCategoryId,
  },
  square_jaw_chin: {
    name: "Broad Square Chin",
    prompt_suffix: `broad masculine square chin, strong angular mental width, wide chiseled chin border, ${LOWER_FACE_PRESERVATION}`,
    strength: 0.74,
    blurPx: 14,
    category: "plastic_surgery" as ServiceCategoryId,
  },
  cleft_smoothing: {
    name: "Chin Dimple / Cleft Smoothing",
    prompt_suffix: `smooth polished chin skin, completely filled chin dimple cleft, relaxed mentalis muscle, seamless chin contour, ${LOWER_FACE_PRESERVATION}`,
    strength: 0.66,
    blurPx: 12,
    category: "plastic_surgery" as ServiceCategoryId,
  },
  chin_filler: {
    name: "Chin Filler (Non-Surgical Projection)",
    prompt_suffix: `subtle non-surgical dermal filler chin projection, soft natural mentum enhancement, no bone or implant alteration, ${LOWER_FACE_PRESERVATION}`,
    strength: 0.62,
    blurPx: 12,
    category: "injectables" as ServiceCategoryId,
  },
};

const BROW_TECHNIQUES = {
  ombre_powder: {
    name: "Ombré Powder Brows",
    prompt_suffix: "ombre powder brows, razor-sharp clean lower border, crisp top outline, freshly waxed smooth skin, zero stray hairs outside border, dermaplaned skin, permanent makeup pixel shading, flawless symmetrical shape, photorealistic",
    category: "pmu" as ServiceCategoryId,
  },
  microblading: {
    name: "Microblading",
    prompt_suffix: "microblading eyebrows, ultra-sharp razor-crisp outer outline border, crisp individual 3D hair strokes inside clean stencil, pristine waxed skin perimeter, no stray hairs, photorealistic",
    category: "pmu" as ServiceCategoryId,
  },
  hybrid_tint: {
    name: "Combination Brows",
    prompt_suffix: "hybrid brow tinting, razor-sharp waxed outline edge, deep skin stain underneath, crisp defined arch tail, smooth hairless surrounding skin, high contrast, photorealistic",
    category: "pmu" as ServiceCategoryId,
  },
};

const LIP_TECHNIQUES = {
  russian: {
    name: "Russian Lip Technique",
    prompt_suffix: "Russian lip filler technique, vertical lip tenting, philtrum-adjacent central projection, heightened cupid's bow, flat anterior profile, clean teeth, natural mouth opening, photorealistic",
    category: "injectables" as ServiceCategoryId,
  },
  classic_lip: {
    name: "Classic Lip Linear",
    prompt_suffix: "Classic lip filler, anterior 3D projection, horizontal volume enhancement, plump natural pout, clean teeth, photorealistic",
    category: "injectables" as ServiceCategoryId,
  },
  border_definition: {
    name: "Cupid's Bow & Border Definition",
    prompt_suffix: "precise vermilion border filler definition, sharpened cupid's bow peaks, crisp lip outline, natural volume, clean teeth, photorealistic",
    category: "injectables" as ServiceCategoryId,
  },
  lip_flip: {
    name: "Lip Flip",
    prompt_suffix: "subtle lip flip, slight eversion of the upper lip vermilion border, no added volume, relaxed orbicularis oris, natural mouth opening, photorealistic",
    category: "injectables" as ServiceCategoryId,
  },
};

// Russian technique gets a lower strength ceiling than the mL-dosage-driven default: its mask
// is deliberately asymmetric (upper lip lifted toward the philtrum, lower lip narrowed), and a
// smaller, more targeted mask needs less denoise headroom than the standard symmetric lip fill.
const LIP_TECHNIQUE_STRENGTH_CEILING: Partial<Record<keyof typeof LIP_TECHNIQUES, number>> = {
  russian: 0.55,
};

const LIP_PMU_TECHNIQUES = {
  lip_blushing: {
    name: "Lip Blushing",
    prompt_suffix: "semi-permanent lip blush tattoo, sheer natural pigment tint evenly applied across the lip surface, enhanced natural lip color, symmetric tone, no volume change, exact original lip shape and size preserved, photorealistic",
    category: "pmu" as ServiceCategoryId,
  },
  lip_neutralization: {
    name: "Lip Neutralization",
    prompt_suffix: "semi-permanent lip pigment correction, neutralized dark or cool-toned pigmentation, warmed natural rosy tone, even color across the lip surface, no volume change, exact original lip shape preserved, photorealistic",
    category: "pmu" as ServiceCategoryId,
  },
  lip_liner: {
    name: "Lip Liner",
    prompt_suffix: "semi-permanent lip liner tattoo, crisp defined vermilion border line, subtle natural fill just inside the border, no volume change, exact original lip shape preserved, photorealistic",
    category: "pmu" as ServiceCategoryId,
  },
};

const EYELINER_TECHNIQUES = {
  lash_enhancement: {
    name: "Lash Enhancement",
    prompt_suffix: "semi-permanent lash line enhancement, subtle soft pigment filling only between the lashes, barely-there natural definition, no visible line extension, eyelid shape and skin texture unchanged, photorealistic",
    category: "pmu" as ServiceCategoryId,
  },
  classic: {
    name: "Classic Eyeliner",
    prompt_suffix: "semi-permanent classic eyeliner tattoo, thin crisp pigment line along the upper lash margin, natural eye shape and eyelid skin texture preserved, photorealistic",
    category: "pmu" as ServiceCategoryId,
  },
  winged: {
    name: "Winged Eyeliner",
    prompt_suffix: "semi-permanent winged eyeliner tattoo, crisp upper lash line tapering into a subtle upward wing past the outer corner, natural eye shape and eyelid skin texture preserved, photorealistic",
    category: "pmu" as ServiceCategoryId,
  },
};

type FeatureType =
  | "chin"
  | "cheeks"
  | "nose"
  | "brows"
  | "upper_lip"
  | "lower_lip"
  | "jawline"
  | "lip_pmu"
  | "eyeliner";

const DOSAGE_MAP: Record<string, { strength: number; dilationPx: number }> = {
  "0.25ml": { strength: 0.48, dilationPx: 6 },
  "0.50ml": { strength: 0.58, dilationPx: 10 },
  "0.75ml": { strength: 0.66, dilationPx: 14 },
  "1.00ml": { strength: 0.74, dilationPx: 18 },
  "tint_soft": { strength: 0.60, dilationPx: 10 },
  "tint_medium": { strength: 0.70, dilationPx: 16 },
  "tint_bold": { strength: 0.80, dilationPx: 22 },
};

const BROW_THICKNESS_MAP: Record<string, { stroke: number; padding: number }> = {
  thin: { stroke: 2, padding: 12 },
  medium: { stroke: 6, padding: 18 },
  thick: { stroke: 12, padding: 24 },
};

// Resolve the single global `strength` sent to fal.
//
// Previously this array was seeded with a hardcoded 0.52. Because every ceiling sat below
// that value, Math.max(...) always exceeded the ceiling and the clamp always won — so the
// strength sent was ALWAYS exactly the lowest ceiling, and the mL selectors had no effect
// whatsoever on the result. The seed is gone; the requested value now comes only from the
// procedures actually selected, so dosage genuinely drives intensity.
function resolveStrength(requested: number[], ceilings: number[]): number {
  if (requested.length === 0) return DEFAULT_STRENGTH;
  const peak = Math.max(...requested);
  if (ceilings.length === 0) return peak;
  return Math.min(peak, Math.min(...ceilings));
}

interface VisualizerAppProps {
  // Specific PROCEDURE_CATALOG ids the active facility is licensed to offer.
  // null/undefined (guest mode, or no facility system wired up) leaves every
  // toggle and technique unrestricted — today's behavior.
  allowedProcedureIds?: string[] | null;
}

export default function VisualizerApp({ allowedProcedureIds = null }: VisualizerAppProps = {}) {
  const [croppedImageSrc, setCroppedImageSrc] = useState<string | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<FeatureType[]>(["cheeks"]);
  const [browTechnique, setBrowTechnique] = useState<keyof typeof BROW_TECHNIQUES>("ombre_powder");
  const [browThickness, setBrowThickness] = useState<"thin" | "medium" | "thick">("medium");
  const [browDensity] = useState<string>("tint_medium");
  const [lipTechnique, setLipTechnique] = useState<keyof typeof LIP_TECHNIQUES>("russian");
  const [lipDosage, setLipDosage] = useState<string>("0.50ml");
  const [noseTechnique, setNoseTechnique] = useState<keyof typeof NOSE_TECHNIQUES>("straight_slim");
  const [cheekTechnique, setCheekTechnique] = useState<keyof typeof CHEEK_TECHNIQUES>("malar_volume");
  const [cheekDosage, setCheekDosage] = useState<string>("1.00ml");
  const [chinTechnique, setChinTechnique] = useState<keyof typeof CHIN_TECHNIQUES>("anterior_projection");
  const [jawlineTechnique, setJawlineTechnique] = useState<keyof typeof JAWLINE_TECHNIQUES>("combined_contour");
  const [lipPmuTechnique, setLipPmuTechnique] = useState<keyof typeof LIP_PMU_TECHNIQUES>("lip_blushing");
  const [lipPmuDensity] = useState<string>("tint_medium");
  const [eyelinerTechnique, setEyelinerTechnique] = useState<keyof typeof EYELINER_TECHNIQUES>("classic");

  // Layout and view modes
  const [viewMode, setViewMode] = useState<"split" | "before" | "after">("split");
  // Diagnostic: swap the BEFORE panel for the mask actually sent to the model.
  const [showMask, setShowMask] = useState<boolean>(false);

  const [landmarker, setLandmarker] = useState<FaceLandmarker | null>(null);
  const [rawPixelLandmarks, setRawPixelLandmarks] = useState<Array<{ x: number; y: number }> | null>(null);
  const [mappedLandmarks, setMappedLandmarks] = useState<Array<{ x: number; y: number }> | null>(null);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  // Fixed Bug #4: Cleanup FaceLandmarker instance on unmount
  useEffect(() => {
    let isCancelled = false;
    let activeLandmarker: FaceLandmarker | null = null;

    async function initMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          numFaces: 1,
        });

        if (isCancelled) {
          faceLandmarker.close();
          return;
        }

        activeLandmarker = faceLandmarker;
        setLandmarker(faceLandmarker);
      } catch (err) {
        if (isCancelled) return;
        console.error("MediaPipe Initialization Error:", err);
        setErrorMessage("Failed to load facial recognition engine.");
      }
    }

    initMediaPipe();

    return () => {
      isCancelled = true;
      if (activeLandmarker) {
        activeLandmarker.close();
        activeLandmarker = null;
      }
    };
  }, []);

  const toggleFeature = (feat: FeatureType) => {
    if (selectedFeatures.includes(feat)) {
      if (selectedFeatures.length > 1) {
        setSelectedFeatures(selectedFeatures.filter((f) => f !== feat));
      }
    } else {
      setSelectedFeatures([...selectedFeatures, feat]);
    }
  };

  // Facility bundle gating. `unlockedSet` holds "feature:technique" keys the active facility
  // is licensed for; null means unrestricted (guest mode / no facility system), preserving
  // today's behavior of showing every toggle and technique.
  const unlockedSet = useMemo(() => {
    if (!allowedProcedureIds) return null;
    const set = new Set<string>();
    PROCEDURE_CATALOG.forEach((entry) => {
      if (entry.feature && entry.technique && allowedProcedureIds.includes(entry.id)) {
        set.add(`${entry.feature}:${entry.technique}`);
      }
    });
    return set;
  }, [allowedProcedureIds]);

  // Lips share one technique/dosage selector across the upper_lip and lower_lip toggles (see
  // LIP_TECHNIQUES usage below), so both toggles unlock off the same "upper_lip:*" catalog
  // entries rather than needing a duplicate lower_lip-tagged catalog row.
  const availableLipTechniques = useMemo(() => {
    const keys = Object.keys(LIP_TECHNIQUES) as Array<keyof typeof LIP_TECHNIQUES>;
    if (!unlockedSet) return keys;
    return keys.filter((key) => unlockedSet.has(`upper_lip:${key}`));
  }, [unlockedSet]);

  const availableChinTechniques = useMemo(() => {
    const keys = Object.keys(CHIN_TECHNIQUES) as Array<keyof typeof CHIN_TECHNIQUES>;
    if (!unlockedSet) return keys;
    return keys.filter((key) => unlockedSet.has(`chin:${key}`));
  }, [unlockedSet]);

  const availableCheekTechniques = useMemo(() => {
    const keys = Object.keys(CHEEK_TECHNIQUES) as Array<keyof typeof CHEEK_TECHNIQUES>;
    if (!unlockedSet) return keys;
    return keys.filter((key) => unlockedSet.has(`cheeks:${key}`));
  }, [unlockedSet]);

  const availableNoseTechniques = useMemo(() => {
    const keys = Object.keys(NOSE_TECHNIQUES) as Array<keyof typeof NOSE_TECHNIQUES>;
    if (!unlockedSet) return keys;
    return keys.filter((key) => unlockedSet.has(`nose:${key}`));
  }, [unlockedSet]);

  const availableBrowTechniques = useMemo(() => {
    const keys = Object.keys(BROW_TECHNIQUES) as Array<keyof typeof BROW_TECHNIQUES>;
    if (!unlockedSet) return keys;
    return keys.filter((key) => unlockedSet.has(`brows:${key}`));
  }, [unlockedSet]);

  const availableLipPmuTechniques = useMemo(() => {
    const keys = Object.keys(LIP_PMU_TECHNIQUES) as Array<keyof typeof LIP_PMU_TECHNIQUES>;
    if (!unlockedSet) return keys;
    return keys.filter((key) => unlockedSet.has(`lip_pmu:${key}`));
  }, [unlockedSet]);

  const availableEyelinerTechniques = useMemo(() => {
    const keys = Object.keys(EYELINER_TECHNIQUES) as Array<keyof typeof EYELINER_TECHNIQUES>;
    if (!unlockedSet) return keys;
    return keys.filter((key) => unlockedSet.has(`eyeliner:${key}`));
  }, [unlockedSet]);

  // Jawline splits into single-calibration techniques (gated normally) plus the
  // combined_contour preset, which only makes sense once buccal_fat_removal AND at least
  // one of jawline_slim/masseter_reduction are both unlocked.
  const availableJawlineTechniques = useMemo((): Array<keyof typeof JAWLINE_TECHNIQUES> => {
    const singleKeys = (
      ["buccal_fat_removal", "jawline_slim", "masseter_reduction"] as const
    ).filter((key) => !unlockedSet || unlockedSet.has(`jawline:${key}`));
    const comboUnlocked =
      !unlockedSet ||
      (unlockedSet.has("jawline:buccal_fat_removal") &&
        (unlockedSet.has("jawline:jawline_slim") || unlockedSet.has("jawline:masseter_reduction")));
    const keys: Array<keyof typeof JAWLINE_TECHNIQUES> = [...singleKeys];
    if (comboUnlocked) keys.push("combined_contour");
    return keys;
  }, [unlockedSet]);

  // If the facility bundle changes underneath the current selection, drop any now-locked
  // feature and fall back the current technique choice to the first still-unlocked option.
  useEffect(() => {
    setSelectedFeatures((prev) => {
      const availability: Partial<Record<FeatureType, unknown[]>> = {
        chin: availableChinTechniques,
        cheeks: availableCheekTechniques,
        nose: availableNoseTechniques,
        jawline: availableJawlineTechniques,
        brows: availableBrowTechniques,
        upper_lip: availableLipTechniques,
        lower_lip: availableLipTechniques,
        lip_pmu: availableLipPmuTechniques,
        eyeliner: availableEyelinerTechniques,
      };
      const next = prev.filter((f) => (availability[f]?.length ?? 0) > 0);
      if (next.length > 0) return next;
      // Nothing in the current selection survived gating (e.g. a facility switch removed
      // every previously-selected feature) — fall back to the first feature that's actually
      // unlocked, in the same order the toggle buttons are displayed, rather than silently
      // keeping a now-locked feature selected with no visible way to deselect it.
      const priorityOrder: FeatureType[] = [
        "chin",
        "cheeks",
        "nose",
        "jawline",
        "brows",
        "upper_lip",
        "lower_lip",
        "lip_pmu",
        "eyeliner",
      ];
      const fallback = priorityOrder.find((f) => (availability[f]?.length ?? 0) > 0);
      return fallback ? [fallback] : prev;
    });

    if (!availableChinTechniques.includes(chinTechnique)) {
      setChinTechnique(availableChinTechniques[0] ?? chinTechnique);
    }
    if (!availableCheekTechniques.includes(cheekTechnique)) {
      setCheekTechnique(availableCheekTechniques[0] ?? cheekTechnique);
    }
    if (!availableNoseTechniques.includes(noseTechnique)) {
      setNoseTechnique(availableNoseTechniques[0] ?? noseTechnique);
    }
    if (!availableJawlineTechniques.includes(jawlineTechnique)) {
      setJawlineTechnique(availableJawlineTechniques[0] ?? jawlineTechnique);
    }
    if (!availableBrowTechniques.includes(browTechnique)) {
      setBrowTechnique(availableBrowTechniques[0] ?? browTechnique);
    }
    if (!availableLipTechniques.includes(lipTechnique)) {
      setLipTechnique(availableLipTechniques[0] ?? lipTechnique);
    }
    if (!availableLipPmuTechniques.includes(lipPmuTechnique)) {
      setLipPmuTechnique(availableLipPmuTechniques[0] ?? lipPmuTechnique);
    }
    if (!availableEyelinerTechniques.includes(eyelinerTechnique)) {
      setEyelinerTechnique(availableEyelinerTechniques[0] ?? eyelinerTechnique);
    }
    // Only re-run this reconciliation when the unlocked set itself changes (facility switch),
    // not on every technique pick — the technique setters above are the reconciliation, not
    // triggers for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedSet]);

  const updateViewportAndCrop = useCallback((img: HTMLImageElement, pixelLms: Array<{ x: number; y: number }>) => {
    const origW = img.width;
    const origH = img.height;

    const glabellaY = pixelLms[9].y;
    const subnasaleY = pixelLms[2].y;
    const leftCheekX = pixelLms[234].x;
    const rightCheekX = pixelLms[454].x;

    const midfaceH = Math.abs(subnasaleY - glabellaY);
    const calcTrichionY = Math.max(0, glabellaY - midfaceH);
    const calcMentonY = Math.min(origH, subnasaleY + midfaceH * 1.1);

    const faceWidth = Math.abs(rightCheekX - leftCheekX);
    const faceHeight = Math.abs(calcMentonY - calcTrichionY);

    const padX = faceWidth * 0.35;
    const padTop = faceHeight * 0.25;
    const padBottom = faceHeight * 0.25;

    const cropX = Math.max(0, leftCheekX - padX);
    const cropY = Math.max(0, calcTrichionY - padTop);
    let cropW = Math.min(origW - cropX, faceWidth + padX * 2);
    let cropH = Math.min(origH - cropY, faceHeight + padTop + padBottom);

    // Round to nearest 64px multiple rather than flooring down
    // Fixed Bug #3: Use Math.round to avoid clipping facial features
    cropW = Math.max(64, Math.round(cropW / 64) * 64);
    cropH = Math.max(64, Math.round(cropH / 64) * 64);

    // Clamp so the crop canvas never reads past the source image bounds
    const maxCropW = Math.max(1, origW - cropX);
    const maxCropH = Math.max(1, origH - cropY);
    cropW = Math.min(cropW, maxCropW);
    cropH = Math.min(cropH, maxCropH);

    // Render the crop no larger than the transport ceiling, still on a 64px grid.
    const downscale = Math.min(1, MAX_SIMULATION_DIMENSION / Math.max(cropW, cropH));
    const outW = Math.max(64, Math.round((cropW * downscale) / 64) * 64);
    const outH = Math.max(64, Math.round((cropH * downscale) / 64) * 64);

    // Landmarks are scaled by the exact source-to-canvas ratio (not by `downscale`,
    // which the 64px rounding above perturbs) so the mask stays pixel-aligned.
    const scaleX = outW / cropW;
    const scaleY = outH / cropH;

    const mapped = pixelLms.map((pt) => ({
      x: (pt.x - cropX) * scaleX,
      y: (pt.y - cropY) * scaleY,
    }));

    setMappedLandmarks(mapped);

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = outW;
    cropCanvas.height = outH;
    const cropCtx = cropCanvas.getContext("2d");
    if (cropCtx) {
      cropCtx.imageSmoothingQuality = "high";
      cropCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
      setCroppedImageSrc(cropCanvas.toDataURL("image/jpeg", CROP_JPEG_QUALITY));
    }
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setResultImage(null);
    setCroppedImageSrc(null);
    setMappedLandmarks(null);

    const file = e.target.files?.[0];
    if (!file || !landmarker) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      img.onload = () => {
        loadedImageRef.current = img;
        try {
          const results = landmarker.detect(img);
          if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
            const rawLms = results.faceLandmarks[0];
            const pixelLms = rawLms.map((pt: { x: number; y: number }) => ({
              x: pt.x * img.width,
              y: pt.y * img.height,
            }));
            setRawPixelLandmarks(pixelLms);
            updateViewportAndCrop(img, pixelLms);
          } else {
            setErrorMessage("No face detected. Upload a front-facing portrait.");
          }
        } catch (err) {
          console.error("Facial Geometry Detection Error:", err);
          setErrorMessage("Failed to analyze facial geometry.");
        }
      };
    };
    reader.readAsDataURL(file);
  };

  // MASK COMPOSITING EFFECT — solid opaque cores with soft Gaussian haloes.
  useEffect(() => {
    if (!mappedLandmarks || !croppedImageSrc || !canvasRef.current) return;
    const img = new Image();
    img.src = croppedImageSrc;
    img.onload = () => {
      const mainCanvas = canvasRef.current;
      if (!mainCanvas) return;
      mainCanvas.width = img.width;
      mainCanvas.height = img.height;
      const mainCtx = mainCanvas.getContext("2d");
      if (!mainCtx) return;
      mainCtx.fillStyle = "black";
      mainCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);

      const fillPolygonPoints = (
        ctx: CanvasRenderingContext2D,
        pts: Point[],
        inflatePx = 0
      ) => {
        if (pts.length < 3) return;

        const { centroid } = getLandmarkMetrics(pts);

        ctx.beginPath();
        pts.forEach((pt, i) => {
          let x = pt.x;
          let y = pt.y;
          if (inflatePx > 0) {
            const dx = pt.x - centroid.x;
            const dy = pt.y - centroid.y;
            const len = Math.hypot(dx, dy) || 1;
            x = pt.x + (dx / len) * inflatePx;
            y = pt.y + (dy / len) * inflatePx;
          }
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = "white";
        ctx.fill();
      };

      // DUAL-PASS MASKING.
      //
      // A single blurred fill spreads the shape's alpha outward, so a narrow region like the
      // nasal dorsum or a cheek pad never reaches fully opaque white at its centre. An
      // inpainting model reads mid-grey as "mostly keep the original pixels", which is part
      // of why simulations came back looking untouched.
      //
      // Pass 1 lays down the blurred halo (soft seam into surrounding skin). Pass 2 then
      // stamps the same polygon unblurred on top, guaranteeing a 100%-opaque core the model
      // has unambiguous permission to redraw. Halo first, core second — order matters.
      const fillSolidCorePolygon = (
        ctx: CanvasRenderingContext2D,
        pts: Point[],
        inflatePx: number,
        blurPx: number
      ) => {
        if (pts.length < 3) return;

        ctx.save();
        ctx.filter = `blur(${Math.max(0, blurPx).toFixed(2)}px)`;
        fillPolygonPoints(ctx, pts, inflatePx);
        ctx.restore();

        ctx.save();
        ctx.filter = "none";
        fillPolygonPoints(ctx, pts, Math.max(0, inflatePx - blurPx * 0.6));
        ctx.restore();
      };

      const fillSolidCoreLandmarks = (
        ctx: CanvasRenderingContext2D,
        indices: number[],
        inflatePx: number,
        blurPx: number
      ) => {
        fillSolidCorePolygon(ctx, getLandmarkPoints(indices, mappedLandmarks), inflatePx, blurPx);
      };

      // Bizygomatic width (outer temple landmarks) — the shared anatomical scale anchor
      // for every gradient below, so masks stay proportional across crop sizes.
      const leftTemple = mappedLandmarks[FACE_LATERAL_LEFT];
      const rightTemple = mappedLandmarks[FACE_LATERAL_RIGHT];
      const facialWidthPx =
        leftTemple && rightTemple ? Math.abs(rightTemple.x - leftTemple.x) : img.width * 0.45;

      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = img.width;
      layerCanvas.height = img.height;
      const layerCtx = layerCanvas.getContext("2d");

      // Per-feature strength: each procedure has its own effective intensity (dosage/technique
      // strength clamped by that procedure's own safety ceiling). Previously a single global
      // strength was sent to the AI, capped to the LOWEST ceiling among every selected
      // procedure — so selecting PMU alongside anything else silently weakened everything.
      // Instead, the strongest requested feature sets the AI's generation strength, and every
      // other feature's mask region is painted at a proportionally dimmer alpha, so the
      // client-side feathering blend pulls weaker procedures back toward the original by
      // exactly the right amount instead of flattening all of them together.
      const getFeatureStrength = (feat: FeatureType): number => {
        switch (feat) {
          case "chin":
            return CHIN_TECHNIQUES[chinTechnique].strength;
          case "cheeks": {
            const cfg = CHEEK_DOSAGE_MAP[cheekDosage] || CHEEK_DOSAGE_MAP["1.00ml"];
            return Math.min(cfg.strength, PROCEDURE_STRENGTH_MAP.cheeks);
          }
          case "brows":
            return DOSAGE_MAP[browDensity]?.strength || 0.70;
          case "upper_lip":
          case "lower_lip": {
            const base = DOSAGE_MAP[lipDosage]?.strength ?? 0.58;
            const techCeiling = LIP_TECHNIQUE_STRENGTH_CEILING[lipTechnique];
            return Math.min(base, PROCEDURE_STRENGTH_MAP[feat], techCeiling ?? base);
          }
          case "nose":
            return NOSE_TECHNIQUES[noseTechnique].strength;
          case "jawline": {
            const calibrations = JAWLINE_TECHNIQUES[jawlineTechnique]?.calibrations ?? (["buccal"] as const);
            return Math.max(...calibrations.map((key) => FACIAL_CALIBRATION_CONFIG[key].maxStrength));
          }
          case "lip_pmu": {
            const base = DOSAGE_MAP[lipPmuDensity]?.strength ?? 0.60;
            return Math.min(base, LIP_PMU_MAX_STRENGTH);
          }
          case "eyeliner":
            return EYELINER_MAX_STRENGTH;
          default:
            return DEFAULT_STRENGTH;
        }
      };
      const peakFeatureStrength = Math.max(...selectedFeatures.map(getFeatureStrength));

      selectedFeatures.forEach((feat) => {
        if (!layerCtx) return;
        layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
        layerCtx.save();
        layerCtx.globalAlpha =
          peakFeatureStrength > 0 ? Math.min(1, getFeatureStrength(feat) / peakFeatureStrength) : 1;

        if (feat === "brows") {
          const leftBrow = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
          const rightBrow = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
          const thicknessConfig = BROW_THICKNESS_MAP[browThickness] || BROW_THICKNESS_MAP.medium;
          const dilationPx = Math.max(4, thicknessConfig.padding * 0.45);
          const browBlur = dilationPx * 1.5;
          [leftBrow, rightBrow].forEach((browIndices) => {
            fillSolidCoreLandmarks(layerCtx, browIndices, dilationPx, browBlur);
          });
        } else if (feat === "chin") {
          const chinConfig = CHIN_TECHNIQUES[chinTechnique];
          fillSolidCoreLandmarks(
            layerCtx,
            angleSortIndices(CHIN_LANDMARKS, mappedLandmarks),
            8,
            chinConfig.blurPx
          );
        } else if (feat === "cheeks") {
          const leftCheekNode = mappedLandmarks[234];
          const rightCheekNode = mappedLandmarks[454];
          const facialWidth = leftCheekNode && rightCheekNode
            ? Math.abs(rightCheekNode.x - leftCheekNode.x)
            : img.width * 0.45;

          // Blur trimmed from 6% to 4% of facial width. At 6% the Gaussian was wide enough
          // relative to the cheek pad that even the dual-pass core sat inside a heavy
          // gradient; 4% still dissolves the seam without diluting the region.
          const cheekBlurRadius = facialWidth * 0.04;
          const dosageConfig = CHEEK_DOSAGE_MAP[cheekDosage] || CHEEK_DOSAGE_MAP["1.00ml"];
          const dosageScale = dosageConfig.dilationPx / CHEEK_DOSAGE_MAP["1.00ml"].dilationPx;

          if (CHEEK_LANDMARKS.left && CHEEK_LANDMARKS.right) {
            [CHEEK_LANDMARKS.left, CHEEK_LANDMARKS.right].forEach((cheekIndicesRaw) => {
              const validIndices = cheekIndicesRaw.filter((idx) => mappedLandmarks[idx] !== undefined);
              if (validIndices.length > 2) {
                const sortedIndices = angleSortIndices(validIndices, mappedLandmarks);
                fillSolidCoreLandmarks(
                  layerCtx,
                  sortedIndices,
                  cheekBlurRadius * 0.5 * dosageScale,
                  cheekBlurRadius
                );
              }
            });
          }
        } else if (feat === "nose" && noseTechnique === "liquid_rhino") {
          // Liquid rhinoplasty is filler-only: volume is added to the dorsum/tip, and the
          // sidewalls must stay completely untouched so the model has no mask permission to
          // narrow the nose. This mask deliberately excludes every lateral sidewall landmark
          // (98/327, 45/275, 220/440, 129/358, 209/429, 122/351, 131/360) that the wide
          // dorsum+sidewall polygon below uses — it's just a narrow midline bridge strip plus
          // a small round pad at the tip.
          const bridgeChain = [168, 197, 195, 6, 5, 4]
            .map((idx) => mappedLandmarks[idx])
            .filter((pt): pt is Point => Boolean(pt));
          const tipPt = mappedLandmarks[NOSE_TIP];
          const leftAlarLR = mappedLandmarks[NOSE_ALAR_LEFT];
          const rightAlarLR = mappedLandmarks[NOSE_ALAR_RIGHT];
          const alarWidthLR =
            leftAlarLR && rightAlarLR
              ? Math.abs(rightAlarLR.x - leftAlarLR.x)
              : img.width * 0.18;
          // Strip width is a small fraction of inter-alar width, so even at full inflation it
          // can never reach as far out as the actual sidewalls.
          const bridgeStripPx = alarWidthLR * 0.12;
          const bridgeBlurPx = Math.max(2, bridgeStripPx * 0.6);
          layerCtx.save();
          clipToNasalBase(layerCtx, mappedLandmarks, layerCanvas.width, layerCanvas.height);
          if (bridgeChain.length >= 2) {
            fillSolidCorePolygon(layerCtx, bridgeChain, bridgeStripPx, bridgeBlurPx);
          }
          if (tipPt) {
            const tipRadiusPx = alarWidthLR * 0.18;
            const tipBlurPx = Math.max(2, tipRadiusPx * 0.5);
            const tipRing = [0, 60, 120, 180, 240, 300].map((deg) => ({
              x: tipPt.x + Math.cos((deg * Math.PI) / 180) * (tipRadiusPx * 0.4),
              y: tipPt.y + Math.sin((deg * Math.PI) / 180) * (tipRadiusPx * 0.4),
            }));
            fillSolidCorePolygon(layerCtx, tipRing, tipRadiusPx * 0.6, tipBlurPx);
          }
          layerCtx.restore();
        } else if (feat === "nose") {
          // Tip/alar-only techniques don't touch the bridge, so they get the smaller mask —
          // asking FLUX to redraw the whole dorsum for a "delicate" tip refinement diluted
          // the edit (or let the model reshape the untouched bridge instead).
          const noseMaskLandmarks =
            noseTechnique === "tip_plasty" || noseTechnique === "alar_reduction"
              ? NOSE_TIP_ALAR_LANDMARKS
              : NOSE_LANDMARKS;
          const noseIndices = angleSortIndices(noseMaskLandmarks, mappedLandmarks);
          const rawNosePts = getLandmarkPoints(noseIndices, mappedLandmarks);
          const midlineX = computeNasalMidlineX(mappedLandmarks);
          // Mirror every landmark about X_mid so the mask cannot inherit lateral mesh drift,
          // then widen horizontally about the same axis to span dorsum + both sidewalls.
          const nosePts =
            midlineX !== null
              ? expandHorizontallyAboutMidline(
                  buildMidlineSymmetricPolygon(rawNosePts, midlineX),
                  midlineX,
                  NOSE_HORIZONTAL_EXPANSION
                )
              : rawNosePts;
          const noseMetrics = nosePts.length >= 3 ? getLandmarkMetrics(nosePts) : null;
          const leftAlar = mappedLandmarks[NOSE_ALAR_LEFT];
          const rightAlar = mappedLandmarks[NOSE_ALAR_RIGHT];
          const alarWidth =
            leftAlar && rightAlar
              ? Math.abs(rightAlar.x - leftAlar.x)
              : (noseMetrics?.width ?? img.width * 0.18);
          // Dilation is 22% of measured inter-alar width. The Gaussian is now capped well
          // below that: the previous max(20, padding) drove blur to ~40px on a large crop,
          // which is wide enough to hollow out the dorsum's alpha entirely.
          const nosePaddingPx = alarWidth * NOSE_EXPANSION_RATIO;
          const noseBlurPx = Math.min(NOSE_BLUR_PX, nosePaddingPx * 0.6);
          layerCtx.save();
          clipToNasalBase(layerCtx, mappedLandmarks, layerCanvas.width, layerCanvas.height);
          fillSolidCorePolygon(layerCtx, nosePts, nosePaddingPx, noseBlurPx);
          layerCtx.restore();
        } else if (feat === "jawline") {
          // Facial width anchor (outer temple landmarks 234/454) instead of
          // nose-derived alarWidth — the buccal hollow and jaw span a much
          // wider, vertically distinct region than the nose, so scaling
          // their blur/padding off nasal width was an anatomical mismatch.
          const facialWidth = facialWidthPx;

          const activeCalibrations =
            JAWLINE_TECHNIQUES[jawlineTechnique]?.calibrations ?? (["buccal"] as const);
          const drawBuccal = activeCalibrations.includes("buccal");
          const drawMandibularStroke = activeCalibrations.includes("jawline");

          // Perioral guard: everything below is clipped strictly inferior to the
          // tragus-commissure line, so the lips and mouth corners are never inpainted.
          const perioralMarginPx = facialWidth * 0.03;
          layerCtx.save();
          clipInferiorToCommissureLine(
            layerCtx,
            mappedLandmarks,
            layerCanvas.width,
            layerCanvas.height,
            perioralMarginPx
          );

          if (drawBuccal) {
            // Sub-malar triangle, calibrated to 5.5% of bizygomatic width.
            const buccalPaddingPx = facialWidth * FACIAL_CALIBRATION_CONFIG.buccal.blurMultiplier;
            const midlineX = computeFacialMidlineX(mappedLandmarks);
            (
              [
                [BUCCAL_LANDMARKS.left, NASOLABIAL_LEFT],
                [BUCCAL_LANDMARKS.right, NASOLABIAL_RIGHT],
              ] as const
            ).forEach(([buccalIndicesRaw, nasolabialIdx]) => {
              const buccalIndices = angleSortIndices(buccalIndicesRaw, mappedLandmarks);
              // Additionally keep each pad lateral to its own nasolabial fold.
              layerCtx.save();
              clipLateralToNasolabialFold(
                layerCtx,
                mappedLandmarks[nasolabialIdx],
                midlineX,
                layerCanvas.width,
                layerCanvas.height
              );
              fillSolidCoreLandmarks(
                layerCtx,
                buccalIndices,
                buccalPaddingPx * 0.4,
                buccalPaddingPx * 0.7
              );
              layerCtx.restore();
            });
          }

          if (drawMandibularStroke) {
            // Thick, unclosed stroke along the true mandibular contour
            // (234 -> 152 -> 454) rather than a filled internal polygon —
            // it bleeds outward into the background and inward onto the
            // lower cheek, giving FLUX room to redraw an actually narrower
            // silhouette instead of only softening the existing edge.
            const jawPts = JAWLINE_LANDMARKS
              .map((idx) => mappedLandmarks[idx])
              .filter((pt): pt is { x: number; y: number } => Boolean(pt));
            if (jawPts.length > 1) {
              const strokeWidthPx = facialWidth * 0.15;
              const strokeBlurPx = facialWidth * FACIAL_CALIBRATION_CONFIG.jawline.blurMultiplier;

              const strokeJawPath = (widthPx: number) => {
                layerCtx.beginPath();
                jawPts.forEach((pt, i) => {
                  if (i === 0) layerCtx.moveTo(pt.x, pt.y);
                  else layerCtx.lineTo(pt.x, pt.y);
                });
                layerCtx.lineWidth = widthPx;
                layerCtx.strokeStyle = "white";
                layerCtx.lineJoin = "round";
                layerCtx.lineCap = "round";
                layerCtx.stroke();
              };

              // Halo, then opaque core — same dual-pass rationale as the filled regions.
              layerCtx.save();
              layerCtx.filter = `blur(${strokeBlurPx.toFixed(2)}px)`;
              strokeJawPath(strokeWidthPx);
              layerCtx.restore();

              layerCtx.save();
              layerCtx.filter = "none";
              strokeJawPath(strokeWidthPx * 0.55);
              layerCtx.restore();
            }
          }

          layerCtx.restore();
        } else if (feat === "lip_pmu") {
          // PMU lip pigment covers the whole lip (upper + lower together), unlike the
          // volumetric filler toggles above which are selected independently per lip.
          const leftCommissure = mappedLandmarks[COMMISSURE_LEFT];
          const rightCommissure = mappedLandmarks[COMMISSURE_RIGHT];
          const lipWidth =
            leftCommissure && rightCommissure
              ? Math.abs(rightCommissure.x - leftCommissure.x)
              : facialWidthPx * 0.35;
          const dosageConfig = DOSAGE_MAP[lipPmuDensity] || DOSAGE_MAP["tint_medium"];
          const dosageScale = dosageConfig.dilationPx / DOSAGE_MAP["tint_medium"].dilationPx;
          const lipBlur = lipWidth * LIP_BLUR_RATIO;
          (["upper_lip", "lower_lip"] as const).forEach((lipFeat) => {
            const indices = FEATURE_INDICES[lipFeat];
            if (indices && indices.length > 0) {
              fillSolidCoreLandmarks(layerCtx, indices, lipBlur * 0.3 * dosageScale, lipBlur);
            }
          });
        } else if (feat === "eyeliner") {
          // Thin open-stroke mask along the lash line — same dual-pass halo-then-core stroke
          // technique used for the JAWLINE_LANDMARKS contour above, just applied per eye side.
          const baseStrokeWidth = Math.max(2, facialWidthPx * 0.006);
          const strokeBlurPx = Math.max(2, facialWidthPx * 0.012);

          const buildLinePts = (indices: number[], extendWing: boolean, cornerIdx: number) => {
            const pts = indices
              .map((idx) => mappedLandmarks[idx])
              .filter((pt): pt is Point => Boolean(pt));
            if (extendWing && pts.length >= 2) {
              const last = pts[pts.length - 1];
              const secondLast = pts[pts.length - 2];
              const corner = mappedLandmarks[cornerIdx] ?? last;
              const dx = last.x - secondLast.x;
              const dy = last.y - secondLast.y;
              const len = Math.hypot(dx, dy) || 1;
              const wingLength = facialWidthPx * 0.05;
              pts.push({
                x: corner.x + (dx / len) * wingLength,
                y: corner.y + (dy / len) * wingLength,
              });
            }
            return pts;
          };

          const strokePath = (pts: Point[], widthPx: number) => {
            if (pts.length < 2) return;
            layerCtx.beginPath();
            pts.forEach((pt, i) => {
              if (i === 0) layerCtx.moveTo(pt.x, pt.y);
              else layerCtx.lineTo(pt.x, pt.y);
            });
            layerCtx.lineWidth = widthPx;
            layerCtx.strokeStyle = "white";
            layerCtx.lineJoin = "round";
            layerCtx.lineCap = "round";
            layerCtx.stroke();
          };

          (["left", "right"] as const).forEach((side) => {
            const isWinged = eyelinerTechnique === "winged";
            const upperPts = buildLinePts(UPPER_LASH_LINE[side], isWinged, EYE_OUTER_CORNER[side]);
            const linesToDraw = [upperPts];
            if (eyelinerTechnique === "lash_enhancement") {
              linesToDraw.push(buildLinePts(LOWER_LASH_LINE[side], false, EYE_OUTER_CORNER[side]));
            }
            const widthPx =
              eyelinerTechnique === "lash_enhancement"
                ? baseStrokeWidth * 0.7
                : isWinged
                  ? baseStrokeWidth * 1.3
                  : baseStrokeWidth;

            linesToDraw.forEach((pts) => {
              layerCtx.save();
              layerCtx.filter = `blur(${strokeBlurPx.toFixed(2)}px)`;
              strokePath(pts, widthPx);
              layerCtx.restore();

              layerCtx.save();
              layerCtx.filter = "none";
              strokePath(pts, widthPx * 0.55);
              layerCtx.restore();
            });
          });
        } else if (feat.includes("lip")) {
          const indices = FEATURE_INDICES[feat];
          if (indices && indices.length > 0) {
            // Vermilion border gradient scales with commissure-to-commissure width, so the
            // falloff stays tight on small mouths instead of washing out mucosal texture.
            const leftCommissure = mappedLandmarks[COMMISSURE_LEFT];
            const rightCommissure = mappedLandmarks[COMMISSURE_RIGHT];
            const lipWidth =
              leftCommissure && rightCommissure
                ? Math.abs(rightCommissure.x - leftCommissure.x)
                : facialWidthPx * 0.35;
            const dosageConfig = DOSAGE_MAP[lipDosage] || DOSAGE_MAP["0.50ml"];
            const dosageScale = dosageConfig.dilationPx / DOSAGE_MAP["0.50ml"].dilationPx;
            const lipBlur = lipWidth * LIP_BLUR_RATIO;
            // Solid outer lip volume only — no inner oral cutouts or stroke outlines.
            // Natural landmark order is kept: the lip loops are already simple polygons and
            // angle-sorting them around the centroid would flatten the cupid's bow.
            const inflatePx = lipBlur * 0.3 * dosageScale;
            if (lipTechnique === "russian") {
              // Russian technique needs headroom the plain lip outline doesn't give it: the
              // upper lip is lifted toward the philtrum for vertical tenting, and the lower
              // lip is narrowed off the commissures so volume reads as a centralized pout
              // instead of corner-to-corner "sausage lip" inflation.
              const basePts = getLandmarkPoints(indices, mappedLandmarks);
              const { centroid } = getLandmarkMetrics(basePts);
              const russianPts =
                feat === "upper_lip"
                  ? basePts.map((pt) =>
                      pt.y < centroid.y ? { x: pt.x, y: pt.y - lipWidth * 0.15 } : pt
                    )
                  : basePts.map((pt) => ({
                      x: centroid.x + (pt.x - centroid.x) * 0.85,
                      y: pt.y,
                    }));
              fillSolidCorePolygon(layerCtx, russianPts, inflatePx, lipBlur);
            } else {
              fillSolidCoreLandmarks(layerCtx, indices, inflatePx, lipBlur);
            }
          }
        } else {
          const indices = FEATURE_INDICES[feat];
          if (indices && indices.length > 0) {
            fillSolidCoreLandmarks(layerCtx, indices, 6, 9);
          }
        }

        layerCtx.restore();
        mainCtx.drawImage(layerCanvas, 0, 0);
      });
      setMaskDataUrl(mainCanvas.toDataURL("image/png"));
    };
  }, [mappedLandmarks, selectedFeatures, browThickness, lipDosage, lipTechnique, noseTechnique, cheekTechnique, cheekDosage, chinTechnique, jawlineTechnique, lipPmuDensity, eyelinerTechnique, croppedImageSrc]);

  // Soft-composite AI over original using the same mask sent to fal (pixel-aligned).
  const applyEdgeFeathering = useCallback((originalSrc: string, aiResultUrl: string, maskUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const origImg = new Image();
      const aiImg = new Image();
      const maskImg = new Image();
      let loadedCount = 0;

      const compose = () => {
        const width = origImg.width;
        const height = origImg.height;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(aiResultUrl);

        // Base: original (aligned with mask_url coordinates).
        ctx.drawImage(origImg, 0, 0, width, height);

        // Build a white-on-transparent soft matte from the fal mask (luminance → alpha only).
        const matteCanvas = document.createElement("canvas");
        matteCanvas.width = width;
        matteCanvas.height = height;
        const matteCtx = matteCanvas.getContext("2d", { willReadFrequently: true });
        if (!matteCtx) return resolve(aiResultUrl);
        matteCtx.drawImage(maskImg, 0, 0, width, height);
        const matteData = matteCtx.getImageData(0, 0, width, height);
        const px = matteData.data;
        for (let i = 0; i < px.length; i += 4) {
          const alpha = (px[i] + px[i + 1] + px[i + 2]) / 3;
          px[i] = 255;
          px[i + 1] = 255;
          px[i + 2] = 255;
          px[i + 3] = alpha;
        }
        matteCtx.putImageData(matteData, 0, 0);

        const softMatte = document.createElement("canvas");
        softMatte.width = width;
        softMatte.height = height;
        const softCtx = softMatte.getContext("2d");
        if (!softCtx) return resolve(aiResultUrl);
        // Reduced from 12px. The mask already carries its own feathered halo, so a second
        // wide blur here compounded on the first and bled the original photo back over the
        // AI result — diluting exactly the change we were trying to see. 4px is just enough
        // to soften the junction between the mask's opaque core and its halo.
        softCtx.filter = "blur(4px)";
        softCtx.drawImage(matteCanvas, 0, 0);

        // AI clipped by soft matte, then layered over the original.
        const aiLayer = document.createElement("canvas");
        aiLayer.width = width;
        aiLayer.height = height;
        const aiCtx = aiLayer.getContext("2d");
        if (!aiCtx) return resolve(aiResultUrl);
        aiCtx.drawImage(aiImg, 0, 0, width, height);
        aiCtx.globalCompositeOperation = "destination-in";
        aiCtx.drawImage(softMatte, 0, 0);

        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(aiLayer, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };

      // Reading back pixels throws if fal's CDN response taints the canvas. Without a
      // guard that throw escapes the image onload callback, the promise never settles
      // and the caller waits forever, so any failure falls back to the raw AI frame.
      const checkLoaded = () => {
        loadedCount++;
        if (loadedCount < 3) return;
        try {
          compose();
        } catch (err) {
          console.error("applyEdgeFeathering compositing failed:", err);
          resolve(aiResultUrl);
        }
      };

      origImg.crossOrigin = "anonymous";
      aiImg.crossOrigin = "anonymous";
      maskImg.crossOrigin = "anonymous";
      origImg.onload = checkLoaded;
      aiImg.onload = checkLoaded;
      maskImg.onload = checkLoaded;
      origImg.onerror = () => resolve(aiResultUrl);
      aiImg.onerror = () => resolve(aiResultUrl);
      maskImg.onerror = () => resolve(aiResultUrl);
      origImg.src = originalSrc;
      aiImg.src = aiResultUrl;
      maskImg.src = maskUrl;
    });
  }, []);

  const logSimulationErrorDetails = (label: string, err: unknown) => {
    if (err == null) {
      console.error(label, "unknown null/undefined error");
      return;
    }
    if (typeof err === "string") {
      console.error(label, err);
      return;
    }
    if (err instanceof Error) {
      const anyErr = err as Error & {
        status?: number | string;
        statusCode?: number | string;
        body?: unknown;
        detail?: unknown;
        response?: { status?: number | string; data?: unknown };
      };
      console.error(label, {
        name: anyErr.name,
        message: anyErr.message,
        status: anyErr.status,
        statusCode: anyErr.statusCode,
        responseStatus: anyErr.response?.status,
        detail: anyErr.detail,
        body: anyErr.body,
        responseData: anyErr.response?.data,
        raw: err,
      });
      return;
    }
    console.error(label, err);
  };

  const USER_SIMULATION_ERROR =
    "Simulation failed — please try again. Check console for details.";

  // Derived from the constant so the copy cannot drift out of sync with the actual limit.
  const USER_SIMULATION_TIMEOUT_ERROR =
    `Simulation timed out after ${SIMULATION_TIMEOUT_MS / 1000} seconds — please try again.`;

  // Per-feature strength: each procedure has its own effective intensity (dosage/technique
  // strength clamped by that procedure's own safety ceiling), matching the mask-alpha scaling
  // in the mask-compositing effect above. The AI's single `strength` input is set to the
  // strongest requested feature; every other selected feature is pulled back toward the
  // original in the mask itself, not by dragging this number down for everyone.
  const getFeatureStrength = useCallback(
    (feat: FeatureType): number => {
      switch (feat) {
        case "chin":
          return CHIN_TECHNIQUES[chinTechnique].strength;
        case "cheeks": {
          const cfg = CHEEK_DOSAGE_MAP[cheekDosage] || CHEEK_DOSAGE_MAP["1.00ml"];
          return Math.min(cfg.strength, PROCEDURE_STRENGTH_MAP.cheeks);
        }
        case "brows":
          return DOSAGE_MAP[browDensity]?.strength || 0.70;
        case "upper_lip":
        case "lower_lip": {
          const base = DOSAGE_MAP[lipDosage]?.strength ?? 0.58;
          const techCeiling = LIP_TECHNIQUE_STRENGTH_CEILING[lipTechnique];
          return Math.min(base, PROCEDURE_STRENGTH_MAP[feat], techCeiling ?? base);
        }
        case "nose":
          return NOSE_TECHNIQUES[noseTechnique].strength;
        case "jawline": {
          const calibrations = JAWLINE_TECHNIQUES[jawlineTechnique]?.calibrations ?? (["buccal"] as const);
          return Math.max(...calibrations.map((key) => FACIAL_CALIBRATION_CONFIG[key].maxStrength));
        }
        case "lip_pmu": {
          const base = DOSAGE_MAP[lipPmuDensity]?.strength ?? 0.60;
          return Math.min(base, LIP_PMU_MAX_STRENGTH);
        }
        case "eyeliner":
          return EYELINER_MAX_STRENGTH;
        default:
          return DEFAULT_STRENGTH;
      }
    },
    [chinTechnique, cheekDosage, browDensity, lipDosage, lipTechnique, noseTechnique, jawlineTechnique, lipPmuDensity]
  );

  // Live readout so the effect of each dosage/preset change is visible before running. This is
  // the strongest requested feature's strength — the same value sent to the AI as `strength`.
  const previewStrength = useMemo(() => {
    if (selectedFeatures.length === 0) return DEFAULT_STRENGTH;
    return Math.max(...selectedFeatures.map(getFeatureStrength));
  }, [selectedFeatures, getFeatureStrength]);

  const handleGeneratePreview = async () => {
    // A second click while a request is in flight would race the first and leave
    // the button state owned by whichever promise settles last.
    if (loading) return;

    if (!croppedImageSrc || !maskDataUrl || selectedFeatures.length === 0) {
      const msg = !croppedImageSrc
        ? "Please upload a portrait before running the simulation."
        : selectedFeatures.length === 0
          ? "Select at least one procedure before running the simulation."
          : "Mask is still preparing — please wait a moment and try again.";
      console.error("handleGeneratePreview early exit:", {
        reason: msg,
        hasCroppedImage: Boolean(croppedImageSrc),
        hasMask: Boolean(maskDataUrl),
        featureCount: selectedFeatures.length,
      });
      setErrorMessage(msg);
      return;
    }
    setLoading(true);
    setErrorMessage(null);

    // Failsafe against a hung request. Aborting the signal is what actually frees the
    // app — clearing `loading` alone would leave the fal call polling in the background
    // and let a late response overwrite the timeout state.
    let timedOut = false;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      timedOut = true;
      abortController.abort();
      console.error(`Simulation timed out after ${SIMULATION_TIMEOUT_MS / 1000} seconds.`);
      setErrorMessage(USER_SIMULATION_TIMEOUT_ERROR);
      setLoading(false);
    }, SIMULATION_TIMEOUT_MS);

    try {
      const promptParts: string[] = ["Clinical aesthetic portrait transformation:"];

      if (selectedFeatures.includes("chin")) {
        promptParts.push(CHIN_TECHNIQUES[chinTechnique].prompt_suffix);
      }
      if (selectedFeatures.includes("cheeks")) {
        const cheekConfig = CHEEK_TECHNIQUES[cheekTechnique];
        const cheekDosageConfig = CHEEK_DOSAGE_MAP[cheekDosage] || CHEEK_DOSAGE_MAP["1.00ml"];
        promptParts.push(`${cheekConfig.prompt_suffix}, ${cheekDosageConfig.promptLabel}`);
      }
      if (selectedFeatures.includes("brows")) {
        promptParts.push(`${browThickness} thickness ${BROW_TECHNIQUES[browTechnique].prompt_suffix}`);
      }
      if (selectedFeatures.includes("upper_lip") || selectedFeatures.includes("lower_lip")) {
        promptParts.push(LIP_TECHNIQUES[lipTechnique].prompt_suffix);
      }
      if (selectedFeatures.includes("nose")) {
        promptParts.push(NOSE_TECHNIQUES[noseTechnique].prompt_suffix);
        if (noseTechnique === "liquid_rhino") {
          // The surgical instruction below explicitly invites the model to redraw the
          // sidewalls, which is exactly what liquid rhinoplasty must not do.
          promptParts.push("do not alter the nasal sidewalls or nostril width in any way");
        } else {
          promptParts.push(
            "reshape the full nasal unit including bridge, dorsum, sidewalls, and tip with smooth continuous contours"
          );
        }
      }
      if (selectedFeatures.includes("jawline")) {
        const jawlineConfig = JAWLINE_TECHNIQUES[jawlineTechnique];
        const calibrations = jawlineConfig?.calibrations ?? (["buccal"] as const);
        calibrations.forEach((key) => promptParts.push(FACIAL_CALIBRATION_CONFIG[key].prompt));
        if (jawlineConfig?.promptSuffix) promptParts.push(jawlineConfig.promptSuffix);
      }
      if (selectedFeatures.includes("lip_pmu")) {
        promptParts.push(LIP_PMU_TECHNIQUES[lipPmuTechnique].prompt_suffix);
      }
      if (selectedFeatures.includes("eyeliner")) {
        promptParts.push(EYELINER_TECHNIQUES[eyelinerTechnique].prompt_suffix);
      }

      // Single global strength sent to the AI — the strongest requested feature. Weaker
      // features (e.g. PMU) are pulled back toward the original via their own mask alpha
      // instead of capping this number for every selected procedure.
      const maxStrength = previewStrength;
      console.info("Simulation strength resolved:", {
        perFeature: selectedFeatures.map((f) => ({ feature: f, strength: getFeatureStrength(f) })),
        sent: maxStrength,
        features: selectedFeatures,
      });

      const compositePrompt = promptParts.join(" ");

      const activeNegatives: string[] = ["plastic skin", "distorted geometry", "overfilled face", "asymmetry"];
      if (selectedFeatures.includes("cheeks")) {
        activeNegatives.push(
          "lower cheek bulge",
          "inferior volume sag",
          "exaggerated nasolabial folds",
          "heavy marionette lines",
          "unnatural cheek shadows",
          "sunken under-eyes"
        );
      }
      if (selectedFeatures.includes("nose")) {
        // Without explicit length constraints the model regresses to aesthetic averages,
        // which bundle tip rotation and shortening into any rhinoplasty request.
        activeNegatives.push(
          "tip rotation",
          "shortened nose",
          "foreshortened tip",
          "philtrum distortion",
          "upturned nose",
          "altered nasal length"
        );
        if (noseTechnique === "liquid_rhino") {
          activeNegatives.push(
            "narrowed sidewalls",
            "reduced nasal width",
            "surgical rhinoplasty result",
            "bone or cartilage removal"
          );
        }
      }
      if (selectedFeatures.includes("upper_lip") || selectedFeatures.includes("lower_lip")) {
        activeNegatives.push("harsh lines around mouth");
        if (lipTechnique === "russian") {
          activeNegatives.push("sausage lips", "uniform corner-to-corner volume", "horizontal-only projection");
        }
      }
      if (selectedFeatures.includes("jawline")) {
        activeNegatives.push(
          "asymmetric jaw contour",
          "over-hollowed cheeks",
          "gaunt sunken appearance",
          "unnatural jaw taper",
          "visible masseter bulge",
          "freckles",
          "changed skin texture",
          "skin grain mismatch",
          "distorted mouth",
          "shifted lip corners"
        );
      }
      if (selectedFeatures.includes("lip_pmu")) {
        activeNegatives.push("lip shape change", "added lip volume", "swollen lips");
      }
      if (selectedFeatures.includes("eyeliner")) {
        activeNegatives.push(
          "smudged eyeliner",
          "asymmetric eye shape",
          "closed eye",
          "altered eyelid shape",
          "changed eye size"
        );
      }
      const scopedNegativePrompt = activeNegatives.join(", ");

      // flux-general/inpainting rather than flux-pro/v1/fill: the latter's schema has no
      // strength or negative_prompt, so every dosage selector and calibrated ceiling this
      // app computes was being discarded and the model ran at its own default. Uses the
      // unwarped crop so image_url and mask_url share identical pixel coordinates.
      const result = await fal.subscribe("fal-ai/flux-general/inpainting", {
        input: {
          prompt: compositePrompt,
          negative_prompt: scopedNegativePrompt,
          image_url: croppedImageSrc,
          mask_url: maskDataUrl,
          strength: maxStrength,
          enable_safety_checker: true,
        },
        abortSignal: abortController.signal,
      });

      if (timedOut) return;

      if (result.data?.images?.[0]?.url) {
        const rawAiUrl = result.data.images[0].url;
        const featheredUrl = await applyEdgeFeathering(croppedImageSrc, rawAiUrl, maskDataUrl);
        setResultImage(featheredUrl);
      } else {
        console.error("handleGeneratePreview empty result:", result?.data ?? result ?? null);
        setErrorMessage(USER_SIMULATION_ERROR);
      }
    } catch (err: unknown) {
      logSimulationErrorDetails("Composite Simulation Execution Error:", err);
      setErrorMessage(timedOut ? USER_SIMULATION_TIMEOUT_ERROR : describeSimulationFailure(err));
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    if (!croppedImageSrc || !resultImage) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const procedureList = selectedFeatures.map((f) => f.toUpperCase()).join(", ");
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Face-off.ai — Patient Consultation Summary</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; max-width: 800px; margin: 0 auto; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
          .title { font-size: 24px; font-weight: bold; font-family: serif; }
          .subtitle { font-size: 12px; color: #64748b; }
          .section { margin-bottom: 20px; }
          .grid { display: flex; gap: 20px; margin-top: 15px; }
          .card { flex: 1; text-align: center; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; }
          .card img { width: 100%; height: auto; border-radius: 6px; }
          .metrics { background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 12px; }
          .disclaimer { font-size: 10px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">Face-off.ai</div>
            <div class="subtitle">Clinical Aesthetic Procedure Simulation Summary</div>
          </div>
          <div style="text-align: right; font-size: 11px; color: #64748b;">
            Date: ${new Date().toLocaleDateString()}<br/>
            Selected Procedures: <strong>${procedureList}</strong>
          </div>
        </div>
        <div class="section">
          <h3>Visual Transformation Simulation</h3>
          <div class="grid">
            <div class="card">
              <img src="${croppedImageSrc}" />
              <p><strong>BEFORE (Baseline)</strong></p>
            </div>
            <div class="card">
              <img src="${resultImage}" />
              <p><strong>AFTER (${procedureList})</strong></p>
            </div>
          </div>
        </div>
        <div class="disclaimer">
          <strong>Medical Disclaimer:</strong> This visual simulation is provided for consultation and educational purposes only. It does not constitute a surgical guarantee. Final treatment plans depend on in-person clinical assessment by a licensed physician.
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 text-white bg-gray-950 min-h-screen select-none">
      
      {/* Header */}
      <div className="border-b border-gray-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif tracking-wide text-amber-100">Face-off.ai</h1>
          <p className="text-gray-400 text-sm">Clinical Aesthetic Procedure Simulator</p>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-950/60 border border-red-500/50 rounded-lg text-red-200 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Control Panel */}
      <div className="bg-gray-900 p-5 rounded-xl border border-gray-800 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-amber-200 uppercase tracking-wider mb-2">
            1. Select Target Procedures
          </label>
          <div className="grid grid-cols-2 md:grid-cols-9 gap-2">
            {[
              { id: "chin" as const, label: "Chin", available: availableChinTechniques.length > 0 },
              { id: "cheeks" as const, label: "Cheeks", available: availableCheekTechniques.length > 0 },
              { id: "nose" as const, label: "Rhinoplasty", available: availableNoseTechniques.length > 0 },
              { id: "jawline" as const, label: "Jawline / Buccal", available: availableJawlineTechniques.length > 0 },
              { id: "brows" as const, label: "Eyebrows", available: availableBrowTechniques.length > 0 },
              { id: "upper_lip" as const, label: "Upper Lip", available: availableLipTechniques.length > 0 },
              { id: "lower_lip" as const, label: "Lower Lip", available: availableLipTechniques.length > 0 },
              { id: "lip_pmu" as const, label: "Lip PMU", available: availableLipPmuTechniques.length > 0 },
              { id: "eyeliner" as const, label: "Eyeliner", available: availableEyelinerTechniques.length > 0 },
            ]
              .filter((f) => f.available)
              .map((f) => {
              const active = selectedFeatures.includes(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => toggleFeature(f.id)}
                  className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-between transition ${
                    active
                      ? "bg-amber-600/20 border-amber-500 text-amber-200 font-bold"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750"
                  }`}
                >
                  <span>{f.label}</span>
                  <span className="text-xs">{active ? "✓" : "+"}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-gray-800">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Upload Photo</label>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="text-sm text-gray-300 w-full" />
          </div>

          {selectedFeatures.includes("chin") && (
            <div>
              <label className="block text-xs text-amber-300 font-medium mb-1">Chin Procedure Preset</label>
              <select
                value={chinTechnique}
                onChange={(e) => setChinTechnique(e.target.value as keyof typeof CHIN_TECHNIQUES)}
                className="bg-gray-800 text-white p-2 rounded border border-amber-500/50 text-xs w-full font-medium"
              >
                {availableChinTechniques.map((key) => (
                  <option key={key} value={key}>{CHIN_TECHNIQUES[key].name}</option>
                ))}
              </select>
            </div>
          )}

          {selectedFeatures.includes("jawline") && (
            <div>
              <label className="block text-xs text-amber-300 font-medium mb-1">Jawline / Buccal Fat Preset</label>
              <select
                value={jawlineTechnique}
                onChange={(e) => setJawlineTechnique(e.target.value as keyof typeof JAWLINE_TECHNIQUES)}
                className="bg-gray-800 text-white p-2 rounded border border-amber-500/50 text-xs w-full font-medium"
              >
                {availableJawlineTechniques.map((key) => (
                  <option key={key} value={key}>{JAWLINE_TECHNIQUES[key].name}</option>
                ))}
              </select>
            </div>
          )}

          {selectedFeatures.includes("cheeks") && (
            <div className="space-y-2">
              <label className="block text-xs text-amber-300 font-medium">Cheek Technique & Volume</label>
              <div className="flex gap-2">
                <select
                  value={cheekTechnique}
                  onChange={(e) => setCheekTechnique(e.target.value as keyof typeof CHEEK_TECHNIQUES)}
                  className="bg-gray-800 text-white p-2 rounded border border-amber-500/50 text-xs flex-1 font-medium"
                >
                  {availableCheekTechniques.map((key) => (
                    <option key={key} value={key}>{CHEEK_TECHNIQUES[key].name}</option>
                  ))}
                </select>
                <select
                  value={cheekDosage}
                  onChange={(e) => setCheekDosage(e.target.value)}
                  className="bg-gray-800 text-white p-2 rounded border border-amber-500/50 text-xs w-28 font-medium"
                >
                  <option value="0.50ml">0.50 mL/side</option>
                  <option value="1.00ml">1.00 mL/side</option>
                  <option value="1.50ml">1.50 mL/side</option>
                </select>
              </div>
            </div>
          )}

          {selectedFeatures.includes("nose") && (
            <div>
              <label className="block text-xs text-amber-300 font-medium mb-1">Rhinoplasty Preset</label>
              <select
                value={noseTechnique}
                onChange={(e) => setNoseTechnique(e.target.value as keyof typeof NOSE_TECHNIQUES)}
                className="bg-gray-800 text-white p-2 rounded border border-amber-500/50 text-xs w-full font-medium"
              >
                {availableNoseTechniques.map((key) => (
                  <option key={key} value={key}>{NOSE_TECHNIQUES[key].name}</option>
                ))}
              </select>
            </div>
          )}

          {selectedFeatures.includes("brows") && (
            <div className="space-y-2">
              <label className="block text-xs text-gray-400">Eyebrow Style & Thickness</label>
              <div className="flex gap-2">
                <select
                  value={browTechnique}
                  onChange={(e) => setBrowTechnique(e.target.value as keyof typeof BROW_TECHNIQUES)}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-700 text-xs flex-1"
                >
                  {availableBrowTechniques.map((key) => (
                    <option key={key} value={key}>{BROW_TECHNIQUES[key].name}</option>
                  ))}
                </select>
                <select
                  value={browThickness}
                  onChange={(e) => setBrowThickness(e.target.value as "thin" | "medium" | "thick")}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-700 text-xs w-24"
                >
                  <option value="thin">Thin</option>
                  <option value="medium">Medium</option>
                  <option value="thick">Thick</option>
                </select>
              </div>
            </div>
          )}

          {(selectedFeatures.includes("upper_lip") || selectedFeatures.includes("lower_lip")) && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Lip Technique & Dosage</label>
              <div className="flex gap-2">
                <select
                  value={lipTechnique}
                  onChange={(e) => setLipTechnique(e.target.value as keyof typeof LIP_TECHNIQUES)}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-700 text-xs flex-1"
                >
                  {availableLipTechniques.map((key) => (
                    <option key={key} value={key}>{LIP_TECHNIQUES[key].name}</option>
                  ))}
                </select>
                <select
                  value={lipDosage}
                  onChange={(e) => setLipDosage(e.target.value)}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-700 text-xs w-24"
                >
                  <option value="0.25ml">0.25ml</option>
                  <option value="0.50ml">0.50ml</option>
                  <option value="0.75ml">0.75ml</option>
                  <option value="1.00ml">1.00ml</option>
                </select>
              </div>
            </div>
          )}

          {selectedFeatures.includes("lip_pmu") && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Lip PMU Technique</label>
              <select
                value={lipPmuTechnique}
                onChange={(e) => setLipPmuTechnique(e.target.value as keyof typeof LIP_PMU_TECHNIQUES)}
                className="bg-gray-800 text-white p-2 rounded border border-gray-700 text-xs w-full"
              >
                {availableLipPmuTechniques.map((key) => (
                  <option key={key} value={key}>{LIP_PMU_TECHNIQUES[key].name}</option>
                ))}
              </select>
            </div>
          )}

          {selectedFeatures.includes("eyeliner") && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Eyeliner Technique</label>
              <select
                value={eyelinerTechnique}
                onChange={(e) => setEyelinerTechnique(e.target.value as keyof typeof EYELINER_TECHNIQUES)}
                className="bg-gray-800 text-white p-2 rounded border border-gray-700 text-xs w-full"
              >
                {availableEyelinerTechniques.map((key) => (
                  <option key={key} value={key}>{EYELINER_TECHNIQUES[key].name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-end items-center gap-3">
        {/* Live intensity readout — this is the exact `strength` value sent to the model. */}
        <span className="text-xs text-gray-400 font-mono">
          Inference intensity:{" "}
          <strong className="text-amber-300">{previewStrength.toFixed(2)}</strong>
        </span>
        {maskDataUrl && (
          <button
            onClick={() => setShowMask(!showMask)}
            className={`text-xs font-semibold px-3 py-2 rounded border transition ${
              showMask
                ? "bg-amber-500 text-black border-amber-400"
                : "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
            }`}
          >
            {showMask ? "🖼 Show Photo" : "🎭 Show Mask"}
          </button>
        )}
        <button
          onClick={handleGeneratePreview}
          disabled={!mappedLandmarks || loading || selectedFeatures.length === 0}
          className="bg-amber-600 hover:bg-amber-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium py-3 px-8 rounded-md transition text-sm shadow-md"
        >
          {loading ? "Simulating Procedure..." : `Run (${selectedFeatures.length} Procedures) Simulation`}
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* 50/50 Split View Grid Layout with Fullscreen Expanders */}
      {croppedImageSrc && (
        <div className="w-full max-w-7xl mx-auto mt-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium text-amber-200">
              {resultImage ? "Multi-Procedure Before & After Comparison:" : "Baseline Preview:"}
            </span>
            {resultImage && (
              <button
                onClick={handleExportPDF}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1.5 transition"
              >
                📄 Export Patient Summary (PDF)
              </button>
            )}
          </div>

          {showMask && (
            <div className="mb-3 p-3 bg-amber-950/40 border border-amber-600/40 rounded-lg text-amber-100 text-xs">
              <strong>Mask view:</strong> white areas are what the AI is allowed to change; black
              areas are locked to the original photo. Solid white over the target region means the
              mask is working. Faint grey means the change will be weak.
            </div>
          )}

          <div className={`grid gap-4 ${viewMode === "split" ? "grid-cols-2" : "grid-cols-1"}`}>
            
            {/* BEFORE COLUMN */}
            {(viewMode === "split" || viewMode === "before") && (
              <div className="relative rounded-lg overflow-hidden bg-black group flex items-center justify-center min-h-[450px] border border-gray-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={showMask && maskDataUrl ? maskDataUrl : croppedImageSrc}
                  alt={showMask ? "Mask" : "Before"}
                  className="w-full h-auto max-h-[85vh] object-contain"
                />
                <span className="absolute bottom-3 left-3 bg-black/80 text-white text-xs px-3 py-1.5 rounded font-mono shadow-md">
                  {showMask ? "MASK" : "BEFORE"}
                </span>
                <button
                  onClick={() => setViewMode(viewMode === "split" ? "before" : "split")}
                  className="absolute top-3 right-3 bg-gray-900/80 hover:bg-amber-500 hover:text-black text-gray-300 text-xs font-semibold px-3 py-1.5 rounded transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                >
                  {viewMode === "split" ? "⤢ Fullscreen" : "⤡ Split View"}
                </button>
              </div>
            )}

            {/* AFTER COLUMN */}
            {(viewMode === "split" || viewMode === "after") && (
              <div className="relative rounded-lg overflow-hidden bg-gray-950 flex flex-col items-center justify-center min-h-[450px] group border border-gray-800">
                {resultImage ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resultImage} alt="After" className="w-full h-auto max-h-[85vh] object-contain" />
                    <span className="absolute bottom-3 right-3 bg-amber-500 text-black text-xs px-3 py-1.5 rounded font-bold font-mono shadow-md">
                      AFTER ({selectedFeatures.join(" + ").toUpperCase()})
                    </span>
                    <button
                      onClick={() => setViewMode(viewMode === "split" ? "after" : "split")}
                      className="absolute top-3 right-3 bg-gray-900/80 hover:bg-amber-500 hover:text-black text-gray-300 text-xs font-semibold px-3 py-1.5 rounded transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                    >
                      {viewMode === "split" ? "⤢ Fullscreen" : "⤡ Split View"}
                    </button>
                  </>
                ) : (
                  <div className="text-gray-500 text-sm font-mono text-center px-6">
                    {loading ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-amber-500">Rendering AI Simulation...</span>
                      </div>
                    ) : (
                      "Select procedures and click 'Run Simulation' to generate clinical results."
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center pt-6 border-t border-gray-900 text-xs text-gray-500">
        <p>
          <strong>Medical Disclaimer:</strong> This tool utilizes generative artificial intelligence for educational and patient consultation purposes only. It does not guarantee surgical or clinical outcomes. Treatment planning requires an in-person clinical consultation with a licensed physician.
        </p>
      </footer>
    </div>
  );
}
