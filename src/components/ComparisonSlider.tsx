"use client";

import type { Dispatch, MouseEvent, RefObject, SetStateAction } from "react";
import type { FeatureType } from "@/components/constants";

export interface ComparisonSliderProps {
  croppedImageSrc: string;
  resultImage: string | null;
  selectedFeatures: FeatureType[];
  sliderPos: number;
  setSliderPos: Dispatch<SetStateAction<number>>;
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  onCanvasMouseDown: (e: MouseEvent<HTMLCanvasElement>) => void;
  onCanvasMouseMove: (e: MouseEvent<HTMLCanvasElement>) => void;
  onCanvasMouseUp: () => void;
  onExportPDF: () => void;
}

export default function ComparisonSlider({
  croppedImageSrc,
  resultImage,
  selectedFeatures,
  sliderPos,
  setSliderPos,
  overlayCanvasRef,
  onCanvasMouseDown,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onExportPDF,
}: ComparisonSliderProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm font-medium text-amber-200">
          {resultImage
            ? "Multi-Procedure Before & After Comparison:"
            : "Interactive Facial Canvas (Drag Lines to Adjust):"}
        </p>
        {resultImage && (
          <button
            type="button"
            onClick={onExportPDF}
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

            <div
              className="absolute inset-y-0 left-0 overflow-hidden"
              style={{ width: `${sliderPos}%` }}
            >
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
              onMouseDown={onCanvasMouseDown}
              onMouseMove={onCanvasMouseMove}
              onMouseUp={onCanvasMouseUp}
              className="absolute inset-0 w-full h-full cursor-ns-resize"
            />
          </div>
        )}
      </div>
    </div>
  );
}
