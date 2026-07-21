"use client";

import { useEffect, useRef } from "react";
import type { FaceLandmarkPoint } from "@/lib/types";

interface FaceCanvasProps {
  imageUrl: string | null;
  landmarks: FaceLandmarkPoint[] | null;
  showMesh?: boolean;
}

export function FaceCanvas({ imageUrl, landmarks, showMesh = true }: FaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    imageRef.current = img;

    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      if (landmarks && showMesh) {
        drawLandmarks(ctx, landmarks, canvas.width, canvas.height);
      }
    };
  }, [imageUrl, landmarks, showMesh]);

  if (!imageUrl) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40">
      <canvas
        ref={canvasRef}
        className="h-auto max-h-[520px] w-full object-contain"
      />
    </div>
  );
}

function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  width: number,
  height: number,
) {
  ctx.strokeStyle = "rgba(201, 168, 124, 0.35)";
  ctx.fillStyle = "rgba(201, 168, 124, 0.6)";
  ctx.lineWidth = 0.5;

  for (const point of landmarks) {
    const x = point.x * width;
    const y = point.y * height;

    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
