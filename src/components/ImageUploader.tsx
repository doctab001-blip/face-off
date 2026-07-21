"use client";

import { useRef } from "react";

interface ImageUploaderProps {
  onImageSelect: (file: File, previewUrl: string) => void;
  disabled?: boolean;
}

export function ImageUploader({ onImageSelect, disabled }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    onImageSelect(file, previewUrl);
  };

  return (
    <div
      className={`group relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/60 p-8 transition-colors hover:border-accent/50 hover:bg-surface-elevated/40 ${
        disabled ? "pointer-events-none opacity-50" : ""
      }`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Upload a face photo"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent transition-transform group-hover:scale-105">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-6 w-6"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 4.5 4.5 0 0 1 4.5 4.5v.75"
          />
        </svg>
      </div>
      <p className="font-display text-lg text-foreground">Upload a portrait</p>
      <p className="mt-2 max-w-xs text-center text-sm text-muted">
        Front-facing photo, good lighting. JPG, PNG, or WebP.
      </p>
    </div>
  );
}
