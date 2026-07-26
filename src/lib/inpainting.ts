import type { ProcedureId, ProcedureType } from "@/lib/types";

export const INPAINTING_MODEL = "fal-ai/flux-pro/v1/fill" as const;

export interface InpaintingInput {
  imageUrl: string;
  maskDataUrl: string;
  procedure: ProcedureType | ProcedureId;
  intensity: number;
  /** Optional multi-procedure prompt override (preferred for the visualizer). */
  promptOverride?: string;
}

export interface InpaintingOutput {
  resultUrl: string;
  seed?: number;
}

const PROCEDURE_PROMPTS: Record<string, string> = {
  "lip-enhancement":
    "Natural lip enhancement with subtle volume and definition, fuller balanced lips, photorealistic portrait, same person, same skin texture, same lighting, professional aesthetic result",
  rhinoplasty:
    "Subtle rhinoplasty refinement, straighter nasal bridge, refined nose tip, natural proportions, photorealistic portrait, same person, same skin texture, same lighting, professional aesthetic result",
  chin: "Subtle chin mentoplasty refinement with natural anterior projection, photorealistic portrait, same person, same skin texture, same lighting",
  cheeks:
    "Subtle malar cheek projection and smooth subzygomatic contour, photorealistic portrait, same person, same skin texture, same lighting",
  eyebrows:
    "Subtle eyebrow arch lift and symmetrical brow refinement, photorealistic portrait, same person, same skin texture, same lighting",
  upperLip:
    "Subtle upper lip volume and cupid's bow definition, photorealistic portrait, same person, same skin texture, same lighting",
  lowerLip:
    "Subtle lower lip cushion volume enhancement, photorealistic portrait, same person, same skin texture, same lighting",
};

async function urlToFile(url: string, filename: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch asset for upload (${response.status}).`);
  }
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

  const prompt =
    input.promptOverride ??
    PROCEDURE_PROMPTS[input.procedure] ??
    "Subtle natural photorealistic aesthetic facial refinement, same person, same skin texture, same lighting";

  const result = await falClient.subscribe(INPAINTING_MODEL, {
    input: {
      prompt,
      image_url: uploadedImageUrl,
      mask_url: uploadedMaskUrl,
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
