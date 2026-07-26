"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { fal } from "@fal-ai/client";
import {
  LIPS_INNER_INDICES,
  FEATURE_INDICES,
  NOSE_LANDMARKS,
  CHEEK_LANDMARKS,
  CHIN_LANDMARKS,
  NOSE_TECHNIQUES,
  CHEEK_TECHNIQUES,
  CHEEK_DOSAGE_MAP,
  CHIN_TECHNIQUES,
  BROW_TECHNIQUES,
  LIP_TECHNIQUES,
  DOSAGE_MAP,
  BROW_THICKNESS_MAP,
  type FeatureType,
  type LinePositions,
} from "./constants";

fal.config({ proxyUrl: "/api/fal/proxy" });

export default function VisualizerApp() {
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
  const [showGoldenRatio, setShowGoldenRatio] = useState<boolean>(false);
  const [zoomScale, setZoomScale] = useState<number>(100);
  const [sliderPos, setSliderPos] = useState<number>(50);

  const [croppedImageSrc, setCroppedImageSrc] = useState<string | null>(null);
  const [rawPixelLandmarks, setRawPixelLandmarks] = useState<Array<{ x: number; y: number }> | null>(null);
  const [mappedLandmarks, setMappedLandmarks] = useState<Array<{ x: number; y: number }> | null>(null);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [fullFacePhi, setFullFacePhi] = useState<{
    facePhiRatio: string;
    verticalThirdsRatio: string;
    overallScore: string;
    clinicalAnalysis: string;
  } | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  const linePositionsRef = useRef<LinePositions | null>(null);
  const activeDraggingLineRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function initMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          numFaces: 1,
        });
        if (isMounted) landmarkerRef.current = faceLandmarker;
      } catch {
        if (isMounted) setErrorMessage("Failed to load facial recognition engine.");
      }
    }
    initMediaPipe();
    return () => {
      isMounted = false;
      if (landmarkerRef.current) landmarkerRef.current.close();
    };
  }, []);

  const toggleFeature = (feat: FeatureType) => {
    if (selectedFeatures.includes(feat)) {
      if (selectedFeatures.length > 1) setSelectedFeatures(selectedFeatures.filter((f) => f !== feat));
    } else {
      setSelectedFeatures([...selectedFeatures, feat]);
    }
  };

  const recalculateMetricsFromLines = useCallback((lines: LinePositions) => {
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

    let analysis = "Near-Ideal Divine Proportion (Φ 1.618)";
    if (parseFloat(facePhi) < 1.5) analysis = "Wider Midface Geometry / Brachycephalic";
    if (parseFloat(facePhi) > 1.75) analysis = "Elongated Facial Height / Dolichocephalic";

    setFullFacePhi({
      facePhiRatio: facePhi,
      verticalThirdsRatio: thirdsRatioStr,
      overallScore: `${overallScore}%`,
      clinicalAnalysis: analysis,
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

    // Source coordinates from original image
    const sourceCropX = Math.max(0, leftCheekX - padX);
    const sourceCropY = Math.max(0, calcTrichionY - padTop);
    let sourceCropW = Math.min(origW - sourceCropX, faceWidth + padX * 2);
    let sourceCropH = Math.min(origH - sourceCropY, faceHeight + padTop + padBottom);

    // AI PIPELINE LIMIT: Clamp to ~1 Megapixel (1024px max dimension)
    const MAX_DIMENSION = 1024;
    let downscaleFactor = 1;
    if (sourceCropW > MAX_DIMENSION || sourceCropH > MAX_DIMENSION) {
      downscaleFactor = Math.min(MAX_DIMENSION / sourceCropW, MAX_DIMENSION / sourceCropH);
    }

    // Target Canvas Dimensions (Enforcing PyTorch 64px multiple)
    let targetCropW = Math.max(64, Math.floor((sourceCropW * downscaleFactor) / 64) * 64);
    let targetCropH = Math.max(64, Math.floor((sourceCropH * downscaleFactor) / 64) * 64);
    
    // Recalculate exact scaling multiplier due to the 64px rounding
    const exactScaleX = targetCropW / sourceCropW;
    const exactScaleY = targetCropH / sourceCropH;

    // Scale facial landmarks to match the resized canvas
    const mapped = pixelLms.map((pt) => ({ 
      x: (pt.x - sourceCropX) * exactScaleX, 
      y: (pt.y - sourceCropY) * exactScaleY 
    }));

    // Scale draggable grid lines to match the resized canvas
    const initialLines = {
      trichion: (calcTrichionY - sourceCropY) * exactScaleY,
      glabella: (glabellaY - sourceCropY) * exactScaleY,
      subnasale: (subnasaleY - sourceCropY) * exactScaleY,
      menton: (calcMentonY - sourceCropY) * exactScaleY,
      leftX: (leftCheekX - sourceCropX) * exactScaleX,
      rightX: (rightCheekX - sourceCropX) * exactScaleX,
    };

    setMappedLandmarks(mapped);
    linePositionsRef.current = initialLines;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = targetCropW;
    cropCanvas.height = targetCropH;
    const cropCtx = cropCanvas.getContext("2d");
    if (cropCtx) {
      // drawImage handles the downscaling automatically: (image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
      cropCtx.drawImage(img, sourceCropX, sourceCropY, sourceCropW, sourceCropH, 0, 0, targetCropW, targetCropH);
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
    linePositionsRef.current = null;

    const file = e.target.files?.[0];
    if (!file || !landmarkerRef.current) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        loadedImageRef.current = img;
        try {
          const results = landmarkerRef.current!.detect(img);
          if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
            const rawLms = results.faceLandmarks[0];
            const pixelLms = rawLms.map((pt: { x: number; y: number }) => ({
              x: pt.x * img.width,
              y: pt.y * img.height,
            }));
            setRawPixelLandmarks(pixelLms);
            updateViewportAndCrop(img, pixelLms, zoomScale);
          } else {
            setErrorMessage("No face detected. Please upload a clear front-facing portrait.");
          }
        } catch {
          setErrorMessage("Failed to process facial landmarks.");
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (loadedImageRef.current && rawPixelLandmarks) {
      updateViewportAndCrop(loadedImageRef.current, rawPixelLandmarks, zoomScale);
    }
  }, [zoomScale, rawPixelLandmarks, updateViewportAndCrop]);

  useEffect(() => {
    if (!mappedLandmarks || !croppedImageSrc || !canvasRef.current) return;

    const img = new Image();
    img.onload = () => {
      const mainCanvas = canvasRef.current!;
      mainCanvas.width = img.width;
      mainCanvas.height = img.height;
      const mainCtx = mainCanvas.getContext("2d");
      if (!mainCtx) return;

      mainCtx.fillStyle = "#000000";
      mainCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);

      const upperLipCenter = mappedLandmarks[13];
      const lowerLipCenter = mappedLandmarks[14];
      const mouthGap =
        upperLipCenter && lowerLipCenter
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
            layerCtx.fillStyle = "#FFFFFF";
            layerCtx.fill();
            layerCtx.lineWidth = thicknessConfig.stroke + thicknessConfig.padding;
            layerCtx.strokeStyle = "#FFFFFF";
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
            layerCtx.fillStyle = "#FFFFFF";
            layerCtx.fill();
            layerCtx.lineWidth = 14;
            layerCtx.strokeStyle = "#FFFFFF";
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
            layerCtx.fillStyle = "#FFFFFF";
            layerCtx.fill();
            layerCtx.lineWidth = dosageConfig.dilationPx;
            layerCtx.strokeStyle = "#FFFFFF";
            layerCtx.lineJoin = "round";
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
              layerCtx.fillStyle = "#FFFFFF";
              layerCtx.fill();
              layerCtx.lineWidth = 10;
              layerCtx.strokeStyle = "#FFFFFF";
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
              layerCtx.fillStyle = "#FFFFFF";
              layerCtx.fill(feat.includes("lip") && mouthGap > 6 ? "evenodd" : "nonzero");
              if (feat.includes("lip")) {
                const dosageConfig = DOSAGE_MAP[lipDosage] || DOSAGE_MAP["0.50ml"];
                layerCtx.lineWidth = dosageConfig.dilationPx;
                layerCtx.strokeStyle = "#FFFFFF";
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
    img.src = croppedImageSrc;
  }, [
    mappedLandmarks,
    selectedFeatures,
    browThickness,
    lipDosage,
    noseTechnique,
    cheekTechnique,
    cheekDosage,
    chinTechnique,
    croppedImageSrc,
  ]);

  const drawGridOverlay = useCallback(() => {
    if (!overlayCanvasRef.current || !linePositionsRef.current || !croppedImageSrc) return;
    const oCtx = overlayCanvasRef.current.getContext("2d");
    if (!oCtx) return;

    const img = new Image();
    img.onload = () => {
      overlayCanvasRef.current!.width = img.width;
      overlayCanvasRef.current!.height = img.height;
      oCtx.clearRect(0, 0, img.width, img.height);

      if (showGoldenRatio && linePositionsRef.current) {
        const { trichion, glabella, subnasale, menton, leftX, rightX } = linePositionsRef.current;
        const lines = [
          { key: "trichion", y: trichion, label: "Trichion (Hairline)" },
          { key: "glabella", y: glabella, label: "Glabella (Brow Line)" },
          { key: "subnasale", y: subnasale, label: "Subnasale (Nose Base)" },
          { key: "menton", y: menton, label: "Menton (Chin Tip)" },
        ];

        lines.forEach((line) => {
          const isDragging = activeDraggingLineRef.current === line.key;
          oCtx.strokeStyle = isDragging ? "#fbbf24" : "#818cf8";
          oCtx.lineWidth = isDragging ? 3 : 1.5;

          oCtx.beginPath();
          oCtx.moveTo(leftX - 25, line.y);
          oCtx.lineTo(rightX + 25, line.y);
          oCtx.stroke();

          oCtx.fillStyle = isDragging ? "#fbbf24" : "#818cf8";
          oCtx.beginPath();
          oCtx.arc(rightX + 25, line.y, 5, 0, Math.PI * 2);
          oCtx.fill();

          oCtx.font = "10px monospace";
          oCtx.fillStyle = isDragging ? "#fbbf24" : "#818cf8";
          oCtx.fillText(`${line.label}`, rightX + 35, line.y + 3);
        });

        oCtx.strokeStyle = "#f59e0b";
        oCtx.lineWidth = 2;
        oCtx.strokeRect(leftX, trichion, rightX - leftX, menton - trichion);
        oCtx.font = "11px monospace";
        oCtx.fillStyle = "#fbbf24";
        oCtx.fillText("Rule of Thirds (Φ = 1.618) Grid", leftX + 10, trichion + 15);
      }
    };
    img.src = croppedImageSrc;
  }, [showGoldenRatio, croppedImageSrc]);

  useEffect(() => {
    drawGridOverlay();
  }, [drawGridOverlay]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!showGoldenRatio || !linePositionsRef.current || !overlayCanvasRef.current) return;
    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const scaleY = overlayCanvasRef.current.height / rect.height;
    const clickY = (e.clientY - rect.top) * scaleY;
    const threshold = 14;

    const keys: Array<keyof LinePositions> = ["trichion", "glabella", "subnasale", "menton"];
    for (const key of keys) {
      if (Math.abs(linePositionsRef.current[key] - clickY) < threshold) {
        activeDraggingLineRef.current = key;
        break;
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeDraggingLineRef.current || !linePositionsRef.current || !overlayCanvasRef.current) return;
    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const scaleY = overlayCanvasRef.current.height / rect.height;
    const newY = (e.clientY - rect.top) * scaleY;

    linePositionsRef.current = { ...linePositionsRef.current, [activeDraggingLineRef.current]: newY };
    drawGridOverlay();
  };

  const handleCanvasMouseUp = () => {
    if (activeDraggingLineRef.current && linePositionsRef.current) {
      recalculateMetricsFromLines(linePositionsRef.current);
    }
    activeDraggingLineRef.current = null;
    drawGridOverlay();
  };

  const generateWarpedImage = useCallback(
    (radiusRatio: number, amount: number): string | null => {
      if (!croppedImageSrc || !mappedLandmarks) return null;
      const img = new Image();
      img.src = croppedImageSrc;
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
            const srcX = centerX + deltaX * (1 + pinchFactor);
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
    },
    [croppedImageSrc, mappedLandmarks],
  );

  const applyEdgeFeathering = useCallback(
    (originalSrc: string, aiResultUrl: string, maskUrl: string): Promise<string> => {
      return new Promise((resolve) => {
        const loadImage = (src: string): Promise<HTMLImageElement> => {
          return new Promise((res, rej) => {
            const img = new Image();
            if (src.startsWith("http")) img.crossOrigin = "anonymous";
            img.onload = () => res(img);
            img.onerror = (e) => rej(e);
            img.src = src;
          });
        };

        Promise.all([loadImage(originalSrc), loadImage(aiResultUrl), loadImage(maskUrl)])
          .then(([origImg, aiImg, maskImg]) => {
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

            aCtx.filter = "blur(14px)";
            aCtx.drawImage(maskImg, 0, 0, width, height);

            ctx.save();
            ctx.globalCompositeOperation = "destination-out";
            ctx.drawImage(alphaCanvas, 0, 0);
            ctx.globalCompositeOperation = "destination-over";
            ctx.drawImage(origImg, 0, 0, width, height);
            ctx.restore();

            resolve(canvas.toDataURL("image/png"));
          })
          .catch(() => resolve(aiResultUrl));
      });
    },
    [],
  );

  const handleGeneratePreview = async () => {
    if (!croppedImageSrc || !maskDataUrl) {
      setErrorMessage("Missing baseline image or feature mask.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const promptParts: string[] = ["Clinical aesthetic facial simulation:"];
      let maxStrength = 0.38;
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
        maxStrength = Math.max(maxStrength, DOSAGE_MAP[browDensity]?.strength || 0.50);
      }
      if (selectedFeatures.includes("upper_lip") || selectedFeatures.includes("lower_lip")) {
        promptParts.push(LIP_TECHNIQUES[lipTechnique].prompt_suffix);
        maxStrength = Math.max(maxStrength, DOSAGE_MAP[lipDosage]?.strength || 0.40);
      }
      if (selectedFeatures.includes("nose")) {
        const noseConfig = NOSE_TECHNIQUES[noseTechnique];
        promptParts.push(noseConfig.prompt_suffix);
        maxStrength = Math.max(maxStrength, noseConfig.strength);
        const warped = generateWarpedImage(noseConfig.pinchRadiusRatio, noseConfig.pinchAmount);
        if (warped) targetImage = warped;
      }

      const compositePrompt = promptParts.join(" ");
      const result = await fal.subscribe("fal-ai/flux-general/inpainting", {
        input: {
          prompt: compositePrompt,
          negative_prompt:
            "lower cheek bulge, inferior volume sag, exaggerated nasolabial folds, heavy marionette lines, unnatural cheek shadows, sunken under-eyes, plastic skin, distorted geometry, overfilled face, asymmetry, harsh lines around mouth",
          image_url: targetImage,
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
      const msg = err instanceof Error ? err.message : "Failed to execute simulation.";
      setErrorMessage(msg);
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
          <div><div class="title">Face-off.ai</div><div class="subtitle">Clinical Aesthetic Procedure Simulation Summary</div></div>
          <div style="text-align: right; font-size: 11px; color: #64748b;"> Date: ${new Date().toLocaleDateString()}<br/> Selected Procedures: <strong>${procedureList}</strong> </div>
        </div>
        <div class="section">
          <h3>Visual Transformation Simulation</h3>
          <div class="grid">
            <div class="card"><img src="${croppedImageSrc}" /><p><strong>BEFORE (Baseline)</strong></p></div>
            <div class="card"><img src="${resultImage}" /><p><strong>AFTER (${procedureList})</strong></p></div>
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
        </div>`
            : ""
        }
        <div class="disclaimer">
          <strong>Medical Disclaimer:</strong> This visual simulation is provided for consultation and educational purposes only. It does not constitute a surgical guarantee. Final treatment plans depend on in-person clinical assessment by a licensed physician.
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 text-white bg-gray-950 min-h-screen select-none">
      <div className="border-b border-gray-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif tracking-wide text-amber-100">Face-off.ai</h1>
          <p className="text-gray-400 text-sm">Multi-Feature Facial Aesthetic Procedure Simulator</p>
        </div>
        <button
          onClick={() => setShowGoldenRatio(!showGoldenRatio)}
          className={`px-3 py-1.5 rounded-md text-xs font-mono border transition ${
            showGoldenRatio
              ? "bg-indigo-900/50 border-indigo-500 text-indigo-200"
              : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
          }`}
        >
          {showGoldenRatio ? "✓ Draggable Grid On" : "+ Enable Draggable Grid"}
        </button>
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
            {(["chin", "cheeks", "nose", "brows", "upper_lip", "lower_lip"] as FeatureType[]).map((f) => {
              const active = selectedFeatures.includes(f);
              return (
                <button
                  key={f}
                  onClick={() => toggleFeature(f)}
                  className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-between transition ${
                    active
                      ? "bg-amber-600/20 border-amber-500 text-amber-200 font-bold"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750"
                  }`}
                >
                  <span className="capitalize">{f.replace("_", " ")}</span>
                  <span className="text-xs">{active ? "✓" : "+"}</span>
                </button>
              );
            })}
          </div>
        </div>

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
                  <option key={key} value={key}>
                    {item.name}
                  </option>
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

      {croppedImageSrc && (
        <div className="bg-gray-900 border border-gray-800 p-3 rounded-xl flex items-center justify-between gap-4 text-xs font-mono">
          <span className="text-gray-400">Viewport Framing (Zoom Scale):</span>
          <div className="flex items-center gap-3 flex-1 max-w-xs">
            <span className="text-gray-500">Zoom In</span>
            <input
              type="range"
              min="50"
              max="200"
              value={zoomScale}
              onChange={(e) => setZoomScale(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <span className="text-gray-500">Zoom Out</span>
          </div>
          <span className="text-amber-400 font-bold min-w-[45px] text-right">{zoomScale}%</span>
        </div>
      )}

      {fullFacePhi && (
        <div className="bg-indigo-950/40 border border-indigo-500/30 p-4 rounded-xl space-y-2 text-xs font-mono">
          <div className="flex justify-between items-center border-b border-indigo-900/50 pb-2">
            <span className="text-amber-400 font-bold">FULL FACE RULE OF THIRDS (Φ = 1.618)</span>
            <span className="text-indigo-300">
              Divine Match: <strong>{fullFacePhi.overallScore}</strong>
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-300 pt-1">
            <div>
              <span className="text-gray-400 block">Height / Width Ratio:</span>
              <strong className="text-white text-sm">{fullFacePhi.facePhiRatio}</strong>
              <span className="text-[10px] text-gray-500 block">(Target Φ = 1.618)</span>
            </div>
            <div>
              <span className="text-gray-400 block">Vertical Thirds (Upper : Mid : Lower):</span>
              <strong className="text-white text-sm">{fullFacePhi.verticalThirdsRatio}</strong>
              <span className="text-[10px] text-gray-500 block">(Target = 1.0 : 1.0 : 1.0)</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleGeneratePreview}
          disabled={!mappedLandmarks || loading}
          className="bg-amber-600 hover:bg-amber-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium py-3 px-8 rounded-md transition text-sm shadow-md cursor-pointer"
        >
          {loading ? "Simulating Procedure..." : `Run (${selectedFeatures.length} Procedures) Simulation`}
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {croppedImageSrc && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-medium text-amber-200">
              {resultImage
                ? "Multi-Procedure Before & After Comparison:"
                : "Interactive Facial Canvas (Drag Lines to Adjust):"}
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

          <div className="relative w-full max-w-xl mx-auto rounded-lg overflow-hidden border border-gray-800">
            {resultImage ? (
              <div className="relative w-full aspect-square select-none touch-none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resultImage} alt="After" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
                />
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10 pointer-events-none shadow-[0_0_12px_rgba(251,191,36,0.8)]"
                  style={{ left: `${sliderPos}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-amber-400 text-gray-950 rounded-full flex items-center justify-center font-bold text-xs shadow-lg">
                    ↔
                  </div>
                </div>
                <span className="absolute bottom-3 left-3 bg-black/80 text-white text-xs px-2.5 py-1 rounded font-mono">
                  BEFORE
                </span>
                <span className="absolute bottom-3 right-3 bg-black/80 text-amber-300 text-xs px-2.5 py-1 rounded font-mono">
                  AFTER ({selectedFeatures.join(" + ").toUpperCase()})
                </span>
              </div>
            ) : (
              <div className="relative w-full aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={croppedImageSrc}
                  alt="Interactive Canvas"
                  className="w-full h-full object-cover pointer-events-none"
                />
                <canvas
                  ref={overlayCanvasRef}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  className="absolute inset-0 w-full h-full cursor-ns-resize"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="text-center pt-6 border-t border-gray-900 text-xs text-gray-500">
        <p>
          <strong>Medical Disclaimer:</strong> This tool utilizes generative artificial intelligence for educational
          and patient consultation purposes only. It does not guarantee surgical or clinical outcomes. Treatment
          planning requires an in-person clinical consultation with a licensed physician.
        </p>
      </footer>
    </div>
  );
}
