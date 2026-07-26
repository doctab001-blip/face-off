import { fal } from "@fal-ai/client";
import { formatFalError } from "@/lib/falErrors";

export const runtime = "nodejs";

/**
 * Server-side fal storage upload.
 * Avoids browser → fal.media PUT (which Safari often fails with an empty error).
 */
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
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return Response.json(
        { error: "Expected multipart/form-data file upload." },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Missing file upload." }, { status: 400 });
    }

    if (file.size <= 0) {
      return Response.json({ error: "Uploaded file is empty." }, { status: 400 });
    }

    const url = await fal.storage.upload(file);
    return Response.json({ url });
  } catch (err: unknown) {
    console.error("[api/fal/upload] Upload failed:", err);
    return Response.json(
      { error: formatFalError(err) },
      { status: 502 },
    );
  }
}
