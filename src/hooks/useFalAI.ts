"use client";

import { useState, useCallback } from "react";
import { fal } from "@fal-ai/client";
import {
  NOSE_TECHNIQUES,
  CHEEK_TECHNIQUES,
  CHEEK_DOSAGE_MAP,
  CHIN_TECHNIQUES,
  BROW_TECHNIQUES,
  LIP_TECHNIQUES,
  DOSAGE_MAP,
  type FeatureType,
} from "@/components/constants";

fal.config({ proxyUrl: "/api/fal/proxy" });

export interface UseFalAIOptions {
  croppedImageSrc: string | null;
  maskDataUrl: string | null;
  mappedLandmarks: Array<{ x: number; y: number }> | null;
  selectedFeatures: FeatureType[];
  chinTechnique: keyof typeof CHIN_TECHNIQUES;
  cheekTechnique: keyof typeof CHEEK_TECHNIQUES;
  cheekDosage: string;
  browTechnique: keyof typeof BROW_TECHNIQUES;
  browThickness: "thin" | "medium" | "thick";
  browDensity: string;
  lipTechnique: keyof typeof LIP_TECHNIQUES;
  lipDosage: string;
  noseTechnique: keyof typeof NOSE_TECHNIQUES;
  onError: (message: string | null) => void;
}

export function useFalAI({
  croppedImageSrc,
  maskDataUrl,
  mappedLandmarks,
  selectedFeatures,
  chinTechnique,
  cheekTechnique,
  cheekDosage,
  browTechnique,
  browThickness,
  browDensity,
  lipTechnique,
  lipDosage,
  noseTechnique,
  onError,
}: UseFalAIOptions) {
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const generateWarpedImage = useCallback((radiusRatio: number, amount: number): string | null => {
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
  }, [croppedImageSrc, mappedLandmarks]);

  // METHOD B: ADAPTIVE ALPHA EDGE-FEATHERING POST-PROCESSOR
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

  const handleGeneratePreview = useCallback(async () => {
    if (!croppedImageSrc || !maskDataUrl) return;

    setLoading(true);
    onError(null);

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
        maxStrength = Math.max(maxStrength, DOSAGE_MAP[lipDosage]?.strength || 0.50);
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
          negative_prompt: "lower cheek bulge, inferior volume sag, exaggerated nasolabial folds, heavy marionette lines, unnatural cheek shadows, sunken under-eyes, plastic skin, distorted geometry, overfilled face, asymmetry, harsh lines around mouth",
          image_url: targetImage,
          mask_url: maskDataUrl,
          strength: maxStrength,
          enable_safety_checker: true,
        },
      });

      const images = (result.data as { images?: Array<{ url?: string }> } | undefined)?.images;
      if (images?.[0]?.url) {
        const rawAiUrl = images[0].url;
        const featheredUrl = await applyEdgeFeathering(croppedImageSrc, rawAiUrl, maskDataUrl);
        setResultImage(featheredUrl);
      } else {
        onError("AI simulation failed to return an image.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to run composite simulation.";
      onError(msg);
    } finally {
      setLoading(false);
    }
  }, [
    applyEdgeFeathering,
    browDensity,
    browTechnique,
    browThickness,
    cheekDosage,
    cheekTechnique,
    chinTechnique,
    croppedImageSrc,
    generateWarpedImage,
    lipDosage,
    lipTechnique,
    maskDataUrl,
    noseTechnique,
    onError,
    selectedFeatures,
  ]);

  return {
    resultImage,
    setResultImage,
    loading,
    handleGeneratePreview,
  };
}
