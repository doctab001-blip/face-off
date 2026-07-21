"use client";

import { DEFAULT_PROCEDURES, type ProcedureType } from "@/lib/types";

interface ProcedurePanelProps {
  selected: ProcedureType | null;
  intensity: number;
  onSelect: (procedure: ProcedureType) => void;
  onIntensityChange: (value: number) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  disabled?: boolean;
}

export function ProcedurePanel({
  selected,
  intensity,
  onSelect,
  onIntensityChange,
  onGenerate,
  isGenerating,
  disabled,
}: ProcedurePanelProps) {
  return (
    <aside className="flex flex-col gap-6 rounded-2xl border border-border bg-surface/80 p-6 backdrop-blur-sm">
      <div>
        <h2 className="font-display text-xl text-foreground">Procedures</h2>
        <p className="mt-1 text-sm text-muted">
          Select a treatment and adjust intensity before generating a preview.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {DEFAULT_PROCEDURES.map((procedure) => {
          const isActive = selected === procedure.id;

          return (
            <button
              key={procedure.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(procedure.id)}
              className={`rounded-xl border px-4 py-3 text-left transition-all ${
                isActive
                  ? "border-accent/60 bg-accent-soft"
                  : "border-border bg-surface-elevated/40 hover:border-accent/30 hover:bg-surface-elevated/70"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <p className="text-sm font-medium text-foreground">{procedure.label}</p>
              <p className="mt-0.5 text-xs text-muted">{procedure.description}</p>
            </button>
          );
        })}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="intensity" className="text-sm text-foreground">
            Intensity
          </label>
          <span className="text-xs text-accent">{intensity}%</span>
        </div>
        <input
          id="intensity"
          type="range"
          min={0}
          max={100}
          step={5}
          value={intensity}
          disabled={disabled || !selected}
          onChange={(e) => onIntensityChange(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <button
        type="button"
        disabled={disabled || !selected || isGenerating}
        onClick={onGenerate}
        className="mt-auto rounded-xl bg-accent px-4 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isGenerating ? "Generating preview…" : "Generate preview"}
      </button>
    </aside>
  );
}
