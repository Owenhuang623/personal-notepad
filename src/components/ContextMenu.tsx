"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  /** Needed when two items can share a label — two folders with the same name. */
  key?: string;
  danger?: boolean;
  /** Arms on the first click and only fires on the second. For anything irreversible. */
  confirm?: boolean;
  /** Shown but not clickable — where a note already is, in the move picker. */
  disabled?: boolean;
  /** Nesting level, for items that stand for folders. */
  indent?: number;
  icon?: React.ReactNode;
  /** Draws a rule above this item. */
  separated?: boolean;
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
  const [armed, setArmed] = useState<string | null>(null);

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
      style={{ left: position.x, top: position.y, boxShadow: "var(--shadow)" }}
      className="np-pop fixed z-50 max-h-[min(420px,70vh)] min-w-[180px] max-w-[280px] overflow-y-auto rounded-lg border border-line bg-canvas p-1"
    >
      {items.map((item) => {
        const id = item.key ?? item.label;
        const isArmed = armed === id;

        return (
          <div key={id}>
            {item.separated && <div className="mx-1.5 my-1 h-px bg-line" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              // An irreversible action sits one click away from a harmless one;
              // the first click only arms it.
              if (item.confirm && !isArmed) {
                setArmed(id);
                return;
              }
              onClose();
              item.onSelect();
            }}
            style={item.indent ? { paddingLeft: `${0.625 + item.indent * 0.875}rem` } : undefined}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors enabled:hover:bg-hover disabled:text-ink-faint ${
              item.danger ? "text-danger" : "text-ink"
            } ${isArmed ? "bg-hover font-medium" : ""}`}
          >
            {item.icon && <span className="shrink-0 text-ink-faint">{item.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{isArmed ? "Click again to confirm" : item.label}</span>
          </button>
          </div>
        );
      })}
    </div>
  );
}
