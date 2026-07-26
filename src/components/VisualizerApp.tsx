"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { fal } from "@fal-ai/client";
import {
  FEATURE_INDICES,
  NOSE_LANDMARKS,
  CHEEK_LANDMARKS,
  CHIN_LANDMARKS,
  NOSE_TECHNIQUES,
  CHEEK_TECHNIQUES,
  CHEEK_DOSAGE_MAP,
  CHIN_TECHNIQUES,
  BROW_TECHNIQUES,
  LIP_TECHNIQUES,
  type FeatureType,
} from "./constants";

fal.config({ proxyUrl: "/api/fal/proxy" });

export default function VisualizerApp() {
  const [selectedFeatures, setSelectedFeatures] = useState<FeatureType[]>(["cheeks"]);
  const [browTechnique, setBrowTechnique] = useState<keyof typeof BROW_TECHNIQUES>("ombre_powder");
  const [browThickness, setBrowThickness] = useState<"thin" | "medium" | "thick">("medium");
  const [lipTechnique, setLipTechnique] = useState<keyof typeof LIP_TECHNIQUES>("russian");
  const [lipDosage, setLipDosage] = useState<string>("0.50ml");
  const [noseTechnique, setNoseTechnique] = useState<keyof typeof NOSE_TECHNIQUES>("straight_slim");
  const [cheekTechnique, setCheekTechnique] = useState<keyof typeof CHEEK_TECHNIQUES>("malar_volume");
  const [cheekDosage, setCheekDosage] = useState<string>("1.00ml");
  const [chinTechnique, setChinTechnique] = useState<keyof typeof CHIN_TECHNIQUES>("anterior_projection");
  const [viewMode, setViewMode] = useState<"split" | "before" | "after">("split");

  const [croppedImageSrc, setCroppedImageSrc] = useState<string | null>(null);
  const [mappedLandmarks, setMappedLandmarks] = useState<Array<{ x: number; y: number }> | null>(null);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function initMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          numFaces: 1,
        });
        if (isMounted) landmarkerRef.current = faceLandmarker;
      } catch {
        if (isMounted) setErrorMessage("Failed to load facial recognition engine.");
      }
    }
    initMediaPipe();
    return () => {
      isMounted = false;
      if (landmarkerRef.current) landmarkerRef.current.close();
    };
  }, []);

  const toggleFeature = (feat: FeatureType) => {
    if (selectedFeatures.includes(feat)) {
      if (selectedFeatures.length > 1) setSelectedFeatures(selectedFeatures.filter((f) => f !== feat));
    } else {
      setSelectedFeatures([...selectedFeatures, feat]);
    }
  };

  const updateViewportAndCrop = useCallback((img: HTMLImageElement, pixelLms: Array<{ x: number; y: number }>) => {
    const origW = img.width;
    const origH = img.height;

    const glabellaY = pixelLms[9].y;
    const subnasaleY = pixelLms[2].y;
    const leftCheekX = pixelLms[234].x;
    const rightCheekX = pixelLms[454].x;

    const midfaceH = Math.abs(subnasaleY - glabellaY);
    const calcTrichionY = Math.max(0, glabellaY - midfaceH);
    const calcMentonY = Math.min(origH, subnasaleY + midfaceH * 1.1);

    const faceWidth = Math.abs(rightCheekX - leftCheekX);
    const faceHeight = Math.abs(calcMentonY - calcTrichionY);

    const padX = faceWidth * 0.35;
    const padTop = faceHeight * 0.25;
    const padBottom = faceHeight * 0.25;

    // Source coordinates from original image
    const sourceCropX = Math.max(0, leftCheekX - padX);
    const sourceCropY = Math.max(0, calcTrichionY - padTop);
    const sourceCropW = Math.min(origW - sourceCropX, faceWidth + padX * 2);
    const sourceCropH = Math.min(origH - sourceCropY, faceHeight + padTop + padBottom);

    // AI PIPELINE LIMIT: Clamp to ~1 Megapixel (1024px max dimension)
    const MAX_DIMENSION = 1024;
    let downscaleFactor = 1;
    if (sourceCropW > MAX_DIMENSION || sourceCropH > MAX_DIMENSION) {
      downscaleFactor = Math.min(MAX_DIMENSION / sourceCropW, MAX_DIMENSION / sourceCropH);
    }

    // Target Canvas Dimensions (Enforcing PyTorch 64px multiple)
    const targetCropW = Math.max(64, Math.floor((sourceCropW * downscaleFactor) / 64) * 64);
    const targetCropH = Math.max(64, Math.floor((sourceCropH * downscaleFactor) / 64) * 64);

    // Recalculate exact scaling multiplier due to the 64px rounding
    const exactScaleX = targetCropW / sourceCropW;
    const exactScaleY = targetCropH / sourceCropH;

    // Scale facial landmarks to match the resized canvas
    const mapped = pixelLms.map((pt) => ({
      x: (pt.x - sourceCropX) * exactScaleX,
      y: (pt.y - sourceCropY) * exactScaleY,
    }));

    setMappedLandmarks(mapped);

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = targetCropW;
    cropCanvas.height = targetCropH;
    const cropCtx = cropCanvas.getContext("2d");
    if (cropCtx) {
      // drawImage handles the downscaling automatically: (image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
      cropCtx.drawImage(img, sourceCropX, sourceCropY, sourceCropW, sourceCropH, 0, 0, targetCropW, targetCropH);
      setCroppedImageSrc(cropCanvas.toDataURL("image/png"));
    }
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setResultImage(null);
    setCroppedImageSrc(null);
    setMappedLandmarks(null);
    setViewMode("split");

    const file = e.target.files?.[0];
    if (!file || !landmarkerRef.current) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          const results = landmarkerRef.current!.detect(img);
          if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
            const rawLms = results.faceLandmarks[0];
            const pixelLms = rawLms.map((pt: { x: number; y: number }) => ({
              x: pt.x * img.width,
              y: pt.y * img.height,
            }));
            updateViewportAndCrop(img, pixelLms);
          } else {
            setErrorMessage("No face detected. Please upload a clear front-facing portrait.");
          }
        } catch {
          setErrorMessage("Failed to process facial landmarks.");
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!mappedLandmarks || !croppedImageSrc || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const mainCanvas = canvasRef.current!;
      mainCanvas.width = img.width;
      mainCanvas.height = img.height;
      const mainCtx = mainCanvas.getContext("2d");
      if (!mainCtx) return;

      // 1. Force Solid Black Background
      mainCtx.fillStyle = "#000000";
      mainCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);

      // 2. Setup direct drawing context with blur to bypass Safari bugs
      mainCtx.filter = "blur(12px)";
      mainCtx.lineCap = "round";
      mainCtx.lineJoin = "round";
      mainCtx.strokeStyle = "#FFFFFF";
      mainCtx.fillStyle = "#FFFFFF";

      // 3. Draw massive white strokes directly over anatomical landmarks
      selectedFeatures.forEach((feat) => {
        if (feat === "brows") {
          mainCtx.lineWidth = 24;
          const leftBrow = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
          const rightBrow = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
          [leftBrow, rightBrow].forEach((brow) => {
            mainCtx.beginPath();
            mainCtx.moveTo(mappedLandmarks[brow[0]].x, mappedLandmarks[brow[0]].y);
            brow.forEach((idx) => mainCtx.lineTo(mappedLandmarks[idx].x, mappedLandmarks[idx].y));
            mainCtx.stroke();
          });
        } else if (feat === "nose") {
          mainCtx.lineWidth = 65;
          mainCtx.beginPath();
          mainCtx.moveTo(mappedLandmarks[NOSE_LANDMARKS[0]].x, mappedLandmarks[NOSE_LANDMARKS[0]].y);
          NOSE_LANDMARKS.forEach((idx) => mainCtx.lineTo(mappedLandmarks[idx].x, mappedLandmarks[idx].y));
          mainCtx.stroke();
        } else if (feat === "cheeks") {
          mainCtx.lineWidth = 75;
          [CHEEK_LANDMARKS.left, CHEEK_LANDMARKS.right].forEach((cheek) => {
            mainCtx.beginPath();
            mainCtx.moveTo(mappedLandmarks[cheek[0]].x, mappedLandmarks[cheek[0]].y);
            cheek.forEach((idx) => mainCtx.lineTo(mappedLandmarks[idx].x, mappedLandmarks[idx].y));
            mainCtx.stroke();
          });
        } else if (feat === "chin") {
          mainCtx.lineWidth = 60;
          mainCtx.beginPath();
          mainCtx.moveTo(mappedLandmarks[CHIN_LANDMARKS[0]].x, mappedLandmarks[CHIN_LANDMARKS[0]].y);
          CHIN_LANDMARKS.forEach((idx) => mainCtx.lineTo(mappedLandmarks[idx].x, mappedLandmarks[idx].y));
          mainCtx.stroke();
        } else if (feat === "upper_lip" || feat === "lower_lip") {
          const indices = FEATURE_INDICES[feat];
          if (indices) {
            mainCtx.lineWidth = 12; // Severely reduced from 35 to prevent oral cavity bleed
            mainCtx.beginPath();
            mainCtx.moveTo(mappedLandmarks[indices[0]].x, mappedLandmarks[indices[0]].y);
            indices.forEach((idx) => mainCtx.lineTo(mappedLandmarks[idx].x, mappedLandmarks[idx].y));
            mainCtx.stroke();
            mainCtx.fillStyle = "#FFFFFF";
            mainCtx.fill();
          }
        } else {
          // Fallback for any other future features
          const indices = FEATURE_INDICES[feat as keyof typeof FEATURE_INDICES];
          if (indices) {
            mainCtx.lineWidth = 25;
            mainCtx.beginPath();
            mainCtx.moveTo(mappedLandmarks[indices[0]].x, mappedLandmarks[indices[0]].y);
            indices.forEach((idx) => mainCtx.lineTo(mappedLandmarks[idx].x, mappedLandmarks[idx].y));
            mainCtx.stroke();
          }
        }
      });

      setMaskDataUrl(mainCanvas.toDataURL("image/png"));
    };
    img.src = croppedImageSrc;
  }, [mappedLandmarks, selectedFeatures, croppedImageSrc]);

  const handleGeneratePreview = async () => {
    if (!croppedImageSrc || !maskDataUrl) {
      setErrorMessage("Missing baseline image or feature mask.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      // 1. Dynamic Strength Calibration
      // Lips require much lower strength to prevent "duck lips". Noses can take slightly more.
      const hasLips = selectedFeatures.includes("upper_lip") || selectedFeatures.includes("lower_lip");
      const clinicalStrength = hasLips ? 0.6 : 0.72;

      // 2. Strict Clinical Prompting
      let aiPrompt = `Subtle, highly realistic clinical modification: ${selectedFeatures.join(", ")}. `;
      aiPrompt +=
        "Absolutely preserve the exact original skin tone, original lighting, and natural skin pores. No makeup, no airbrushing. ";

      if (hasLips) {
        aiPrompt +=
          "Keep lips natural, strictly closed mouth, do not show teeth, no exaggerated volume, preserve original jawline perfectly.";
      }

      const negativePrompt =
        "makeup, smooth skin, plastic, airbrushed, extreme, caricature, exaggerated, duck lips, color shift, changing lighting, changing identity, open mouth, showing teeth, beauty filter, fake";

      // 3. API Payload Update
      // fal client types omit mask_url for img2img; runtime payload keeps clinical mask targeting.
      const result = await fal.subscribe("fal-ai/flux/dev/image-to-image", {
        input: {
          image_url: croppedImageSrc,
          mask_url: maskDataUrl,
          prompt: aiPrompt,
          negative_prompt: negativePrompt,
          strength: clinicalStrength,
          guidance_scale: 7.5,
          num_inference_steps: 28,
        } as never,
        logs: true,
      });

      if (result.data?.images?.[0]?.url) {
        setResultImage(result.data.images[0].url);
      } else {
        setErrorMessage("AI simulation failed to return an image.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to execute simulation.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    if (!croppedImageSrc || !resultImage) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const procedureList = selectedFeatures.map((f) => f.toUpperCase()).join(", ");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Face-off.ai — Patient Consultation Summary</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; max-width: 800px; margin: 0 auto; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
          .title { font-size: 24px; font-weight: bold; font-family: serif; }
          .subtitle { font-size: 12px; color: #64748b; }
          .section { margin-bottom: 20px; }
          .grid { display: flex; gap: 20px; margin-top: 15px; }
          .card { flex: 1; text-align: center; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; }
          .card img { width: 100%; height: auto; border-radius: 6px; }
          .metrics { background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 12px; }
          .disclaimer { font-size: 10px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div><div class="title">Face-off.ai</div><div class="subtitle">Clinical Aesthetic Procedure Simulation Summary</div></div>
          <div style="text-align: right; font-size: 11px; color: #64748b;"> Date: ${new Date().toLocaleDateString()}<br/> Selected Procedures: <strong>${procedureList}</strong> </div>
        </div>
        <div class="section">
          <h3>Visual Transformation Simulation</h3>
          <div class="grid">
            <div class="card"><img src="${croppedImageSrc}" /><p><strong>BEFORE (Baseline)</strong></p></div>
            <div class="card"><img src="${resultImage}" /><p><strong>AFTER (${procedureList})</strong></p></div>
          </div>
        </div>
        <div class="disclaimer">
          <strong>Medical Disclaimer:</strong> This visual simulation is provided for consultation and educational purposes only. It does not constitute a surgical guarantee. Final treatment plans depend on in-person clinical assessment by a licensed physician.
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 text-white bg-gray-950 min-h-screen select-none">
      <div className="border-b border-gray-800 pb-4">
        <h1 className="text-3xl font-serif tracking-wide text-amber-100">Face-off.ai</h1>
        <p className="text-gray-400 text-sm">Multi-Feature Facial Aesthetic Procedure Simulator</p>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-950/60 border border-red-500/50 rounded-lg text-red-200 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Control Panel */}
      <div className="bg-gray-900 p-5 rounded-xl border border-gray-800 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-amber-200 uppercase tracking-wider mb-2">
            1. Select Target Procedures
          </label>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {(["chin", "cheeks", "nose", "brows", "upper_lip", "lower_lip"] as FeatureType[]).map((f) => {
              const active = selectedFeatures.includes(f);
              return (
                <button
                  key={f}
                  onClick={() => toggleFeature(f)}
                  className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-between transition ${
                    active
                      ? "bg-amber-600/20 border-amber-500 text-amber-200 font-bold"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750"
                  }`}
                >
                  <span className="capitalize">{f.replace("_", " ")}</span>
                  <span className="text-xs">{active ? "✓" : "+"}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-gray-800">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Upload Photo</label>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="text-sm text-gray-300 w-full" />
          </div>

          {selectedFeatures.includes("chin") && (
            <div>
              <label className="block text-xs text-amber-300 font-medium mb-1">Chin Procedure Preset</label>
              <select
                value={chinTechnique}
                onChange={(e) => setChinTechnique(e.target.value as keyof typeof CHIN_TECHNIQUES)}
                className="bg-gray-800 text-white p-2 rounded border border-amber-500/50 text-xs w-full font-medium"
              >
                {Object.entries(CHIN_TECHNIQUES).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedFeatures.includes("cheeks") && (
            <div className="space-y-2">
              <label className="block text-xs text-amber-300 font-medium">Cheek Technique & Volume</label>
              <div className="flex gap-2">
                <select
                  value={cheekTechnique}
                  onChange={(e) => setCheekTechnique(e.target.value as keyof typeof CHEEK_TECHNIQUES)}
                  className="bg-gray-800 text-white p-2 rounded border border-amber-500/50 text-xs flex-1 font-medium"
                >
                  {Object.entries(CHEEK_TECHNIQUES).map(([key, item]) => (
                    <option key={key} value={key}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <select
                  value={cheekDosage}
                  onChange={(e) => setCheekDosage(e.target.value)}
                  className="bg-gray-800 text-white p-2 rounded border border-amber-500/50 text-xs w-28 font-medium"
                >
                  <option value="0.50ml">0.50 mL/side</option>
                  <option value="1.00ml">1.00 mL/side</option>
                  <option value="1.50ml">1.50 mL/side</option>
                </select>
              </div>
            </div>
          )}

          {selectedFeatures.includes("nose") && (
            <div>
              <label className="block text-xs text-amber-300 font-medium mb-1">Rhinoplasty Preset</label>
              <select
                value={noseTechnique}
                onChange={(e) => setNoseTechnique(e.target.value as keyof typeof NOSE_TECHNIQUES)}
                className="bg-gray-800 text-white p-2 rounded border border-amber-500/50 text-xs w-full font-medium"
              >
                {Object.entries(NOSE_TECHNIQUES).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedFeatures.includes("brows") && (
            <div className="space-y-2">
              <label className="block text-xs text-gray-400">Eyebrow Style & Thickness</label>
              <div className="flex gap-2">
                <select
                  value={browTechnique}
                  onChange={(e) => setBrowTechnique(e.target.value as keyof typeof BROW_TECHNIQUES)}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-700 text-xs flex-1"
                >
                  <option value="ombre_powder">Ombré Powder</option>
                  <option value="microblading">Microblading</option>
                  <option value="hybrid_tint">Hybrid Tint</option>
                </select>
                <select
                  value={browThickness}
                  onChange={(e) => setBrowThickness(e.target.value as "thin" | "medium" | "thick")}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-700 text-xs w-24"
                >
                  <option value="thin">Thin</option>
                  <option value="medium">Medium</option>
                  <option value="thick">Thick</option>
                </select>
              </div>
            </div>
          )}

          {(selectedFeatures.includes("upper_lip") || selectedFeatures.includes("lower_lip")) && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Lip Technique & Dosage</label>
              <div className="flex gap-2">
                <select
                  value={lipTechnique}
                  onChange={(e) => setLipTechnique(e.target.value as keyof typeof LIP_TECHNIQUES)}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-700 text-xs flex-1"
                >
                  <option value="russian">Russian Lift</option>
                  <option value="classic_lip">Classic 3D</option>
                </select>
                <select
                  value={lipDosage}
                  onChange={(e) => setLipDosage(e.target.value)}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-700 text-xs w-24"
                >
                  <option value="0.25ml">0.25ml</option>
                  <option value="0.50ml">0.50ml</option>
                  <option value="0.75ml">0.75ml</option>
                  <option value="1.00ml">1.00ml</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleGeneratePreview}
          disabled={!mappedLandmarks || loading}
          className="bg-amber-600 hover:bg-amber-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium py-3 px-8 rounded-md transition text-sm shadow-md cursor-pointer"
        >
          {loading ? "Simulating Procedure..." : `Run (${selectedFeatures.length} Procedures) Simulation`}
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {croppedImageSrc && resultImage && (
        <div className="flex justify-end max-w-7xl mx-auto mt-4">
          <button
            onClick={handleExportPDF}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1.5 transition"
          >
            📄 Export Patient Summary (PDF)
          </button>
        </div>
      )}

      {croppedImageSrc && (
        <div className="w-full max-w-7xl mx-auto mt-6">
          <div className={`grid gap-2 ${viewMode === "split" ? "grid-cols-2" : "grid-cols-1"}`}>
            {/* BEFORE COLUMN */}
            {(viewMode === "split" || viewMode === "before") && (
              <div className="relative rounded-lg overflow-hidden bg-black group flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={croppedImageSrc} alt="Before" className="w-full h-auto max-h-[85vh] object-contain" />
                <span className="absolute bottom-3 left-3 bg-black/80 text-white text-xs px-3 py-1.5 rounded font-mono shadow-md">
                  BEFORE
                </span>
                <button
                  onClick={() => setViewMode(viewMode === "split" ? "before" : "split")}
                  className="absolute top-3 right-3 bg-gray-900/80 hover:bg-amber-500 hover:text-black text-gray-300 text-xs font-semibold px-3 py-1.5 rounded transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                >
                  {viewMode === "split" ? "⤢ Fullscreen" : "⤡ Split View"}
                </button>
              </div>
            )}
            {/* AFTER COLUMN */}
            {(viewMode === "split" || viewMode === "after") && (
              <div className="relative rounded-lg overflow-hidden bg-gray-950 flex flex-col items-center justify-center min-h-[300px] group">
                {resultImage ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resultImage} alt="After" className="w-full h-auto max-h-[85vh] object-contain" />
                    <span className="absolute bottom-3 right-3 bg-amber-500 text-black text-xs px-3 py-1.5 rounded font-bold font-mono shadow-md">
                      AFTER (
                      {selectedFeatures.length > 0
                        ? selectedFeatures.join(" + ").toUpperCase()
                        : "SIMULATION"}
                      )
                    </span>
                    <button
                      onClick={() => setViewMode(viewMode === "split" ? "after" : "split")}
                      className="absolute top-3 right-3 bg-gray-900/80 hover:bg-amber-500 hover:text-black text-gray-300 text-xs font-semibold px-3 py-1.5 rounded transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                    >
                      {viewMode === "split" ? "⤢ Fullscreen" : "⤡ Split View"}
                    </button>
                  </>
                ) : (
                  <div className="text-gray-500 text-sm font-mono text-center px-6">
                    {loading ? (
                      <span className="text-amber-500 animate-pulse">Rendering AI Simulation...</span>
                    ) : (
                      "Select procedures and click 'Run Simulation'"
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="text-center pt-6 border-t border-gray-900 text-xs text-gray-500">
        <p>
          <strong>Medical Disclaimer:</strong> This tool utilizes generative artificial intelligence for educational
          and patient consultation purposes only. It does not guarantee surgical or clinical outcomes. Treatment
          planning requires an in-person clinical consultation with a licensed physician.
        </p>
      </footer>
    </div>
  );
}
