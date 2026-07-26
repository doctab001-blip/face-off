import { createRouteHandler } from "@fal-ai/server-proxy/nextjs";

export const { GET, POST, PUT } = createRouteHandler({
  // Limit proxied model calls to the fill pipeline used by the visualizer.
  allowedEndpoints: ["fal-ai/flux-pro/**"],
});
