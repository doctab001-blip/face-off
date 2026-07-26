"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { fal } from "@fal-ai/client";

fal.config({ proxyUrl: "/api/fal/proxy" });

const LIPS_INNER_INDICES = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];

const FEATURE_INDICES: Record<string, number[]> = {
  upper_lip: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78],
  lower_lip: [61, 78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  brows: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
};

const NOSE_LANDMARKS = [1, 2, 98, 327, 168, 197, 195, 5, 4, 275, 45, 220, 440, 6, 129, 358, 209, 429];

// NOSE_LANDMARKS isn't listed in perimeter order (it zigzags across the
// midline), so connecting the raw indices with lineTo self-intersects into a
// bowtie shape. Re-derive a simple (non-crossing) polygon by sorting the
// mapped points by angle around their centroid before drawing.
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

const CHEEK_LANDMARKS = {
  left: [116, 123, 117, 118, 101, 50, 187, 207, 205, 227, 111, 36, 142, 100],
  right: [345, 352, 346, 347, 330, 280, 411, 427, 425, 447, 340, 266, 371, 329],
};

// Fixed Bug #2: Removed duplicate index 18
const CHIN_LANDMARKS = [152, 377, 400, 378, 379, 365, 397, 288, 361, 18, 83, 132, 58, 172, 136, 150, 149, 176, 148];

const NOSE_TECHNIQUES = {
  straight_slim: {
    name: "Straight & Slim Refinement",
    prompt_suffix: "flawless narrow straight nasal bridge, delicate supratip break, refined defined nasal tip cartilage, subtle alar narrowing, seamless skin texture, photorealistic, 8k resolution",
    strength: 0.52,
    pinchRadiusRatio: 0.32,
    pinchAmount: 0.28,
  },
  dorsal_hump: {
    name: "Dorsal Hump Reduction",
    prompt_suffix: "perfectly straight smooth nasal profile, complete dorsal hump reduction, refined bridge, photorealistic",
    strength: 0.48,
    pinchRadiusRatio: 0.25,
    pinchAmount: 0.20,
  },
  tip_plasty: {
    name: "Nasal Tip Refinement",
    prompt_suffix: "delicate narrow tip cartilage, elevated nasal tip angle, subtle supratip break, photorealistic",
    strength: 0.45,
    pinchRadiusRatio: 0.22,
    pinchAmount: 0.22,
  },
  alar_reduction: {
    name: "Alar Base Narrowing",
    prompt_suffix: "narrowed alar base, reduced nostril flare, tight delicate nasal base, photorealistic",
    strength: 0.42,
    pinchRadiusRatio: 0.20,
    pinchAmount: 0.20,
  },
  liquid_rhino: {
    name: "Liquid Non-Surgical Rhinoplasty",
    prompt_suffix: "non-surgical dermal filler alignment, disguised nasal bump, straight bridge profile, photorealistic",
    strength: 0.40,
    pinchRadiusRatio: 0.18,
    pinchAmount: 0.12,
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

const CHEEK_DOSAGE_MAP: Record<string, { strength: number; dilationPx: number; promptLabel: string }> = {
  "0.50ml": { strength: 0.32, dilationPx: 8, promptLabel: "subtle 0.5ml filler highlight over zygomatic prominence" },
  "1.00ml": { strength: 0.40, dilationPx: 14, promptLabel: "moderate 1.0ml dermal filler augmentation centered on zygomatic process and arch" },
  "1.50ml": { strength: 0.48, dilationPx: 20, promptLabel: "pronounced 1.5ml volumetric cheek projection across entire zygomatic structure" },
};

const CHIN_TECHNIQUES = {
  anterior_projection: {
    name: "Anterior Projection (Mentoplasty)",
    prompt_suffix: "strong forward chin projection, prominent pogonion, well-defined chin tip, balanced facial profile line, photorealistic",
    strength: 0.55,
    blurPx: 12,
  },
  chin_lengthening: {
    name: "Vertical Chin Elongation",
    prompt_suffix: "elongated lower facial third, vertically extended chin length, defined lower mentum border, sleek proportion, photorealistic",
    strength: 0.52,
    blurPx: 12,
  },
  v_shape_slimming: {
    name: "V-Line Slimming / T-Osteotomy",
    prompt_suffix: "slim V-line chin tip, narrowed mental apex, delicate tapered lower jawline, sleek chin contour, photorealistic",
    strength: 0.55,
    blurPx: 12,
  },
  square_jaw_chin: {
    name: "Broad Square Chin",
    prompt_suffix: "broad masculine square chin, strong angular mental width, wide chiseled chin border, photorealistic",
    strength: 0.55,
    blurPx: 12,
  },
  cleft_smoothing: {
    name: "Chin Dimple / Cleft Smoothing",
    prompt_suffix: "smooth polished chin skin, completely filled chin dimple cleft, relaxed mentalis muscle, seamless chin contour, photorealistic",
    strength: 0.50,
    blurPx: 10,
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

type FeatureType = "chin" | "cheeks" | "nose" | "brows" | "upper_lip" | "lower_lip";

const DOSAGE_MAP: Record<string, { strength: number; dilationPx: number }> = {
  "0.25ml": { strength: 0.35, dilationPx: 4 },
  "0.50ml": { strength: 0.45, dilationPx: 8 },
  "0.75ml": { strength: 0.55, dilationPx: 12 },
  "1.00ml": { strength: 0.65, dilationPx: 16 },
  "tint_soft": { strength: 0.52, dilationPx: 8 },
  "tint_medium": { strength: 0.62, dilationPx: 14 },
  "tint_bold": { strength: 0.72, dilationPx: 20 },
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

  // MASK COMPOSITING EFFECT
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

      const upperLipCenter = mappedLandmarks[13];
      const lowerLipCenter = mappedLandmarks[14];
      const mouthGap = upperLipCenter && lowerLipCenter ? Math.hypot(lowerLipCenter.x - upperLipCenter.x, lowerLipCenter.y - upperLipCenter.y) : 0;

      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = img.width;
      layerCanvas.height = img.height;
      const layerCtx = layerCanvas.getContext("2d");

      selectedFeatures.forEach((feat) => {
        if (!layerCtx) return;
        layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
        layerCtx.save();

        if (feat === "brows") {
          layerCtx.filter = "none";
          const leftBrow = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
          const rightBrow = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
          const thicknessConfig = BROW_THICKNESS_MAP[browThickness] || BROW_THICKNESS_MAP["medium"];
          [leftBrow, rightBrow].forEach((browIndices) => {
            layerCtx.beginPath();
            const startPt = mappedLandmarks[browIndices[0]];
            if (!startPt) return;
            layerCtx.moveTo(startPt.x, startPt.y);
            for (let i = 1; i < browIndices.length; i++) {
              const pt = mappedLandmarks[browIndices[i]];
              if (pt) layerCtx.lineTo(pt.x, pt.y);
            }
            layerCtx.closePath();
            layerCtx.fillStyle = "white";
            layerCtx.fill();
            layerCtx.lineWidth = thicknessConfig.stroke + thicknessConfig.padding;
            layerCtx.strokeStyle = "white";
            layerCtx.lineJoin = "miter";
            layerCtx.stroke();
          });
        } else if (feat === "chin") {
          const config = CHIN_TECHNIQUES[chinTechnique];
          layerCtx.filter = `blur(${config.blurPx}px)`;
          layerCtx.beginPath();
          const startPt = mappedLandmarks[CHIN_LANDMARKS[0]];
          if (startPt) {
            layerCtx.moveTo(startPt.x, startPt.y);
            for (let i = 1; i < CHIN_LANDMARKS.length; i++) {
              const pt = mappedLandmarks[CHIN_LANDMARKS[i]];
              if (pt) layerCtx.lineTo(pt.x, pt.y);
            }
            layerCtx.closePath();
            layerCtx.fillStyle = "white";
            layerCtx.fill();
            layerCtx.lineWidth = 14;
            layerCtx.strokeStyle = "white";
            layerCtx.lineJoin = "round";
            layerCtx.stroke();
          }
        } else if (feat === "cheeks") {
          const dosageConfig = CHEEK_DOSAGE_MAP[cheekDosage] || CHEEK_DOSAGE_MAP["1.00ml"];
          layerCtx.filter = "blur(8px)";
          const shiftY = -8;
          [CHEEK_LANDMARKS.left, CHEEK_LANDMARKS.right].forEach((cheekIndices) => {
            layerCtx.beginPath();
            const startPt = mappedLandmarks[cheekIndices[0]];
            if (!startPt) return;
            layerCtx.moveTo(startPt.x, startPt.y + shiftY);
            for (let i = 1; i < cheekIndices.length; i++) {
              const pt = mappedLandmarks[cheekIndices[i]];
              if (pt) layerCtx.lineTo(pt.x, pt.y + shiftY);
            }
            layerCtx.closePath();
            layerCtx.fillStyle = "white";
            layerCtx.fill();
            layerCtx.lineWidth = dosageConfig.dilationPx;
            layerCtx.strokeStyle = "white";
            layerCtx.lineJoin = "round";
            layerCtx.stroke();
          });
        } else if (feat === "nose") {
          layerCtx.filter = "blur(8px)";
          const noseIndices = angleSortIndices(NOSE_LANDMARKS, mappedLandmarks);
          if (noseIndices.length > 0) {
            layerCtx.beginPath();
            const startPt = mappedLandmarks[noseIndices[0]];
            if (startPt) {
              layerCtx.moveTo(startPt.x, startPt.y);
              for (let i = 1; i < noseIndices.length; i++) {
                const pt = mappedLandmarks[noseIndices[i]];
                if (pt) layerCtx.lineTo(pt.x, pt.y);
              }
              layerCtx.closePath();
              layerCtx.fillStyle = "white";
              layerCtx.fill();
              layerCtx.lineWidth = 10;
              layerCtx.strokeStyle = "white";
              layerCtx.lineJoin = "round";
              layerCtx.stroke();
            }
          }
        } else {
          layerCtx.filter = "blur(8px)";
          const indices = FEATURE_INDICES[feat];
          if (indices && indices.length > 0) {
            layerCtx.beginPath();
            const startPt = mappedLandmarks[indices[0]];
            if (startPt) {
              layerCtx.moveTo(startPt.x, startPt.y);
              for (let i = 1; i < indices.length; i++) {
                const pt = mappedLandmarks[indices[i]];
                if (pt) layerCtx.lineTo(pt.x, pt.y);
              }
              layerCtx.closePath();
              if (feat.includes("lip") && mouthGap > 6) {
                const innerStart = mappedLandmarks[LIPS_INNER_INDICES[0]];
                if (innerStart) {
                  layerCtx.moveTo(innerStart.x, innerStart.y);
                  for (let j = 1; j < LIPS_INNER_INDICES.length; j++) {
                    const innerPt = mappedLandmarks[LIPS_INNER_INDICES[j]];
                    if (innerPt) layerCtx.lineTo(innerPt.x, innerPt.y);
                  }
                  layerCtx.closePath();
                }
              }
              layerCtx.fillStyle = "white";
              layerCtx.fill(feat.includes("lip") && mouthGap > 6 ? "evenodd" : "nonzero");
              if (feat.includes("lip")) {
                const dosageConfig = DOSAGE_MAP[lipDosage] || DOSAGE_MAP["0.50ml"];
                layerCtx.lineWidth = dosageConfig.dilationPx;
                layerCtx.strokeStyle = "white";
                layerCtx.lineJoin = "round";
                layerCtx.stroke();
              }
            }
          }
        }
        layerCtx.restore();
        mainCtx.drawImage(layerCanvas, 0, 0);
      });
      setMaskDataUrl(mainCanvas.toDataURL("image/png"));
    };
  }, [mappedLandmarks, selectedFeatures, browThickness, lipDosage, noseTechnique, cheekTechnique, cheekDosage, chinTechnique, croppedImageSrc]);

  // Fixed Bug #1: Made generateWarpedImage async with explicit img.decode() promise
  const generateWarpedImage = async (radiusRatio: number, amount: number): Promise<string | null> => {
    if (!croppedImageSrc || !mappedLandmarks) return null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = croppedImageSrc;
    await img.decode();

    const warpCanvas = document.createElement("canvas");
    const width = img.width;
    const height = img.height;
    warpCanvas.width = width;
    warpCanvas.height = height;
    const wCtx = warpCanvas.getContext("2d");
    if (!wCtx) return croppedImageSrc;
    wCtx.drawImage(img, 0, 0);
    const srcData = wCtx.getImageData(0, 0, width, height);
    const dstData = wCtx.createImageData(width, height);
    const noseTip = mappedLandmarks[1];
    const noseBridgeTop = mappedLandmarks[168];
    if (!noseTip || !noseBridgeTop) return croppedImageSrc;
    const centerX = noseTip.x;
    const minY = Math.min(noseBridgeTop.y, noseTip.y) - 10;
    const maxY = Math.max(noseBridgeTop.y, noseTip.y) + 20;
    const leftAlar = mappedLandmarks[129] || mappedLandmarks[98];
    const rightAlar = mappedLandmarks[358] || mappedLandmarks[327];
    const noseWidth = leftAlar && rightAlar ? Math.abs(rightAlar.x - leftAlar.x) : width * 0.25;
    const radius = noseWidth * (1 + radiusRatio);
    const srcBytes = srcData.data;
    const dstBytes = dstData.data;
    dstBytes.set(srcBytes);
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      if (y < 0 || y >= height) continue;
      const deltaY = y - (minY + (maxY - minY) * 0.5);
      const verticalFactor = Math.cos((deltaY / (maxY - minY)) * Math.PI * 0.5);
      for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x++) {
        if (x < 0 || x >= width) continue;
        const deltaX = x - centerX;
        const dist = Math.abs(deltaX);
        if (dist < radius) {
          const normDist = dist / radius;
          const pinchFactor = Math.exp(-normDist * normDist * 3) * amount * verticalFactor;
          const srcX = Math.max(0, Math.min(width - 1, centerX + deltaX * (1 + pinchFactor)));
          const x0 = Math.floor(srcX);
          const x1 = Math.min(width - 1, x0 + 1);
          const weight1 = srcX - x0;
          const weight0 = 1 - weight1;
          const dstIdx = (y * width + x) * 4;
          const srcIdx0 = (y * width + x0) * 4;
          const srcIdx1 = (y * width + x1) * 4;
          for (let c = 0; c < 3; c++) {
            dstBytes[dstIdx + c] = srcBytes[srcIdx0 + c] * weight0 + srcBytes[srcIdx1 + c] * weight1;
          }
        }
      }
    }
    wCtx.putImageData(dstData, 0, 0);
    return warpCanvas.toDataURL("image/png");
  };

  const applyEdgeFeathering = useCallback(
    (originalSrc: string, aiResultUrl: string, _maskUrl: string): Promise<string> => {
      return new Promise((resolve) => {
        if (!mappedLandmarks) {
          resolve(aiResultUrl);
          return;
        }

        const landmarks = mappedLandmarks;
        const origImg = new Image();
        const aiImg = new Image();
        let loadedCount = 0;

        const drawLandmarkClipShapes = (target: CanvasRenderingContext2D) => {
          const upperLipCenter = landmarks[13];
          const lowerLipCenter = landmarks[14];
          const mouthGap =
            upperLipCenter && lowerLipCenter
              ? Math.hypot(lowerLipCenter.x - upperLipCenter.x, lowerLipCenter.y - upperLipCenter.y)
              : 0;

          const fillPoly = (indices: number[], shiftY = 0) => {
            const startPt = landmarks[indices[0]];
            if (!startPt) return;
            target.beginPath();
            target.moveTo(startPt.x, startPt.y + shiftY);
            for (let i = 1; i < indices.length; i++) {
              const pt = landmarks[indices[i]];
              if (pt) target.lineTo(pt.x, pt.y + shiftY);
            }
            target.closePath();
            target.fillStyle = "#ffffff";
            target.fill();
            target.strokeStyle = "#ffffff";
            target.lineJoin = "round";
            target.stroke();
          };

          selectedFeatures.forEach((feat) => {
            if (feat === "brows") {
              const leftBrow = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
              const rightBrow = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
              const thicknessConfig = BROW_THICKNESS_MAP[browThickness] || BROW_THICKNESS_MAP.medium;
              [leftBrow, rightBrow].forEach((browIndices) => {
                const startPt = landmarks[browIndices[0]];
                if (!startPt) return;
                target.beginPath();
                target.moveTo(startPt.x, startPt.y);
                for (let i = 1; i < browIndices.length; i++) {
                  const pt = landmarks[browIndices[i]];
                  if (pt) target.lineTo(pt.x, pt.y);
                }
                target.closePath();
                target.fillStyle = "#ffffff";
                target.fill();
                target.lineWidth = thicknessConfig.stroke + thicknessConfig.padding;
                target.strokeStyle = "#ffffff";
                target.lineJoin = "miter";
                target.stroke();
              });
            } else if (feat === "chin") {
              target.lineWidth = 14;
              fillPoly(CHIN_LANDMARKS);
            } else if (feat === "cheeks") {
              const dosageConfig = CHEEK_DOSAGE_MAP[cheekDosage] || CHEEK_DOSAGE_MAP["1.00ml"];
              target.lineWidth = dosageConfig.dilationPx;
              fillPoly(CHEEK_LANDMARKS.left, -8);
              fillPoly(CHEEK_LANDMARKS.right, -8);
            } else if (feat === "nose") {
              target.lineWidth = 12;
              fillPoly(angleSortIndices(NOSE_LANDMARKS, landmarks));
            } else {
              const indices = FEATURE_INDICES[feat];
              if (!indices?.length) return;
              const startPt = landmarks[indices[0]];
              if (!startPt) return;
              target.beginPath();
              target.moveTo(startPt.x, startPt.y);
              for (let i = 1; i < indices.length; i++) {
                const pt = landmarks[indices[i]];
                if (pt) target.lineTo(pt.x, pt.y);
              }
              target.closePath();
              if (feat.includes("lip") && mouthGap > 6) {
                const innerStart = landmarks[LIPS_INNER_INDICES[0]];
                if (innerStart) {
                  target.moveTo(innerStart.x, innerStart.y);
                  for (let j = 1; j < LIPS_INNER_INDICES.length; j++) {
                    const innerPt = landmarks[LIPS_INNER_INDICES[j]];
                    if (innerPt) target.lineTo(innerPt.x, innerPt.y);
                  }
                  target.closePath();
                }
              }
              target.fillStyle = "#ffffff";
              target.fill(feat.includes("lip") && mouthGap > 6 ? "evenodd" : "nonzero");
              if (feat.includes("lip")) {
                const dosageConfig = DOSAGE_MAP[lipDosage] || DOSAGE_MAP["0.50ml"];
                target.lineWidth = dosageConfig.dilationPx;
                target.strokeStyle = "#ffffff";
                target.lineJoin = "round";
                target.stroke();
              }
            }
          });
        };

        const buildClipPath = (): Path2D => {
          const path = new Path2D();
          const appendPoly = (indices: number[], shiftY = 0) => {
            const startPt = landmarks[indices[0]];
            if (!startPt) return;
            path.moveTo(startPt.x, startPt.y + shiftY);
            for (let i = 1; i < indices.length; i++) {
              const pt = landmarks[indices[i]];
              if (pt) path.lineTo(pt.x, pt.y + shiftY);
            }
            path.closePath();
          };

          selectedFeatures.forEach((feat) => {
            if (feat === "brows") {
              appendPoly([70, 63, 105, 66, 107, 55, 65, 52, 53, 46]);
              appendPoly([300, 293, 334, 296, 336, 285, 295, 282, 283, 276]);
            } else if (feat === "chin") {
              appendPoly(CHIN_LANDMARKS);
            } else if (feat === "cheeks") {
              appendPoly(CHEEK_LANDMARKS.left, -8);
              appendPoly(CHEEK_LANDMARKS.right, -8);
            } else if (feat === "nose") {
              appendPoly(angleSortIndices(NOSE_LANDMARKS, landmarks));
            } else {
              const indices = FEATURE_INDICES[feat];
              if (indices?.length) appendPoly(indices);
            }
          });

          return path;
        };

        const checkLoaded = () => {
          loadedCount++;
          if (loadedCount < 2) return;

          const width = origImg.width;
          const height = origImg.height;
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(aiResultUrl);

          // 1) Original portrait as the clinical base — never touched by mask RGB.
          ctx.drawImage(origImg, 0, 0, width, height);

          // 2) White-only clip matte via landmark Path2D + ctx.clip() (transparent outside; never black RGB).
          const clipPath = buildClipPath();
          const shapeCanvas = document.createElement("canvas");
          shapeCanvas.width = width;
          shapeCanvas.height = height;
          const shapeCtx = shapeCanvas.getContext("2d");
          if (!shapeCtx) return resolve(aiResultUrl);
          shapeCtx.save();
          shapeCtx.clip(clipPath);
          shapeCtx.fillStyle = "#ffffff";
          shapeCtx.fillRect(0, 0, width, height);
          shapeCtx.restore();
          // Extra stroke coverage for brows/lips (still white-only on transparent).
          drawLandmarkClipShapes(shapeCtx);

          const softPass1 = document.createElement("canvas");
          softPass1.width = width;
          softPass1.height = height;
          const soft1Ctx = softPass1.getContext("2d");
          if (!soft1Ctx) return resolve(aiResultUrl);
          soft1Ctx.filter = "blur(24px)";
          soft1Ctx.drawImage(shapeCanvas, 0, 0);

          const softClipMatte = document.createElement("canvas");
          softClipMatte.width = width;
          softClipMatte.height = height;
          const softCtx = softClipMatte.getContext("2d");
          if (!softCtx) return resolve(aiResultUrl);
          softCtx.filter = "blur(16px)";
          softCtx.drawImage(softPass1, 0, 0);

          // 3) AI inside soft clip matte (alpha only), then source-over the original base.
          const aiLayer = document.createElement("canvas");
          aiLayer.width = width;
          aiLayer.height = height;
          const aiCtx = aiLayer.getContext("2d");
          if (!aiCtx) return resolve(aiResultUrl);
          aiCtx.drawImage(aiImg, 0, 0, width, height);
          aiCtx.globalCompositeOperation = "destination-in";
          aiCtx.drawImage(softClipMatte, 0, 0);

          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.drawImage(aiLayer, 0, 0);
          ctx.restore();

          resolve(canvas.toDataURL("image/png"));
        };

        origImg.crossOrigin = "anonymous";
        aiImg.crossOrigin = "anonymous";
        origImg.onload = checkLoaded;
        aiImg.onload = checkLoaded;
        origImg.onerror = () => resolve(aiResultUrl);
        aiImg.onerror = () => resolve(aiResultUrl);
        origImg.src = originalSrc;
        aiImg.src = aiResultUrl;
      });
    },
    [mappedLandmarks, selectedFeatures, browThickness, cheekDosage, lipDosage]
  );

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
      let maxStrength = 0.45;
      let targetImage = croppedImageSrc;

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
        maxStrength = Math.max(maxStrength, noseConfig.strength);
        const warped = await generateWarpedImage(noseConfig.pinchRadiusRatio, noseConfig.pinchAmount);
        if (warped) targetImage = warped;
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
      const scopedNegativePrompt = activeNegatives.join(", ");

      const result = await fal.subscribe("fal-ai/flux-pro/v1/fill", {
        input: {
          prompt: compositePrompt,
          negative_prompt: scopedNegativePrompt,
          image_url: targetImage,
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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {[
              { id: "chin" as const, label: "Chin" },
              { id: "cheeks" as const, label: "Cheeks" },
              { id: "nose" as const, label: "Rhinoplasty" },
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
