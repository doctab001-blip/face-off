"use client";

import React, { useState } from "react";
import VisualizerApp from "@/components/VisualizerApp";

type SubscriptionTierId = "boutique" | "clinical_group" | "enterprise";
type ActiveTab = "visualizer" | "pricing" | "register" | "facility_portal" | "admin_portal";

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
      "All Core Facial Procedures",
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
      "FLUX Inpainting Engine",
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

export default function DashboardApp() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("visualizer");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [activeFacilityId, setActiveFacilityId] = useState<string | null>(null);
  const [selectedTierForRegister, setSelectedTierForRegister] =
    useState<SubscriptionTierId>("clinical_group");
  const [regForm, setRegForm] = useState({
    name: "",
    practitionerName: "",
    practitionerTitle: "",
    email: "",
    phone: "",
    address: "",
  });
  const [registrationSuccessMsg, setRegistrationSuccessMsg] = useState("");

  const isDark = theme === "dark";
  const currentFacility = facilities.find((f) => f.id === activeFacilityId) ?? null;

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

  const handleSimulationComplete = () => {
    if (!activeFacilityId) return;
    setFacilities((prev) =>
      prev.map((f) =>
        f.id === activeFacilityId
          ? { ...f, simulationsUsed: f.simulationsUsed + 1 }
          : f,
      ),
    );
  };

  const tabClass = (tab: ActiveTab | "pricing_group") => {
    const active =
      tab === "pricing_group"
        ? activeTab === "pricing" || activeTab === "register"
        : activeTab === tab;
    return `px-3 py-1.5 rounded-lg transition ${
      active
        ? isDark
          ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30"
          : "bg-white text-amber-800 font-semibold border border-amber-500/30 shadow-sm"
        : isDark
          ? "text-slate-400 hover:text-slate-200"
          : "text-slate-600 hover:text-slate-900"
    }`;
  };

  return (
    <div
      className={`min-h-[100dvh] font-sans selection:bg-amber-500 selection:text-black transition-colors duration-300 ${
        isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
      style={{
        fontFamily:
          "'Avenir Next', 'Avenir', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <header
        className={`sticky top-0 z-50 backdrop-blur-md border-b transition-colors duration-300 ${
          isDark ? "bg-slate-950/90 border-slate-800" : "bg-white/90 border-slate-200 shadow-sm"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab("visualizer")}
              className={`text-xl font-bold tracking-wider transition ${
                isDark ? "text-amber-200 hover:text-amber-100" : "text-amber-700 hover:text-amber-800"
              }`}
            >
              Face-off.ai
            </button>
            <span
              className={`hidden sm:inline-block text-[10px] uppercase tracking-widest px-2.5 py-0.5 rounded border font-mono ${
                isDark
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-amber-500/10 text-amber-700 border-amber-500/30"
              }`}
            >
              Clinical Platform
            </span>
          </div>

          <nav
            className={`flex items-center gap-1 p-1 rounded-xl border text-xs font-medium overflow-x-auto ${
              isDark ? "bg-slate-900/80 border-slate-800" : "bg-slate-100 border-slate-200"
            }`}
          >
            <button type="button" onClick={() => setActiveTab("visualizer")} className={tabClass("visualizer")}>
              🔬 Visualizer
            </button>
            <button type="button" onClick={() => setActiveTab("pricing")} className={tabClass("pricing_group")}>
              💳 Plans & Login
            </button>
            <button type="button" onClick={() => setActiveTab("facility_portal")} className={tabClass("facility_portal")}>
              🏥 Facility Portal
            </button>
            <button type="button" onClick={() => setActiveTab("admin_portal")} className={tabClass("admin_portal")}>
              👑 Super Admin
            </button>
          </nav>

          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-xs font-mono ${
              isDark ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-700"
            }`}
          >
            {isDark ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === "visualizer" && (
          <div>
            <div
              className={`mb-6 pb-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                isDark ? "border-slate-800/80" : "border-slate-200"
              }`}
            >
              <div>
                <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                  Aesthetic Procedure AI Simulator
                </h1>
                <p className={`text-xs font-mono mt-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Multi-feature facial aesthetic simulation with MediaPipe landmarks and Fal inpainting.
                </p>
              </div>

              <div
                className={`p-3 rounded-xl border flex items-center gap-4 text-xs font-mono ${
                  isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm"
                }`}
              >
                {currentFacility ? (
                  <>
                    <div>
                      <div className={`text-[10px] uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Clinic Account
                      </div>
                      <div className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                        {currentFacility.name}
                      </div>
                    </div>
                    <div className={`h-6 w-px ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                    <div>
                      <div className={`text-[10px] uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Monthly Simulations
                      </div>
                      <div className={`font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                        {currentFacility.simulationsUsed} /{" "}
                        {currentFacility.simulationsLimit >= 99999 ? "∞" : currentFacility.simulationsLimit}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded border ${SUBSCRIPTION_TIERS[currentFacility.tierId].badgeColor}`}
                    >
                      {SUBSCRIPTION_TIERS[currentFacility.tierId].name}
                    </span>
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      Unregistered / Guest Mode
                    </span>
                    <button
                      type="button"
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

            <VisualizerApp embedded onSimulationComplete={handleSimulationComplete} />
          </div>
        )}

        {(activeTab === "pricing" || activeTab === "register") && (
          <div className="max-w-5xl mx-auto py-6 space-y-8">
            <div className="text-center space-y-2">
              <h2 className={`text-2xl font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                Facility Plans & Clinical Login
              </h2>
              <p className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Session-local demo onboarding. Choose a plan, register your facility, then manage staff in Facility Portal.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTierId[]).map((tierId) => {
                const tier = SUBSCRIPTION_TIERS[tierId];
                const selected = selectedTierForRegister === tierId;
                return (
                  <button
                    key={tierId}
                    type="button"
                    onClick={() => {
                      setSelectedTierForRegister(tierId);
                      setActiveTab("register");
                    }}
                    className={`text-left p-5 rounded-2xl border transition ${
                      selected
                        ? "border-amber-500/50 bg-amber-500/10"
                        : isDark
                          ? "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                          : "border-slate-200 bg-white hover:border-slate-300 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-bold text-sm">{tier.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${tier.badgeColor}`}>
                        ${tier.priceMonthly}/mo
                      </span>
                    </div>
                    <ul className={`space-y-1.5 text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      {tier.features.map((f) => (
                        <li key={f}>• {f}</li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {activeTab === "register" && (
              <div
                className={`p-6 rounded-2xl border ${
                  isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-md"
                }`}
              >
                <h3 className="text-lg font-bold mb-1">Register Facility / Admin Login</h3>
                <p className={`text-xs font-mono mb-4 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Selected plan: {SUBSCRIPTION_TIERS[selectedTierForRegister].name}
                </p>

                {registrationSuccessMsg ? (
                  <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-sm font-mono">
                    {registrationSuccessMsg}
                  </div>
                ) : (
                  <form onSubmit={handleRegisterFacility} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block text-xs space-y-1">
                      <span className="text-slate-400 font-mono">Facility Name</span>
                      <input
                        required
                        value={regForm.name}
                        onChange={(e) => setRegForm((s) => ({ ...s, name: e.target.value }))}
                        className={`w-full p-2.5 rounded-lg border text-sm ${
                          isDark ? "bg-slate-950 border-slate-700" : "bg-white border-slate-300"
                        }`}
                      />
                    </label>
                    <label className="block text-xs space-y-1">
                      <span className="text-slate-400 font-mono">Admin Email</span>
                      <input
                        required
                        type="email"
                        value={regForm.email}
                        onChange={(e) => setRegForm((s) => ({ ...s, email: e.target.value }))}
                        className={`w-full p-2.5 rounded-lg border text-sm ${
                          isDark ? "bg-slate-950 border-slate-700" : "bg-white border-slate-300"
                        }`}
                      />
                    </label>
                    <label className="block text-xs space-y-1">
                      <span className="text-slate-400 font-mono">Primary Practitioner</span>
                      <input
                        value={regForm.practitionerName}
                        onChange={(e) => setRegForm((s) => ({ ...s, practitionerName: e.target.value }))}
                        className={`w-full p-2.5 rounded-lg border text-sm ${
                          isDark ? "bg-slate-950 border-slate-700" : "bg-white border-slate-300"
                        }`}
                      />
                    </label>
                    <label className="block text-xs space-y-1">
                      <span className="text-slate-400 font-mono">Title / Role</span>
                      <input
                        value={regForm.practitionerTitle}
                        onChange={(e) => setRegForm((s) => ({ ...s, practitionerTitle: e.target.value }))}
                        className={`w-full p-2.5 rounded-lg border text-sm ${
                          isDark ? "bg-slate-950 border-slate-700" : "bg-white border-slate-300"
                        }`}
                      />
                    </label>
                    <label className="block text-xs space-y-1">
                      <span className="text-slate-400 font-mono">Phone</span>
                      <input
                        value={regForm.phone}
                        onChange={(e) => setRegForm((s) => ({ ...s, phone: e.target.value }))}
                        className={`w-full p-2.5 rounded-lg border text-sm ${
                          isDark ? "bg-slate-950 border-slate-700" : "bg-white border-slate-300"
                        }`}
                      />
                    </label>
                    <label className="block text-xs space-y-1">
                      <span className="text-slate-400 font-mono">Address</span>
                      <input
                        value={regForm.address}
                        onChange={(e) => setRegForm((s) => ({ ...s, address: e.target.value }))}
                        className={`w-full p-2.5 rounded-lg border text-sm ${
                          isDark ? "bg-slate-950 border-slate-700" : "bg-white border-slate-300"
                        }`}
                      />
                    </label>
                    <div className="md:col-span-2 flex justify-end pt-2">
                      <button
                        type="submit"
                        className="min-h-[44px] px-6 py-2.5 rounded-xl bg-amber-400 text-slate-950 font-semibold text-xs transition shadow-lg shadow-amber-500/10"
                      >
                        Complete Facility Registration ($
                        {SUBSCRIPTION_TIERS[selectedTierForRegister].priceMonthly}/mo)
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
              <div
                className={`p-8 rounded-2xl border text-center ${
                  isDark ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
                }`}
              >
                <p className={`text-sm mb-4 font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  No clinical facilities registered in this session.
                </p>
                <button
                  type="button"
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
                      <span
                        className={`text-[10px] font-mono uppercase px-2.5 py-1 rounded border ${SUBSCRIPTION_TIERS[fac.tierId].badgeColor}`}
                      >
                        {SUBSCRIPTION_TIERS[fac.tierId].name}
                      </span>
                    </div>

                    <div
                      className={`grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-xl border text-xs font-mono mb-4 ${
                        isDark ? "bg-slate-950/40 border-slate-800" : "bg-slate-50 border-slate-200"
                      }`}
                    >
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
                      type="button"
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
              <div
                className={`p-4 rounded-xl border ${
                  isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"
                }`}
              >
                <span className="text-slate-400 text-xs font-mono block">Monthly Recurring Revenue</span>
                <span className="text-2xl font-bold text-emerald-400">
                  $
                  {facilities
                    .reduce((acc, f) => acc + SUBSCRIPTION_TIERS[f.tierId].priceMonthly, 0)
                    .toLocaleString()}
                </span>
              </div>
              <div
                className={`p-4 rounded-xl border ${
                  isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"
                }`}
              >
                <span className="text-slate-400 text-xs font-mono block">Active Facilities</span>
                <span className="text-2xl font-bold text-amber-400">{facilities.length}</span>
              </div>
              <div
                className={`p-4 rounded-xl border ${
                  isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"
                }`}
              >
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
                      type="button"
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

        <footer
          className={`mt-12 pt-6 border-t text-center text-[10px] font-mono leading-relaxed ${
            isDark ? "border-slate-800 text-slate-600" : "border-slate-200 text-slate-500"
          }`}
        >
          Medical Disclaimer: This simulation tool utilizes AI for educational modeling and patient consultation
          support only. Treatment planning requires an in-person clinical assessment by a licensed physician.
        </footer>
      </main>
    </div>
  );
}
