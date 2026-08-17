export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-ink" />
      <g className="stroke-canvas" strokeWidth="2.4" strokeLinecap="round">
        <line x1="9" y1="11" x2="23" y2="11" />
        <line x1="9" y1="16" x2="23" y2="16" />
        <line x1="9" y1="21" x2="17" y2="21" />
      </g>
    </svg>
  );
}
