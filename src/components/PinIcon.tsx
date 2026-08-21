export function PinIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path
        d="M9.5 1.8 14.2 6.5l-1.9.6-2.7 2.7-.3 3-1.6-1.6-4 4 4-4-1.6-1.6 3-.3 2.7-2.7.7-1.8Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
