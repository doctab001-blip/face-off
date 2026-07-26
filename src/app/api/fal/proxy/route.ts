import { createRouteHandler } from "@fal-ai/server-proxy/nextjs";

export const { GET, POST } = createRouteHandler({
  allowedEndpoints: [
    "fal-ai/flux-general/**",
    "fal-ai/flux-pro/**",
  ],
});
