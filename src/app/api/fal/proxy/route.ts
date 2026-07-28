import { createRouteHandler } from "@fal-ai/server-proxy/nextjs";

// Headroom for a slow hop to fal. Each call through here is short — the client submits to the
// queue and then polls, so no single request spans the whole inference — but a cold upstream
// can still stall one of them past the default ceiling.
export const maxDuration = 60;

// GET/POST/PUT are all required — fal queue cancel + some storage flows use PUT.
export const { GET, POST, PUT } = createRouteHandler({
  allowedEndpoints: [
    "fal-ai/flux-general/**",
    "fal-ai/flux-pro/**",
  ],
});
