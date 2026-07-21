import type { ProcedureType } from "@/lib/types";

export const INPAINTING_MODEL = "fal-ai/flux-general/inpainting" as const;

export interface InpaintingInput {
  imageUrl: string;
  maskDataUrl: string;
  procedure: ProcedureType;
  intensity: number;
}

export interface InpaintingOutput {
  resultUrl: string;
  seed?: number;
}

const PROCEDURE_PROMPTS: Record<ProcedureType, string> = {
  "lip-enhancement":
    "Natural lip enhancement with subtle volume and definition, fuller balanced lips, photorealistic portrait, same person, same skin texture, same lighting, professional aesthetic result",
  rhinoplasty:
    "Subtle rhinoplasty refinement, straighter nasal bridge, refined nose tip, natural proportions, photorealistic portrait, same person, same skin texture, same lighting, professional aesthetic result",
};

function intensityToStrength(intensity: number): number {
  const normalized = Math.min(100, Math.max(0, intensity)) / 100;
  return Number((0.32 + normalized * 0.48).toFixed(2));
}

async function urlToFile(url: string, filename: string): Promise<File> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
}

export async function runProcedureInpainting(
  falClient: typeof import("@fal-ai/client").fal,
  input: InpaintingInput,
): Promise<InpaintingOutput> {
  const [imageFile, maskFile] = await Promise.all([
    urlToFile(input.imageUrl, "original.png"),
    urlToFile(input.maskDataUrl, "mask.png"),
  ]);

  const [uploadedImageUrl, uploadedMaskUrl] = await Promise.all([
    falClient.storage.upload(imageFile),
    falClient.storage.upload(maskFile),
  ]);

  const result = await falClient.subscribe(INPAINTING_MODEL, {
    input: {
      prompt: PROCEDURE_PROMPTS[input.procedure],
      image_url: uploadedImageUrl,
      mask_url: uploadedMaskUrl,
      strength: intensityToStrength(input.intensity),
      num_inference_steps: 28,
      guidance_scale: 3.5,
      output_format: "png",
    },
    logs: true,
  });

  const resultUrl = result.data?.images?.[0]?.url;

  if (!resultUrl) {
    throw new Error("Inpainting completed but no image was returned.");
  }

  return {
    resultUrl,
    seed: result.data?.seed,
  };
}
