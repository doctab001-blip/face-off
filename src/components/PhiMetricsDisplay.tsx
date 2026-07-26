"use client";

export interface PhiMetrics {
  facePhiRatio: string;
  verticalThirdsRatio: string;
  overallScore: string;
  clinicalAnalysis: string;
}

export interface PhiMetricsDisplayProps {
  fullFacePhi: PhiMetrics;
}

export default function PhiMetricsDisplay({ fullFacePhi }: PhiMetricsDisplayProps) {
  return (
    <div className="bg-indigo-950/40 border border-indigo-500/30 p-4 rounded-xl space-y-2 text-xs font-mono">
      <div className="flex justify-between items-center border-b border-indigo-900/50 pb-2">
        <span className="text-amber-400 font-bold">FULL FACE RULE OF THIRDS (Φ = 1.618)</span>
        <span className="text-indigo-300">
          Divine Match: <strong>{fullFacePhi.overallScore}</strong>
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-300 pt-1">
        <div>
          <span className="text-gray-400 block">Height / Width Ratio:</span>
          <strong className="text-white text-sm">{fullFacePhi.facePhiRatio}</strong>
          <span className="text-[10px] text-gray-500 block">(Target Φ = 1.618)</span>
        </div>
        <div>
          <span className="text-gray-400 block">Vertical Thirds (Upper : Mid : Lower):</span>
          <strong className="text-white text-sm">{fullFacePhi.verticalThirdsRatio}</strong>
          <span className="text-[10px] text-gray-500 block">(Target = 1.0 : 1.0 : 1.0)</span>
        </div>
      </div>
    </div>
  );
}
