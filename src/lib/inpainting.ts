import type { ProcedureId, ProcedureType } from "@/lib/types";
import { formatFalError } from "@/lib/falErrors";

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

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`Failed to read local image data (${response.status}).`);
  }
  const blob = await response.blob();
  if (blob.size <= 0) {
    throw new Error("Local image data was empty.");
  }
  return new File([blob], filename, { type: blob.type || "image/png" });
}

/** Downscale very large portraits before upload to keep fal payloads reliable. */
async function maybeDownscaleImageDataUrl(
  dataUrl: string,
  maxDim = 1280,
): Promise<string> {
  if (typeof document === "undefined") return dataUrl;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Failed to decode image for resize."));
    el.src = dataUrl;
  });

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) return dataUrl;

  const longest = Math.max(width, height);
  if (longest <= maxDim) return dataUrl;

  const scale = maxDim / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function uploadViaServer(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch("/api/fal/upload", {
    method: "POST",
    body: form,
  });

  let payload: { url?: string; error?: string } = {};
  try {
    payload = (await response.json()) as { url?: string; error?: string };
  } catch {
    // ignore JSON parse errors
  }

  if (!response.ok || !payload.url) {
    throw new Error(
      payload.error ||
        `Server upload failed (HTTP ${response.status}). Check FAL_KEY on Vercel.`,
    );
  }

  return payload.url;
}

export async function runProcedureInpainting(
  falClient: typeof import("@fal-ai/client").fal,
  input: InpaintingInput,
): Promise<InpaintingOutput> {
  try {
    const resizedImageUrl = await maybeDownscaleImageDataUrl(input.imageUrl);

    // Keep mask aligned to the (possibly resized) image dimensions.
    const maskSource =
      resizedImageUrl === input.imageUrl
        ? input.maskDataUrl
        : await regenerateMaskForResizedImage(resizedImageUrl, input.maskDataUrl);

    const [imageFile, maskFile] = await Promise.all([
      dataUrlToFile(resizedImageUrl, "original.jpg"),
      dataUrlToFile(maskSource, "mask.png"),
    ]);

    const [uploadedImageUrl, uploadedMaskUrl] = await Promise.all([
      uploadViaServer(imageFile),
      uploadViaServer(maskFile),
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
  } catch (err: unknown) {
    throw new Error(formatFalError(err));
  }
}

/**
 * When the source image is resized, scale the existing mask canvas to match.
 */
async function regenerateMaskForResizedImage(
  resizedImageDataUrl: string,
  originalMaskDataUrl: string,
): Promise<string> {
  const [image, mask] = await Promise.all([
    loadHtmlImage(resizedImageDataUrl),
    loadHtmlImage(originalMaskDataUrl),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return originalMaskDataUrl;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for mask resize."));
    img.src = src;
  });
}
