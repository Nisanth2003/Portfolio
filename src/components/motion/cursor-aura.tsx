'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A small ring that leads the cursor and expands over interactive elements.
 *
 * The soft violet blob this used to also draw is gone: the WebGL cursor trail now
 * paints the glow around the pointer, and two overlapping violet halos just muddied
 * each other. This is only the crisp precision indicator now.
 *
 * Position is written straight to style.transform inside a rAF loop rather than
 * through React state — one setState per frame would re-render the tree 60x/second.
 */
export function CursorAura() {
  const [enabled, setEnabled] = useState(false);
  const ringRef = useRef<HTMLDivElement>(null);

  const target = useRef({ x: 0, y: 0 });
  const ring = useRef({ x: 0, y: 0 });
  const hot = useRef(false);
  /** Eased in the loop rather than by a CSS transition, for the reason given below. */
  const scale = useRef(1);

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setEnabled(fine && !still);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onMove = (event: PointerEvent) => {
      target.current = { x: event.clientX, y: event.clientY };
      const el = event.target as Element | null;
      hot.current = !!el?.closest?.('a, button, [role="button"]');
    };

    window.addEventListener('pointermove', onMove, { passive: true });

    let frame = 0;
    const loop = () => {
      ring.current.x += (target.current.x - ring.current.x) * 0.22;
      ring.current.y += (target.current.y - ring.current.y) * 0.22;
      scale.current += ((hot.current ? 2.1 : 1) - scale.current) * 0.18;

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ring.current.x}px, ${ring.current.y}px, 0) translate(-50%, -50%) scale(${scale.current.toFixed(3)})`;
        // Idle opacity down from 0.5 to 0.28 — present enough to track, dim enough to
        // stop competing with the plume. Full brightness is reserved for hover.
        ringRef.current.style.opacity = hot.current ? '0.95' : '0.28';
      }

      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] hidden lg:block">
      {/* Violet, not cyan, and the glow is nearly gone.
          A hot cyan ring with a 12px halo was the single brightest thing tracking the
          pointer — it read as a spark leading a flame, and it fought the smoke behind
          it for the same attention. It is a precision indicator, so it only has to be
          locatable, not luminous. It still brightens over interactive elements, which
          is the one moment it should be noticed. */}
      {/* No transition on `transform`. The rAF loop above already writes the position
          every frame with its own easing, and a 200ms CSS transition on top of that
          double-smooths it: the ring keeps travelling for a fifth of a second after the
          pointer stops, and each frame restarts the interpolation, so it floats and
          overshoots instead of settling. Only opacity — which is written as a step — has
          any business being transitioned. */}
      <div
        ref={ringRef}
        className="absolute left-0 top-0 size-6 rounded-full border border-accent/45 transition-opacity duration-200 ease-out"
        style={{ boxShadow: '0 0 6px hsl(271 91% 65% / 0.22)' }}
      />
    </div>
  );
}
