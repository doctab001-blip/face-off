"use client";

import React from "react";
import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-slate-100 font-sans selection:bg-amber-500 selection:text-black">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-gray-950/80 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-serif tracking-wider text-amber-200">Face-off.ai</span>
            <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
              Clinical Edition
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-amber-300 transition">Features</a>
            <a href="#procedures" className="hover:text-amber-300 transition">Procedures</a>
            <a href="#phi-metrics" className="hover:text-amber-300 transition">Facial Phi Metrics</a>
          </nav>

          <div className="flex items-center gap-3">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="text-xs text-slate-300 hover:text-white font-medium px-4 py-2 rounded-lg border border-slate-700 hover:border-slate-500 transition">
                  Facility Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="text-xs font-semibold text-gray-950 bg-amber-400 hover:bg-amber-300 px-4 py-2 rounded-lg transition shadow-md shadow-amber-500/10">
                  Register Facility
                </button>
              </SignUpButton>
            </Show>

            <Show when="signed-in">
              <UserButton afterSignOutUrl="/" />
            </Show>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-24 pb-20 md:pt-32 md:pb-28">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-amber-500/10 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-5xl mx-auto px-6 text-center relative z-10">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-400 font-mono mb-4">
            Next-Generation Consultation Visualization
          </p>
          
          <h1 className="text-4xl md:text-6xl font-serif text-slate-100 tracking-tight leading-tight mb-6">
            Precision AI Procedure Simulation for <span className="italic text-amber-200">Aesthetic Clinics</span>
          </h1>
          
          <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Elevate patient consultations with real-time, landmark-guided multi-feature aesthetic predictions and full-face divine proportion ($\Phi$) metric analysis.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/visualizer"
              className="w-full sm:w-auto px-8 py-4 text-sm font-semibold text-gray-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2"
            >
              <span>Launch Procedure Visualizer</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section id="features" className="py-20 border-t border-slate-800/80 bg-gray-900/40">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-serif text-slate-100 mb-3">Designed for Clinical Excellence</h2>
            <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Built for aesthetic practitioners and consultation specialists</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/30 transition">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4 text-lg">
                📐
              </div>
              <h3 className="text-lg font-medium text-slate-100 mb-2">Rule of Thirds & $\Phi$ Ratio</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Interactive vertical third lines and golden ratio guides directly calculated against key facial landmarks (Trichion, Glabella, Subnasale, Menton).
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/30 transition">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4 text-lg">
                ✨
              </div>
              <h3 className="text-lg font-medium text-slate-100 mb-2">Multi-Feature Composite</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Simulate simultaneous procedures across chin mentoplasty, cheek volumetric projection, rhinoplasty refinement, eyebrows, and lips.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/30 transition">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4 text-lg">
                📄
              </div>
              <h3 className="text-lg font-medium text-slate-100 mb-2">Clinical Consultation PDF</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Generate clean, branded consultation summaries complete with baseline comparison images and facial proportion metrics for patient records.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action Banner */}
      <section className="py-20 border-t border-slate-800/80">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-serif text-slate-100 mb-4">Ready to Transform Your Patient Consultations?</h2>
          <p className="text-sm text-slate-400 mb-8 max-w-xl mx-auto">
            Experience real-time interactive procedure simulation directly in your browser.
          </p>
          <Link
            href="/visualizer"
            className="inline-flex items-center gap-2 px-8 py-4 text-sm font-semibold text-gray-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition shadow-xl shadow-amber-500/20"
          >
            Open Procedure Visualizer
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-900 bg-gray-950 text-center text-xs text-slate-500">
        <p>© 2026 Face-off.ai. Clinical procedure simulation for educational and consultation purposes only.</p>
      </footer>
    </div>
  );
}