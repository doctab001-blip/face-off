"use client";

import React, { useState, useRef, useCallback } from "react";
import { fal } from "@/lib/fal";
import { runProcedureInpainting } from "@/lib/inpainting";
import { generateProcedureMask } from "@/lib/mediapipe/procedureMask";
import type { ProcedureId } from "@/lib/types";

interface ProcedureConfig {
  id: ProcedureId;
  label: string;
  preset: string;
  intensity: number;
}

type SubscriptionTierId = "boutique" | "clinical_group" | "enterprise";

interface SubscriptionTier {
  id: SubscriptionTierId;
  name: string;
  priceMonthly: number;
  practitionerSeats: number | "Unlimited";
  simulationLimit: number | "Unlimited";
  badgeColor: string;
  features: string[];
}

interface Practitioner {
  id: string;
  name: string;
  title: string;
  email: string;
  role: "Facility Admin" | "Senior Surgeon" | "Aesthetic Injector";
}

interface Facility {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  tierId: SubscriptionTierId;
  status: "active" | "pending" | "suspended";
  simulationsUsed: number;
  simulationsLimit: number;
  registeredDate: string;
  practitioners: Practitioner[];
}

const SUBSCRIPTION_TIERS: Record<SubscriptionTierId, SubscriptionTier> = {
  boutique: {
    id: "boutique",
    name: "Boutique Practice",
    priceMonthly: 199,
    practitionerSeats: 1,
    simulationLimit: 100,
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    features: [
      "1 Practitioner Account",
      "100 AI Simulations / month",
      "All 6 Core Facial Procedures",
      "Standard PDF Consultation Export",
      "Standard Support",
    ],
  },
  clinical_group: {
    id: "clinical_group",
    name: "Clinical Group",
    priceMonthly: 499,
    practitionerSeats: 5,
    simulationLimit: 500,
    badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    features: [
      "Up to 5 Practitioner Accounts",
      "500 HD AI Simulations / month",
      "FLUX.1 Pro Fill Engine",
      "Custom Facility Logo on PDF Reports",
      "Multi-Mask Layering & Comparison Slider",
      "Priority Clinical Support",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise Hospital",
    priceMonthly: 1299,
    practitionerSeats: "Unlimited",
    simulationLimit: "Unlimited",
    badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    features: [
      "Unlimited Practitioner Seats",
      "Unlimited High-Res AI Simulations",
      "Multi-Location Facility Management",
      "Custom Procedural Prompt Tuning",
      "EMR / EHR API Integration Access",
      "Dedicated Clinical Account Manager",
      "24/7 SLA Priority Support",
    ],
  },
};

const PROCEDURES_LIST: { id: ProcedureId; label: string }[] = [
  { id: "chin", label: "Chin" },
  { id: "cheeks", label: "Cheeks" },
  { id: "rhinoplasty", label: "Rhinoplasty" },
  { id: "eyebrows", label: "Eyebrows" },
  { id: "upperLip", label: "Upper Lip" },
  { id: "lowerLip", label: "Lower Lip" },
];

/** Visual-only region labels for AI prompts (no surgical procedure names). */
const VISUAL_REGION_LABELS: Record<ProcedureId, string> = {
  chin: "Refined chin",
  cheeks: "Refined cheeks",
  rhinoplasty: "Refined nose",
  eyebrows: "Refined brows",
  upperLip: "Refined upper lip",
  lowerLip: "Refined lower lip",
};

const PRESET_OPTIONS: Record<ProcedureId, string[]> = {
  chin: [
    "Anterior Projection (Mentoplasty)",
    "Vertical Lengthening",
    "Widen & Square Mentum",
    "Soft Apex Taper",
    "Submental Angle Refinement",
  ],
  cheeks: [
    "Malar Volumetric Projection",
    "Subzygomatic Hollow Softening",
    "High Model Cheekbone Lift",
    "Lateral Zygomatic Arch Contouring",
  ],
  rhinoplasty: [
    "Straight & Slim Nasal Bridge",
    "Dorsal Hump Reduction & Tip Lift",
    "Alar Base Contouring & Narrowing",
    "Nasal Tip Definition & Apex Refinement",
    "Supratip Break & Straight Profile Contouring",
  ],
  eyebrows: [
    "Lateral Arch Elevation",
    "Medial Brow Softening",
    "Symmetrical Tail Lift",
    "Fox-Eye Arch Lift",
  ],
  upperLip: [
    "Subtle Vermilion Border Definition (0.5 mL Filler)",
    "Moderate Volume & Cupid's Bow Accentuation (1.0 mL Filler)",
    "Plump Fullness & Lip Flip Simulation (1.5 mL Filler)",
    "Asymmetry Correction & Vermilion Ratio Balance",
  ],
  lowerLip: [
    "Subtle Lower Cushion Softening (0.5 mL Filler)",
    "Central Pillow Volume Enhancement (1.0 mL Filler)",
    "Full Volumetric Plumping & Keyhole Contour (1.5 mL Filler)",
    "Symmetrical Cushion Balance & Lip Scale",
  ],
};

function createSamplePatientPortraitDataUrl(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const bgGrad = ctx.createRadialGradient(400, 500, 100, 400, 500, 600);
  bgGrad.addColorStop(0, "#1e293b");
  bgGrad.addColorStop(1, "#020617");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 800, 1000);

  ctx.save();
  ctx.fillStyle = "#e2a882";
  
  ctx.beginPath();
  ctx.ellipse(400, 480, 190, 260, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillRect(320, 680, 160, 220);

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(330, 430, 32, 16, 0, 0, Math.PI * 2);
  ctx.ellipse(470, 430, 32, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#332211";
  ctx.beginPath();
  ctx.arc(330, 430, 14, 0, Math.PI * 2);
  ctx.arc(470, 430, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#2b1a0d";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(280, 395);
  ctx.quadraticCurveTo(330, 380, 370, 395);
  ctx.moveTo(430, 395);
  ctx.quadraticCurveTo(470, 380, 520, 395);
  ctx.stroke();

  ctx.strokeStyle = "#c48862";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(400, 410);
  ctx.lineTo(392, 520);
  ctx.lineTo(410, 535);
  ctx.stroke();

  ctx.fillStyle = "#ba5d68";
  ctx.beginPath();
  ctx.moveTo(345, 600);
  ctx.quadraticCurveTo(400, 585, 455, 600);
  ctx.quadraticCurveTo(400, 605, 345, 600);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(348, 602);
  ctx.quadraticCurveTo(400, 635, 452, 602);
  ctx.quadraticCurveTo(400, 605, 348, 602);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 245, 235, 0.15)";
  ctx.beginPath();
  ctx.ellipse(400, 700, 45, 25, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  return canvas.toDataURL("image/jpeg", 0.95);
}

export default function VisualizerApp() {
  const [activeTab, setActiveTab] = useState<"visualizer" | "pricing" | "register" | "facility_portal" | "admin_portal">("visualizer");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [activeFacilityId, setActiveFacilityId] = useState<string | null>(null);

  const [selectedTierForRegister, setSelectedTierForRegister] = useState<SubscriptionTierId>("clinical_group");
  const [regForm, setRegForm] = useState({
    name: "",
    practitionerName: "",
    practitionerTitle: "",
    email: "",
    phone: "",
    address: "",
  });
  const [registrationSuccessMsg, setRegistrationSuccessMsg] = useState<string>("");

  const [selectedProcedures, setSelectedProcedures] = useState<ProcedureId[]>(["rhinoplasty", "upperLip"]);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isGridOn, setIsGridOn] = useState(true);

  const [zoomLevel, setZoomLevel] = useState<number>(1.25);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: -10 });
  const [isAutoFocused, setIsAutoFocused] = useState<boolean>(true);

  const [sliderPos, setSliderPos] = useState<number>(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);

  const imageRef = useRef<HTMLImageElement | null>(null);

  const [configs, setConfigs] = useState<Record<ProcedureId, ProcedureConfig>>({
    chin: { id: "chin", label: "Chin", preset: "Anterior Projection (Mentoplasty)", intensity: 50 },
    cheeks: { id: "cheeks", label: "Cheeks", preset: "Malar Volumetric Projection", intensity: 50 },
    rhinoplasty: { id: "rhinoplasty", label: "Rhinoplasty", preset: "Straight & Slim Nasal Bridge", intensity: 60 },
    eyebrows: { id: "eyebrows", label: "Eyebrows", preset: "Lateral Arch Elevation", intensity: 50 },
    upperLip: { id: "upperLip", label: "Upper Lip", preset: "Moderate Volume & Cupid's Bow Accentuation (1.0 mL Filler)", intensity: 60 },
    lowerLip: { id: "lowerLip", label: "Lower Lip", preset: "Central Pillow Volume Enhancement (1.0 mL Filler)", intensity: 50 },
  });

  const currentFacility = facilities.find((f) => f.id === activeFacilityId) || null;

  const toggleProcedure = (procId: ProcedureId) => {
    setSelectedProcedures((prev) =>
      prev.includes(procId) ? prev.filter((id) => id !== procId) : [...prev, procId]
    );
  };

  const updateConfig = (procId: ProcedureId, key: "preset" | "intensity", value: string | number) => {
    setConfigs((prev) => ({
      ...prev,
      [procId]: { ...prev[procId], [key]: value },
    }));
  };

  const autoDetectAndCenterFace = useCallback((imgElement: HTMLImageElement) => {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = imgElement.naturalWidth || 800;
      canvas.height = imgElement.naturalHeight || 800;
      ctx.drawImage(imgElement, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let totalSkinX = 0;
      let totalSkinY = 0;
      let skinPixelCount = 0;

      for (let y = 0; y < canvas.height; y += 8) {
        for (let x = 0; x < canvas.width; x += 8) {
          const i = (y * canvas.width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          if (r > 60 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
            totalSkinX += x;
            totalSkinY += y;
            skinPixelCount++;
          }
        }
      }

      if (skinPixelCount > 40) {
        const avgY = totalSkinY / skinPixelCount;
        const normCenterY = avgY / canvas.height;
        const offsetY = (0.5 - normCenterY) * 180;

        setZoomLevel(1.3);
        setPanOffset({ x: 0, y: Math.max(-100, Math.min(100, offsetY)) });
        setIsAutoFocused(true);
      } else {
        setZoomLevel(1.2);
        setPanOffset({ x: 0, y: -10 });
        setIsAutoFocused(true);
      }
    } catch {
      setZoomLevel(1.2);
      setPanOffset({ x: 0, y: -10 });
      setIsAutoFocused(true);
    }
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setImageSrc(dataUrl);
        setResultImage(null);

        const img = new Image();
        img.onload = () => autoDetectAndCenterFace(img);
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const loadSamplePortrait = () => {
    const sampleUrl = createSamplePatientPortraitDataUrl();
    setImageSrc(sampleUrl);
    setResultImage(null);

    const img = new Image();
    img.onload = () => autoDetectAndCenterFace(img);
    img.src = sampleUrl;
  };

  const resetFraming = () => {
    if (imageRef.current) {
      autoDetectAndCenterFace(imageRef.current);
    } else {
      setZoomLevel(1.2);
      setPanOffset({ x: 0, y: 0 });
    }
  };

  const runSimulation = async () => {
    if (!imageSrc || selectedProcedures.length === 0) return;
    setIsProcessing(true);
    setSimulationError(null);
    setStatusText("Detecting facial landmarks & building anatomical mask...");

    try {
      const { maskDataUrl, usedLandmarks } = await generateProcedureMask(
        imageSrc,
        selectedProcedures,
      );

      setStatusText(
        usedLandmarks
          ? "Running secure server-side FLUX.1 Pro Fill..."
          : "Face landmarks unavailable — using approximate mask. Running server-side fill...",
      );

      // Visual-only directives — strip surgical trigger words from the AI prompt
      const procedureDirectives = selectedProcedures
        .map((id) => {
          const c = configs[id];
          const visualPreset = c.preset
            .replace(/\s*\([^)]*(plasty|procedure|surgery|filler|mL)[^)]*\)/gi, "")
            .replace(/\b(rhinoplasty|mentoplasty|procedure|surgery)\b/gi, "")
            .replace(/\s{2,}/g, " ")
            .trim();
          return `${VISUAL_REGION_LABELS[id]}, ${visualPreset}`;
        })
        .join("; ")
        .replace(/Filler|Rhinoplasty|Mentoplasty|Procedure/gi, "refinement");

      const promptText = `High-end clinical photography of a pristine, healed human face. Subtle visual refinement: ${procedureDirectives}. Flawless natural skin texture, perfectly symmetrical. Soft studio lighting, hyperrealistic editorial aesthetic. Maintain 100% original patient identity.`;

      const primary = selectedProcedures[0];
      const avgIntensity = Math.round(
        selectedProcedures.reduce((sum, id) => sum + configs[id].intensity, 0) /
          selectedProcedures.length,
      );

      const { resultUrl } = await runProcedureInpainting(fal, {
        imageUrl: imageSrc,
        maskDataUrl,
        procedure: primary,
        intensity: avgIntensity,
        promptOverride: promptText,
      });

      setResultImage(resultUrl);

      if (activeFacilityId) {
        setFacilities((prev) =>
          prev.map((f) =>
            f.id === activeFacilityId
              ? { ...f, simulationsUsed: f.simulationsUsed + 1 }
              : f,
          ),
        );
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error && err.message.trim()
          ? err.message.trim()
          : "Simulation failed with an empty error payload. Check FAL_KEY and try again.";
      console.error("FLUX.1 Pro Fill execution failed:", err);
      setSimulationError(errorMessage);
    } finally {
      setIsProcessing(false);
      setStatusText("");
    }
  };

  const handleRegisterFacility = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.name || !regForm.email) return;

    const newFacId = `fac_${Date.now().toString().slice(-4)}`;
    const tier = SUBSCRIPTION_TIERS[selectedTierForRegister];

    const newFacility: Facility = {
      id: newFacId,
      name: regForm.name,
      email: regForm.email,
      phone: regForm.phone || "Not provided",
      address: regForm.address || "Medical Facility Address",
      tierId: selectedTierForRegister,
      status: "active",
      simulationsUsed: 0,
      simulationsLimit: typeof tier.simulationLimit === "number" ? tier.simulationLimit : 99999,
      registeredDate: new Date().toISOString().split("T")[0],
      practitioners: [
        {
          id: `p_${newFacId}_1`,
          name: regForm.practitionerName || "Primary Medical Director",
          title: regForm.practitionerTitle || "Consultant Plastic Surgeon",
          email: regForm.email,
          role: "Facility Admin",
        },
      ],
    };

    setFacilities((prev) => [newFacility, ...prev]);
    setActiveFacilityId(newFacId);
    setRegistrationSuccessMsg(`Success! ${regForm.name} registered under the ${tier.name} tier.`);

    setRegForm({
      name: "",
      practitionerName: "",
      practitionerTitle: "",
      email: "",
      phone: "",
      address: "",
    });

    setTimeout(() => {
      setRegistrationSuccessMsg("");
      setActiveTab("facility_portal");
    }, 1800);
  };

  const exportPDF = () => {
    window.print();
  };

  const isDark = theme === "dark";

  return (
    <div 
      className={`min-h-[100dvh] font-sans selection:bg-amber-500 selection:text-black transition-colors duration-300 ${
        isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
      style={{ fontFamily: "'Avenir Next', 'Avenir', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      <header className={`sticky top-0 z-50 backdrop-blur-md border-b transition-colors duration-300 ${
        isDark ? "bg-slate-950/90 border-slate-800" : "bg-white/90 border-slate-200 shadow-sm"
      }`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              onClick={() => setActiveTab("visualizer")}
              className={`text-xl font-bold tracking-wider cursor-pointer transition ${
                isDark ? "text-amber-200 hover:text-amber-100" : "text-amber-700 hover:text-amber-800"
              }`}
            >
              Face-off.ai
            </span>
            <span className={`hidden sm:inline-block text-[10px] uppercase tracking-widest px-2.5 py-0.5 rounded border font-mono ${
              isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-500/10 text-amber-700 border-amber-500/30"
            }`}>
              Clinical Platform
            </span>
          </div>

          <nav className={`flex items-center gap-1 p-1 rounded-xl border text-xs font-medium ${
            isDark ? "bg-slate-900/80 border-slate-800" : "bg-slate-100 border-slate-200"
          }`}>
            <button
              onClick={() => setActiveTab("visualizer")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === "visualizer"
                  ? isDark 
                    ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30"
                    : "bg-white text-amber-800 font-semibold border border-amber-500/30 shadow-sm"
                  : isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🔬 Visualizer
            </button>

            <button
              onClick={() => setActiveTab("pricing")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === "pricing" || activeTab === "register"
                  ? isDark 
                    ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30"
                    : "bg-white text-amber-800 font-semibold border border-amber-500/30 shadow-sm"
                  : isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              💳 Tiers & Plans
            </button>

            <button
              onClick={() => setActiveTab("facility_portal")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === "facility_portal"
                  ? isDark 
                    ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30"
                    : "bg-white text-amber-800 font-semibold border border-amber-500/30 shadow-sm"
                  : isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🏥 Facility Portal
            </button>

            <button
              onClick={() => setActiveTab("admin_portal")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === "admin_portal"
                  ? isDark 
                    ? "bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30"
                    : "bg-white text-emerald-800 font-semibold border border-emerald-500/30 shadow-sm"
                  : isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              👑 Super Admin
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition flex items-center gap-1.5 ${
                isDark
                  ? "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                  : "bg-slate-100 border-slate-300 text-slate-700 hover:border-slate-400 shadow-sm"
              }`}
              title="Toggle Theme"
            >
              {isDark ? "☀️ Light Mode" : "🌙 Dark Mode"}
            </button>

            <div className="hidden lg:flex items-center gap-2 font-mono text-xs">
              <span className={isDark ? "text-slate-500" : "text-slate-600"}>Active Facility:</span>
              {facilities.length > 0 ? (
                <select
                  value={activeFacilityId || ""}
                  onChange={(e) => setActiveFacilityId(e.target.value)}
                  className={`rounded px-2.5 py-1 focus:outline-none cursor-pointer border ${
                    isDark
                      ? "bg-slate-900 border-slate-800 text-amber-300 focus:border-amber-500/50"
                      : "bg-white border-slate-300 text-amber-800 focus:border-amber-500"
                  }`}
                >
                  {facilities.map((fac) => (
                    <option key={fac.id} value={fac.id}>
                      {fac.name} ({SUBSCRIPTION_TIERS[fac.tierId].name})
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  onClick={() => setActiveTab("pricing")}
                  className={`underline transition ${isDark ? "text-amber-400 hover:text-amber-300" : "text-amber-700 hover:text-amber-800"}`}
                >
                  + Register Facility
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "visualizer" && (
          <div>
            <div className={`mb-6 pb-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4 ${
              isDark ? "border-slate-800/80" : "border-slate-200"
            }`}>
              <div>
                <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                  Aesthetic Procedure AI Simulator
                </h1>
                <p className={`text-xs font-mono mt-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Anatomically targeted rhinoplasty, dermal filler volume, and facial contouring visualizer.
                </p>
              </div>

              <div className={`p-3 rounded-xl border flex items-center gap-4 text-xs font-mono ${
                isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm"
              }`}>
                {currentFacility ? (
                  <>
                    <div>
                      <div className={`text-[10px] uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>Clinic Account</div>
                      <div className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{currentFacility.name}</div>
                    </div>
                    <div className={`h-6 w-px ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                    <div>
                      <div className={`text-[10px] uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>Monthly Simulations</div>
                      <div className={`font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                        {currentFacility.simulationsUsed} / {currentFacility.simulationsLimit >= 99999 ? "∞" : currentFacility.simulationsLimit}
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${SUBSCRIPTION_TIERS[currentFacility.tierId].badgeColor}`}>
                      {SUBSCRIPTION_TIERS[currentFacility.tierId].name}
                    </span>
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>Unregistered / Guest Mode</span>
                    <button
                      onClick={() => setActiveTab("pricing")}
                      className={`px-2.5 py-1 rounded border text-[11px] ${
                        isDark 
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/30" 
                          : "bg-amber-500/10 text-amber-800 border-amber-500/30"
                      }`}
                    >
                      Register Clinic
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className={`p-6 rounded-2xl border mb-8 ${
              isDark ? "bg-slate-900/60 border-slate-800 shadow-xl" : "bg-white border-slate-200 shadow-md"
            }`}>
              <h2 className={`text-xs font-mono uppercase tracking-widest mb-4 ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                1. Select Target Procedures
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-6">
                {PROCEDURES_LIST.map((proc) => {
                  const active = selectedProcedures.includes(proc.id);
                  return (
                    <button
                      key={proc.id}
                      onClick={() => toggleProcedure(proc.id)}
                      className={`px-4 py-2.5 rounded-xl text-xs font-medium border transition flex items-center justify-between ${
                        active
                          ? isDark
                            ? "border-amber-500/60 bg-amber-500/15 text-amber-300 shadow-sm shadow-amber-500/10"
                            : "border-amber-500 bg-amber-50 text-amber-900 shadow-sm"
                          : isDark
                            ? "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                      }`}
                    >
                      <span>{proc.label}</span>
                      <span className="text-xs font-mono">{active ? "✓" : "+"}</span>
                    </button>
                  );
                })}
              </div>

              {selectedProcedures.length > 0 && (
                <div className={`pt-6 border-t mb-6 ${isDark ? "border-slate-800/80" : "border-slate-200"}`}>
                  <h2 className={`text-xs font-mono uppercase tracking-widest mb-4 ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                    2. Active Procedure Presets ({selectedProcedures.length} Selected)
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {selectedProcedures.map((procId) => {
                      const conf = configs[procId];
                      const options = PRESET_OPTIONS[procId] || [];

                      return (
                        <div key={procId} className={`p-4 rounded-xl border ${
                          isDark ? "bg-slate-950/80 border-slate-800/80" : "bg-slate-50 border-slate-200"
                        }`}>
                          <div className="flex justify-between items-center mb-3">
                            <span className={`text-xs font-semibold font-mono uppercase ${isDark ? "text-amber-300" : "text-amber-800"}`}>
                              {conf.label} Configuration
                            </span>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              isDark ? "text-slate-400 bg-slate-900 border-slate-800" : "text-slate-600 bg-white border-slate-200"
                            }`}>
                              Magnitude: {conf.intensity}%
                            </span>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className={`block text-[11px] mb-1 font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                                Anatomical Target Preset
                              </label>
                              <select
                                value={conf.preset}
                                onChange={(e) => updateConfig(procId, "preset", e.target.value)}
                                className={`w-full rounded-lg px-3 py-2 text-xs focus:outline-none cursor-pointer border ${
                                  isDark
                                    ? "bg-slate-900 border-slate-800 text-slate-200 focus:border-amber-500/50"
                                    : "bg-white border-slate-300 text-slate-800 focus:border-amber-500"
                                }`}
                              >
                                {options.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <div className={`flex justify-between text-[11px] mb-1 font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                                <span>Volumetric Scale</span>
                                <span>{conf.intensity}%</span>
                              </div>
                              <input
                                type="range"
                                min="10"
                                max="100"
                                value={conf.intensity}
                                onChange={(e) => updateConfig(procId, "intensity", Number(e.target.value))}
                                className={`w-full accent-amber-500 h-1 rounded-lg appearance-none cursor-pointer ${
                                  isDark ? "bg-slate-800" : "bg-slate-200"
                                }`}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className={`pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 ${
                isDark ? "border-slate-800/80" : "border-slate-200"
              }`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
                  <div>
                    <label className={`block text-xs font-mono mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      Upload Patient Baseline Photo
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className={`block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold cursor-pointer ${
                        isDark 
                          ? "text-slate-400 file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700" 
                          : "text-slate-600 file:bg-slate-200 file:text-slate-800 hover:file:bg-slate-300"
                      }`}
                    />
                  </div>

                  <button
                    onClick={loadSamplePortrait}
                    className={`mt-2 sm:mt-5 text-xs px-3 py-1.5 rounded-lg font-mono border transition ${
                      isDark 
                        ? "bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700" 
                        : "bg-slate-100 hover:bg-slate-200 text-amber-800 border-slate-300"
                    }`}
                  >
                    👤 Load Sample Patient
                  </button>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => setIsGridOn(!isGridOn)}
                    className={`text-xs px-3.5 py-2.5 rounded-xl border font-mono transition ${
                      isGridOn
                        ? isDark
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                          : "border-amber-500 bg-amber-50 text-amber-800"
                        : isDark
                          ? "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700"
                          : "border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {isGridOn ? "✓ Grid On" : "Grid Off"}
                  </button>

                  <button
                    onClick={runSimulation}
                    disabled={!imageSrc || isProcessing || selectedProcedures.length === 0}
                    className={`flex-1 sm:flex-none px-8 py-3 rounded-xl text-xs font-semibold transition shadow-lg flex items-center justify-center gap-2 ${
                      !imageSrc || isProcessing || selectedProcedures.length === 0
                        ? isDark ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-amber-400 hover:bg-amber-300 text-gray-950 shadow-amber-500/10"
                    }`}
                  >
                    {isProcessing ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin text-sm">✨</span>
                        <span>Simulating ({selectedProcedures.length} targets)...</span>
                      </span>
                    ) : (
                      <span>Run AI Simulation ({selectedProcedures.length} Targets)</span>
                    )}
                  </button>
                </div>
              </div>

              {statusText && (
                <p className={`mt-3 text-[11px] font-mono text-right animate-pulse ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                  {statusText}
                </p>
              )}

              {simulationError && (
                <div className="mt-4 p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-200 text-xs font-mono space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-rose-300">Simulation Error</p>
                    <button
                      type="button"
                      onClick={() => setSimulationError(null)}
                      className="px-2 py-1 rounded border border-rose-500/30 text-[10px] uppercase tracking-wide hover:bg-rose-500/20"
                    >
                      Close
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-rose-100/90">{simulationError}</p>
                </div>
              )}
            </div>

            {imageSrc && (
              <div className={`p-4 rounded-xl border mb-6 flex flex-wrap items-center justify-between gap-4 ${
                isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono uppercase ${isDark ? "text-amber-400" : "text-amber-700"}`}>🎯 Viewport Framing:</span>
                  <span className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    {isAutoFocused ? "Auto-Centered on Face" : "Manual Framing"}
                  </span>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>Zoom:</span>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.05"
                      value={zoomLevel}
                      onChange={(e) => {
                        setZoomLevel(parseFloat(e.target.value));
                        setIsAutoFocused(false);
                      }}
                      className={`w-24 accent-amber-500 h-1 rounded appearance-none cursor-pointer ${
                        isDark ? "bg-slate-800" : "bg-slate-200"
                      }`}
                    />
                    <span className={`text-xs font-mono ${isDark ? "text-slate-300" : "text-slate-700"}`}>{zoomLevel.toFixed(2)}x</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>Pan Y:</span>
                    <input
                      type="range"
                      min="-200"
                      max="200"
                      step="5"
                      value={panOffset.y}
                      onChange={(e) => {
                        setPanOffset((prev) => ({ ...prev, y: parseInt(e.target.value) }));
                        setIsAutoFocused(false);
                      }}
                      className={`w-24 accent-amber-500 h-1 rounded appearance-none cursor-pointer ${
                        isDark ? "bg-slate-800" : "bg-slate-200"
                      }`}
                    />
                  </div>

                  <button
                    onClick={resetFraming}
                    className={`px-3 py-1 rounded text-xs font-mono transition ${
                      isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-300" : "bg-slate-200 hover:bg-slate-300 text-slate-800"
                    }`}
                  >
                    Auto-Center Face
                  </button>

                  {resultImage && (
                    <button
                      onClick={exportPDF}
                      className={`px-3.5 py-1 rounded border text-xs font-mono transition flex items-center gap-1.5 ${
                        isDark 
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30" 
                          : "bg-amber-500/10 text-amber-800 border-amber-500/30 hover:bg-amber-500/20"
                      }`}
                    >
                      📄 Print PDF Report
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className={`p-6 rounded-2xl border flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden ${
                isDark ? "bg-slate-900/40 border-slate-800/80" : "bg-white border-slate-200 shadow-md"
              }`}>
                <h3 className={`text-xs font-mono uppercase tracking-widest mb-4 self-start ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Baseline Patient Photo
                </h3>

                {imageSrc ? (
                  <div className="relative w-full max-w-lg h-[500px] flex items-center justify-center bg-black/80 rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
                    <div
                      className="w-full h-full flex items-center justify-center transition-transform duration-300 ease-out overflow-hidden"
                      style={{
                        transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                      }}
                    >
                      <img
                        ref={imageRef}
                        src={imageSrc}
                        alt="Patient Baseline"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {isGridOn && (
                      <div className="absolute inset-0 pointer-events-none border border-amber-500/30 grid grid-cols-3 grid-rows-3">
                        <div className="border-r border-b border-amber-500/20 flex items-start p-1 text-[9px] font-mono text-amber-400/60">Trichion</div>
                        <div className="border-r border-b border-amber-500/20" />
                        <div className="border-b border-amber-500/20" />
                        <div className="border-r border-b border-amber-500/20 flex items-start p-1 text-[9px] font-mono text-amber-400/60">Glabella</div>
                        <div className="border-r border-b border-amber-500/20 flex items-center justify-center text-[10px] font-mono text-amber-400/40">Phi 1.618</div>
                        <div className="border-b border-amber-500/20" />
                        <div className="border-r border-amber-500/20 flex items-start p-1 text-[9px] font-mono text-amber-400/60">Menton</div>
                        <div className="border-r border-b border-amber-500/20" />
                        <div />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <div className={`w-12 h-12 rounded-full border flex items-center justify-center mx-auto mb-4 text-xl ${
                      isDark ? "bg-slate-800/60 border-slate-700 text-slate-400" : "bg-slate-100 border-slate-300 text-slate-500"
                    }`}>
                      📷
                    </div>
                    <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>No Patient Baseline Loaded</p>
                    <p className={`text-xs mt-1 max-w-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                      Upload a portrait or click "Load Sample Patient" above to view face viewport.
                    </p>
                  </div>
                )}
              </div>

              <div className={`p-6 rounded-2xl border flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden ${
                isDark ? "bg-slate-900/40 border-slate-800/80" : "bg-white border-slate-200 shadow-md"
              }`}>
                <div className="flex justify-between items-center w-full mb-4">
                  <h3 className={`text-xs font-mono uppercase tracking-widest ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                    Simulated Clinical Outcome
                  </h3>
                  {resultImage && (
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      isDark ? "text-slate-400 bg-slate-800" : "text-slate-600 bg-slate-100"
                    }`}>
                      Drag divider to compare
                    </span>
                  )}
                </div>

                {resultImage ? (
                  <div
                    className="relative w-full max-w-lg h-[500px] bg-black/80 rounded-xl overflow-hidden border border-amber-500/30 shadow-2xl select-none touch-none"
                    onMouseMove={(e) => {
                      if (!isDraggingSlider) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                      setSliderPos((x / rect.width) * 100);
                    }}
                    onTouchMove={(e) => {
                      if (!isDraggingSlider) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const touch = e.touches[0];
                      const x = Math.max(0, Math.min(touch.clientX - rect.left, rect.width));
                      setSliderPos((x / rect.width) * 100);
                    }}
                    onMouseUp={() => setIsDraggingSlider(false)}
                    onMouseLeave={() => setIsDraggingSlider(false)}
                    onTouchEnd={() => setIsDraggingSlider(false)}
                  >
                    <div
                      className="absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out overflow-hidden pointer-events-none"
                      style={{
                        transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                      }}
                    >
                      <img
                        src={resultImage}
                        alt="Simulated Outcome"
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </div>

                    {/* Clip full-size before image so the divider reveals rather than rescales */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                    >
                      <div
                        className="absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out overflow-hidden"
                        style={{
                          transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                        }}
                      >
                        <img
                          src={imageSrc || ""}
                          alt="Baseline Overlay"
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      </div>
                    </div>

                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-400 cursor-ew-resize z-20 flex items-center justify-center"
                      style={{ left: `${sliderPos}%` }}
                      onMouseDown={() => setIsDraggingSlider(true)}
                      onTouchStart={() => setIsDraggingSlider(true)}
                    >
                      <div className="w-7 h-7 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-xs font-bold shadow-lg cursor-ew-resize border border-white">
                        ↔
                      </div>
                    </div>

                    <span className="absolute bottom-3 left-3 text-[10px] font-mono bg-black/60 text-slate-300 px-2 py-1 rounded backdrop-blur">
                      Before
                    </span>
                    <span className="absolute bottom-3 right-3 text-[10px] font-mono bg-amber-500/80 text-black font-semibold px-2 py-1 rounded backdrop-blur">
                      After (Simulated)
                    </span>
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <div className={`w-12 h-12 rounded-full border flex items-center justify-center mx-auto mb-4 text-xl ${
                      isDark ? "bg-slate-800/60 border-slate-700 text-amber-400/60" : "bg-slate-100 border-slate-300 text-amber-700"
                    }`}>
                      ✨
                    </div>
                    <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Simulation Pending</p>
                    <p className={`text-xs mt-1 max-w-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                      Configure procedure parameters above and click "Run AI Simulation" to render results.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {(activeTab === "pricing" || activeTab === "register") && (
          <div>
            <div className="text-center max-w-3xl mx-auto mb-12">
              <h1 className={`text-3xl font-bold tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                Medical Facility Subscription Tiers
              </h1>
              <p className={`text-xs font-mono mt-2 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Empower your aesthetic surgical practice or cosmetic clinic with AI-powered visual consultation software. Choose the tier that matches your clinical volume.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              {(Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTierId[]).map((tierKey) => {
                const tier = SUBSCRIPTION_TIERS[tierKey];
                const isSelected = selectedTierForRegister === tierKey;

                return (
                  <div
                    key={tier.id}
                    className={`rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 relative ${
                      isSelected
                        ? isDark
                          ? "bg-slate-900 border-2 border-amber-500 shadow-2xl shadow-amber-500/10 scale-[1.02]"
                          : "bg-white border-2 border-amber-500 shadow-xl scale-[1.02]"
                        : isDark
                          ? "bg-slate-900/50 border border-slate-800 hover:border-slate-700"
                          : "bg-white border border-slate-200 hover:border-slate-300 shadow-sm"
                    }`}
                  >
                    {tier.id === "clinical_group" && (
                      <span className="absolute -top-3 right-6 bg-amber-500 text-slate-950 font-mono font-bold text-[10px] uppercase px-3 py-0.5 rounded-full shadow">
                        Most Popular for Clinics
                      </span>
                    )}

                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h2 className={`text-lg font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{tier.name}</h2>
                          <p className={`text-[11px] font-mono mt-0.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                            {tier.practitionerSeats === "Unlimited"
                              ? "Unlimited Practitioner Seats"
                              : `${tier.practitionerSeats} Practitioner Seat${tier.practitionerSeats > 1 ? "s" : ""}`}
                          </p>
                        </div>
                      </div>

                      <div className={`mb-6 pb-6 border-b ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                        <span className={`text-3xl font-bold ${isDark ? "text-amber-300" : "text-amber-800"}`}>${tier.priceMonthly}</span>
                        <span className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}> / month</span>
                      </div>

                      <ul className="space-y-3 mb-8">
                        {tier.features.map((feat, idx) => (
                          <li key={idx} className={`flex items-start gap-2 text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                            <span className="text-amber-500 font-bold">✓</span>
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedTierForRegister(tier.id);
                        setActiveTab("register");
                      }}
                      className={`w-full py-3 rounded-xl text-xs font-semibold transition ${
                        isSelected
                          ? "bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-lg shadow-amber-500/10"
                          : isDark
                            ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
                      }`}
                    >
                      {isSelected ? "Selected — Register Facility" : `Select ${tier.name}`}
                    </button>
                  </div>
                );
              })}
            </div>

            {activeTab === "register" && (
              <div className={`max-w-2xl mx-auto p-8 rounded-2xl border shadow-2xl ${
                isDark ? "bg-slate-900/90 border-amber-500/40" : "bg-white border-amber-500/50"
              }`}>
                <div className="mb-6">
                  <span className={`text-[10px] font-mono uppercase tracking-widest ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                    Facility Onboarding
                  </span>
                  <h2 className={`text-xl font-bold mt-1 ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                    Register Facility under {SUBSCRIPTION_TIERS[selectedTierForRegister].name} Tier (${SUBSCRIPTION_TIERS[selectedTierForRegister].priceMonthly}/mo)
                  </h2>
                </div>

                {registrationSuccessMsg ? (
                  <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono text-center">
                    {registrationSuccessMsg}
                  </div>
                ) : (
                  <form onSubmit={handleRegisterFacility} className="space-y-4">
                    <div>
                      <label className={`block text-xs font-mono mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        Facility / Clinic Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Apex Facial Plastic Surgery Center"
                        value={regForm.name}
                        onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                        className={`w-full rounded-lg px-3.5 py-2.5 text-xs focus:outline-none focus:border-amber-500 border ${
                          isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-xs font-mono mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                          Primary Practitioner Name *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Dr. Alexander Wright, MD"
                          value={regForm.practitionerName}
                          onChange={(e) => setRegForm({ ...regForm, practitionerName: e.target.value })}
                          className={`w-full rounded-lg px-3.5 py-2.5 text-xs focus:outline-none focus:border-amber-500 border ${
                            isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                          }`}
                        />
                      </div>

                      <div>
                        <label className={`block text-xs font-mono mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                          Practitioner Title
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Board-Certified Plastic Surgeon"
                          value={regForm.practitionerTitle}
                          onChange={(e) => setRegForm({ ...regForm, practitionerTitle: e.target.value })}
                          className={`w-full rounded-lg px-3.5 py-2.5 text-xs focus:outline-none focus:border-amber-500 border ${
                            isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                          }`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-xs font-mono mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                          Administrator Email *
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="administrator@clinic.com"
                          value={regForm.email}
                          onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                          className={`w-full rounded-lg px-3.5 py-2.5 text-xs focus:outline-none focus:border-amber-500 border ${
                            isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                          }`}
                        />
                      </div>

                      <div>
                        <label className={`block text-xs font-mono mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                          Clinic Phone
                        </label>
                        <input
                          type="tel"
                          placeholder="+1 (555) 019-2831"
                          value={regForm.phone}
                          onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                          className={`w-full rounded-lg px-3.5 py-2.5 text-xs focus:outline-none focus:border-amber-500 border ${
                            isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                          }`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-mono mb-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        Facility Address
                      </label>
                      <input
                        type="text"
                        placeholder="Street, Building, City, Country"
                        value={regForm.address}
                        onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                        className={`w-full rounded-lg px-3.5 py-2.5 text-xs focus:outline-none focus:border-amber-500 border ${
                          isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                        }`}
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs transition shadow-lg shadow-amber-500/10"
                      >
                        Complete Facility Registration (${SUBSCRIPTION_TIERS[selectedTierForRegister].priceMonthly}/mo)
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "facility_portal" && (
          <div className="max-w-5xl mx-auto py-6">
            <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-slate-100" : "text-slate-900"}`}>
              Facility Portal & Staff Ledger
            </h2>
            <p className={`text-xs font-mono mb-6 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Session-local demo ledger. Data resets on refresh until a backend is connected.
            </p>

            {facilities.length === 0 ? (
              <div className={`p-8 rounded-2xl border text-center ${
                isDark ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
              }`}>
                <p className={`text-sm mb-4 font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  No clinical facilities registered in this session.
                </p>
                <button
                  onClick={() => setActiveTab("pricing")}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl text-xs font-semibold bg-amber-400 text-slate-950"
                >
                  Onboard First Facility
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {facilities.map((fac) => (
                  <div
                    key={fac.id}
                    className={`p-6 rounded-2xl border ${
                      isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-md"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-4 gap-4">
                      <div>
                        <h3 className="text-lg font-bold">{fac.name}</h3>
                        <p className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                          {fac.email} • {fac.phone}
                        </p>
                        <p className={`text-xs font-mono mt-1 ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                          {fac.address}
                        </p>
                      </div>
                      <span className={`text-[10px] font-mono uppercase px-2.5 py-1 rounded border ${SUBSCRIPTION_TIERS[fac.tierId].badgeColor}`}>
                        {SUBSCRIPTION_TIERS[fac.tierId].name}
                      </span>
                    </div>

                    <div className={`grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-xl border text-xs font-mono mb-4 ${
                      isDark ? "bg-slate-950/40 border-slate-800" : "bg-slate-50 border-slate-200"
                    }`}>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Simulations Run</span>
                        <span className="text-amber-400 font-bold">
                          {fac.simulationsUsed} / {fac.simulationsLimit >= 99999 ? "∞" : fac.simulationsLimit}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Staff Accounts</span>
                        <span>{fac.practitioners.length} Profiles</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Registration Date</span>
                        <span>{fac.registeredDate}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-mono text-slate-400 block uppercase">
                        Practitioner Accounts
                      </span>
                      {fac.practitioners.map((p) => (
                        <div
                          key={p.id}
                          className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between gap-3 ${
                            isDark ? "border-slate-800/80 bg-slate-950/20" : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <div>
                            <span className={`font-bold block ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                              {p.name}
                            </span>
                            <span className="text-slate-400 block">
                              {p.email} • {p.title}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px]">
                            {p.role}
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => setActiveFacilityId(fac.id)}
                      className={`mt-4 min-h-[40px] px-4 py-2 rounded-xl text-xs font-mono border transition ${
                        activeFacilityId === fac.id
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : isDark
                            ? "bg-slate-900 text-slate-300 border-slate-700"
                            : "bg-white text-slate-700 border-slate-300"
                      }`}
                    >
                      {activeFacilityId === fac.id ? "Active Facility" : "Set as Active"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "admin_portal" && (
          <div className="max-w-5xl mx-auto py-6">
            <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-slate-100" : "text-slate-900"}`}>
              Super Admin System Metrics
            </h2>
            <p className={`text-xs font-mono mb-6 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Cross-tenant demo metrics for this browser session only.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
                <span className="text-slate-400 text-xs font-mono block">Monthly Recurring Revenue</span>
                <span className="text-2xl font-bold text-emerald-400">
                  ${facilities.reduce((acc, f) => acc + SUBSCRIPTION_TIERS[f.tierId].priceMonthly, 0).toLocaleString()}
                </span>
              </div>
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
                <span className="text-slate-400 text-xs font-mono block">Active Facilities</span>
                <span className="text-2xl font-bold text-amber-400">{facilities.length}</span>
              </div>
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}>
                <span className="text-slate-400 text-xs font-mono block">Total Simulations Executed</span>
                <span className="text-2xl font-bold text-blue-400">
                  {facilities.reduce((acc, f) => acc + f.simulationsUsed, 0)}
                </span>
              </div>
            </div>

            {facilities.length === 0 ? (
              <p className="text-xs font-mono text-slate-500 text-center py-8">
                No registered facilities online.
              </p>
            ) : (
              <div className="space-y-4">
                {facilities.map((fac) => (
                  <div
                    key={fac.id}
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                      isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"
                    }`}
                  >
                    <div>
                      <span className="font-bold text-sm block">{fac.name}</span>
                      <span className="text-xs font-mono text-slate-400">
                        {fac.email} • {SUBSCRIPTION_TIERS[fac.tierId].name} • {fac.simulationsUsed}/
                        {fac.simulationsLimit >= 99999 ? "∞" : fac.simulationsLimit} sims
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setFacilities((prev) =>
                          prev.map((f) =>
                            f.id === fac.id
                              ? { ...f, simulationsLimit: f.simulationsLimit + 100 }
                              : f,
                          ),
                        );
                      }}
                      className="min-h-[44px] px-3 py-1.5 rounded border font-mono bg-amber-500/10 text-amber-300 border-amber-500/30 text-xs"
                    >
                      +100 Credits
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <footer className={`mt-12 pt-6 border-t text-center text-[10px] font-mono leading-relaxed ${
          isDark ? "border-slate-800 text-slate-600" : "border-slate-200 text-slate-500"
        }`}>
          Medical Disclaimer: This simulation tool utilizes AI for educational modeling and patient consultation support only. Treatment planning requires an in-person clinical assessment by a licensed physician.
        </footer>
      </main>
    </div>
  );
}