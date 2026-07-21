import { createRouteHandler } from "@fal-ai/server-proxy/nextjs";

export const { GET, POST, PUT } = createRouteHandler({
  allowedEndpoints: ["fal-ai/flux-general/inpainting"],
});
