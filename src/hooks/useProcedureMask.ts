"use client";

import { useState, useEffect, type RefObject, type MutableRefObject } from "react";
import {
  LIPS_INNER_INDICES,
  FEATURE_INDICES,
  NOSE_LANDMARKS,
  CHEEK_LANDMARKS,
  CHIN_LANDMARKS,
  CHEEK_DOSAGE_MAP,
  CHIN_TECHNIQUES,
  BROW_THICKNESS_MAP,
  DOSAGE_MAP,
  type FeatureType,
  type LinePositions,
} from "@/components/constants";

export interface UseProcedureMaskOptions {
  mappedLandmarks: Array<{ x: number; y: number }> | null;
  croppedImageSrc: string | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  selectedFeatures: FeatureType[];
  browThickness: "thin" | "medium" | "thick";
  lipDosage: string;
  cheekDosage: string;
  chinTechnique: keyof typeof CHIN_TECHNIQUES;
  showGoldenRatio: boolean;
  linePositionsRef: MutableRefObject<LinePositions | null>;
  activeDraggingLineRef: MutableRefObject<string | null>;
  drawGoldenRatioOverlay: (
    lines: LinePositions | null,
    activeKey: string | null,
    show: boolean,
  ) => void;
}

export function useProcedureMask({
  mappedLandmarks,
  croppedImageSrc,
  canvasRef,
  overlayCanvasRef,
  selectedFeatures,
  browThickness,
  lipDosage,
  cheekDosage,
  chinTechnique,
  showGoldenRatio,
  linePositionsRef,
  activeDraggingLineRef,
  drawGoldenRatioOverlay,
}: UseProcedureMaskOptions) {
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);

  // ISOLATED MULTI-LAYER MASK COMPOSITING EFFECT
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

      if (overlayCanvasRef.current) {
        const overlayCanvas = overlayCanvasRef.current;
        overlayCanvas.width = img.width;
        overlayCanvas.height = img.height;
        drawGoldenRatioOverlay(
          linePositionsRef.current,
          activeDraggingLineRef.current,
          showGoldenRatio,
        );
      }
    };
  }, [
    mappedLandmarks,
    selectedFeatures,
    browThickness,
    lipDosage,
    cheekDosage,
    chinTechnique,
    showGoldenRatio,
    croppedImageSrc,
    drawGoldenRatioOverlay,
    canvasRef,
    overlayCanvasRef,
    linePositionsRef,
    activeDraggingLineRef,
  ]);

  return { maskDataUrl };
}
