"use client";

import { useCallback, useEffect, useState } from "react";
import {
  detectFaceLandmarks,
  disposeFaceLandmarker,
} from "@/lib/mediapipe/faceLandmarker";
import type { FaceLandmarkPoint } from "@/lib/types";

interface UseFaceLandmarkerReturn {
  landmarks: FaceLandmarkPoint[] | null;
  isLoading: boolean;
  error: string | null;
  detect: (image: HTMLImageElement | HTMLCanvasElement) => Promise<void>;
  reset: () => void;
}

export function useFaceLandmarker(): UseFaceLandmarkerReturn {
  const [landmarks, setLandmarks] = useState<FaceLandmarkPoint[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      disposeFaceLandmarker();
    };
  }, []);

  const detect = useCallback(
    async (image: HTMLImageElement | HTMLCanvasElement) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await detectFaceLandmarks(image);

        if (!result) {
          setLandmarks(null);
          setError("No face detected. Please upload a clear, front-facing photo.");
          return;
        }

        setLandmarks(result.faceLandmarks[0]);
      } catch (err) {
        console.error("[useFaceLandmarker] Landmark detection failed:", err);
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
    [],
  );

  const reset = useCallback(() => {
    setLandmarks(null);
    setError(null);
  }, []);

  return { landmarks, isLoading, error, detect, reset };
}
