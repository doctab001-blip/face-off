import { createRouteHandler } from "@fal-ai/server-proxy/nextjs";

// GET/POST/PUT are all required — fal queue cancel + some storage flows use PUT.
export const { GET, POST, PUT } = createRouteHandler({
  allowedEndpoints: [
    "fal-ai/flux-general/**",
    "fal-ai/flux-pro/**",
  ],
});
