"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
};

/**
 * A right-click menu positioned at the pointer, nudged back inside the window
 * if it would otherwise overflow. Closes on outside click, Escape, or scroll —
 * a menu left floating over content it no longer points at is worse than none.
 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;

    const { width, height } = element.getBoundingClientRect();
    setPosition({
      x: Math.min(x, window.innerWidth - width - 8),
      y: Math.min(y, window.innerHeight - height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    /*
     * Clicks *inside* the menu must be ignored here. This listener runs on
     * mousedown in the capture phase, so closing unconditionally would unmount
     * the menu before the click reached the item — every action silently did
     * nothing.
     */
    const onPointerDown = (event: MouseEvent) => {
      if (menu.current?.contains(event.target as Node)) return;
      onClose();
    };

    const close = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menu}
      role="menu"
      style={{ left: position.x, top: position.y }}
      className="fixed z-50 min-w-[168px] overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-lg shadow-black/5"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={`block w-full px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-hover ${
            item.danger ? "text-danger" : "text-ink"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
