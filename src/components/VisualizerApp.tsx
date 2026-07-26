"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  NOSE_TECHNIQUES,
  CHEEK_TECHNIQUES,
  CHIN_TECHNIQUES,
  BROW_TECHNIQUES,
  LIP_TECHNIQUES,
  type FeatureType,
  type LinePositions,
} from "@/components/constants";
import { useMediaPipe } from "@/hooks/useMediaPipe";
import { useFalAI } from "@/hooks/useFalAI";
import { useProcedureMask } from "@/hooks/useProcedureMask";
import ControlPanel from "@/components/ControlPanel";
import ComparisonSlider from "@/components/ComparisonSlider";
import PhiMetricsDisplay from "@/components/PhiMetricsDisplay";

export default function VisualizerApp() {
  const [selectedFeatures, setSelectedFeatures] = useState<FeatureType[]>(["cheeks"]);

  const [browTechnique, setBrowTechnique] = useState<keyof typeof BROW_TECHNIQUES>("ombre_powder");
  const [browThickness, setBrowThickness] = useState<"thin" | "medium" | "thick">("medium");
  const [browDensity] = useState<string>("tint_medium");

  const [lipTechnique, setLipTechnique] = useState<keyof typeof LIP_TECHNIQUES>("russian");
  const [lipDosage, setLipDosage] = useState<string>("0.50ml");

  const [noseTechnique, setNoseTechnique] = useState<keyof typeof NOSE_TECHNIQUES>("straight_slim");
  const [cheekTechnique, setCheekTechnique] = useState<keyof typeof CHEEK_TECHNIQUES>("malar_volume");
  const [cheekDosage, setCheekDosage] = useState<string>("1.00ml");
  const [chinTechnique, setChinTechnique] = useState<keyof typeof CHIN_TECHNIQUES>("anterior_projection");

  const [showGoldenRatio, setShowGoldenRatio] = useState<boolean>(false);
  const [zoomScale, setZoomScale] = useState<number>(100);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sliderPos, setSliderPos] = useState<number>(50);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeDraggingLineRef = useRef<string | null>(null);

  const onError = useCallback((message: string | null) => {
    setErrorMessage(message);
  }, []);

  const {
    mappedLandmarks,
    croppedImageSrc,
    handleImageUpload: mediaPipeUpload,
    linePositions,
    setLinePositions,
    linePositionsRef,
    fullFacePhi,
    recalculateMetricsFromLines,
  } = useMediaPipe({
    zoomScale,
    onError,
  });

  const drawGoldenRatioOverlay = useCallback((
    lines: LinePositions | null,
    activeKey: string | null,
    show: boolean,
  ) => {
    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas) return;
    const oCtx = overlayCanvas.getContext("2d");
    if (!oCtx) return;

    oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!show || !lines) return;

    const { trichion, glabella, subnasale, menton, leftX, rightX } = lines;
    const gridLines = [
      { key: "trichion", y: trichion, label: "Trichion (Hairline)" },
      { key: "glabella", y: glabella, label: "Glabella (Brow Line)" },
      { key: "subnasale", y: subnasale, label: "Subnasale (Nose Base)" },
      { key: "menton", y: menton, label: "Menton (Chin Tip)" },
    ];

    gridLines.forEach((line) => {
      const isDragging = activeKey === line.key;
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

      oCtx.font = "10px monospace";
      oCtx.fillStyle = isDragging ? "#fbbf24" : "#818cf8";
      oCtx.fillText(`${line.label}`, rightX + 35, line.y + 3);
    });

    oCtx.strokeStyle = "#f59e0b";
    oCtx.lineWidth = 2;
    oCtx.strokeRect(leftX, trichion, rightX - leftX, menton - trichion);
    oCtx.font = "11px monospace";
    oCtx.fillStyle = "#fbbf24";
    oCtx.fillText("Rule of Thirds (Φ = 1.618) Grid", leftX + 10, trichion + 15);
  }, []);

  const { maskDataUrl } = useProcedureMask({
    mappedLandmarks,
    croppedImageSrc,
    canvasRef,
    overlayCanvasRef,
    selectedFeatures,
    browThickness,
    lipDosage,
    cheekDosage,
    chinTechnique,
    showGoldenRatio,
    linePositionsRef,
    activeDraggingLineRef,
    drawGoldenRatioOverlay,
  });

  const {
    resultImage,
    setResultImage,
    loading,
    handleGeneratePreview,
  } = useFalAI({
    croppedImageSrc,
    maskDataUrl,
    mappedLandmarks,
    selectedFeatures,
    chinTechnique,
    cheekTechnique,
    cheekDosage,
    browTechnique,
    browThickness,
    browDensity,
    lipTechnique,
    lipDosage,
    noseTechnique,
    onError,
  });

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setResultImage(null);
    mediaPipeUpload(e);
  }, [mediaPipeUpload, setResultImage]);

  // Redraw grid when toggled or when line state commits (e.g. after drag end)
  useEffect(() => {
    drawGoldenRatioOverlay(
      linePositionsRef.current,
      activeDraggingLineRef.current,
      showGoldenRatio,
    );
  }, [showGoldenRatio, linePositions, drawGoldenRatioOverlay, linePositionsRef]);

  const toggleFeature = (feat: FeatureType) => {
    if (selectedFeatures.includes(feat)) {
      if (selectedFeatures.length > 1) {
        setSelectedFeatures(selectedFeatures.filter((f) => f !== feat));
      }
    } else {
      setSelectedFeatures([...selectedFeatures, feat]);
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!showGoldenRatio || !linePositionsRef.current || !overlayCanvasRef.current) return;

    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const scaleY = overlayCanvasRef.current.height / rect.height;
    const clickY = (e.clientY - rect.top) * scaleY;

    const threshold = 14;
    const keys: Array<keyof LinePositions> = ["trichion", "glabella", "subnasale", "menton"];
    const lines = linePositionsRef.current;

    for (const key of keys) {
      if (Math.abs(lines[key] - clickY) < threshold) {
        activeDraggingLineRef.current = key;
        drawGoldenRatioOverlay(lines, key, true);
        break;
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const activeKey = activeDraggingLineRef.current;
    if (!activeKey || !linePositionsRef.current || !overlayCanvasRef.current) return;

    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const scaleY = overlayCanvasRef.current.height / rect.height;
    const newY = (e.clientY - rect.top) * scaleY;

    const updated: LinePositions = {
      ...linePositionsRef.current,
      [activeKey]: newY,
    };

    linePositionsRef.current = updated;
    drawGoldenRatioOverlay(updated, activeKey, true);
  };

  const handleCanvasMouseUp = () => {
    if (activeDraggingLineRef.current && linePositionsRef.current) {
      setLinePositions(linePositionsRef.current);
      recalculateMetricsFromLines(linePositionsRef.current);
    }
    activeDraggingLineRef.current = null;
    drawGoldenRatioOverlay(linePositionsRef.current, null, showGoldenRatio);
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
            <div>
              <div class="title">Face-off.ai</div>
              <div class="subtitle">Clinical Aesthetic Procedure Simulation Summary</div>
            </div>
            <div style="text-align: right; font-size: 11px; color: #64748b;">
              Date: ${new Date().toLocaleDateString()}<br/>
              Selected Procedures: <strong>${procedureList}</strong>
            </div>
          </div>

          <div class="section">
            <h3>Visual Transformation Simulation</h3>
            <div class="grid">
              <div class="card">
                <img src="${croppedImageSrc}" />
                <p><strong>BEFORE (Baseline)</strong></p>
              </div>
              <div class="card">
                <img src="${resultImage}" />
                <p><strong>AFTER (${procedureList})</strong></p>
              </div>
            </div>
          </div>

          ${
            fullFacePhi
              ? `
          <div class="section">
            <h3>Facial Proportion Analysis (Rule of Thirds / Divine Φ)</h3>
            <div class="metrics">
              <p>Height/Width Ratio: <strong>${fullFacePhi.facePhiRatio}</strong> (Ideal Φ = 1.618)</p>
              <p>Vertical Thirds Ratio (Upper : Mid : Lower): <strong>${fullFacePhi.verticalThirdsRatio}</strong></p>
              <p>Facial Geometry Score: <strong>${fullFacePhi.overallScore}</strong></p>
            </div>
          </div>
          `
              : ""
          }

          <div class="disclaimer">
            <strong>Medical Disclaimer:</strong> This visual simulation is provided for consultation and educational purposes only. It does not constitute a surgical guarantee. Final treatment plans depend on in-person clinical assessment by a licensed physician.
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
    <div className="max-w-5xl mx-auto p-6 space-y-6 text-white bg-gray-950 min-h-screen select-none">
      <div className="border-b border-gray-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif tracking-wide text-amber-100">Face-off.ai</h1>
          <p className="text-gray-400 text-sm">Multi-Feature Facial Aesthetic Procedure Simulator</p>
        </div>
        <button
          onClick={() => setShowGoldenRatio(!showGoldenRatio)}
          className={`px-3 py-1.5 rounded-md text-xs font-mono border transition ${
            showGoldenRatio ? "bg-indigo-900/50 border-indigo-500 text-indigo-200" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
          }`}
        >
          {showGoldenRatio ? "✓ Draggable Grid On" : "+ Enable Draggable Grid"}
        </button>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-950/60 border border-red-500/50 rounded-lg text-red-200 text-sm">
          {errorMessage}
        </div>
      )}

      <ControlPanel
        selectedFeatures={selectedFeatures}
        onToggleFeature={toggleFeature}
        onImageUpload={handleImageUpload}
        chinTechnique={chinTechnique}
        setChinTechnique={setChinTechnique}
        cheekTechnique={cheekTechnique}
        setCheekTechnique={setCheekTechnique}
        cheekDosage={cheekDosage}
        setCheekDosage={setCheekDosage}
        noseTechnique={noseTechnique}
        setNoseTechnique={setNoseTechnique}
        browTechnique={browTechnique}
        setBrowTechnique={setBrowTechnique}
        browThickness={browThickness}
        setBrowThickness={setBrowThickness}
        lipTechnique={lipTechnique}
        setLipTechnique={setLipTechnique}
        lipDosage={lipDosage}
        setLipDosage={setLipDosage}
      />

      {croppedImageSrc && (
        <div className="bg-gray-900 border border-gray-800 p-3 rounded-xl flex items-center justify-between gap-4 text-xs font-mono">
          <span className="text-gray-400">Viewport Framing (Zoom Scale):</span>
          <div className="flex items-center gap-3 flex-1 max-w-xs">
            <span className="text-gray-500">Zoom In</span>
            <input
              type="range"
              min="50"
              max="200"
              value={zoomScale}
              onChange={(e) => setZoomScale(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <span className="text-gray-500">Zoom Out</span>
          </div>
          <span className="text-amber-400 font-bold min-w-[45px] text-right">{zoomScale}%</span>
        </div>
      )}

      {fullFacePhi && <PhiMetricsDisplay fullFacePhi={fullFacePhi} />}

      <div className="flex justify-end">
        <button
          onClick={handleGeneratePreview}
          disabled={!mappedLandmarks || loading}
          className="bg-amber-600 hover:bg-amber-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium py-3 px-8 rounded-md transition text-sm shadow-md"
        >
          {loading ? "Simulating Procedure..." : `Run (${selectedFeatures.length} Procedures) Simulation`}
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {croppedImageSrc && (
        <ComparisonSlider
          croppedImageSrc={croppedImageSrc}
          resultImage={resultImage}
          selectedFeatures={selectedFeatures}
          sliderPos={sliderPos}
          setSliderPos={setSliderPos}
          overlayCanvasRef={overlayCanvasRef}
          onCanvasMouseDown={handleCanvasMouseDown}
          onCanvasMouseMove={handleCanvasMouseMove}
          onCanvasMouseUp={handleCanvasMouseUp}
          onExportPDF={handleExportPDF}
        />
      )}

      <footer className="text-center pt-6 border-t border-gray-900 text-xs text-gray-500">
        <p>
          <strong>Medical Disclaimer:</strong> This tool utilizes generative artificial intelligence for educational and patient consultation purposes only. It does not guarantee surgical or clinical outcomes. Treatment planning requires an in-person clinical consultation with a licensed physician.
        </p>
      </footer>
    </div>
  );
}
