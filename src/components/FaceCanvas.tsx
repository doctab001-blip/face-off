"use client";

import React, { useEffect, useRef } from "react";

interface FaceCanvasProps {
  imageSrc: string | null;
  landmarks?: Array<{ x: number; y: number; z: number }> | null;
  isGridOn?: boolean;
}

export function FaceCanvas({ imageSrc, landmarks, isGridOn }: FaceCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;

    img.onload = () => {
      // Set canvas resolution to image native dimensions
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      // Draw baseline image
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      // If MediaPipe landmarks exist, calculate face center
      if (landmarks && landmarks.length > 0) {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

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

        // Calculate 40% anatomical padding around face
        const cropSize = Math.max(faceWidth, faceHeight) * 1.6;
        const cropX = Math.max(0, centerX - cropSize / 2);
        const cropY = Math.max(0, centerY - cropSize / 2);
        const finalWidth = Math.min(canvas.width - cropX, cropSize);
        const finalHeight = Math.min(canvas.height - cropY, cropSize);

        // Store crop metrics on canvas for css zoom centering
        canvas.style.objectFit = "cover";
        canvas.style.objectPosition = `${(centerX / canvas.width) * 100}% ${(centerY / canvas.height) * 100}%`;
      }
    };
  }, [imageSrc, landmarks]);

  return (
    <div ref={containerRef} className="relative w-full h-[520px] bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-2xl">
      {imageSrc ? (
        <img
          src={imageSrc}
          alt="Focused Face Baseline"
          className="w-full h-full object-contain object-center transition-all duration-300"
          style={{
            // Ensure full face framing is prioritized over background elements
            maxHeight: "100%",
            maxWidth: "100%",
          }}
        />
      ) : (
        <div className="text-center text-slate-500 text-xs font-mono">
          No image loaded
        </div>
      )}
    </div>
  );
}