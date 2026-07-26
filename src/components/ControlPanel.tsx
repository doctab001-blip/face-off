"use client";

import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import {
  NOSE_TECHNIQUES,
  CHEEK_TECHNIQUES,
  CHIN_TECHNIQUES,
  BROW_TECHNIQUES,
  LIP_TECHNIQUES,
  type FeatureType,
} from "@/components/constants";

export interface ControlPanelProps {
  selectedFeatures: FeatureType[];
  onToggleFeature: (feat: FeatureType) => void;
  onImageUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  chinTechnique: keyof typeof CHIN_TECHNIQUES;
  setChinTechnique: Dispatch<SetStateAction<keyof typeof CHIN_TECHNIQUES>>;
  cheekTechnique: keyof typeof CHEEK_TECHNIQUES;
  setCheekTechnique: Dispatch<SetStateAction<keyof typeof CHEEK_TECHNIQUES>>;
  cheekDosage: string;
  setCheekDosage: Dispatch<SetStateAction<string>>;
  noseTechnique: keyof typeof NOSE_TECHNIQUES;
  setNoseTechnique: Dispatch<SetStateAction<keyof typeof NOSE_TECHNIQUES>>;
  browTechnique: keyof typeof BROW_TECHNIQUES;
  setBrowTechnique: Dispatch<SetStateAction<keyof typeof BROW_TECHNIQUES>>;
  browThickness: "thin" | "medium" | "thick";
  setBrowThickness: Dispatch<SetStateAction<"thin" | "medium" | "thick">>;
  lipTechnique: keyof typeof LIP_TECHNIQUES;
  setLipTechnique: Dispatch<SetStateAction<keyof typeof LIP_TECHNIQUES>>;
  lipDosage: string;
  setLipDosage: Dispatch<SetStateAction<string>>;
}

const FEATURE_OPTIONS: ReadonlyArray<{ id: FeatureType; label: string }> = [
  { id: "chin", label: "Chin" },
  { id: "cheeks", label: "Cheeks" },
  { id: "nose", label: "Rhinoplasty" },
  { id: "brows", label: "Eyebrows" },
  { id: "upper_lip", label: "Upper Lip" },
  { id: "lower_lip", label: "Lower Lip" },
];

export default function ControlPanel({
  selectedFeatures,
  onToggleFeature,
  onImageUpload,
  chinTechnique,
  setChinTechnique,
  cheekTechnique,
  setCheekTechnique,
  cheekDosage,
  setCheekDosage,
  noseTechnique,
  setNoseTechnique,
  browTechnique,
  setBrowTechnique,
  browThickness,
  setBrowThickness,
  lipTechnique,
  setLipTechnique,
  lipDosage,
  setLipDosage,
}: ControlPanelProps) {
  return (
    <div className="bg-gray-900 p-5 rounded-xl border border-gray-800 space-y-4">
      <div>
        <label className="block text-xs font-semibold text-amber-200 uppercase tracking-wider mb-2">
          1. Select Target Procedures
        </label>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {FEATURE_OPTIONS.map((f) => {
            const active = selectedFeatures.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onToggleFeature(f.id)}
                className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-between transition ${
                  active
                    ? "bg-amber-600/20 border-amber-500 text-amber-200 font-bold"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750"
                }`}
              >
                <span>{f.label}</span>
                <span className="text-xs">{active ? "✓" : "+"}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-gray-800">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Upload Photo</label>
          <input
            type="file"
            accept="image/*"
            onChange={onImageUpload}
            className="text-sm text-gray-300 w-full"
          />
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
  );
}
