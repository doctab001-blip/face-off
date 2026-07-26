import { fal } from "@fal-ai/client";
import { INPAINTING_MODEL } from "@/lib/inpainting";
import { formatFalError } from "@/lib/falErrors";

export const runtime = "nodejs";
export const maxDuration = 60;

type SimulateBody = {
  imageDataUrl?: string;
  maskDataUrl?: string;
  prompt?: string;
  intensity?: number;
};

function dataUrlToBytes(dataUrl: string): {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
} {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid image payload. Expected a base64 data URL.");
  }
  const contentType = match[1] || "image/png";
  const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
  if (bytes.byteLength <= 0) {
    throw new Error("Image payload was empty.");
  }
  // Vercel request body limit is ~4.5MB; keep a safety margin.
  if (bytes.byteLength > 4 * 1024 * 1024) {
    throw new Error(
      `Image is too large (${Math.round(bytes.byteLength / 1024)}KB). Please use a smaller photo.`,
    );
  }
  const extension = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";
  return { bytes, contentType, extension };
}

async function uploadBytes(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
): Promise<string> {
  const copy = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const file = new File([copy], filename, { type: contentType });
  return fal.storage.upload(file);
}

export async function POST(request: Request) {
  if (!process.env.FAL_KEY) {
    return Response.json(
      { error: "FAL_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  fal.config({
    credentials: process.env.FAL_KEY,
  });

  try {
    const body = (await request.json()) as SimulateBody;
    if (!body.imageDataUrl || !body.maskDataUrl || !body.prompt?.trim()) {
      return Response.json(
        { error: "Missing imageDataUrl, maskDataUrl, or prompt." },
        { status: 400 },
      );
    }

    const image = dataUrlToBytes(body.imageDataUrl);
    const mask = dataUrlToBytes(body.maskDataUrl);

    const [imageUrl, maskUrl] = await Promise.all([
      uploadBytes(image.bytes, `original.${image.extension}`, image.contentType),
      uploadBytes(mask.bytes, `mask.${mask.extension}`, mask.contentType),
    ]);

    // fal-ai/flux-pro/v1/fill only accepts a narrow input schema — no negative_prompt/strength.
    const result = await fal.subscribe(INPAINTING_MODEL, {
      input: {
        prompt: body.prompt.trim(),
        image_url: imageUrl,
        mask_url: maskUrl,
      },
      logs: true,
    });

    const resultUrl = result.data?.images?.[0]?.url;
    if (!resultUrl) {
      return Response.json(
        { error: "Inpainting completed but no image was returned." },
        { status: 502 },
      );
    }

    return Response.json({
      resultUrl,
      seed: result.data?.seed,
      requestId: result.requestId,
    });
  } catch (err: unknown) {
    console.error("[api/simulate] failed:", err);
    return Response.json({ error: formatFalError(err) }, { status: 502 });
  }
}
