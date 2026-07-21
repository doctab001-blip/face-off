import {
  FEATURE_LANDMARK_MAP,
  type FacialFeature,
} from "@/lib/mediapipe/featureIndices";
import type { FaceLandmarkPoint } from "@/lib/types";

export interface FeatureMaskOptions {
  width: number;
  height: number;
  features: FacialFeature[];
  /** Gaussian blur radius in pixels for feathered edges. */
  blurRadius?: number;
}

function toPixel(point: FaceLandmarkPoint, width: number, height: number) {
  return { x: point.x * width, y: point.y * height };
}

export function traceClosedFeaturePath(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  indices: readonly number[],
  width: number,
  height: number,
): void {
  if (indices.length < 3) return;

  const [firstIndex, ...restIndices] = indices;
  const first = toPixel(landmarks[firstIndex], width, height);

  ctx.beginPath();
  ctx.moveTo(first.x, first.y);

  for (const index of restIndices) {
    const point = toPixel(landmarks[index], width, height);
    ctx.lineTo(point.x, point.y);
  }

  ctx.closePath();
}

export function drawFeaturePathOutline(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  feature: FacialFeature,
  width: number,
  height: number,
  strokeStyle = "rgba(201, 168, 124, 0.85)",
): void {
  const indices = FEATURE_LANDMARK_MAP[feature];

  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = Math.max(1.5, Math.min(width, height) * 0.002);
  traceClosedFeaturePath(ctx, landmarks, indices, width, height);
  ctx.stroke();
  ctx.restore();
}

/**
 * Renders a white-on-black inpainting mask with feathered edges for the
 * selected facial features.
 */
export function createFeatureMaskCanvas(
  landmarks: FaceLandmarkPoint[],
  options: FeatureMaskOptions,
): HTMLCanvasElement {
  const { width, height, features } = options;
  const blurRadius =
    options.blurRadius ?? Math.max(6, Math.round(Math.min(width, height) * 0.018));

  const sharpCanvas = document.createElement("canvas");
  sharpCanvas.width = width;
  sharpCanvas.height = height;

  const sharpCtx = sharpCanvas.getContext("2d");
  if (!sharpCtx) {
    throw new Error("Could not acquire 2D canvas context for feature mask.");
  }

  sharpCtx.fillStyle = "#000000";
  sharpCtx.fillRect(0, 0, width, height);

  sharpCtx.fillStyle = "#ffffff";
  for (const feature of features) {
    const indices = FEATURE_LANDMARK_MAP[feature];
    traceClosedFeaturePath(sharpCtx, landmarks, indices, width, height);
    sharpCtx.fill();
  }

  const featheredCanvas = document.createElement("canvas");
  featheredCanvas.width = width;
  featheredCanvas.height = height;

  const featheredCtx = featheredCanvas.getContext("2d");
  if (!featheredCtx) {
    throw new Error("Could not acquire 2D canvas context for feathered mask.");
  }

  featheredCtx.fillStyle = "#000000";
  featheredCtx.fillRect(0, 0, width, height);
  featheredCtx.filter = `blur(${blurRadius}px)`;
  featheredCtx.drawImage(sharpCanvas, 0, 0);
  featheredCtx.filter = "none";

  return featheredCanvas;
}

export function featureMaskToPng(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}
