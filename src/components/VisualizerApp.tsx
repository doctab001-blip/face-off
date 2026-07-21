"use client";

import { useCallback, useMemo, useState } from "react";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { Header } from "@/components/Header";
import { ImageUploader } from "@/components/ImageUploader";
import { FaceFeatureMask } from "@/components/FaceFeatureMask";
import { ProcedurePanel } from "@/components/ProcedurePanel";
import { fal } from "@/lib/fal";
import { runProcedureInpainting } from "@/lib/inpainting";
import type { FacialFeature } from "@/lib/mediapipe/featureIndices";
import { PROCEDURE_FEATURES, type ProcedureType } from "@/lib/types";

export function VisualizerApp() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [selectedProcedure, setSelectedProcedure] = useState<ProcedureType | null>(
    null,
  );
  const [intensity, setIntensity] = useState(50);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [maskPng, setMaskPng] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<FacialFeature[]>([
    "lips",
    "nose",
  ]);

  const activeFeatures = useMemo(() => {
    if (!selectedProcedure) return selectedFeatures;
    return PROCEDURE_FEATURES[selectedProcedure];
  }, [selectedProcedure, selectedFeatures]);

  const handleImageSelect = useCallback(
    (_file: File, previewUrl: string) => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }

      setMaskPng(null);
      setResultUrl(null);
      setGenerationError(null);
      setImageUrl(previewUrl);
    },
    [imageUrl],
  );

  const handleProcedureSelect = useCallback((procedure: ProcedureType) => {
    setSelectedProcedure(procedure);
    setSelectedFeatures(PROCEDURE_FEATURES[procedure]);
    setResultUrl(null);
    setGenerationError(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!selectedProcedure || !imageUrl || !maskPng) return;

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const result = await runProcedureInpainting(fal, {
        imageUrl,
        maskDataUrl: maskPng,
        procedure: selectedProcedure,
        intensity,
      });

      setResultUrl(result.resultUrl);
    } catch (err) {
      setResultUrl(null);
      setGenerationError(
        err instanceof Error
          ? err.message
          : "Failed to generate procedure preview. Check your FAL_KEY and try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  }, [selectedProcedure, imageUrl, maskPng, intensity]);

  const handleResetComparison = () => {
    setResultUrl(null);
    setGenerationError(null);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <div className="mb-10 animate-fade-up text-center">
          <h1 className="font-display text-4xl tracking-tight text-foreground sm:text-5xl">
            Visualize your aesthetic journey
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            Upload a portrait, choose Lip Enhancement or Rhinoplasty, and compare
            your simulated result with an interactive before-and-after slider.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <section className="flex flex-col gap-4">
            {!imageUrl ? (
              <ImageUploader onImageSelect={handleImageSelect} />
            ) : resultUrl ? (
              <>
                <BeforeAfterSlider
                  beforeSrc={imageUrl}
                  afterSrc={resultUrl}
                  beforeLabel="Original"
                  afterLabel="Simulated"
                />
                <button
                  type="button"
                  onClick={handleResetComparison}
                  className="self-center text-sm text-muted hover:text-accent"
                >
                  ← Back to mask preview
                </button>
              </>
            ) : (
              <FaceFeatureMask
                imageUrl={imageUrl}
                showUploader={false}
                selectedFeatures={activeFeatures}
                onFeaturesChange={setSelectedFeatures}
                onMaskReady={(png) => setMaskPng(png)}
              />
            )}

            {isGenerating && (
              <div className="rounded-xl border border-border bg-surface-elevated/60 px-4 py-6 text-center">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                <p className="text-sm text-foreground">
                  Running fal.ai inpainting…
                </p>
                <p className="mt-1 text-xs text-muted">
                  This may take 20–40 seconds depending on queue load.
                </p>
              </div>
            )}

            {generationError && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
                {generationError}
              </p>
            )}
          </section>

          <ProcedurePanel
            selected={selectedProcedure}
            intensity={intensity}
            onSelect={handleProcedureSelect}
            onIntensityChange={setIntensity}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            disabled={!maskPng || isGenerating}
          />
        </div>
      </main>
    </div>
  );
}
