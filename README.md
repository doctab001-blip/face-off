# Face-off.ai

B2B aesthetic procedure simulator for medical clinics.

## Stack

- **Next.js** app router UI (`src/app/page.tsx`)
- **MediaPipe Face Landmarker** for anatomical inpainting masks
- **fal.ai FLUX.1 Pro Fill** via secure server proxy (`/api/fal/proxy`)

## Setup

```bash
npm install
cp .env.example .env.local
# set FAL_KEY=key_id:key_secret
npm run dev
```

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `FAL_KEY` | Yes | fal.ai API key used by `@fal-ai/server-proxy` |

## Notes

- Facility registration / portals are **session-local demo state** (in-memory React state).
- Landmark masking falls back to approximate portrait regions if MediaPipe cannot detect a face.
- `src/components/VisualizerApp.tsx` is a legacy Gemini demo and is **not** mounted by the app.
