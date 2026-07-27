"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ClinicAuth() {
  const router = useRouter();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      }

      const supabase = createClient();

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/dashboard"); // Redirect to the secure simulator portal
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // Optional: specify redirect URL for email confirmation if enabled in Supabase
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setMessage("Registration successful. Please check your email to verify your clinic's account.");
      }
    } catch (err: unknown) {
      const messageText = err instanceof Error ? err.message : "An authentication error occurred.";
      setError(messageText);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 select-none">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 card-clinical">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight bg-gradient-to-r from-blue-700 via-blue-600 to-teal-500 bg-clip-text text-transparent">
            Face-off.ai
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            {isLogin ? "Secure Clinic Portal Login" : "Register Your Medical Facility"}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs text-center">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-lg text-teal-700 text-xs text-center">
            {message}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Authorized Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 text-slate-900 placeholder:text-slate-400 border border-slate-200 rounded-lg p-2.5 text-sm focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none transition"
              placeholder="admin@clinic.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 text-slate-900 placeholder:text-slate-400 border border-slate-200 rounded-lg p-2.5 text-sm focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none transition"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-clinical w-full disabled:cursor-not-allowed font-semibold py-2.5 rounded-xl transition text-sm"
          >
            {loading ? "Processing..." : isLogin ? "Authenticate" : "Submit Registration"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
              setMessage(null);
            }}
            className="text-xs font-medium text-blue-700 hover:text-blue-800 transition"
          >
            {isLogin
              ? "Need a facility license? Register here."
              : "Already have a license? Log in here."}
          </button>
        </div>
      </div>
    </div>
  );
}
