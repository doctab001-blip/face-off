"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { fal } from "@fal-ai/client";

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

// Mask expansion and padding are anatomy-relative: 22% of the inter-alar (nostril base) width.
const NOSE_EXPANSION_RATIO = 0.22;
// Widen the nasal mask 15% horizontally about X_mid so the dorsum and both sidewalls are
// covered uniformly, rather than pinching to a narrow vertical band down the bridge.
const NOSE_HORIZONTAL_EXPANSION = 1.15;
// Gaussian radius for the nasal region; large enough that the seam dissolves into skin.
const NOSE_BLUR_PX = 20;
const NOSE_ALAR_LEFT = 129;
const NOSE_ALAR_RIGHT = 358;

// Midline anchors: inner eye corners (primary), then nasal bridge root, then nasal tip.
const EYE_INNER_LEFT = 133;
const EYE_INNER_RIGHT = 362;
const NOSE_BRIDGE_ROOT = 168;
const NOSE_TIP = 1;

type Point = { x: number; y: number };

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

// Scale horizontal offsets about X_mid. Applied to an already-symmetric polygon this widens
// both sides by the same amount, so the midline anchor and bilateral symmetry are preserved.
function expandHorizontallyAboutMidline(pts: Point[], midlineX: number, factor: number): Point[] {
  return pts.map((pt) => ({ x: midlineX + (pt.x - midlineX) * factor, y: pt.y }));
}

const CHEEK_LANDMARKS = {
  left: [116, 123, 117, 118, 101, 50, 187, 207, 205, 227, 111, 36, 142, 100],
  right: [345, 352, 346, 347, 330, 280, 411, 427, 425, 447, 340, 266, 371, 329],
};

// Fixed Bug #2: Removed duplicate index 18
const CHIN_LANDMARKS = [152, 377, 400, 378, 379, 365, 397, 288, 361, 18, 83, 132, 58, 172, 136, 150, 149, 176, 148];

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

const JAWLINE_TECHNIQUES = {
  buccal_fat_removal: {
    name: "Buccal Fat Pad Removal",
    prompt_suffix: "reduced buccal fat pad volume, slimmer contoured lower cheek hollow beneath the cheekbone, refined natural facial taper, photorealistic, same person, same skin texture, same lighting",
    strength: 0.55,
  },
  jawline_slim: {
    name: "Jawline Slimming (V-Line)",
    prompt_suffix: "slender tapered jawline, reduced mandibular width, sharp refined jaw contour, elegant V-line lower face, photorealistic, same person, same skin texture, same lighting",
    strength: 0.55,
  },
  combined_contour: {
    name: "Combined Lower Face Contour",
    prompt_suffix: "reduced buccal fat pad volume with a slender tapered V-line jawline, refined natural facial taper, photorealistic, same person, same skin texture, same lighting",
    strength: 0.58,
  },
};

const NOSE_TECHNIQUES = {
  straight_slim: {
    name: "Straight & Slim Refinement",
    prompt_suffix: "flawless narrow straight nasal bridge, delicate supratip break, refined defined nasal tip cartilage, subtle alar narrowing, seamless skin texture, photorealistic, 8k resolution",
    strength: 0.55,
  },
  dorsal_hump: {
    name: "Dorsal Hump Reduction",
    prompt_suffix: "perfectly straight smooth nasal profile, complete dorsal hump reduction, refined bridge, photorealistic",
    strength: 0.52,
  },
  tip_plasty: {
    name: "Nasal Tip Refinement",
    prompt_suffix: "delicate narrow tip cartilage, elevated nasal tip angle, subtle supratip break, photorealistic",
    strength: 0.50,
  },
  alar_reduction: {
    name: "Alar Base Narrowing",
    prompt_suffix: "narrowed alar base, reduced nostril flare, tight delicate nasal base, photorealistic",
    strength: 0.42,
  },
  liquid_rhino: {
    name: "Liquid Non-Surgical Rhinoplasty",
    prompt_suffix: "non-surgical dermal filler alignment, disguised nasal bump, straight bridge profile, photorealistic",
    strength: 0.40,
  },
};

const CHEEK_TECHNIQUES = {
  malar_volume: {
    name: "Zygomatic Arch Projection",
    prompt_suffix: "defined dermal filler projection over the zygomatic process and arch prominence, elevated high cheekbone apex, smooth transition to infraorbital rim, photorealistic",
  },
  apple_volume: {
    name: "Anterior Zygomatic Body Fill",
    prompt_suffix: "youthful dermal filler volume concentrated over anterior zygomatic body prominence, natural midface projection, seamless skin texture, photorealistic",
  },
  contour_sculpt: {
    name: "High Zygomatic Arch Sculpting",
    prompt_suffix: "chiseled lateral zygomatic arch highlight, elevated cheekbone structure, elegant midface contour, photorealistic",
  },
};

// Volumetric cheek parameter matrix: dosage → inference strength, Gaussian blur radius, dilation.
const CHEEK_DOSAGE_MAP: Record<
  string,
  { strength: number; blurRadius: number; dilationPx: number; promptLabel: string }
> = {
  "0.50ml": { strength: 0.35, blurRadius: 12, dilationPx: 8, promptLabel: "subtle 0.5ml filler highlight over zygomatic prominence" },
  "1.00ml": { strength: 0.45, blurRadius: 16, dilationPx: 12, promptLabel: "moderate 1.0ml dermal filler augmentation centered on zygomatic process and arch" },
  "1.50ml": { strength: 0.55, blurRadius: 20, dilationPx: 16, promptLabel: "pronounced 1.5ml volumetric cheek projection across entire zygomatic structure" },
};

const CHIN_TECHNIQUES = {
  anterior_projection: {
    name: "Anterior Projection (Mentoplasty)",
    prompt_suffix: "strong forward chin projection, prominent pogonion, well-defined chin tip, balanced facial profile line, photorealistic",
    strength: 0.65,
    blurPx: 14,
  },
  chin_lengthening: {
    name: "Vertical Chin Elongation",
    prompt_suffix: "elongated lower facial third, vertically extended chin length, defined lower mentum border, sleek proportion, photorealistic",
    strength: 0.62,
    blurPx: 14,
  },
  v_shape_slimming: {
    name: "V-Line Slimming / T-Osteotomy",
    prompt_suffix: "slim V-line chin tip, narrowed mental apex, delicate tapered lower jawline, sleek chin contour, photorealistic",
    strength: 0.65,
    blurPx: 14,
  },
  square_jaw_chin: {
    name: "Broad Square Chin",
    prompt_suffix: "broad masculine square chin, strong angular mental width, wide chiseled chin border, photorealistic",
    strength: 0.65,
    blurPx: 14,
  },
  cleft_smoothing: {
    name: "Chin Dimple / Cleft Smoothing",
    prompt_suffix: "smooth polished chin skin, completely filled chin dimple cleft, relaxed mentalis muscle, seamless chin contour, photorealistic",
    strength: 0.58,
    blurPx: 12,
  },
};

const BROW_TECHNIQUES = {
  ombre_powder: {
    name: "Ombré Powder Brows",
    prompt_suffix: "ombre powder brows, razor-sharp clean lower border, crisp top outline, freshly waxed smooth skin, zero stray hairs outside border, dermaplaned skin, permanent makeup pixel shading, flawless symmetrical shape, photorealistic",
  },
  microblading: {
    name: "Microblading",
    prompt_suffix: "microblading eyebrows, ultra-sharp razor-crisp outer outline border, crisp individual 3D hair strokes inside clean stencil, pristine waxed skin perimeter, no stray hairs, photorealistic",
  },
  hybrid_tint: {
    name: "Hybrid Brow Tint",
    prompt_suffix: "hybrid brow tinting, razor-sharp waxed outline edge, deep skin stain underneath, crisp defined arch tail, smooth hairless surrounding skin, high contrast, photorealistic",
  },
};

const LIP_TECHNIQUES = {
  russian: {
    name: "Russian Lip Technique",
    prompt_suffix: "Russian lip filler technique, vertical micro-threads, flat profile, heightened cupid's bow, plump volume, clean teeth, natural mouth opening, photorealistic",
  },
  classic_lip: {
    name: "Classic Lip Linear",
    prompt_suffix: "Classic lip filler, anterior 3D projection, horizontal volume enhancement, plump natural pout, clean teeth, photorealistic",
  },
};

type FeatureType = "chin" | "cheeks" | "nose" | "brows" | "upper_lip" | "lower_lip" | "jawline";

const DOSAGE_MAP: Record<string, { strength: number; dilationPx: number }> = {
  "0.25ml": { strength: 0.42, dilationPx: 6 },
  "0.50ml": { strength: 0.52, dilationPx: 10 },
  "0.75ml": { strength: 0.62, dilationPx: 14 },
  "1.00ml": { strength: 0.72, dilationPx: 18 },
  "tint_soft": { strength: 0.58, dilationPx: 10 },
  "tint_medium": { strength: 0.68, dilationPx: 16 },
  "tint_bold": { strength: 0.78, dilationPx: 22 },
};

const BROW_THICKNESS_MAP: Record<string, { stroke: number; padding: number }> = {
  thin: { stroke: 2, padding: 12 },
  medium: { stroke: 6, padding: 18 },
  thick: { stroke: 12, padding: 24 },
};

export default function VisualizerApp() {
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

  // Layout and view modes
  const [viewMode, setViewMode] = useState<"split" | "before" | "after">("split");

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

    const mapped = pixelLms.map((pt) => ({
      x: pt.x - cropX,
      y: pt.y - cropY,
    }));

    setMappedLandmarks(mapped);

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext("2d");
    if (cropCtx) {
      cropCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      setCroppedImageSrc(cropCanvas.toDataURL("image/png"));
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

  // MASK COMPOSITING EFFECT — solid filled volumes with soft Gaussian falloff (no hard strokes).
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

      const fillLandmarkPoly = (
        ctx: CanvasRenderingContext2D,
        indices: number[],
        inflatePx = 0
      ) => {
        fillPolygonPoints(ctx, getLandmarkPoints(indices, mappedLandmarks), inflatePx);
      };

      // Linear alpha ramp: 1.0 at the core landmark locus → 0.0 at the outer boundary radius.
      // Canvas interpolates radial stops linearly, so this is an exact linear falloff with no seam.
      const fillRadialVolume = (
        ctx: CanvasRenderingContext2D,
        indices: number[],
        expansionPx: number
      ) => {
        const pts = getLandmarkPoints(indices, mappedLandmarks);
        if (pts.length < 3) return;

        const { centroid, maxRadius } = getLandmarkMetrics(pts);
        const outerRadius = maxRadius + expansionPx;
        if (outerRadius <= 0) return;

        const gradient = ctx.createRadialGradient(
          centroid.x,
          centroid.y,
          0,
          centroid.x,
          centroid.y,
          outerRadius
        );
        // alpha(r) = 1 - r / outerRadius
        for (let step = 0; step <= 8; step++) {
          const t = step / 8;
          gradient.addColorStop(t, `rgba(255,255,255,${(1 - t).toFixed(4)})`);
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centroid.x, centroid.y, outerRadius, 0, Math.PI * 2);
        ctx.fill();
      };

      // Fills a thin strip along an open landmark path (e.g. the jaw edge),
      // rather than the whole interior a closed fill would cover. Offsets
      // each point outward along its local path normal (finite-difference
      // tangent, sign resolved away from an interior reference point) to
      // build a ribbon polygon. Verified against canonical_face_model.obj
      // to stay a simple (non-self-crossing) polygon at this offset scale.
      const fillRibbonAlongPath = (
        ctx: CanvasRenderingContext2D,
        indices: number[],
        stripWidthPx: number,
        interiorRef: { x: number; y: number },
      ) => {
        const pts = indices
          .map((idx) => mappedLandmarks[idx])
          .filter((pt): pt is { x: number; y: number } => Boolean(pt));
        if (pts.length < 3) return;

        const n = pts.length;
        const outer = pts.map((p, i) => {
          const prev = pts[(i - 1 + n) % n];
          const next = pts[(i + 1) % n];
          const tx = next.x - prev.x;
          const ty = next.y - prev.y;
          let nx = -ty;
          let ny = tx;
          const len = Math.hypot(nx, ny) || 1;
          nx /= len;
          ny /= len;
          const toP = { x: p.x - interiorRef.x, y: p.y - interiorRef.y };
          if (nx * toP.x + ny * toP.y < 0) {
            nx = -nx;
            ny = -ny;
          }
          return { x: p.x + nx * stripWidthPx, y: p.y + ny * stripWidthPx };
        });

        const ribbon = [...pts, ...outer.slice().reverse()];
        ctx.beginPath();
        ribbon.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.fillStyle = "white";
        ctx.fill();
      };

      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = img.width;
      layerCanvas.height = img.height;
      const layerCtx = layerCanvas.getContext("2d");

      selectedFeatures.forEach((feat) => {
        if (!layerCtx) return;
        layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
        layerCtx.save();

        if (feat === "brows") {
          const leftBrow = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
          const rightBrow = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
          const thicknessConfig = BROW_THICKNESS_MAP[browThickness] || BROW_THICKNESS_MAP.medium;
          const dilationPx = Math.max(4, thicknessConfig.padding * 0.45);
          // Gaussian falloff applied exclusively to the filled volumetric path.
          layerCtx.filter = `blur(${(dilationPx * 1.5).toFixed(2)}px)`;
          [leftBrow, rightBrow].forEach((browIndices) => {
            fillLandmarkPoly(layerCtx, browIndices, dilationPx);
          });
        } else if (feat === "chin") {
          const chinConfig = CHIN_TECHNIQUES[chinTechnique];
          layerCtx.filter = `blur(${chinConfig.blurPx}px)`;
          fillLandmarkPoly(layerCtx, CHIN_LANDMARKS, 8);
        } else if (feat === "cheeks") {
          // Explicit dosage matrix drives blur radius and dilation; no coordinate translation.
          const dosageConfig = CHEEK_DOSAGE_MAP[cheekDosage] || CHEEK_DOSAGE_MAP["1.00ml"];
          layerCtx.filter = `blur(${dosageConfig.blurRadius}px)`;
          [CHEEK_LANDMARKS.left, CHEEK_LANDMARKS.right].forEach((cheekIndicesRaw) => {
            const cheekIndices = angleSortIndices(cheekIndicesRaw, mappedLandmarks);
            fillRadialVolume(layerCtx, cheekIndices, dosageConfig.dilationPx);
          });
        } else if (feat === "nose") {
          const noseIndices = angleSortIndices(NOSE_LANDMARKS, mappedLandmarks);
          const rawNosePts = getLandmarkPoints(noseIndices, mappedLandmarks);
          const midlineX = computeFacialMidlineX(mappedLandmarks);
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
          // Dilation and Gaussian padding are both 22% of measured inter-alar width, so the
          // dorsal hump and tip are fully covered without spilling into adjacent zones.
          const nosePaddingPx = alarWidth * NOSE_EXPANSION_RATIO;
          layerCtx.filter = `blur(${Math.max(NOSE_BLUR_PX, nosePaddingPx).toFixed(2)}px)`;
          fillPolygonPoints(layerCtx, nosePts, nosePaddingPx);
        } else if (feat === "jawline") {
          // Same alar-width anatomy scale as the nose region above, so buccal/jaw
          // padding and blur stay proportional to this patient's face size.
          const leftAlar = mappedLandmarks[NOSE_ALAR_LEFT];
          const rightAlar = mappedLandmarks[NOSE_ALAR_RIGHT];
          const alarWidth = leftAlar && rightAlar ? Math.abs(rightAlar.x - leftAlar.x) : img.width * 0.18;
          const jawPaddingPx = alarWidth * NOSE_EXPANSION_RATIO;
          layerCtx.filter = `blur(${jawPaddingPx.toFixed(2)}px)`;
          [BUCCAL_LANDMARKS.left, BUCCAL_LANDMARKS.right].forEach((buccalIndicesRaw) => {
            const buccalIndices = angleSortIndices(buccalIndicesRaw, mappedLandmarks);
            fillLandmarkPoly(layerCtx, buccalIndices, jawPaddingPx * 0.6);
          });
          const jawInteriorRef = mappedLandmarks[2] || { x: 0, y: 0 };
          fillRibbonAlongPath(layerCtx, JAWLINE_LANDMARKS, jawPaddingPx, jawInteriorRef);
        } else {
          const indices = FEATURE_INDICES[feat];
          if (indices && indices.length > 0) {
            const dosageConfig = DOSAGE_MAP[lipDosage] || DOSAGE_MAP["0.50ml"];
            const dilationPx = feat.includes("lip") ? Math.max(4, dosageConfig.dilationPx * 0.5) : 6;
            layerCtx.filter = `blur(${(dilationPx * 1.5).toFixed(2)}px)`;
            // Solid outer lip/feature volume only — no inner oral cutouts or stroke outlines.
            fillLandmarkPoly(layerCtx, indices, dilationPx);
          }
        }

        layerCtx.restore();
        mainCtx.drawImage(layerCanvas, 0, 0);
      });
      setMaskDataUrl(mainCanvas.toDataURL("image/png"));
    };
  }, [mappedLandmarks, selectedFeatures, browThickness, lipDosage, noseTechnique, cheekTechnique, cheekDosage, chinTechnique, jawlineTechnique, croppedImageSrc]);

  // Soft-composite AI over original using the same mask sent to fal (pixel-aligned).
  const applyEdgeFeathering = useCallback((originalSrc: string, aiResultUrl: string, maskUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const origImg = new Image();
      const aiImg = new Image();
      const maskImg = new Image();
      let loadedCount = 0;

      const checkLoaded = () => {
        loadedCount++;
        if (loadedCount < 3) return;

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
        softCtx.filter = "blur(12px)";
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

  const handleGeneratePreview = async () => {
    if (!croppedImageSrc || !maskDataUrl) {
      const msg = !croppedImageSrc
        ? "Please upload a portrait before running the simulation."
        : "Mask is still preparing — please wait a moment and try again.";
      console.error("handleGeneratePreview early exit:", {
        reason: msg,
        hasCroppedImage: Boolean(croppedImageSrc),
        hasMask: Boolean(maskDataUrl),
      });
      setErrorMessage(msg);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const promptParts: string[] = ["Clinical aesthetic portrait transformation:"];
      let maxStrength = 0.52;

      if (selectedFeatures.includes("chin")) {
        const chinConfig = CHIN_TECHNIQUES[chinTechnique];
        promptParts.push(chinConfig.prompt_suffix);
        maxStrength = Math.max(maxStrength, chinConfig.strength);
      }
      if (selectedFeatures.includes("cheeks")) {
        const cheekConfig = CHEEK_TECHNIQUES[cheekTechnique];
        const cheekDosageConfig = CHEEK_DOSAGE_MAP[cheekDosage] || CHEEK_DOSAGE_MAP["1.00ml"];
        promptParts.push(`${cheekConfig.prompt_suffix}, ${cheekDosageConfig.promptLabel}`);
        maxStrength = Math.max(maxStrength, cheekDosageConfig.strength);
      }
      if (selectedFeatures.includes("brows")) {
        promptParts.push(`${browThickness} thickness ${BROW_TECHNIQUES[browTechnique].prompt_suffix}`);
        maxStrength = Math.max(maxStrength, DOSAGE_MAP[browDensity]?.strength || 0.62);
      }
      if (selectedFeatures.includes("upper_lip") || selectedFeatures.includes("lower_lip")) {
        promptParts.push(LIP_TECHNIQUES[lipTechnique].prompt_suffix);
        maxStrength = Math.max(maxStrength, DOSAGE_MAP[lipDosage]?.strength || 0.5);
      }
      if (selectedFeatures.includes("nose")) {
        const noseConfig = NOSE_TECHNIQUES[noseTechnique];
        promptParts.push(noseConfig.prompt_suffix);
        promptParts.push(
          "reshape the full nasal unit including bridge, dorsum, sidewalls, and tip with smooth continuous contours"
        );
        maxStrength = Math.max(maxStrength, noseConfig.strength);
      }
      if (selectedFeatures.includes("jawline")) {
        const jawlineConfig = JAWLINE_TECHNIQUES[jawlineTechnique];
        promptParts.push(jawlineConfig.prompt_suffix);
        maxStrength = Math.max(maxStrength, jawlineConfig.strength);
      }

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
      if (selectedFeatures.includes("upper_lip") || selectedFeatures.includes("lower_lip")) {
        activeNegatives.push("harsh lines around mouth");
      }
      if (selectedFeatures.includes("jawline")) {
        activeNegatives.push(
          "asymmetric jaw contour",
          "over-hollowed cheeks",
          "gaunt sunken appearance",
          "unnatural jaw taper",
          "visible masseter bulge"
        );
      }
      const scopedNegativePrompt = activeNegatives.join(", ");

      // Use the unwarped crop so image_url and mask_url share identical pixel coordinates.
      const result = await fal.subscribe("fal-ai/flux-pro/v1/fill", {
        input: {
          prompt: compositePrompt,
          negative_prompt: scopedNegativePrompt,
          image_url: croppedImageSrc,
          mask_url: maskDataUrl,
          strength: maxStrength,
          enable_safety_checker: true,
        } as never,
      });
      
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
      setErrorMessage(USER_SIMULATION_ERROR);
    } finally {
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
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {[
              { id: "chin" as const, label: "Chin" },
              { id: "cheeks" as const, label: "Cheeks" },
              { id: "nose" as const, label: "Rhinoplasty" },
              { id: "jawline" as const, label: "Jawline / Buccal" },
              { id: "brows" as const, label: "Eyebrows" },
              { id: "upper_lip" as const, label: "Upper Lip" },
              { id: "lower_lip" as const, label: "Lower Lip" },
            ].map((f) => {
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
                {Object.entries(CHIN_TECHNIQUES).map(([key, item]) => (
                  <option key={key} value={key}>{item.name}</option>
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
                {Object.entries(JAWLINE_TECHNIQUES).map(([key, item]) => (
                  <option key={key} value={key}>{item.name}</option>
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
                  {Object.entries(CHEEK_TECHNIQUES).map(([key, item]) => (
                    <option key={key} value={key}>{item.name}</option>
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
                {Object.entries(NOSE_TECHNIQUES).map(([key, item]) => (
                  <option key={key} value={key}>{item.name}</option>
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
                  <option value="ombre_powder">Ombré Powder</option>
                  <option value="microblading">Microblading</option>
                  <option value="hybrid_tint">Hybrid Tint</option>
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
                  <option value="russian">Russian Lift</option>
                  <option value="classic_lip">Classic 3D</option>
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
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleGeneratePreview}
          disabled={!mappedLandmarks || loading}
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

          <div className={`grid gap-4 ${viewMode === "split" ? "grid-cols-2" : "grid-cols-1"}`}>
            
            {/* BEFORE COLUMN */}
            {(viewMode === "split" || viewMode === "before") && (
              <div className="relative rounded-lg overflow-hidden bg-black group flex items-center justify-center min-h-[450px] border border-gray-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={croppedImageSrc} alt="Before" className="w-full h-auto max-h-[85vh] object-contain" />
                <span className="absolute bottom-3 left-3 bg-black/80 text-white text-xs px-3 py-1.5 rounded font-mono shadow-md">BEFORE</span>
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
