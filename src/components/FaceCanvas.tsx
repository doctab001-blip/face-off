"use client";

import React, { useEffect, useRef } from "react";

interface FaceCanvasProps {
  imageSrc: string | null;
  landmarks?: Array<{ x: number; y: number; z: number }> | null;
  isGridOn?: boolean;
}

export function FaceCanvas({ imageSrc, landmarks, isGridOn }: FaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    if (!imageSrc.startsWith("blob:") && !imageSrc.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.src = imageSrc;

    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      if (landmarks && landmarks.length > 0) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        landmarks.forEach((pt) => {
          const x = pt.x * canvas.width;
          const y = pt.y * canvas.height;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        });

        const faceWidth = maxX - minX;
        const faceHeight = maxY - minY;
        const centerX = minX + faceWidth / 2;
        const centerY = minY + faceHeight / 2;

        ctx.save();
        ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
        ctx.lineWidth = Math.max(2, canvas.width * 0.002);
        ctx.strokeRect(
          centerX - (faceWidth * 1.6) / 2,
          centerY - (faceHeight * 1.6) / 2,
          faceWidth * 1.6,
          faceHeight * 1.6,
        );
        ctx.restore();
      }

      if (isGridOn) {
        ctx.save();
        ctx.strokeStyle = "rgba(251, 191, 36, 0.25)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          const x = (canvas.width / 3) * i;
          const y = (canvas.height / 3) * i;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
        ctx.restore();
      }
    };
  }, [imageSrc, landmarks, isGridOn]);

  return (
    <div className="relative w-full h-[520px] bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-2xl">
      {imageSrc ? (
        <canvas
          ref={canvasRef}
          className="max-h-full max-w-full object-contain"
          aria-label="Focused face baseline canvas"
        />
      ) : (
        <div className="text-center text-slate-500 text-xs font-mono">
          No image loaded
        </div>
      )}
    </div>
  );
}
