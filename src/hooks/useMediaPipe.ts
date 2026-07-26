"use client";

import { useState, useEffect, useRef, useCallback, type ChangeEvent } from "react";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import type { LinePositions } from "@/components/constants";

export interface UseMediaPipeOptions {
  zoomScale: number;
  onError: (message: string | null) => void;
  /** Called when a new upload starts (clear AI result, etc.). */
  onUploadStart?: () => void;
}

export function useMediaPipe({
  zoomScale,
  onError,
  onUploadStart,
}: UseMediaPipeOptions) {
  const [croppedImageSrc, setCroppedImageSrc] = useState<string | null>(null);
  const [landmarker, setLandmarker] = useState<FaceLandmarker | null>(null);
  const [rawPixelLandmarks, setRawPixelLandmarks] = useState<Array<{ x: number; y: number }> | null>(null);
  const [mappedLandmarks, setMappedLandmarks] = useState<Array<{ x: number; y: number }> | null>(null);
  const [linePositions, setLinePositions] = useState<LinePositions | null>(null);
  const [fullFacePhi, setFullFacePhi] = useState<{
    facePhiRatio: string;
    verticalThirdsRatio: string;
    overallScore: string;
    clinicalAnalysis: string;
  } | null>(null);

  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const linePositionsRef = useRef<LinePositions | null>(null);

  useEffect(() => {
    let cancelled = false;
    let faceLandmarker: FaceLandmarker | null = null;

    async function initMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const created = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          numFaces: 1,
        });
        if (cancelled) {
          created.close();
          return;
        }
        faceLandmarker = created;
        setLandmarker(created);
      } catch {
        if (!cancelled) {
          onError("Failed to load facial recognition engine.");
        }
      }
    }
    initMediaPipe();
    return () => {
      cancelled = true;
      faceLandmarker?.close();
    };
  }, [onError]);

  const recalculateMetricsFromLines = useCallback((lines: LinePositions | null) => {
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

  const updateViewportAndCrop = useCallback((
    img: HTMLImageElement,
    pixelLms: Array<{ x: number; y: number }>,
    scale: number,
  ) => {
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

    // Enforce 64px multiple to prevent PyTorch 422 shape mismatch errors
    cropW = Math.max(64, Math.floor(cropW / 64) * 64);
    cropH = Math.max(64, Math.floor(cropH / 64) * 64);

    const mapped = pixelLms.map((pt) => ({
      x: pt.x - cropX,
      y: pt.y - cropY,
    }));

    const initialLines: LinePositions = {
      trichion: calcTrichionY - cropY,
      glabella: glabellaY - cropY,
      subnasale: subnasaleY - cropY,
      menton: calcMentonY - cropY,
      leftX: leftCheekX - cropX,
      rightX: rightCheekX - cropX,
    };

    setMappedLandmarks(mapped);
    linePositionsRef.current = initialLines;
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

  const handleImageUpload = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    onError(null);
    onUploadStart?.();
    setCroppedImageSrc(null);
    setFullFacePhi(null);
    setMappedLandmarks(null);
    linePositionsRef.current = null;
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
            updateViewportAndCrop(img, pixelLms, zoomScale);
          } else {
            onError("No face detected. Upload a front-facing portrait.");
          }
        } catch {
          onError("Failed to analyze facial geometry.");
        }
      };
    };
    reader.readAsDataURL(file);
  }, [landmarker, onError, onUploadStart, updateViewportAndCrop, zoomScale]);

  useEffect(() => {
    if (loadedImageRef.current && rawPixelLandmarks) {
      updateViewportAndCrop(loadedImageRef.current, rawPixelLandmarks, zoomScale);
    }
  }, [zoomScale, rawPixelLandmarks, updateViewportAndCrop]);

  return {
    mappedLandmarks,
    croppedImageSrc,
    handleImageUpload,
    linePositions,
    setLinePositions,
    linePositionsRef,
    fullFacePhi,
    recalculateMetricsFromLines,
  };
}
