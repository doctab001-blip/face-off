import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

/** External CDN — do not use local /public MediaPipe assets. */
const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";

/** External CDN model asset — do not use local /public MediaPipe assets. */
const FACE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const LANDMARKER_OPTIONS = {
  outputFaceBlendshapes: true,
  runningMode: "IMAGE" as const,
  numFaces: 1,
};

type Delegate = "GPU" | "CPU";

let landmarkerInstance: FaceLandmarker | null = null;
let activeDelegate: Delegate | null = null;

function isImageReady(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

export function waitForImageReady(
  image: HTMLImageElement,
): Promise<HTMLImageElement> {
  if (isImageReady(image)) {
    return Promise.resolve(image);
  }

  return new Promise((resolve, reject) => {
    const onLoad = () => {
      cleanup();
      if (isImageReady(image)) {
        resolve(image);
      } else {
        reject(
          new Error(
            `Image loaded but has invalid dimensions (${image.naturalWidth}x${image.naturalHeight}).`,
          ),
        );
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error("Image failed to load before landmark detection."));
    };

    const cleanup = () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };

    image.addEventListener("load", onLoad);
    image.addEventListener("error", onError);
  });
}

export function createImageElement(src: string): HTMLImageElement {
  const img = new Image();

  // crossOrigin on blob:/data: URLs can break loading in Safari
  if (!src.startsWith("blob:") && !src.startsWith("data:")) {
    img.crossOrigin = "anonymous";
  }

  img.src = src;
  return img;
}

async function loadVisionTasks() {
  return FilesetResolver.forVisionTasks(WASM_CDN);
}

async function createLandmarker(delegate: Delegate): Promise<FaceLandmarker> {
  const vision = await loadVisionTasks();

  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL,
      delegate,
    },
    ...LANDMARKER_OPTIONS,
  });
}

async function initializeLandmarker(delegates: Delegate[]): Promise<FaceLandmarker> {
  let lastError: unknown;

  for (const delegate of delegates) {
    try {
      const instance = await createLandmarker(delegate);
      landmarkerInstance = instance;
      activeDelegate = delegate;
      console.info(`[FaceLandmarker] Initialized with ${delegate} delegate.`);
      return instance;
    } catch (err) {
      lastError = err;
      console.warn(
        `[FaceLandmarker] Failed to initialize with ${delegate} delegate:`,
        err,
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to initialize Face Landmarker with any delegate.");
}

async function getLandmarker(forceDelegate?: Delegate): Promise<FaceLandmarker> {
  if (landmarkerInstance && activeDelegate) {
    if (!forceDelegate || activeDelegate === forceDelegate) {
      return landmarkerInstance;
    }

    disposeFaceLandmarker();
  }

  if (forceDelegate === "CPU") {
    return initializeLandmarker(["CPU"]);
  }

  if (forceDelegate === "GPU") {
    return initializeLandmarker(["GPU"]);
  }

  return initializeLandmarker(["GPU", "CPU"]);
}

function runDetection(
  landmarker: FaceLandmarker,
  image: HTMLImageElement | HTMLCanvasElement,
): FaceLandmarkerResult {
  return landmarker.detect(image);
}

export async function detectFaceLandmarks(
  image: HTMLImageElement | HTMLCanvasElement,
): Promise<FaceLandmarkerResult | null> {
  let readyImage: HTMLImageElement | HTMLCanvasElement = image;

  if (image instanceof HTMLImageElement) {
    readyImage = await waitForImageReady(image);
  }

  try {
    let landmarker = await getLandmarker();

    try {
      const result = runDetection(landmarker, readyImage);
      if (!result.faceLandmarks.length) {
        return null;
      }
      return result;
    } catch (detectError) {
      if (activeDelegate !== "GPU") {
        throw detectError;
      }

      console.warn(
        "[FaceLandmarker] GPU detection failed, retrying with CPU delegate:",
        detectError,
      );

      disposeFaceLandmarker();
      landmarker = await getLandmarker("CPU");

      const result = runDetection(landmarker, readyImage);
      if (!result.faceLandmarks.length) {
        return null;
      }
      return result;
    }
  } catch (err) {
    console.error("[FaceLandmarker] Detection failed:", err);
    throw err instanceof Error
      ? err
      : new Error("Failed to analyze face landmarks.");
  }
}

export function disposeFaceLandmarker(): void {
  landmarkerInstance?.close();
  landmarkerInstance = null;
  activeDelegate = null;
}
