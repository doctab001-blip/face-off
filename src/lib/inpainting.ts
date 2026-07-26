import type { ProcedureId, ProcedureType } from "@/lib/types";

export const INPAINTING_MODEL = "fal-ai/flux-pro/v1/fill" as const;

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

const PROCEDURE_PROMPTS: Record<string, string> = {
  "lip-enhancement":
    "Natural fuller balanced lips with subtle volume and definition, photorealistic portrait, same person, same skin texture, same lighting",
  rhinoplasty:
    "Subtle refined nose with straighter nasal bridge and natural tip proportions, photorealistic portrait, same person, same skin texture, same lighting",
  chin: "Subtle refined chin with natural anterior projection, photorealistic portrait, same person, same skin texture, same lighting",
  cheeks:
    "Subtle refined cheek contour with smooth midface balance, photorealistic portrait, same person, same skin texture, same lighting",
  eyebrows:
    "Subtle refined brow arch with symmetrical balance, photorealistic portrait, same person, same skin texture, same lighting",
  upperLip:
    "Subtle refined upper lip volume and cupid's bow definition, photorealistic portrait, same person, same skin texture, same lighting",
  lowerLip:
    "Subtle refined lower lip cushion volume, photorealistic portrait, same person, same skin texture, same lighting",
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
    "Subtle natural photorealistic facial refinement, same person, same skin texture, same lighting";

  // FluxProFillInput typings omit negative_prompt, but the API accepts it at runtime.
  const result = await falClient.subscribe(INPAINTING_MODEL, {
    input: {
      prompt,
      image_url: uploadedImageUrl,
      mask_url: uploadedMaskUrl,
      negative_prompt: INPAINTING_NEGATIVE_PROMPT,
    } as {
      prompt: string;
      image_url: string;
      mask_url: string;
      negative_prompt: string;
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
