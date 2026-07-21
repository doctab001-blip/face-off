"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import {
  createFeatureMaskCanvas,
  drawFeaturePathOutline,
  featureMaskToPng,
} from "@/lib/mediapipe/featureMask";
import type { FacialFeature } from "@/lib/mediapipe/featureIndices";
import {
  createImageElement,
  detectFaceLandmarks,
  waitForImageReady,
} from "@/lib/mediapipe/faceLandmarker";
import type { FaceLandmarkPoint } from "@/lib/types";

interface FaceFeatureMaskProps {
  /** When provided, skips internal upload and uses this image directly. */
  imageUrl?: string | null;
  /** Features to include in the generated mask. Defaults to both lips and nose. */
  selectedFeatures?: FacialFeature[];
  onFeaturesChange?: (features: FacialFeature[]) => void;
  onMaskReady?: (maskPng: string, maskCanvas: HTMLCanvasElement) => void;
  onLandmarksDetected?: (landmarks: FaceLandmarkPoint[]) => void;
  showUploader?: boolean;
}

const ALL_FEATURES: FacialFeature[] = ["lips", "nose"];

export function FaceFeatureMask({
  imageUrl: externalImageUrl,
  selectedFeatures: controlledFeatures,
  onFeaturesChange,
  onMaskReady,
  onLandmarksDetected,
  showUploader = true,
}: FaceFeatureMaskProps) {
  const [internalImageUrl, setInternalImageUrl] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<FaceLandmarkPoint[] | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalFeatures, setInternalFeatures] =
    useState<FacialFeature[]>(ALL_FEATURES);
  const [maskPng, setMaskPng] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const imageUrl = externalImageUrl ?? internalImageUrl;
  const selectedFeatures = controlledFeatures ?? internalFeatures;

  const setSelectedFeatures = useCallback(
    (features: FacialFeature[]) => {
      if (onFeaturesChange) {
        onFeaturesChange(features);
      } else {
        setInternalFeatures(features);
      }
    },
    [onFeaturesChange],
  );

  const toggleFeature = useCallback(
    (feature: FacialFeature) => {
      const next = selectedFeatures.includes(feature)
        ? selectedFeatures.filter((item) => item !== feature)
        : [...selectedFeatures, feature];
      setSelectedFeatures(next);
    },
    [selectedFeatures, setSelectedFeatures],
  );

  const processImage = useCallback(
    async (source: HTMLImageElement) => {
      setIsLoading(true);
      setError(null);
      setMaskPng(null);

      try {
        const readySource =
          source instanceof HTMLImageElement
            ? await waitForImageReady(source)
            : source;

        const result = await detectFaceLandmarks(readySource);

        if (!result?.faceLandmarks[0]) {
          setLandmarks(null);
          setError("No face detected. Please upload a clear, front-facing photo.");
          return;
        }

        const detected = result.faceLandmarks[0];
        setLandmarks(detected);
        setImageSize({
          width: readySource instanceof HTMLImageElement
            ? readySource.naturalWidth
            : readySource.width,
          height: readySource instanceof HTMLImageElement
            ? readySource.naturalHeight
            : readySource.height,
        });
        onLandmarksDetected?.(detected);
      } catch (err) {
        console.error("[FaceFeatureMask] Landmark detection failed:", err);
        setLandmarks(null);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to analyze face landmarks. Try a different photo or browser.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [onLandmarksDetected],
  );

  const handleImageSelect = useCallback(
    (_file: File, previewUrl: string) => {
      if (internalImageUrl) {
        URL.revokeObjectURL(internalImageUrl);
      }

      setLandmarks(null);
      setMaskPng(null);
      setInternalImageUrl(previewUrl);

      const img = createImageElement(previewUrl);
      imageRef.current = img;

      img.onload = () => {
        void processImage(img);
      };

      img.onerror = () => {
        console.error("[FaceFeatureMask] Image failed to load:", previewUrl);
        setError("Failed to load the uploaded image. Please try another file.");
        setIsLoading(false);
      };
    },
    [internalImageUrl, processImage],
  );

  useEffect(() => {
    if (!externalImageUrl || showUploader) return;

    const img = createImageElement(externalImageUrl);
    imageRef.current = img;

    img.onload = () => {
      void processImage(img);
    };

    img.onerror = () => {
      console.error("[FaceFeatureMask] Image failed to load:", externalImageUrl);
      setError("Failed to load the uploaded image. Please try another file.");
      setIsLoading(false);
    };
  }, [externalImageUrl, showUploader, processImage]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !imageUrl || !landmarks || !imageSize) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = imageRef.current;
    if (!img) return;

    canvas.width = imageSize.width;
    canvas.height = imageSize.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    for (const feature of selectedFeatures) {
      drawFeaturePathOutline(ctx, landmarks, feature, canvas.width, canvas.height);
    }
  }, [imageUrl, landmarks, imageSize, selectedFeatures]);

  useEffect(() => {
    if (!landmarks || !imageSize || selectedFeatures.length === 0) {
      setMaskPng(null);
      return;
    }

    const maskCanvas = createFeatureMaskCanvas(landmarks, {
      width: imageSize.width,
      height: imageSize.height,
      features: selectedFeatures,
    });

    const displayCanvas = maskCanvasRef.current;
    if (displayCanvas) {
      displayCanvas.width = imageSize.width;
      displayCanvas.height = imageSize.height;
      const displayCtx = displayCanvas.getContext("2d");
      displayCtx?.drawImage(maskCanvas, 0, 0);
    }

    const png = featureMaskToPng(maskCanvas);
    setMaskPng(png);
    onMaskReady?.(png, maskCanvas);
  }, [landmarks, imageSize, selectedFeatures, onMaskReady]);

  const handleDownloadMask = () => {
    if (!maskPng) return;

    const link = document.createElement("a");
    link.href = maskPng;
    link.download = "feature-mask.png";
    link.click();
  };

  return (
    <div className="flex flex-col gap-4">
      {showUploader && !imageUrl && (
        <ImageUploader onImageSelect={handleImageSelect} disabled={isLoading} />
      )}

      {isLoading && (
        <p className="text-center text-sm text-muted">Detecting 3D face landmarks…</p>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
          {error}
        </p>
      )}

      {landmarks && imageUrl && (
        <>
          <div className="flex flex-wrap gap-2">
            {ALL_FEATURES.map((feature) => {
              const active = selectedFeatures.includes(feature);

              return (
                <button
                  key={feature}
                  type="button"
                  onClick={() => toggleFeature(feature)}
                  className={`rounded-full border px-4 py-1.5 text-xs capitalize transition-colors ${
                    active
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : "border-border bg-surface-elevated/40 text-muted hover:border-accent/30"
                  }`}
                >
                  {feature}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-xs tracking-wide text-muted uppercase">
                Photo + feature paths
              </p>
              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40">
                <canvas
                  ref={previewCanvasRef}
                  className="h-auto max-h-[420px] w-full object-contain"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs tracking-wide text-muted uppercase">
                  Feathered mask
                </p>
                {maskPng && (
                  <button
                    type="button"
                    onClick={handleDownloadMask}
                    className="text-xs text-accent hover:underline"
                  >
                    Download PNG
                  </button>
                )}
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-black shadow-2xl shadow-black/40">
                <canvas
                  ref={maskCanvasRef}
                  className="h-auto max-h-[420px] w-full object-contain"
                />
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-muted">
            {landmarks.length} landmarks · {selectedFeatures.length} feature
            {selectedFeatures.length === 1 ? "" : "s"} selected · white regions are
            feathered for inpainting
          </p>
        </>
      )}
    </div>
  );
}
