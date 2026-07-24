"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { fal } from "@fal-ai/client";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, OrganizationSwitcher } from "@clerk/nextjs";

fal.config({ proxyUrl: "/api/fal/proxy" });

const LIPS_INNER_INDICES = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];

const FEATURE_INDICES: Record<string, number[]> = {
  upper_lip: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78],
  lower_lip: [61, 78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  brows: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
};

const NOSE_LANDMARKS = [1, 2, 98, 327, 168, 197, 195, 5, 4, 275, 45, 220, 440, 6, 129, 358, 209, 429];

const CHEEK_LANDMARKS = {
  left: [116, 123, 117, 118, 101, 50, 187, 207, 205, 227, 111, 36, 142, 100],
  right: [345, 352, 346, 347, 330, 280, 411, 427, 425, 447, 340, 266, 371, 329],
};

const CHIN_LANDMARKS = [152, 377, 400, 378, 379, 365, 397, 288, 361, 18, 83, 18, 132, 58, 172, 136, 150, 149, 176, 148, 152];

const NOSE_TECHNIQUES = {
  straight_slim: {
    name: "Straight & Slim Refinement",
    prompt_suffix: "flawless narrow straight nasal bridge, delicate supratip break, refined defined nasal tip cartilage, subtle alar narrowing, seamless skin texture, photorealistic, 8k resolution",
    strength: 0.52,
  },
  dorsal_hump: {
    name: "Dorsal Hump Reduction",
    prompt_suffix: "perfectly straight smooth nasal profile, complete dorsal hump reduction, refined bridge, photorealistic",
    strength: 0.48,
  },
  tip_plasty: {
    name: "Nasal Tip Refinement",
    prompt_suffix: "delicate narrow tip cartilage, elevated nasal tip angle, subtle supratip break, photorealistic",
    strength: 0.45,
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
};

const BROW_TECHNIQUES = {
  ombre_powder: {
    name: "Ombré Powder Brows",
    prompt_suffix: "ombre powder brows, razor-sharp clean lower border, crisp top outline, freshly waxed smooth skin, zero stray hairs outside border, photorealistic",
  },
  microblading: {
    name: "Microblading",
    prompt_suffix: "microblading eyebrows, ultra-sharp razor-crisp outer outline border, crisp individual 3D hair strokes, photorealistic",
  },
};

const LIP_TECHNIQUES = {
  russian: {
    name: "Russian Lip Technique",
    prompt_suffix: "Russian lip filler technique, vertical micro-threads, flat profile, heightened cupid's bow, plump volume, clean teeth, photorealistic",
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
};

export default function VisualizerApp() {
  const [activeTab, setActiveTab] = useState<"visualizer" | "pricing">("visualizer");
  const [croppedImageSrc, setCroppedImageSrc] = useState<string | null>(null);

  const [selectedFeatures, setSelectedFeatures] = useState<FeatureType[]>(["cheeks", "nose"]);

  const [browTechnique, setBrowTechnique] = useState<keyof typeof BROW_TECHNIQUES>("ombre_powder");
  const [browThickness, setBrowThickness] = useState<"thin" | "medium" | "thick">("medium");

  const [lipTechnique, setLipTechnique] = useState<keyof typeof LIP_TECHNIQUES>("russian");
  const [lipDosage, setLipDosage] = useState<string>("0.50ml");

  const [noseTechnique, setNoseTechnique] = useState<keyof typeof NOSE_TECHNIQUES>("straight_slim");
  const [cheekTechnique, setCheekTechnique] = useState<keyof typeof CHEEK_TECHNIQUES>("malar_volume");
  const [cheekDosage, setCheekDosage] = useState<string>("1.00ml");
  const [chinTechnique, setChinTechnique] = useState<keyof typeof CHIN_TECHNIQUES>("anterior_projection");

  const [showGoldenRatio, setShowGoldenRatio] = useState<boolean>(false);

  const [linePositions, setLinePositions] = useState<{
    trichion: number;
    glabella: number;
    subnasale: number;
    menton: number;
    leftX: number;
    rightX: number;
  } | null>(null);

  const [activeDraggingLine, setActiveDraggingLine] = useState<string | null>(null);

  const [fullFacePhi, setFullFacePhi] = useState<{
    facePhiRatio: string;
    verticalThirdsRatio: string;
    overallScore: string;
  } | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [landmarker, setLandmarker] = useState<any | null>(null);
  const [rawPixelLandmarks, setRawPixelLandmarks] = useState<Array<{ x: number; y: number }> | null>(null);
  const [mappedLandmarks, setMappedLandmarks] = useState<Array<{ x: number; y: number }> | null>(null);

  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sliderPos, setSliderPos] = useState<number>(50);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    async function initMediaPipe() {
      if (typeof window === "undefined") return;
      try {
        const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
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
        setLandmarker(faceLandmarker);
      } catch {
        setErrorMessage("Failed to load MediaPipe facial recognition engine.");
      }
    }
    initMediaPipe();
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

  const recalculateMetricsFromLines = useCallback((lines: typeof linePositions) => {
    if (!lines) return;

    const { trichion, glabella, subnasale, menton, leftX, rightX } = lines;

    const faceHeight = menton - trichion;
    const faceWidth = Math.abs(rightX - leftX);
    const facePhi = faceWidth > 0 ? (faceHeight / faceWidth).toFixed(3) : "1.618";

    const upperThird = Math.abs(glabella - trichion);
    const middleThird = Math.abs(subnasale - glabella);
    const lowerThird = Math.abs(menton - subnasale);
    const avgThird = (upperThird + middleThird + lowerThird) / 3;
    const thirdsRatioStr = `${(upperThird / avgThird).toFixed(2)} : ${(middleThird / avgThird).toFixed(2)} : ${(lowerThird / avgThird).toFixed(2)}`;

    const phiDiff = Math.abs(parseFloat(facePhi) - 1.618);
    const overallScore = Math.max(70, Math.min(99, 100 - phiDiff * 30)).toFixed(1);

    setFullFacePhi({
      facePhiRatio: facePhi,
      verticalThirdsRatio: thirdsRatioStr,
      overallScore: `${overallScore}%`,
    });
  }, []);

  const updateViewportAndCrop = useCallback((img: HTMLImageElement, pixelLms: Array<{ x: number; y: number }>, scale: number) => {
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

    const scaleMultiplier = scale / 100;
    const padX = faceWidth * 0.35 * scaleMultiplier;
    const padTop = faceHeight * 0.25 * scaleMultiplier;
    const padBottom = faceHeight * 0.25 * scaleMultiplier;

    const cropX = Math.max(0, leftCheekX - padX);
    const cropY = Math.max(0, calcTrichionY - padTop);
    let cropW = Math.min(origW - cropX, faceWidth + padX * 2);
    let cropH = Math.min(origH - cropY, faceHeight + padTop + padBottom);

    cropW = Math.max(64, Math.floor(cropW / 64) * 64);
    cropH = Math.max(64, Math.floor(cropH / 64) * 64);

    const mapped = pixelLms.map((pt) => ({
      x: pt.x - cropX,
      y: pt.y - cropY,
    }));

    const initialLines = {
      trichion: calcTrichionY - cropY,
      glabella: glabellaY - cropY,
      subnasale: subnasaleY - cropY,
      menton: calcMentonY - cropY,
      leftX: leftCheekX - cropX,
      rightX: rightCheekX - cropX,
    };

    setMappedLandmarks(mapped);
    setLinePositions(initialLines);

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext("2d");
    if (cropCtx) {
      cropCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      setCroppedImageSrc(cropCanvas.toDataURL("image/png"));
    }
    recalculateMetricsFromLines(initialLines);
  }, [recalculateMetricsFromLines]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setResultImage(null);
    setCroppedImageSrc(null);
    setFullFacePhi(null);
    setMappedLandmarks(null);
    setLinePositions(null);

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
            updateViewportAndCrop(img, pixelLms, 100);
          } else {
            setErrorMessage("No face detected. Upload a clear front-facing portrait.");
          }
        } catch {
          setErrorMessage("Failed to analyze facial geometry.");
        }
      };
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (loadedImageRef.current && rawPixelLandmarks) {
      updateViewportAndCrop(loadedImageRef.current, rawPixelLandmarks, 100);
    }
  }, [rawPixelLandmarks, updateViewportAndCrop]);

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
      const mouthGap = upperLipCenter && lowerLipCenter 
        ? Math.hypot(lowerLipCenter.x - upperLipCenter.x, lowerLipCenter.y - upperLipCenter.y)
        : 0;

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

            layerCtx.lineWidth = 18;
            layerCtx.strokeStyle = "white";
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
            layerCtx.stroke();
          });
        } else if (feat === "nose") {
          layerCtx.filter = "blur(8px)";

          if (NOSE_LANDMARKS && NOSE_LANDMARKS.length > 0) {
            layerCtx.beginPath();
            const startPt = mappedLandmarks[NOSE_LANDMARKS[0]];
            if (startPt) {
              layerCtx.moveTo(startPt.x, startPt.y);
              for (let i = 1; i < NOSE_LANDMARKS.length; i++) {
                const pt = mappedLandmarks[NOSE_LANDMARKS[i]];
                if (pt) layerCtx.lineTo(pt.x, pt.y);
              }
              layerCtx.closePath();
              layerCtx.fillStyle = "white";
              layerCtx.fill();

              layerCtx.lineWidth = 10;
              layerCtx.strokeStyle = "white";
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
                layerCtx.stroke();
              }
            }
          }
        }

        layerCtx.restore();
        mainCtx.drawImage(layerCanvas, 0, 0);
      });

      setMaskDataUrl(mainCanvas.toDataURL("image/png"));

      if (overlayCanvasRef.current && linePositions) {
        const overlayCanvas = overlayCanvasRef.current;
        overlayCanvas.width = img.width;
        overlayCanvas.height = img.height;
        const oCtx = overlayCanvas.getContext("2d");
        if (oCtx) {
          oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

          if (showGoldenRatio) {
            const { trichion, glabella, subnasale, menton, leftX, rightX } = linePositions;
            const lines = [
              { key: "trichion", y: trichion, label: "Trichion (Hairline)" },
              { key: "glabella", y: glabella, label: "Glabella (Brow Line)" },
              { key: "subnasale", y: subnasale, label: "Subnasale (Nose Base)" },
              { key: "menton", y: menton, label: "Menton (Chin Tip)" },
            ];

            lines.forEach((line) => {
              const isDragging = activeDraggingLine === line.key;
              oCtx.strokeStyle = isDragging ? "#fbbf24" : "#818cf8";
              oCtx.lineWidth = isDragging ? 3 : 1.5;
              oCtx.beginPath();
              oCtx.moveTo(leftX - 25, line.y);
              oCtx.lineTo(rightX + 25, line.y);
              oCtx.stroke();
            });
          }
        }
      }
    };
  }, [mappedLandmarks, linePositions, activeDraggingLine, selectedFeatures, browThickness, lipDosage, noseTechnique, cheekTechnique, cheekDosage, chinTechnique, showGoldenRatio, croppedImageSrc]);

  const applyEdgeFeathering = useCallback((originalSrc: string, aiResultUrl: string, maskUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const origImg = new Image();
      const aiImg = new Image();
      const maskImg = new Image();

      let loadedCount = 0;
      const checkLoaded = () => {
        loadedCount++;
        if (loadedCount === 3) {
          const canvas = document.createElement("canvas");
          const width = origImg.width;
          const height = origImg.height;
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(aiResultUrl);

          ctx.drawImage(aiImg, 0, 0, width, height);

          const alphaCanvas = document.createElement("canvas");
          alphaCanvas.width = width;
          alphaCanvas.height = height;
          const aCtx = alphaCanvas.getContext("2d");
          if (!aCtx) return resolve(aiResultUrl);

          aCtx.filter = "blur(16px)";
          aCtx.drawImage(maskImg, 0, 0, width, height);

          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.drawImage(alphaCanvas, 0, 0);
          ctx.globalCompositeOperation = "destination-over";
          ctx.drawImage(origImg, 0, 0, width, height);
          ctx.restore();

          resolve(canvas.toDataURL("image/png"));
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

  const handleGeneratePreview = async () => {
    if (!croppedImageSrc || !maskDataUrl) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const promptParts: string[] = ["Clinical aesthetic portrait transformation:"];
      let maxStrength = 0.45;

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
      }

      if (selectedFeatures.includes("upper_lip") || selectedFeatures.includes("lower_lip")) {
        promptParts.push(LIP_TECHNIQUES[lipTechnique].prompt_suffix);
        maxStrength = Math.max(maxStrength, DOSAGE_MAP[lipDosage]?.strength || 0.50);
      }

      if (selectedFeatures.includes("nose")) {
        const noseConfig = NOSE_TECHNIQUES[noseTechnique];
        promptParts.push(noseConfig.prompt_suffix);
        maxStrength = Math.max(maxStrength, noseConfig.strength);
      }

      const compositePrompt = promptParts.join(" ");

      const result = await fal.subscribe("fal-ai/flux-general/inpainting", {
        input: {
          prompt: compositePrompt,
          negative_prompt: "lower cheek bulge, inferior volume sag, exaggerated nasolabial folds, heavy marionette lines, unnatural cheek shadows, sunken under-eyes, plastic skin, distorted geometry, overfilled face, asymmetry",
          image_url: croppedImageSrc,
          mask_url: maskDataUrl,
          strength: maxStrength,
          enable_safety_checker: true,
        },
      });

      if (result.data?.images?.[0]?.url) {
        const rawAiUrl = result.data.images[0].url;
        const featheredUrl = await applyEdgeFeathering(croppedImageSrc, rawAiUrl, maskDataUrl);
        setResultImage(featheredUrl);
      } else {
        setErrorMessage("AI simulation failed to return an image.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to run composite simulation.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!showGoldenRatio || !linePositions || !overlayCanvasRef.current) return;

    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const scaleY = overlayCanvasRef.current.height / rect.height;
    const clickY = (e.clientY - rect.top) * scaleY;

    const threshold = 18;
    const keys: Array<keyof typeof linePositions> = ["trichion", "glabella", "subnasale", "menton"];

    for (const key of keys) {
      if (Math.abs(linePositions[key] - clickY) < threshold) {
        setActiveDraggingLine(key);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        break;
      }
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeDraggingLine || !linePositions || !overlayCanvasRef.current) return;

    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const scaleY = overlayCanvasRef.current.height / rect.height;
    const newY = (e.clientY - rect.top) * scaleY;

    const updated = {
      ...linePositions,
      [activeDraggingLine]: newY,
    };

    setLinePositions(updated);
    recalculateMetricsFromLines(updated);
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeDraggingLine) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setActiveDraggingLine(null);
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

          ${
            fullFacePhi
              ? `
          <div class="section">
            <h3>Facial Proportion Analysis (Rule of Thirds / Divine Φ)</h3>
            <div class="metrics">
              <p>Height/Width Ratio: <strong>${fullFacePhi.facePhiRatio}</strong> (Ideal Φ = 1.618)</p>
              <p>Vertical Thirds Ratio (Upper : Mid : Lower): <strong>${fullFacePhi.verticalThirdsRatio}</strong></p>
              <p>Facial Geometry Score: <strong>${fullFacePhi.overallScore}</strong></p>
            </div>
          </div>
          `
              : ""
          }

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
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6 text-white bg-gray-950 min-h-screen select-none touch-pan-y">
      {/* Header & Facility Auth Bar */}
      <div className="border-b border-gray-800 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif tracking-wide text-amber-100">Face-off.ai</h1>
          <p className="text-gray-400 text-xs md:text-sm">Multi-Feature Facial Aesthetic Procedure Simulator</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab(activeTab === "visualizer" ? "pricing" : "visualizer")}
            className="px-3 py-1.5 rounded-md text-xs font-mono border border-gray-700 bg-gray-800 text-amber-300 hover:bg-gray-750"
          >
            {activeTab === "visualizer" ? "💳 Subscription Tiers" : "🔬 Visualizer Workspace"}
          </button>

          <button
            onClick={() => setShowGoldenRatio(!showGoldenRatio)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono border transition ${
              showGoldenRatio ? "bg-indigo-900/50 border-indigo-500 text-indigo-200" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
            }`}
          >
            {showGoldenRatio ? "✓ Draggable Grid On" : "+ Enable Draggable Grid"}
          </button>

          {/* Real Clerk Auth Integration */}
          <SignedOut>
            <div className="flex items-center gap-2">
              <SignInButton mode="modal">
                <button className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded border border-gray-700 font-medium">
                  Facility Sign In
                </button>
              </SignInButton>

              <SignUpButton mode="modal">
                <button className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded font-medium">
                  Register Facility
                </button>
              </SignUpButton>
            </div>
          </SignedOut>

          <SignedIn>
            <div className="flex items-center gap-2">
              <OrganizationSwitcher
                appearance={{
                  elements: {
                    rootBox: "bg-gray-800 rounded border border-gray-700 text-xs",
                    organizationSwitcherTrigger: "text-xs text-amber-200 py-1 px-2",
                  },
                }}
              />
              <UserButton afterSignOutUrl="/" />
            </div>
          </SignedIn>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-950/60 border border-red-500/50 rounded-lg text-red-200 text-sm">
          {errorMessage}
        </div>
      )}

      {activeTab === "visualizer" ? (
        <>
          {/* Control Panel */}
          <div className="bg-gray-900 p-4 md:p-5 rounded-xl border border-gray-800 space-y-4">
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

              {/* Cheek Selector */}
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
                        <option key={key} value={key}>
                          {item.name}
                        </option>
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

              {/* Nose Selector */}
              {selectedFeatures.includes("nose") && (
                <div>
                  <label className="block text-xs text-amber-300 font-medium mb-1">Rhinoplasty Preset</label>
                  <select
                    value={noseTechnique}
                    onChange={(e) => setNoseTechnique(e.target.value as keyof typeof NOSE_TECHNIQUES)}
                    className="bg-gray-800 text-white p-2 rounded border border-amber-500/50 text-xs w-full font-medium"
                  >
                    {Object.entries(NOSE_TECHNIQUES).map(([key, item]) => (
                      <option key={key} value={key}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Eyebrow Selector */}
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

              {/* Lip Selector */}
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

              {/* Chin Selector */}
              {selectedFeatures.includes("chin") && (
                <div>
                  <label className="block text-xs text-amber-300 font-medium mb-1">Chin Procedure Preset</label>
                  <select
                    value={chinTechnique}
                    onChange={(e) => setChinTechnique(e.target.value as keyof typeof CHIN_TECHNIQUES)}
                    className="bg-gray-800 text-white p-2 rounded border border-amber-500/50 text-xs w-full font-medium"
                  >
                    {Object.entries(CHIN_TECHNIQUES).map(([key, item]) => (
                      <option key={key} value={key}>
                        {item.name}
                      </option>
                    ))}
                  </select>
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

          {croppedImageSrc && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-medium text-amber-200">
                  {resultImage ? "Multi-Procedure Before & After Comparison:" : "Interactive Facial Canvas:"}
                </p>
                {resultImage && (
                  <button
                    onClick={handleExportPDF}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1.5 transition"
                  >
                    📄 Export Patient Summary (PDF)
                  </button>
                )}
              </div>

              <div className="relative w-full max-w-xl mx-auto rounded-lg overflow-hidden border border-gray-800 touch-none">
                {resultImage ? (
                  <div className="relative w-full aspect-square select-none touch-none">
                    <img src={resultImage} alt="After" className="absolute inset-0 w-full h-full object-cover" />

                    <div
                      className="absolute inset-y-0 left-0 overflow-hidden pointer-events-none"
                      style={{ width: `${sliderPos}%` }}
                    >
                      <img
                        src={croppedImageSrc}
                        alt="Before"
                        className="absolute top-0 left-0 h-full w-full object-cover max-w-none"
                        style={{ width: "100%", height: "100%" }}
                      />
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={sliderPos}
                      onChange={(e) => setSliderPos(Number(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20 touch-none"
                    />

                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10 pointer-events-none shadow-[0_0_12px_rgba(251,191,36,0.8)]"
                      style={{ left: `${sliderPos}%` }}
                    >
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-amber-400 text-gray-950 rounded-full flex items-center justify-center font-bold text-xs shadow-lg">
                        ↔
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative w-full aspect-square touch-none">
                    <img src={croppedImageSrc} alt="Interactive Canvas" className="w-full h-full object-cover pointer-events-none" />
                    <canvas
                      ref={overlayCanvasRef}
                      onPointerDown={handleCanvasPointerDown}
                      onPointerMove={handleCanvasPointerMove}
                      onPointerUp={handleCanvasPointerUp}
                      className="absolute inset-0 w-full h-full cursor-ns-resize touch-none"
                      style={{ touchAction: "none" }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Pricing Tiers View */
        <div className="max-w-4xl mx-auto py-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-amber-200">Clinical Facility Subscriptions</h2>
            <p className="text-gray-400 text-xs font-mono">Select a monthly plan to unlock iPad visualizer seats for your consultation team.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-gray-900 border border-gray-800 rounded-xl space-y-4">
              <span className="text-xs font-mono bg-blue-900/50 text-blue-300 px-2 py-1 rounded">Solo Practitioner</span>
              <div className="text-2xl font-bold text-white">1,500 SAR <span className="text-xs text-gray-400 font-normal">/ mo</span></div>
              <ul className="text-xs text-gray-300 space-y-2">
                <li>✓ 100 AI Simulations/month</li>
                <li>✓ Standard iPad & Web Access</li>
                <li>✓ PDF Consultation Reports</li>
              </ul>
            </div>

            <div className="p-6 bg-gray-900 border border-amber-500/50 rounded-xl space-y-4 relative">
              <span className="absolute -top-2.5 right-4 bg-amber-500 text-gray-950 font-bold text-[10px] px-2 py-0.5 rounded uppercase">Popular</span>
              <span className="text-xs font-mono bg-amber-900/50 text-amber-300 px-2 py-1 rounded">Pro Clinic Tier</span>
              <div className="text-2xl font-bold text-white">3,500 SAR <span className="text-xs text-gray-400 font-normal">/ mo</span></div>
              <ul className="text-xs text-gray-300 space-y-2">
                <li>✓ Unlimited iPad Simulations</li>
                <li>✓ Multi-Doctor Practitioner Seats</li>
                <li>✓ Custom Facility Logo Export</li>
                <li>✓ Golden Ratio Grid Overlay</li>
              </ul>
            </div>

            <div className="p-6 bg-gray-900 border border-gray-800 rounded-xl space-y-4">
              <span className="text-xs font-mono bg-emerald-900/50 text-emerald-300 px-2 py-1 rounded">Enterprise / Website Widget</span>
              <div className="text-2xl font-bold text-white">8,000 SAR <span className="text-xs text-gray-400 font-normal">/ mo</span></div>
              <ul className="text-xs text-gray-300 space-y-2">
                <li>✓ All Pro Features</li>
                <li>✓ Embeddable Website Lead Widget</li>
                <li>✓ Direct WhatsApp Lead Routing</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center pt-6 border-t border-gray-900 text-xs text-gray-500">
        <p>
          <strong>Medical Disclaimer:</strong> This tool utilizes generative artificial intelligence for educational and patient consultation purposes only. It does not guarantee surgical or clinical outcomes. Treatment planning requires an in-person clinical consultation with a licensed physician.
        </p>
      </footer>
    </div>
  );
}