"use client";

import { useCallback, useRef, useState } from "react";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Before",
  afterLabel = "After",
  className = "",
}: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(96, Math.max(4, next)));
  }, []);

  const handlePointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePosition(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!isDragging) return;
    updatePosition(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    setIsDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40 ${className}`}
    >
      <div
        ref={containerRef}
        className="relative aspect-[3/4] w-full cursor-ew-resize select-none touch-none sm:aspect-[4/5]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="slider"
        aria-label="Before and after comparison"
        aria-valuemin={4}
        aria-valuemax={96}
        aria-valuenow={Math.round(position)}
      >
        {/* After (simulated result) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterSrc}
          alt={afterLabel}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />

        {/* Before (original) — clipped from the right */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={beforeSrc}
            alt={beforeLabel}
            className="h-full w-full object-cover"
            draggable={false}
          />
        </div>

        {/* Vertical divider + drag handle */}
        <div
          className="pointer-events-none absolute inset-y-0 z-10 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${position}%` }}
        >
          <div className="h-full w-0.5 bg-white/90 shadow-[0_0_12px_rgba(0,0,0,0.45)]" />
          <div
            className={`absolute top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/90 bg-accent shadow-lg transition-transform ${
              isDragging ? "scale-110" : ""
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5 text-background"
              aria-hidden="true"
            >
              <path strokeLinecap="round" d="M8 8l-4 4 4 4M16 8l4 4-4 4" />
            </svg>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-between px-4">
          <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {beforeLabel}
          </span>
          <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {afterLabel}
          </span>
        </div>

        <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-white/80 drop-shadow">
          Drag to compare
        </p>
      </div>
    </div>
  );
}
