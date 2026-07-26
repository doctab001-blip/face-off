import {
  createFeatureMaskCanvas,
  featureMaskToPng,
} from "@/lib/mediapipe/featureMask";
import {
  createImageElement,
  detectFaceLandmarks,
  waitForImageReady,
} from "@/lib/mediapipe/faceLandmarker";
import type { FacialFeature } from "@/lib/mediapipe/featureIndices";
import { PROCEDURE_ID_FEATURES, type ProcedureId } from "@/lib/types";

/**
 * MediaPipe Face Landmarker assets are loaded from external CDNs in
 * `faceLandmarker.ts` (not from local /public folders):
 * - FilesetResolver.forVisionTasks:
 *   https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm
 * - FaceLandmarker modelAssetPath:
 *   https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
 */

/**
 * Heuristic fallback when MediaPipe cannot detect a face.
 * Uses approximate portrait proportions (not identity-accurate).
 */
async function generateHeuristicMask(
  imageSrc: string,
  selectedProcedures: ProcedureId[],
): Promise<string> {
  const img = createImageElement(imageSrc);
  await waitForImageReady(img);

  const canvas = document.createElement("canvas");
  const width = img.naturalWidth || 800;
  const height = img.naturalHeight || 800;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create canvas context for heuristic mask.");
  }

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "white";
  ctx.filter = "blur(12px)";

  for (const procId of selectedProcedures) {
    if (procId === "chin") {
      ctx.beginPath();
      ctx.ellipse(width * 0.5, height * 0.82, width * 0.12, height * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (procId === "cheeks") {
      for (const posX of [0.36, 0.64]) {
        ctx.beginPath();
        ctx.ellipse(
          width * posX,
          height * 0.48,
          width * 0.1,
          height * 0.06,
          posX > 0.5 ? -0.2 : 0.2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else if (procId === "rhinoplasty") {
      ctx.beginPath();
      ctx.ellipse(width * 0.5, height * 0.46, width * 0.055, height * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (procId === "upperLip" || procId === "lowerLip") {
      const posY = procId === "upperLip" ? 0.63 : 0.66;
      ctx.beginPath();
      ctx.ellipse(width * 0.5, height * posY, width * 0.08, height * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (procId === "eyebrows") {
      for (const posX of [0.35, 0.65]) {
        ctx.beginPath();
        ctx.ellipse(width * posX, height * 0.3, width * 0.08, height * 0.02, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return canvas.toDataURL("image/png");
}

export async function generateProcedureMask(
  imageSrc: string,
  selectedProcedures: ProcedureId[],
): Promise<{ maskDataUrl: string; usedLandmarks: boolean }> {
  if (selectedProcedures.length === 0) {
    throw new Error("Select at least one procedure before generating a mask.");
  }

  const features = Array.from(
    new Set(
      selectedProcedures.flatMap((id) => PROCEDURE_ID_FEATURES[id] ?? []),
    ),
  ) as FacialFeature[];

  try {
    const img = createImageElement(imageSrc);
    await waitForImageReady(img);
    const result = await detectFaceLandmarks(img);

    if (!result?.faceLandmarks?.[0]?.length) {
      const maskDataUrl = await generateHeuristicMask(imageSrc, selectedProcedures);
      return { maskDataUrl, usedLandmarks: false };
    }

    const landmarks = result.faceLandmarks[0];
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const maskCanvas = createFeatureMaskCanvas(landmarks, {
      width,
      height,
      features,
    });

    return {
      maskDataUrl: featureMaskToPng(maskCanvas),
      usedLandmarks: true,
    };
  } catch (err) {
    console.warn("[procedureMask] Landmark mask failed, using heuristic fallback:", err);
    const maskDataUrl = await generateHeuristicMask(imageSrc, selectedProcedures);
    return { maskDataUrl, usedLandmarks: false };
  }
}
