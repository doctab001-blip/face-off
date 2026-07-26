"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

export default function VisualizerApp() {
  const [croppedImageSrc, setCroppedImageSrc] = useState<string | null>(null);
  const [showGoldenRatio, setShowGoldenRatio] = useState<boolean>(false);
  const [zoomScale, setZoomScale] = useState<number>(100);
  const [linePositions, setLinePositions] = useState<{
    trichion: number;
    glabella: number;
    subnasale: number;
    menton: number;
    leftX: number;
    rightX: number;
  } | null>(null);
  const [activeDraggingLine, setActiveDraggingLine] = useState<string | null>(null);
  const [fullFacePhi, setFullFacePhi] = useState<{
    facePhiRatio: string;
    verticalThirdsRatio: string;
    overallScore: string;
    clinicalAnalysis: string;
  } | null>(null);

  const [landmarker, setLandmarker] = useState<FaceLandmarker | null>(null);
  const [rawPixelLandmarks, setRawPixelLandmarks] = useState<Array<{ x: number; y: number }> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  // Initialize MediaPipe Facial Recognition
  useEffect(() => {
    async function initMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
        );
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          numFaces: 1,
        });
        setLandmarker(faceLandmarker);
      } catch {
        setErrorMessage("Failed to load facial recognition engine.");
      }
    }
    initMediaPipe();
  }, []);

  // Calculate Rule of Thirds and Face Phi
  const recalculateMetricsFromLines = useCallback((lines: typeof linePositions) => {
    if (!lines) return;
    const { trichion, glabella, subnasale, menton, leftX, rightX } = lines;

    const faceHeight = menton - trichion;
    const faceWidth = Math.abs(rightX - leftX);

    const facePhi = faceWidth > 0 ? (faceHeight / faceWidth).toFixed(3) : "1.618";

    const upperThird = Math.abs(glabella - trichion);
    const middleThird = Math.abs(subnasale - glabella);
    const lowerThird = Math.abs(menton - subnasale);

    const avgThird = (upperThird + middleThird + lowerThird) / 3;
    const thirdsRatioStr = `${(upperThird / avgThird).toFixed(2)} : ${(middleThird / avgThird).toFixed(2)} : ${(lowerThird / avgThird).toFixed(2)}`;

    const phiDiff = Math.abs(parseFloat(facePhi) - 1.618);
    const overallScore = Math.max(70, Math.min(99, 100 - phiDiff * 30)).toFixed(1);

    let analysis = "Near-Ideal Divine Proportion (Φ 1.618)";
    if (parseFloat(facePhi) < 1.5) analysis = "Wider Midface Geometry / Brachycephalic";
    if (parseFloat(facePhi) > 1.75) analysis = "Elongated Facial Height / Dolichocephalic";

    setFullFacePhi({
      facePhiRatio: facePhi,
      verticalThirdsRatio: thirdsRatioStr,
      overallScore: `${overallScore}%`,
      clinicalAnalysis: analysis,
    });
  }, []);

  // Auto-Crop and Setup Viewport
  const updateViewportAndCrop = useCallback(
    (img: HTMLImageElement, pixelLms: Array<{ x: number; y: number }>, scale: number) => {
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

      const scaleMultiplier = scale / 100;
      const padX = faceWidth * 0.35 * scaleMultiplier;
      const padTop = faceHeight * 0.25 * scaleMultiplier;
      const padBottom = faceHeight * 0.25 * scaleMultiplier;

      const cropX = Math.max(0, leftCheekX - padX);
      const cropY = Math.max(0, calcTrichionY - padTop);
      let cropW = Math.min(origW - cropX, faceWidth + padX * 2);
      let cropH = Math.min(origH - cropY, faceHeight + padTop + padBottom);

      cropW = Math.max(64, Math.floor(cropW / 64) * 64);
      cropH = Math.max(64, Math.floor(cropH / 64) * 64);

      const initialLines = {
        trichion: calcTrichionY - cropY,
        glabella: glabellaY - cropY,
        subnasale: subnasaleY - cropY,
        menton: calcMentonY - cropY,
        leftX: leftCheekX - cropX,
        rightX: rightCheekX - cropX,
      };

      setLinePositions(initialLines);

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      const cropCtx = cropCanvas.getContext("2d");
      if (cropCtx) {
        cropCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        setCroppedImageSrc(cropCanvas.toDataURL("image/png"));
      }

      recalculateMetricsFromLines(initialLines);
    },
    [recalculateMetricsFromLines],
  );

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setCroppedImageSrc(null);
    setFullFacePhi(null);
    setLinePositions(null);

    const file = e.target.files?.[0];
    if (!file || !landmarker) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      img.onload = () => {
        loadedImageRef.current = img;
        try {
          const results = landmarker.detect(img);
          if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
            const rawLms = results.faceLandmarks[0];
            const pixelLms = rawLms.map((pt: { x: number; y: number }) => ({
              x: pt.x * img.width,
              y: pt.y * img.height,
            }));
            setRawPixelLandmarks(pixelLms);
            updateViewportAndCrop(img, pixelLms, zoomScale);
          } else {
            setErrorMessage("No face detected. Upload a front-facing portrait.");
          }
        } catch {
          setErrorMessage("Failed to analyze facial geometry.");
        }
      };
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (loadedImageRef.current && rawPixelLandmarks) {
      updateViewportAndCrop(loadedImageRef.current, rawPixelLandmarks, zoomScale);
    }
  }, [zoomScale, rawPixelLandmarks, updateViewportAndCrop]);

  // Render Interactive Golden Ratio Grid
  useEffect(() => {
    if (!overlayCanvasRef.current || !croppedImageSrc) return;

    const img = new Image();
    img.src = croppedImageSrc;
    img.onload = () => {
      const overlayCanvas = overlayCanvasRef.current;
      if (!overlayCanvas) return;
      overlayCanvas.width = img.width;
      overlayCanvas.height = img.height;
      const oCtx = overlayCanvas.getContext("2d");
      if (!oCtx) return;

      oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      if (showGoldenRatio && linePositions) {
        const { trichion, glabella, subnasale, menton, leftX, rightX } = linePositions;
        const lines = [
          { key: "trichion", y: trichion, label: "Trichion (Hairline)" },
          { key: "glabella", y: glabella, label: "Glabella (Brow Line)" },
          { key: "subnasale", y: subnasale, label: "Subnasale (Nose Base)" },
          { key: "menton", y: menton, label: "Menton (Chin Tip)" },
        ];

        lines.forEach((line) => {
          const isDragging = activeDraggingLine === line.key;
          oCtx.strokeStyle = isDragging ? "#fbbf24" : "#818cf8";
          oCtx.lineWidth = isDragging ? 3 : 1.5;
          oCtx.beginPath();
          oCtx.moveTo(leftX - 25, line.y);
          oCtx.lineTo(rightX + 25, line.y);
          oCtx.stroke();

          oCtx.fillStyle = isDragging ? "#fbbf24" : "#818cf8";
          oCtx.beginPath();
          oCtx.arc(rightX + 25, line.y, 5, 0, Math.PI * 2);
          oCtx.fill();

          oCtx.font = "12px monospace";
          oCtx.fillText(`${line.label}`, rightX + 35, line.y + 4);
        });

        oCtx.strokeStyle = "#f59e0b";
        oCtx.lineWidth = 2;
        oCtx.strokeRect(leftX, trichion, rightX - leftX, menton - trichion);
        oCtx.font = "14px monospace";
        oCtx.fillStyle = "#fbbf24";
        oCtx.fillText("Rule of Thirds (Φ = 1.618) Grid", leftX + 10, trichion + 20);
      }
    };
  }, [linePositions, activeDraggingLine, showGoldenRatio, croppedImageSrc]);

  // Canvas Mouse Events
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!showGoldenRatio || !linePositions || !overlayCanvasRef.current) return;
    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const scaleY = overlayCanvasRef.current.height / rect.height;
    const clickY = (e.clientY - rect.top) * scaleY;
    const threshold = 14;

    const keys: Array<keyof typeof linePositions> = ["trichion", "glabella", "subnasale", "menton"];
    for (const key of keys) {
      if (Math.abs(linePositions[key] - clickY) < threshold) {
        setActiveDraggingLine(key);
        break;
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeDraggingLine || !linePositions || !overlayCanvasRef.current) return;
    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const scaleY = overlayCanvasRef.current.height / rect.height;
    const newY = (e.clientY - rect.top) * scaleY;

    const updated = {
      ...linePositions,
      [activeDraggingLine]: newY,
    };
    setLinePositions(updated);
    recalculateMetricsFromLines(updated);
  };

  const handleCanvasMouseUp = () => {
    setActiveDraggingLine(null);
  };

  // Export Diagnostic PDF
  const handleExportPDF = () => {
    if (!croppedImageSrc || !fullFacePhi) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Face-off.ai — Patient Diagnostic Summary</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; max-width: 800px; margin: 0 auto; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
          .title { font-size: 24px; font-weight: bold; font-family: serif; }
          .subtitle { font-size: 12px; color: #64748b; }
          .section { margin-bottom: 20px; }
          .card { text-align: center; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; max-width: 400px; margin: 0 auto; }
          .card img { width: 100%; height: auto; border-radius: 6px; }
          .metrics { background: #f8fafc; padding: 16px; border-radius: 6px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 14px; margin-top: 20px; }
          .disclaimer { font-size: 10px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">Face-off.ai</div>
            <div class="subtitle">Clinical Facial Proportion Analysis</div>
          </div>
          <div style="text-align: right; font-size: 11px; color: #64748b;">
            Date: ${new Date().toLocaleDateString()}
          </div>
        </div>

        <div class="section">
          <h3>Patient Baseline</h3>
          <div class="card">
            <img src="${croppedImageSrc}" />
          </div>
        </div>

        <div class="section">
          <h3>Structural Analysis (Rule of Thirds / Divine Φ)</h3>
          <div class="metrics">
            <p>Height/Width Ratio: <strong>${fullFacePhi.facePhiRatio}</strong> (Ideal Φ = 1.618)</p>
            <p>Vertical Thirds Ratio (Upper : Mid : Lower): <strong>${fullFacePhi.verticalThirdsRatio}</strong></p>
            <p>Facial Geometry Score: <strong>${fullFacePhi.overallScore}</strong></p>
            <p>Clinical Assessment: <strong>${fullFacePhi.clinicalAnalysis}</strong></p>
          </div>
        </div>

        <div class="disclaimer">
          <strong>Medical Disclaimer:</strong> This geometric analysis is provided for consultation and educational purposes only. It does not replace an in-person clinical assessment by a licensed physician.
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 text-white bg-gray-950 min-h-screen select-none">
      {/* Header */}
      <div className="border-b border-gray-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif tracking-wide text-amber-100">Face-off.ai</h1>
          <p className="text-gray-400 text-sm">Clinical Facial Geometry & Proportion Analyzer</p>
        </div>
        <button
          onClick={() => setShowGoldenRatio(!showGoldenRatio)}
          className={`px-3 py-1.5 rounded-md text-xs font-mono border transition ${
            showGoldenRatio
              ? "bg-indigo-900/50 border-indigo-500 text-indigo-200"
              : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
          }`}
        >
          {showGoldenRatio ? "✓ Draggable Grid On" : "+ Enable Draggable Grid"}
        </button>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-950/60 border border-red-500/50 rounded-lg text-red-200 text-sm font-mono">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Upload Panel */}
      <div className="bg-gray-900 p-5 rounded-xl border border-gray-800 flex flex-col items-center justify-center py-8">
        <label className="block text-sm font-semibold text-amber-200 uppercase tracking-wider mb-3">
          Initialize Patient Analysis
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="block w-full max-w-sm text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-500 transition cursor-pointer"
        />
        <p className="text-xs text-gray-500 mt-4 text-center max-w-md">
          Upload a clear, front-facing portrait. The system will automatically map the facial landmarks and calibrate
          the structural viewport.
        </p>
      </div>

      {/* Analytics & Viewport Configuration */}
      {croppedImageSrc && (
        <div className="bg-gray-900 border border-gray-800 p-3 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono">
          <div className="flex items-center gap-3 w-full md:flex-1 max-w-md">
            <span className="text-gray-400">Zoom:</span>
            <input
              type="range"
              min="50"
              max="200"
              value={zoomScale}
              onChange={(e) => setZoomScale(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <span className="text-amber-400 font-bold min-w-[45px] text-right">{zoomScale}%</span>
          </div>

          <button
            onClick={handleExportPDF}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 rounded flex items-center gap-1.5 transition w-full md:w-auto justify-center"
          >
            📄 Export Analysis (PDF)
          </button>
        </div>
      )}

      {/* Phi Score Card */}
      {fullFacePhi && (
        <div className="bg-indigo-950/40 border border-indigo-500/30 p-5 rounded-xl space-y-3 text-xs font-mono">
          <div className="flex justify-between items-center border-b border-indigo-900/50 pb-3">
            <span className="text-amber-400 font-bold text-sm tracking-wider">
              FULL FACE RULE OF THIRDS (Φ = 1.618)
            </span>
            <span className="text-indigo-300 text-sm">
              Divine Match: <strong className="text-amber-400">{fullFacePhi.overallScore}</strong>
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
            <div>
              <span className="text-gray-400 block mb-1">Height / Width Ratio:</span>
              <strong className="text-white text-base">{fullFacePhi.facePhiRatio}</strong>
              <span className="text-[10px] text-gray-500 block">(Target Φ = 1.618)</span>
            </div>
            <div>
              <span className="text-gray-400 block mb-1">Vertical Thirds (Upper : Mid : Lower):</span>
              <strong className="text-white text-base">{fullFacePhi.verticalThirdsRatio}</strong>
              <span className="text-[10px] text-gray-500 block">(Target = 1.0 : 1.0 : 1.0)</span>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Canvas */}
      {croppedImageSrc && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-200 mb-4">
            Interactive Facial Canvas (Enable Grid & Drag Lines to Adjust):
          </p>
          <div className="relative w-full max-w-xl mx-auto rounded-lg overflow-hidden border border-gray-800">
            <div className="relative w-full aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={croppedImageSrc}
                alt="Interactive Canvas"
                className="w-full h-full object-cover pointer-events-none"
              />
              <canvas
                ref={overlayCanvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                className="absolute inset-0 w-full h-full cursor-ns-resize"
              />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center pt-6 border-t border-gray-900 text-xs text-gray-600">
        <p>
          <strong>Medical Disclaimer:</strong> This tool utilizes computer vision for proportion analysis and patient
          consultation purposes only. It does not replace a physical examination.
        </p>
      </footer>
    </div>
  );
}
