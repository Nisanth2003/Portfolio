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

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ring.current.x}px, ${ring.current.y}px, 0) translate(-50%, -50%) scale(${hot.current ? 2.1 : 1})`;
        ringRef.current.style.opacity = hot.current ? '1' : '0.5';
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
      <div
        ref={ringRef}
        className="absolute left-0 top-0 size-6 rounded-full border border-system/70 transition-[transform,opacity] duration-200 ease-out"
        style={{ boxShadow: '0 0 12px hsl(188 86% 53% / 0.6)' }}
      />
    </div>
  );
}
