export function Header() {
  return (
    <header className="border-b border-border/60 bg-surface/40 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="animate-fade-up">
          <p className="font-display text-2xl tracking-wide text-foreground">
            Face-off<span className="text-accent">.ai</span>
          </p>
          <p className="mt-0.5 text-xs tracking-widest text-muted uppercase">
            Aesthetic Procedure Visualizer
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-border bg-surface-elevated/60 px-4 py-2 text-xs text-muted sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-soft" />
          MediaPipe + fal.ai ready
        </div>
      </div>
    </header>
  );
}
