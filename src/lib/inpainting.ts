import type { ProcedureId, ProcedureType } from "@/lib/types";

export const INPAINTING_MODEL = "fal-ai/flux-general/inpainting" as const;

export const INPAINTING_NEGATIVE_PROMPT =
  "piercings, metal, jewelry, surgical tape, bandages, splints, medical instruments, bindi, red dots, unnatural blemishes, watermarks, text" as const;

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

/** Healed visual anatomy only — no surgical / clinical procedure names. */
const PROCEDURE_PROMPTS: Record<string, string> = {
  "lip-enhancement":
    "Naturally fuller balanced lips with soft volume and clean vermilion edges, photorealistic portrait, same person, same skin texture, same lighting",
  rhinoplasty:
    "Naturally refined nose with a smooth straight bridge and soft tip, unbroken clean skin, photorealistic portrait, same person, same skin texture, same lighting",
  chin: "Naturally refined chin with balanced lower-face contour, photorealistic portrait, same person, same skin texture, same lighting",
  cheeks:
    "Naturally refined cheek contour with smooth midface balance, photorealistic portrait, same person, same skin texture, same lighting",
  eyebrows:
    "Naturally refined brow arch with symmetrical soft edges, photorealistic portrait, same person, same skin texture, same lighting",
  upperLip:
    "Naturally refined upper lip with soft cupid's bow definition, photorealistic portrait, same person, same skin texture, same lighting",
  lowerLip:
    "Naturally refined lower lip with soft cushion volume, photorealistic portrait, same person, same skin texture, same lighting",
};

function intensityToStrength(intensity: number): number {
  const normalized = Math.min(100, Math.max(0, intensity)) / 100;
  return Number((0.55 + normalized * 0.35).toFixed(2));
}

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
    "Naturally healed facial anatomy with clean unbroken skin, photorealistic portrait, same person, same skin texture, same lighting";

  const result = await falClient.subscribe(INPAINTING_MODEL, {
    input: {
      prompt,
      negative_prompt: INPAINTING_NEGATIVE_PROMPT,
      image_url: uploadedImageUrl,
      mask_url: uploadedMaskUrl,
      strength: intensityToStrength(input.intensity),
      num_inference_steps: 28,
      guidance_scale: 3.5,
      output_format: "png",
      enable_safety_checker: true,
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
