"use client";

/**
 * Legacy Gemini + local-warp demo. Not mounted by the app.
 * The live entry point is `src/app/page.tsx` (MediaPipe + fal FLUX fill).
 */

import React, { useState, useEffect } from "react";

export type Role = "facility_admin" | "staff" | "super_admin";
export type SubscriptionTierId = "boutique" | "clinical_group" | "enterprise";
export type ProcedureId = "chin" | "cheeks" | "rhinoplasty" | "eyebrows" | "upperLip" | "lowerLip";

export interface Facility {
  id: string;
  name: string;
  licenseNumber: string;
  email: string;
  phone: string;
  address: string;
  tierId: SubscriptionTierId;
  simulationsUsed: number;
  simulationsLimit: number;
  status: "active" | "pending" | "suspended";
  registeredDate: string;
}

export interface Profile {
  id: string;
  facilityId: string;
  fullName: string;
  email: string;
  role: Role;
  title: string;
  createdAt: string;
}

export interface ProcedureConfig {
  id: ProcedureId;
  label: string;
  preset: string;
  intensity: number;
}

export interface SubscriptionTier {
  id: SubscriptionTierId;
  name: string;
  priceMonthly: number;
  seats: string;
  simulations: string;
  badgeColor: string;
  features: string[];
}

const SUBSCRIPTION_TIERS: Record<SubscriptionTierId, SubscriptionTier> = {
  boutique: {
    id: "boutique",
    name: "Boutique Practice",
    priceMonthly: 199,
    seats: "1 Practitioner",
    simulations: "100 / month",
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
    seats: "Up to 5 Practitioners",
    simulations: "500 / month",
    badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    features: [
      "Up to 5 Practitioner Accounts",
      "500 HD AI Simulations / month",
      "Gemini 3.1 Flash AI Engine",
      "Custom Facility Logo on PDF Reports",
      "Multi-Mask Layering & Comparison Slider",
      "Priority Clinical Support",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise Hospital",
    priceMonthly: 1299,
    seats: "Unlimited",
    simulations: "Unlimited",
    badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    features: [
      "Unlimited Practitioner Seats",
      "Unlimited High-Res AI Simulations",
      "Multi-Location Facility Management",
      "Custom Procedural Prompt Tuning",
      "EMR / EHR API Integration Access",
      "Dedicated Clinical Account Manager",
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

  ctx.restore();
  return canvas.toDataURL("image/jpeg", 0.95);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (src.startsWith("http://") || src.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image element"));
    img.src = src;
  });
}

function detectFaceBounds(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let count = 0;

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const isSkin =
        r > 60 && g > 40 && b > 20 &&
        r > g && (r - b) > 15 && (r - g) > 10 &&
        Math.abs(r - g) < 100;

      if (isSkin) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }

  if (count > (width * height) / 400 && (maxX - minX) > width * 0.15) {
    return {
      cx: (minX + maxX) / 2,
      cy: minY + (maxY - minY) * 0.45,
      fw: maxX - minX,
      fh: maxY - minY,
    };
  }

  return {
    cx: width * 0.5,
    cy: height * 0.46,
    fw: width * 0.42,
    fh: height * 0.52,
  };
}

interface PixelWarp {
  cx: number;
  cy: number;
  radiusX: number;
  radiusY: number;
  type: "narrow_x" | "inflate" | "shift_y";
  strength: number;
}

function applyAnatomicalPixelWarp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  warps: PixelWarp[]
) {
  if (warps.length === 0) return;

  const srcImgData = ctx.getImageData(0, 0, width, height);
  const src = srcImgData.data;
  const dstImgData = ctx.createImageData(width, height);
  const dst = dstImgData.data;

  dst.set(src);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let u = x;
      let v = y;

      for (let i = 0; i < warps.length; i++) {
        const warp = warps[i];
        const dx = (x - warp.cx) / warp.radiusX;
        const dy = (y - warp.cy) / warp.radiusY;
        const distSq = dx * dx + dy * dy;

        if (distSq < 1.0) {
          const falloff = (1.0 - distSq) * (1.0 - distSq);

          if (warp.type === "narrow_x") {
            u += (x - warp.cx) * warp.strength * falloff * 0.012;
          } else if (warp.type === "inflate") {
            u -= dx * warp.radiusX * warp.strength * falloff * 0.008;
            v -= dy * warp.radiusY * warp.strength * falloff * 0.008;
          } else if (warp.type === "shift_y") {
            v += warp.strength * falloff * 0.6;
          }
        }
      }

      const uClamped = Math.max(0, Math.min(width - 1, u));
      const vClamped = Math.max(0, Math.min(height - 1, v));

      const x0 = Math.floor(uClamped);
      const y0 = Math.floor(vClamped);
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);

      const wx = uClamped - x0;
      const wy = vClamped - y0;

      const i00 = (y0 * width + x0) * 4;
      const i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4;
      const i11 = (y1 * width + x1) * 4;

      const dstIdx = (y * width + x) * 4;

      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c] * (1 - wx) + src[i10 + c] * wx;
        const bottom = src[i01 + c] * (1 - wx) + src[i11 + c] * wx;
        dst[dstIdx + c] = Math.round(top * (1 - wy) + bottom * wy);
      }
    }
  }

  ctx.putImageData(dstImgData, 0, 0);
}

async function generateLocalSculptedSimulation(
  imageSrc: string,
  selectedProcedures: ProcedureId[],
  configs: Record<ProcedureId, ProcedureConfig>
): Promise<string> {
  const img = await loadImage(imageSrc);

  const maxDim = 900;
  let width = img.naturalWidth || 800;
  let height = img.naturalHeight || 800;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageSrc;

  ctx.drawImage(img, 0, 0, width, height);

  const { cx, cy, fw, fh } = detectFaceBounds(ctx, width, height);
  const warps: PixelWarp[] = [];

  selectedProcedures.forEach((procId) => {
    const conf = configs[procId];
    const baseFactor = (conf.intensity || 50) / 100;

    let volumeMultiplier = 1.0;
    if (conf.preset.includes("0.5 mL")) volumeMultiplier = 0.7;
    if (conf.preset.includes("1.0 mL")) volumeMultiplier = 1.1;
    if (conf.preset.includes("1.5 mL")) volumeMultiplier = 1.6;

    const factor = baseFactor * volumeMultiplier;

    if (procId === "rhinoplasty") {
      const noseY = cy - fh * 0.04;
      const noseX = cx;

      warps.push({
        cx: noseX,
        cy: noseY,
        radiusX: fw * 0.14,
        radiusY: fh * 0.18,
        type: "narrow_x",
        strength: 22 * factor,
      });

      warps.push({
        cx: noseX,
        cy: noseY + fh * 0.08,
        radiusX: fw * 0.1,
        radiusY: fh * 0.08,
        type: "shift_y",
        strength: -10 * factor,
      });
    } else if (procId === "upperLip") {
      const lipY = cy + fh * 0.22;
      warps.push({
        cx: cx,
        cy: lipY,
        radiusX: fw * 0.22,
        radiusY: fh * 0.06,
        type: "inflate",
        strength: 20 * factor,
      });
    } else if (procId === "lowerLip") {
      const lipY = cy + fh * 0.27;
      warps.push({
        cx: cx,
        cy: lipY,
        radiusX: fw * 0.24,
        radiusY: fh * 0.07,
        type: "inflate",
        strength: 22 * factor,
      });
    } else if (procId === "chin") {
      const chinY = cy + fh * 0.42;
      warps.push({
        cx: cx,
        cy: chinY,
        radiusX: fw * 0.24,
        radiusY: fh * 0.12,
        type: "inflate",
        strength: 18 * factor,
      });
      warps.push({
        cx: cx,
        cy: chinY,
        radiusX: cx,
        radiusY: chinY,
        type: "shift_y",
        strength: 12 * factor,
      });
    } else if (procId === "cheeks") {
      const isSubzygomatic = conf.preset.includes("Subzygomatic");
      const isHighLift = conf.preset.includes("High Model");

      const cheekY = cy + fh * (isSubzygomatic ? 0.12 : isHighLift ? -0.01 : 0.03);
      const cheekXOffset = fw * (isSubzygomatic ? 0.32 : 0.30);

      [cx - cheekXOffset, cx + cheekXOffset].forEach((cheekX) => {
        warps.push({
          cx: cheekX,
          cy: cheekY,
          radiusX: fw * 0.20,
          radiusY: fh * 0.14,
          type: "inflate",
          strength: 26 * factor,
        });

        if (isHighLift) {
          warps.push({
            cx: cheekX,
            cy: cheekY,
            radiusX: fw * 0.18,
            radiusY: fh * 0.12,
            type: "shift_y",
            strength: -12 * factor,
          });
        }
      });
    } else if (procId === "eyebrows") {
      [cx - fw * 0.22, cx + fw * 0.22].forEach((browX) => {
        warps.push({
          cx: browX,
          cy: cy - fh * 0.24,
          radiusX: fw * 0.16,
          radiusY: fh * 0.08,
          type: "shift_y",
          strength: -12 * factor,
        });
      });
    }
  });

  applyAnatomicalPixelWarp(ctx, width, height, warps);

  /* Malar Catchlight Overlay for Cheeks */
  if (selectedProcedures.includes("cheeks")) {
    const conf = configs["cheeks"];
    const baseFactor = (conf.intensity || 50) / 100;

    ctx.save();
    ctx.globalCompositeOperation = "soft-light";

    const isSubzygomatic = conf.preset.includes("Subzygomatic");
    const cheekY = cy + fh * (isSubzygomatic ? 0.12 : 0.03);
    const cheekXOffset = fw * 0.30;

    [cx - cheekXOffset, cx + cheekXOffset].forEach((cheekX) => {
      const cheekGrad = ctx.createRadialGradient(cheekX, cheekY, 2, cheekX, cheekY, fw * 0.18);
      cheekGrad.addColorStop(0, `rgba(255, 250, 242, ${0.35 * baseFactor})`);
      cheekGrad.addColorStop(0.7, `rgba(240, 215, 195, ${0.12 * baseFactor})`);
      cheekGrad.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = cheekGrad;
      ctx.beginPath();
      ctx.ellipse(cheekX, cheekY, fw * 0.18, fh * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  if (selectedProcedures.includes("upperLip") || selectedProcedures.includes("lowerLip")) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    const lipY = cy + fh * 0.24;
    const lipGrad = ctx.createRadialGradient(cx, lipY, 2, cx, lipY, fw * 0.22);
    lipGrad.addColorStop(0, "rgba(235, 110, 130, 0.2)");
    lipGrad.addColorStop(0.8, "rgba(215, 90, 110, 0.08)");
    lipGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = lipGrad;
    ctx.beginPath();
    ctx.ellipse(cx, lipY, fw * 0.22, fh * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return canvas.toDataURL("image/jpeg", 0.95);
}

async function runGeminiImageSimulation(
  base64Data: string,
  promptText: string,
  apiKeyOverride?: string
): Promise<string | null> {
  const apiKey = apiKeyOverride || "";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`;

  let base64Clean = base64Data;
  let mimeType = "image/jpeg";
  if (base64Data.includes(",")) {
    const parts = base64Data.split(",");
    base64Clean = parts[1];
    const mimeMatch = parts[0].match(/data:(image\/[a-zA-Z0-9+\/]+);/);
    if (mimeMatch) mimeType = mimeMatch[1];
  }

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Execute a realistic clinical plastic surgery simulation on this patient photograph. Target anatomical procedures:\n${promptText}\n\nStrict Rules: Maintain exact identity, facial expressions, background, clothing, scarf, eyes, and skin texture. Modify ONLY the targeted facial features. If Cheeks is selected, project the malar cheekbones and subzygomatic contours smoothly without altering lower eyelids.`,
          },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Clean,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
    },
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      const part = result?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (part && part.inlineData?.data) {
        return `data:${part.inlineData.mimeType || "image/jpeg"};base64,${part.inlineData.data}`;
      }
    } else {
      console.warn("Gemini API HTTP status:", response.status);
    }
  } catch (e) {
    console.warn("Gemini API call skipped or unconfigured", e);
  }
  return null;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"visualizer" | "pricing" | "register" | "auth" | "facility_portal" | "super_admin">("visualizer");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  /* Multi-Tenancy State */
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [activeFacility, setActiveFacility] = useState<Facility | null>(null);

  /* API Key Modal */
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);

  /* Multi-step Onboarding State */
  const [regStep, setRegStep] = useState<1 | 2 | 3>(1);
  const [selectedTierForRegister, setSelectedTierForRegister] = useState<SubscriptionTierId>("clinical_group");
  const [regAdminForm, setRegAdminForm] = useState({ fullName: "", email: "", password: "", title: "Medical Director" });
  const [regFacilityForm, setRegFacilityForm] = useState({ name: "", licenseNumber: "", phone: "", address: "" });
  const [registrationMsg, setRegistrationMsg] = useState("");

  /* Staff Sign-In Form */
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState("");

  /* Visualizer State - Default to Rhinoplasty & Cheeks */
  const [selectedProcedures, setSelectedProcedures] = useState<ProcedureId[]>(["rhinoplasty", "cheeks"]);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [usedEngine, setUsedEngine] = useState<string>("");
  const [isGridOn, setIsGridOn] = useState(true);
  const [isFaceZoomOn, setIsFaceZoomOn] = useState(true);
  const [faceZoomTransform, setFaceZoomTransform] = useState({ scale: 1.35, originX: 50, originY: 46 });
  const [wipePercent, setWipePercent] = useState<number>(50);

  const [configs, setConfigs] = useState<Record<ProcedureId, ProcedureConfig>>({
    chin: { id: "chin", label: "Chin", preset: "Anterior Projection (Mentoplasty)", intensity: 60 },
    cheeks: { id: "cheeks", label: "Cheeks", preset: "Malar Volumetric Projection", intensity: 65 },
    rhinoplasty: { id: "rhinoplasty", label: "Rhinoplasty", preset: "Straight & Slim Nasal Bridge", intensity: 75 },
    eyebrows: { id: "eyebrows", label: "Eyebrows", preset: "Lateral Arch Elevation", intensity: 60 },
    upperLip: { id: "upperLip", label: "Upper Lip", preset: "Moderate Volume & Cupid's Bow Accentuation (1.0 mL Filler)", intensity: 75 },
    lowerLip: { id: "lowerLip", label: "Lower Lip", preset: "Central Pillow Volume Enhancement (1.0 mL Filler)", intensity: 60 },
  });

  const isDark = theme === "dark";

  /* Calculate face bounds & zoom scale when photo changes */
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 800;
      canvas.height = img.naturalHeight || 800;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const { cx, cy, fh } = detectFaceBounds(ctx, canvas.width, canvas.height);
        const originX = Math.round((cx / canvas.width) * 100);
        const originY = Math.round((cy / canvas.height) * 100);
        const faceHeightRatio = fh / canvas.height;
        const calculatedScale = Math.min(2.2, Math.max(1.25, 0.65 / Math.max(0.2, faceHeightRatio)));
        setFaceZoomTransform({
          scale: Number(calculatedScale.toFixed(2)),
          originX,
          originY,
        });
      }
    };
    img.src = imageSrc;
  }, [imageSrc]);

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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setImageSrc(dataUrl);
        setResultImage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const loadSamplePortrait = () => {
    const sampleUrl = createSamplePatientPortraitDataUrl();
    setImageSrc(sampleUrl);
    setResultImage(null);
  };

  const runSimulation = async () => {
    if (!imageSrc || selectedProcedures.length === 0) return;
    setIsProcessing(true);
    const startTime = Date.now();

    try {
      setStatusText("Connecting to AI Simulation Engine...");
      await new Promise((r) => setTimeout(r, 600));

      setStatusText("Mapping Anatomical Guidelines & Malar Targets...");
      await new Promise((r) => setTimeout(r, 700));

      setStatusText("Executing Photorealistic AI Simulation...");

      const promptText = selectedProcedures
        .map((p) => `- ${configs[p].label}: ${configs[p].preset} (Intensity: ${configs[p].intensity}%)`)
        .join("\n");

      let simulatedResultUrl = await runGeminiImageSimulation(imageSrc, promptText, geminiApiKey);
      let engineLabel = "Gemini 3.1 Flash AI Engine";

      if (!simulatedResultUrl) {
        engineLabel = "Anatomical Sculpt Engine";
        simulatedResultUrl = await generateLocalSculptedSimulation(imageSrc, selectedProcedures, configs);
      }

      if (activeFacility) {
        setFacilities((prev) =>
          prev.map((f) =>
            f.id === activeFacility.id ? { ...f, simulationsUsed: f.simulationsUsed + 1 } : f
          )
        );
        setActiveFacility((prev) => (prev ? { ...prev, simulationsUsed: prev.simulationsUsed + 1 } : null));
      }

      const elapsed = Date.now() - startTime;
      if (elapsed < 2200) {
        await new Promise((r) => setTimeout(r, 2200 - elapsed));
      }

      setUsedEngine(engineLabel);
      setResultImage(simulatedResultUrl);
    } catch (err) {
      const fallback = await generateLocalSculptedSimulation(imageSrc, selectedProcedures, configs);
      setResultImage(fallback);
      setUsedEngine("Anatomical Sculpt Engine");
    } finally {
      setIsProcessing(false);
      setStatusText("");
    }
  };

  const handleCompleteRegistration = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regAdminForm.email || !regFacilityForm.name) return;

    const facId = `fac_${Date.now().toString().slice(-4)}`;
    const profId = `usr_${Date.now().toString().slice(-4)}`;
    const tier = SUBSCRIPTION_TIERS[selectedTierForRegister];

    const newFacility: Facility = {
      id: facId,
      name: regFacilityForm.name,
      licenseNumber: regFacilityForm.licenseNumber || `LIC-${Math.floor(100000 + Math.random() * 900000)}`,
      email: regAdminForm.email,
      phone: regFacilityForm.phone || "Not provided",
      address: regFacilityForm.address || "Medical Facility Address",
      tierId: selectedTierForRegister,
      simulationsUsed: 0,
      simulationsLimit: tier.simulations === "Unlimited" ? 99999 : parseInt(tier.simulations),
      status: "active",
      registeredDate: new Date().toISOString().split("T")[0],
    };

    const newAdminProfile: Profile = {
      id: profId,
      facilityId: facId,
      fullName: regAdminForm.fullName,
      email: regAdminForm.email,
      role: "facility_admin",
      title: regAdminForm.title || "Facility Director",
      createdAt: new Date().toISOString().split("T")[0],
    };

    setFacilities((prev) => [newFacility, ...prev]);
    setProfiles((prev) => [newAdminProfile, ...prev]);
    setActiveFacility(newFacility);
    setActiveProfile(newAdminProfile);

    setRegistrationMsg(`Success! ${newFacility.name} auto-provisioned with Admin ${newAdminProfile.fullName}.`);

    setTimeout(() => {
      setRegistrationMsg("");
      setRegStep(1);
      setRegAdminForm({ fullName: "", email: "", password: "", title: "Medical Director" });
      setRegFacilityForm({ name: "", licenseNumber: "", phone: "", address: "" });
      setActiveTab("facility_portal");
    }, 1500);
  };

  const handleStaffSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    const matchedProfile = profiles.find((p) => p.email.toLowerCase() === authForm.email.toLowerCase());
    if (matchedProfile) {
      const matchedFac = facilities.find((f) => f.id === matchedProfile.facilityId);
      setActiveProfile(matchedProfile);
      setActiveFacility(matchedFac || null);
      setActiveTab("visualizer");
      setAuthForm({ email: "", password: "" });
    } else {
      setAuthError("No registered practitioner found with this email. Please register your facility first.");
    }
  };

  const navItems = [
    { id: "visualizer", label: "🔬 AI Visualizer" },
    { id: "pricing", label: "💳 Subscription Tiers" },
    { id: "facility_portal", label: "🏥 Facility Portal" },
    { id: "super_admin", label: "👑 Super Admin" },
  ];

  /* Viewport image transform style for Face Zoom */
  const viewportTransformStyle: React.CSSProperties = isFaceZoomOn && imageSrc
    ? {
        transform: `scale(${faceZoomTransform.scale})`,
        transformOrigin: `${faceZoomTransform.originX}% ${faceZoomTransform.originY}%`,
        transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform-origin 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      }
    : {
        transform: "scale(1)",
        transformOrigin: "center center",
        transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      };

  return (
    <div
      className={`min-h-[100dvh] flex flex-col lg:flex-row font-sans selection:bg-amber-500 selection:text-black transition-colors duration-300 ${
        isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
      style={{ fontFamily: "'Avenir Next', 'Avenir', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
    >
      {}
      <aside className={`hidden lg:flex flex-col w-64 border-r shrink-0 sticky top-0 h-[100dvh] z-30 transition-colors duration-300 ${
        isDark ? "bg-slate-950/90 border-slate-800" : "bg-white border-slate-200 shadow-sm"
      }`}>
        <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
          <div>
            <span className={`text-xl font-bold tracking-wider cursor-pointer ${isDark ? "text-amber-200" : "text-amber-700"}`} onClick={() => setActiveTab("visualizer")}>
              Face-off.ai
            </span>
            <span className="block text-[10px] uppercase tracking-widest font-mono text-amber-500 mt-0.5">
              Clinical Platform
            </span>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-slate-800/40">
          {activeProfile && activeFacility ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono">
              <span className="text-amber-400 font-bold block truncate">{activeFacility.name}</span>
              <span className="text-slate-400 block truncate">{activeProfile.fullName}</span>
              <span className="text-[10px] text-slate-500 capitalize">{activeProfile.role.replace("_", " ")}</span>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400">
              <span>Guest / Demo Session</span>
              <button
                onClick={() => setActiveTab("auth")}
                className="mt-2 text-[11px] text-amber-400 underline block"
              >
                Sign In to Clinic
              </button>
            </div>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1.5 text-xs font-medium">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full min-h-[44px] px-4 py-3 rounded-xl transition text-left flex items-center justify-between ${
                  isActive
                    ? isDark
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold"
                      : "bg-amber-50 text-amber-900 border border-amber-500/30 font-semibold shadow-sm"
                    : isDark
                      ? "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span>{item.label}</span>
                {isActive && <span className="text-amber-400">●</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/60 space-y-2">
          <button
            onClick={() => setShowApiKeyModal(!showApiKeyModal)}
            className={`w-full min-h-[44px] px-3 py-2 rounded-xl border text-xs font-mono transition flex items-center justify-between ${
              geminiApiKey
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🔑 Gemini AI</span>
            <span>{geminiApiKey ? "Active" : "Set Key"}</span>
          </button>

          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`w-full min-h-[44px] px-3 py-2 rounded-xl border text-xs font-mono transition flex items-center justify-between ${
              isDark
                ? "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                : "bg-slate-100 border-slate-300 text-slate-700 hover:border-slate-400 shadow-sm"
            }`}
          >
            <span>Appearance</span>
            <span>{isDark ? "☀️ Light" : "🌙 Dark"}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className={`lg:hidden sticky top-0 z-40 backdrop-blur-md border-b flex items-center justify-between px-6 h-16 transition-colors duration-300 ${
        isDark ? "bg-slate-950/90 border-slate-800" : "bg-white/90 border-slate-200 shadow-sm"
      }`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileDrawerOpen(true)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-800 text-amber-400 font-bold text-lg"
            aria-label="Open Navigation Drawer"
          >
            ☰
          </button>
          <span className={`text-lg font-bold tracking-wider ${isDark ? "text-amber-200" : "text-amber-700"}`}>
            Face-off.ai
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="min-h-[44px] px-3 py-2 rounded-xl border text-xs font-mono bg-slate-900 border-slate-800 text-slate-300"
          >
            {isDark ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* Mobile Slide-over Drawer */}
      {isMobileDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMobileDrawerOpen(false)}></div>
          <div className={`relative w-80 max-w-[80vw] h-full flex flex-col p-6 z-10 border-r transition-colors duration-300 ${
            isDark ? "bg-slate-950 text-slate-100 border-slate-800" : "bg-white text-slate-900 border-slate-200"
          }`}>
            <div className="flex items-center justify-between pb-6 border-b border-slate-800">
              <span className="text-lg font-bold text-amber-400">Face-off.ai Menu</span>
              <button
                onClick={() => setIsMobileDrawerOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800 text-slate-300"
              >
                ✕
              </button>
            </div>

            <nav className="flex-1 py-6 space-y-2 text-sm font-medium">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any);
                    setIsMobileDrawerOpen(false);
                  }}
                  className={`w-full min-h-[44px] px-4 py-3 rounded-xl text-left flex items-center justify-between ${
                    activeTab === item.id
                      ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30"
                      : "text-slate-400 hover:bg-slate-900"
                  }`}
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-2xl border bg-slate-900 border-slate-800 shadow-2xl text-xs font-mono space-y-4">
            <h3 className="text-sm font-bold text-amber-400">🔑 Gemini Generative AI API Key</h3>
            <p className="text-slate-400">
              Enter a free Gemini API key to run live Generative Image Inpainting (`gemini-3.1-flash-image-preview`).
            </p>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              className="w-full text-base px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-700 text-slate-300"
              >
                Close
              </button>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="min-h-[44px] px-6 py-2 rounded-xl bg-amber-400 text-slate-950 font-bold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full overflow-x-hidden">
        {activeTab === "visualizer" && (
          <div>
            {}
            <div className={`mb-6 pb-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4 ${
              isDark ? "border-slate-800/80" : "border-slate-200"
            }`}>
              <div>
                <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                  Aesthetic Procedure AI Visualizer
                </h1>
                <p className={`text-xs font-mono mt-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Anatomically targeted rhinoplasty, malar cheek projection, dermal filler volume, and facial contouring visualizer.
                </p>
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
                      className={`min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-medium border transition flex items-center justify-between ${
                        active
                          ? isDark
                            ? "border-amber-500/60 bg-amber-500/15 text-amber-300 shadow-sm shadow-amber-500/10"
                            : "border-amber-500 bg-amber-50 text-amber-900 shadow-sm"
                          : isDark
                            ? "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <span>{proc.label}</span>
                      <span className="text-xs font-mono">{active ? "✓" : "+"}</span>
                    </button>
                  );
                })}
              </div>

              {selectedProcedures.length > 0 ? (
                <div className={`mb-6 pt-6 border-t ${isDark ? "border-slate-800/80" : "border-slate-200"}`}>
                  <h2 className={`text-xs font-mono uppercase tracking-widest mb-4 ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                    2. Active Procedure Presets ({selectedProcedures.length} Selected)
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedProcedures.map((procId) => {
                      const conf = configs[procId];
                      const presets = PRESET_OPTIONS[procId] || [];

                      return (
                        <div
                          key={procId}
                          className={`p-4 rounded-xl border ${
                            isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200 shadow-sm"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold font-mono tracking-wider text-amber-400 uppercase">
                              {conf.label} Configuration
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              Magnitude: {conf.intensity}%
                            </span>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                                Anatomical Target Preset
                              </label>
                              <select
                                value={conf.preset}
                                onChange={(e) => updateConfig(procId, "preset", e.target.value)}
                                className={`w-full text-base min-h-[44px] px-3 py-2 rounded-lg border font-medium transition cursor-pointer ${
                                  isDark
                                    ? "bg-slate-900 border-slate-700 text-slate-100 focus:border-amber-500"
                                    : "bg-white border-slate-300 text-slate-900 focus:border-amber-500 shadow-sm"
                                }`}
                              >
                                {presets.map((presetOption, idx) => (
                                  <option key={idx} value={presetOption}>
                                    {presetOption}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 mb-1">
                                <span>Volumetric Scale</span>
                                <span>{conf.intensity}%</span>
                              </div>
                              <input
                                type="range"
                                min="10"
                                max="100"
                                value={conf.intensity}
                                onChange={(e) => updateConfig(procId, "intensity", Number(e.target.value))}
                                className="w-full accent-amber-400 cursor-pointer h-2 rounded-lg bg-slate-700"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className={`p-4 rounded-xl border mb-6 text-center text-xs font-mono text-slate-400 ${
                  isDark ? "bg-slate-950/40 border-slate-800/60" : "bg-slate-50 border-slate-200"
                }`}>
                  Click procedure targets above (e.g. Cheeks, Rhinoplasty) to configure anatomical preset options.
                </div>
              )}

              <div className={`pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 ${
                isDark ? "border-slate-800/80" : "border-slate-200"
              }`}>
                <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className={`block text-xs file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold cursor-pointer ${
                      isDark
                        ? "text-slate-400 file:bg-slate-800 file:text-slate-200"
                        : "text-slate-600 file:bg-slate-200 file:text-slate-800"
                    }`}
                  />
                  <button
                    onClick={loadSamplePortrait}
                    className={`min-h-[44px] text-xs px-3.5 py-2 rounded-xl font-mono border transition ${
                      isDark
                        ? "bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700"
                        : "bg-slate-100 hover:bg-slate-200 text-amber-800 border-slate-300"
                    }`}
                  >
                    👤 Sample Patient
                  </button>
                  <button
                    onClick={() => setIsFaceZoomOn(!isFaceZoomOn)}
                    className={`min-h-[44px] text-xs px-3.5 py-2 rounded-xl font-mono border transition ${
                      isFaceZoomOn
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                  >
                    🔍 {isFaceZoomOn ? `Face Focus (${faceZoomTransform.scale}x)` : "Full View"}
                  </button>
                  <button
                    onClick={() => setIsGridOn(!isGridOn)}
                    className={`min-h-[44px] text-xs px-3.5 py-2 rounded-xl font-mono border transition ${
                      isGridOn
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                  >
                    📐 {isGridOn ? "Grid On" : "Grid Off"}
                  </button>
                </div>

                <button
                  onClick={runSimulation}
                  disabled={!imageSrc || isProcessing || selectedProcedures.length === 0}
                  className={`min-h-[44px] px-8 py-3 rounded-xl text-xs font-semibold transition shadow-lg flex items-center justify-center gap-2 w-full sm:w-auto ${
                    !imageSrc || isProcessing || selectedProcedures.length === 0
                      ? isDark ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-amber-400 hover:bg-amber-300 text-gray-950"
                  }`}
                >
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-slate-950"></span>
                      {statusText || "Processing..."}
                    </span>
                  ) : (
                    `Run AI Simulation (${selectedProcedures.length} Selected)`
                  )}
                </button>
              </div>
            </div>

            {/* Viewports */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {}
              <div className={`p-6 rounded-2xl border flex flex-col items-center justify-center min-h-[480px] relative overflow-hidden ${
                isDark ? "bg-slate-900/40 border-slate-800/80" : "bg-white border-slate-200 shadow-md"
              }`}>
                <h3 className={`text-xs font-mono uppercase tracking-widest mb-4 self-start ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Baseline Patient Photo
                </h3>
                {imageSrc ? (
                  <div className="relative max-h-[420px] overflow-hidden rounded-xl inline-block">
                    <img
                      src={imageSrc}
                      alt="Baseline"
                      style={viewportTransformStyle}
                      className="max-h-[420px] object-contain rounded-xl block"
                    />
                    {isGridOn && (
                      <div className="absolute inset-0 border border-amber-500/30 pointer-events-none rounded-xl grid grid-cols-3 grid-rows-3 opacity-40">
                        <div className="border-r border-b border-amber-500/30"></div>
                        <div className="border-r border-b border-amber-500/30"></div>
                        <div className="border-b border-amber-500/30"></div>
                        <div className="border-r border-b border-amber-500/30"></div>
                        <div className="border-r border-b border-amber-500/30"></div>
                        <div className="border-b border-amber-500/30"></div>
                        <div className="border-r border-amber-500/30"></div>
                        <div className="border-r border-amber-500/30"></div>
                        <div></div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No Patient Photo Loaded</p>
                )}
              </div>

              {/* Simulated Outcome Viewport */}
              <div className={`p-6 rounded-2xl border flex flex-col items-center justify-center min-h-[480px] relative overflow-hidden ${
                isDark ? "bg-slate-900/40 border-slate-800/80" : "bg-white border-slate-200 shadow-md"
              }`}>
                <div className="flex items-center justify-between w-full mb-4">
                  <h3 className={`text-xs font-mono uppercase tracking-widest ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                    Simulated Clinical Outcome
                  </h3>
                  {usedEngine && !isProcessing && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
                      {usedEngine}
                    </span>
                  )}
                </div>

                {isProcessing ? (
                  <div className="relative w-full flex flex-col items-center justify-center min-h-[380px] p-2 text-center">
                    <style>{`
                      @keyframes scanLine {
                        0% { top: 2%; opacity: 0.8; }
                        50% { top: 94%; opacity: 1; }
                        100% { top: 2%; opacity: 0.8; }
                      }
                      .animate-laser-scan {
                        animation: scanLine 2.4s ease-in-out infinite;
                      }
                      @keyframes radarSweep {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                      }
                      .animate-radar-sweep {
                        animation: radarSweep 4s linear infinite;
                      }
                    `}</style>

                    <div className="relative max-h-[380px] overflow-hidden rounded-xl inline-block border border-amber-500/40 shadow-2xl shadow-amber-500/10">
                      {imageSrc ? (
                        <img
                          src={imageSrc}
                          alt="Scanning Target"
                          style={viewportTransformStyle}
                          className="max-h-[380px] object-contain rounded-xl block opacity-30 blur-[1px] grayscale"
                        />
                      ) : (
                        <div className="w-[280px] h-[380px] bg-slate-900 rounded-xl"></div>
                      )}

                      <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_18px_#fbbf24] animate-laser-scan z-10 pointer-events-none"></div>

                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-40 h-40 rounded-full border border-amber-500/40 border-dashed animate-radar-sweep flex items-center justify-center">
                          <div className="w-24 h-24 rounded-full border border-amber-400/30 animate-ping"></div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col items-center gap-1.5">
                      <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs shadow-lg shadow-amber-500/5">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                        </span>
                        <span className="font-semibold tracking-wider uppercase text-[11px]">
                          {statusText || "AI Processing..."}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-slate-400">
                        Targeting {selectedProcedures.map((p) => configs[p].label).join(" • ")}
                      </p>
                    </div>
                  </div>
                ) : resultImage ? (
                  <div className="relative w-full flex flex-col items-center justify-center">
                    <div className="relative max-h-[420px] overflow-hidden rounded-xl inline-block">
                      <img
                        src={imageSrc || ""}
                        alt="Baseline Under"
                        style={viewportTransformStyle}
                        className="max-h-[420px] object-contain rounded-xl block"
                      />

                      <div
                        className="absolute top-0 left-0 bottom-0 overflow-hidden rounded-xl"
                        style={{ width: `${wipePercent}%` }}
                      >
                        <img
                          src={resultImage}
                          alt="Simulated Result"
                          style={viewportTransformStyle}
                          className="max-h-[420px] object-contain rounded-xl block max-w-none"
                        />
                      </div>

                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-amber-400 shadow-lg pointer-events-none"
                        style={{ left: `${wipePercent}%` }}
                      >
                        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-amber-400 text-slate-950 text-[10px] flex items-center justify-center font-bold">
                          ↔
                        </div>
                      </div>

                      {isGridOn && (
                        <div className="absolute inset-0 border border-amber-500/30 pointer-events-none rounded-xl grid grid-cols-3 grid-rows-3 opacity-40">
                          <div className="border-r border-b border-amber-500/30"></div>
                          <div className="border-r border-b border-amber-500/30"></div>
                          <div className="border-b border-amber-500/30"></div>
                          <div className="border-r border-b border-amber-500/30"></div>
                          <div className="border-r border-b border-amber-500/30"></div>
                          <div className="border-b border-amber-500/30"></div>
                          <div className="border-r border-amber-500/30"></div>
                          <div className="border-r border-amber-500/30"></div>
                          <div></div>
                        </div>
                      )}
                    </div>

                    <div className="w-full max-w-xs mt-4 flex items-center gap-3">
                      <span className="text-[10px] font-mono text-slate-400">Before</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={wipePercent}
                        onChange={(e) => setWipePercent(Number(e.target.value))}
                        className="w-full accent-amber-400 h-2 rounded bg-slate-700 cursor-pointer"
                      />
                      <span className="text-[10px] font-mono text-amber-400">Simulated</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Simulation Pending</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Pricing Tab */}
        {activeTab === "pricing" && (
          <div className="max-w-5xl mx-auto py-8">
            <h2 className="text-2xl font-bold text-center mb-2">Subscription Tiers & Clinical Access</h2>
            <p className="text-xs text-slate-400 text-center mb-10 font-mono">Select a plan to onboard your clinic and manage practitioner seats.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.values(SUBSCRIPTION_TIERS).map((tier) => (
                <div key={tier.id} className={`p-6 rounded-2xl border flex flex-col justify-between ${
                  isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-md"
                }`}>
                  <div>
                    <span className={`text-[10px] uppercase font-mono px-2.5 py-1 rounded border ${tier.badgeColor}`}>
                      {tier.name}
                    </span>
                    <div className="mt-4 mb-2">
                      <span className="text-3xl font-bold">${tier.priceMonthly}</span>
                      <span className="text-xs text-slate-500 font-mono"> / month</span>
                    </div>
                    <ul className="space-y-2 my-6 text-xs text-slate-300">
                      {tier.features.map((feat, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <span className="text-amber-400">✓</span> {feat}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedTierForRegister(tier.id);
                      setRegStep(1);
                      setActiveTab("register");
                    }}
                    className="w-full min-h-[44px] py-2.5 rounded-xl text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 transition"
                  >
                    Register Facility Under Plan
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Register Facility Onboarding Tab */}
        {activeTab === "register" && (
          <div className="max-w-xl mx-auto py-8">
            <div className={`p-8 rounded-2xl border ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-md"}`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Facility Onboarding Wizard</h2>
                <span className="text-xs font-mono text-amber-400">Step {regStep} of 3</span>
              </div>

              {registrationMsg && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
                  {registrationMsg}
                </div>
              )}

              {regStep === 1 && (
                <form onSubmit={(e) => { e.preventDefault(); setRegStep(2); }} className="space-y-4">
                  <h3 className="text-xs font-mono text-amber-400 uppercase tracking-widest">Step 1: Primary Administrator Setup</h3>
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={regAdminForm.fullName}
                      onChange={(e) => setRegAdminForm({ ...regAdminForm, fullName: e.target.value })}
                      placeholder="Dr. Alexander Wright, MD"
                      className="w-full text-base min-h-[44px] px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">Clinical Email Address *</label>
                    <input
                      type="email"
                      required
                      value={regAdminForm.email}
                      onChange={(e) => setRegAdminForm({ ...regAdminForm, email: e.target.value })}
                      placeholder="director@facility.com"
                      className="w-full text-base min-h-[44px] px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">Account Password *</label>
                    <input
                      type="password"
                      required
                      value={regAdminForm.password}
                      onChange={(e) => setRegAdminForm({ ...regAdminForm, password: e.target.value })}
                      placeholder="••••••••••••"
                      className="w-full text-base min-h-[44px] px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-100"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full min-h-[44px] py-3 rounded-xl text-xs font-semibold bg-amber-400 text-slate-950 mt-4"
                  >
                    Continue to Facility Details →
                  </button>
                </form>
              )}

              {regStep === 2 && (
                <form onSubmit={(e) => { e.preventDefault(); setRegStep(3); }} className="space-y-4">
                  <h3 className="text-xs font-mono text-amber-400 uppercase tracking-widest">Step 2: Medical Facility Profile</h3>
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">Facility Name *</label>
                    <input
                      type="text"
                      required
                      value={regFacilityForm.name}
                      onChange={(e) => setRegFacilityForm({ ...regFacilityForm, name: e.target.value })}
                      placeholder="e.g. Apex Aesthetic Surgery Center"
                      className="w-full text-base min-h-[44px] px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">Medical License Number</label>
                    <input
                      type="text"
                      value={regFacilityForm.licenseNumber}
                      onChange={(e) => setRegFacilityForm({ ...regFacilityForm, licenseNumber: e.target.value })}
                      placeholder="LIC-984210"
                      className="w-full text-base min-h-[44px] px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">Contact Phone</label>
                    <input
                      type="text"
                      value={regFacilityForm.phone}
                      onChange={(e) => setRegFacilityForm({ ...regFacilityForm, phone: e.target.value })}
                      placeholder="+1 (555) 234-5678"
                      className="w-full text-base min-h-[44px] px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-100"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setRegStep(1)}
                      className="w-1/3 min-h-[44px] py-3 rounded-xl text-xs border border-slate-700 text-slate-300"
                    >
                      ← Back
                    </button>
                    <button
                      type="submit"
                      className="w-2/3 min-h-[44px] py-3 rounded-xl text-xs font-semibold bg-amber-400 text-slate-950"
                    >
                      Review & Provision →
                    </button>
                  </div>
                </form>
              )}

              {regStep === 3 && (
                <form onSubmit={handleCompleteRegistration} className="space-y-4 font-mono text-xs">
                  <h3 className="text-xs text-amber-400 uppercase tracking-widest">Step 3: Auto-Provisioning Confirmation</h3>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div><span className="text-slate-400">Plan Tier:</span> {SUBSCRIPTION_TIERS[selectedTierForRegister].name}</div>
                    <div><span className="text-slate-400">Facility:</span> {regFacilityForm.name}</div>
                    <div><span className="text-slate-400">Admin:</span> {regAdminForm.fullName} ({regAdminForm.email})</div>
                    <div><span className="text-slate-400">Database Action:</span> Linking `profiles.facility_id` to `facilities.id` via Supabase RLS.</div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setRegStep(2)}
                      className="w-1/3 min-h-[44px] py-3 rounded-xl border border-slate-700 text-slate-300"
                    >
                      ← Back
                    </button>
                    <button
                      type="submit"
                      className="w-2/3 min-h-[44px] py-3 rounded-xl font-semibold bg-emerald-400 text-slate-950"
                    >
                      Confirm & Provision Facility
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Staff Authentication Portal Tab */}
        {activeTab === "auth" && (
          <div className="max-w-md mx-auto py-8">
            <div className={`p-8 rounded-2xl border ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-md"}`}>
              <h2 className="text-xl font-bold mb-1">Staff Sign-In</h2>
              <p className="text-xs text-slate-400 mb-6 font-mono">Multi-tenant clinical authentication portal.</p>

              {authError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono">
                  {authError}
                </div>
              )}

              <form onSubmit={handleStaffSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Clinical Email</label>
                  <input
                    type="email"
                    required
                    value={authForm.email}
                    onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    placeholder="practitioner@clinic.com"
                    className="w-full text-base min-h-[44px] px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={authForm.password}
                    onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    placeholder="••••••••••••"
                    className="w-full text-base min-h-[44px] px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-100"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[44px] py-3 rounded-xl text-xs font-semibold bg-amber-400 text-slate-950 mt-4"
                >
                  Sign In to Workspace
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Facility Portal Tab */}
        {activeTab === "facility_portal" && (
          <div className="max-w-5xl mx-auto py-6">
            <h2 className="text-xl font-bold mb-2">Facility Portal & Staff Ledger</h2>
            {facilities.length === 0 ? (
              <div className={`p-8 rounded-2xl border text-center ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"}`}>
                <p className="text-sm text-slate-400 mb-4 font-mono">No clinical facilities registered in ledger.</p>
                <button
                  onClick={() => setActiveTab("register")}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl text-xs font-semibold bg-amber-400 text-slate-950"
                >
                  Onboard First Facility
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {facilities.map((fac) => {
                  const facilityProfiles = profiles.filter((p) => p.facilityId === fac.id);
                  return (
                    <div key={fac.id} className={`p-6 rounded-2xl border ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-md"}`}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-bold">{fac.name}</h3>
                          <p className="text-xs font-mono text-slate-400">License: {fac.licenseNumber} • {fac.email}</p>
                        </div>
                        <span className={`text-[10px] font-mono uppercase px-2.5 py-1 rounded border ${SUBSCRIPTION_TIERS[fac.tierId].badgeColor}`}>
                          {SUBSCRIPTION_TIERS[fac.tierId].name}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-xs font-mono mb-4">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Simulations Run</span>
                          <span className="text-amber-400 font-bold">{fac.simulationsUsed} / {fac.simulationsLimit}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Staff Accounts</span>
                          <span>{facilityProfiles.length} Profiles</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Registration Date</span>
                          <span>{fac.registeredDate}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="text-xs font-mono text-slate-400 block uppercase">Practitioner Accounts (RLS Scoped)</span>
                        {facilityProfiles.map((p) => (
                          <div key={p.id} className="p-3 rounded-xl border border-slate-800/80 bg-slate-950/20 text-xs font-mono flex items-center justify-between">
                            <div>
                              <span className="font-bold text-slate-200">{p.fullName}</span>
                              <span className="text-slate-400 block">{p.email} • {p.title}</span>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px] capitalize">{p.role.replace("_", " ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Super Admin Metrics Tab */}
        {activeTab === "super_admin" && (
          <div className="max-w-5xl mx-auto py-6">
            <h2 className="text-xl font-bold mb-2">Super Admin System Metrics</h2>
            <p className="text-xs font-mono text-slate-400 mb-6">Cross-tenant platform statistics, credit allocations, and subscription status.</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="p-4 rounded-xl border bg-slate-900/60 border-slate-800">
                <span className="text-slate-400 text-xs font-mono block">Monthly Recurring Revenue</span>
                <span className="text-2xl font-bold text-emerald-400">
                  ${facilities.reduce((acc, f) => acc + SUBSCRIPTION_TIERS[f.tierId].priceMonthly, 0).toLocaleString()}
                </span>
              </div>
              <div className="p-4 rounded-xl border bg-slate-900/60 border-slate-800">
                <span className="text-slate-400 text-xs font-mono block">Active Facilities</span>
                <span className="text-2xl font-bold text-amber-400">{facilities.length}</span>
              </div>
              <div className="p-4 rounded-xl border bg-slate-900/60 border-slate-800">
                <span className="text-slate-400 text-xs font-mono block">Total Simulations Executed</span>
                <span className="text-2xl font-bold text-blue-400">
                  {facilities.reduce((acc, f) => acc + f.simulationsUsed, 0)}
                </span>
              </div>
            </div>

            {facilities.length === 0 ? (
              <p className="text-xs font-mono text-slate-500 text-center py-8">No registered facilities online.</p>
            ) : (
              <div className="space-y-4">
                {facilities.map((fac) => (
                  <div key={fac.id} className="p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 border-slate-800">
                    <div>
                      <span className="font-bold text-sm block">{fac.name}</span>
                      <span className="text-xs font-mono text-slate-400">{fac.email} • {SUBSCRIPTION_TIERS[fac.tierId].name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setFacilities((prev) =>
                            prev.map((f) => (f.id === fac.id ? { ...f, simulationsLimit: f.simulationsLimit + 100 } : f))
                          );
                        }}
                        className="min-h-[44px] px-3 py-1.5 rounded border font-mono bg-amber-500/10 text-amber-300 border-amber-500/30 text-xs"
                      >
                        +100 Credits
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}