"use client";

import { useEffect } from "react";

/**
 * A click-point ripple on every `.button`, without touching the ~30
 * components that render one. One delegated listener finds the nearest
 * `.button` ancestor, drops a `<span class="ripple">` positioned at the
 * pointer, and lets the CSS animation (globals.css) remove itself.
 */
export function RippleEffect() {
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(".button");
      if (!target || target.hasAttribute("disabled")) return;

      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.6;
      const span = document.createElement("span");
      span.className = "ripple";
      span.style.width = `${size}px`;
      span.style.height = `${size}px`;
      span.style.left = `${event.clientX - rect.left - size / 2}px`;
      span.style.top = `${event.clientY - rect.top - size / 2}px`;
      span.addEventListener("animationend", () => span.remove());
      target.appendChild(span);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return null;
}
