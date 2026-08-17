"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A destructive action that arms itself on first click instead of opening a
 * modal — one less layer of chrome, and it disarms on its own after a moment.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className = "",
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function handleClick() {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 3500);
      return;
    }

    clearTimeout(timer.current);
    setArmed(false);
    onConfirm();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onBlur={() => {
        clearTimeout(timer.current);
        setArmed(false);
      }}
      className={`rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
        armed ? "bg-hover text-danger" : "text-ink-muted hover:bg-hover hover:text-ink"
      } ${className}`}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
