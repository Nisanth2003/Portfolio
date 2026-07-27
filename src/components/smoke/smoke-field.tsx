'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Box, Square } from 'lucide-react';

import { smokeStore } from './smoke-store';
import { usePageVisible, useVisualMode } from './use-visual-mode';

// three.js is never server-rendered and is not in the initial bundle — it arrives
// only after useVisualMode decides this device should have it.
const SmokeCanvas = dynamic(() => import('./smoke-canvas'), { ssr: false });

const MAX_CONTEXT_RETRIES = 3;

/**
 * The site-wide smoke field. Fixed behind every section, so the whole page sits in
 * the same volume of smoke rather than the effect stopping below the hero.
 *
 * Scroll position and pointer are written straight into smokeStore from passive
 * listeners. Nothing goes through React state, so moving the mouse or scrolling
 * never re-renders a component.
 */
/**
 * Dev-only framerate readout.
 *
 * A full-screen noise shader is fragment-bound, and the difference between "drifting"
 * and "lurching" is entirely whether it holds frame rate. Browser automation cannot
 * measure this — background tabs are throttled to roughly 1fps — so the number is
 * surfaced in the UI during development instead of guessed at.
 */
function FpsMeter() {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let frame = 0;
    let frames = 0;
    let last = performance.now();

    const tick = (now: number) => {
      frames++;
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (fps === null) return null;

  return (
    <span
      className={
        fps >= 50
          ? 'text-system'
          : fps >= 30
            ? 'text-rank'
            : 'text-destructive'
      }
    >
      {fps} fps
    </span>
  );
}

export function SmokeField() {
  const { mode, capable, toggle } = useVisualMode();
  const visible = usePageVisible();
  const [canvasKey, setCanvasKey] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    let lastX = 0;
    let lastY = 0;

    /**
     * Proximity highlighting: every element marked `data-prox` gets a `--prox`
     * custom property from 0 to 1 based on how close the cursor is to it. Components
     * bind that to a ring or glow, so the page brightens around the cursor as it
     * travels instead of only reacting on direct hover.
     *
     * Runs at most once per frame, and writes only a custom property — no React
     * state, no layout reads beyond the rects, so it never re-renders anything.
     */
    const updateProximity = () => {
      frame = 0;
      root.style.setProperty('--mx', `${lastX}px`);
      root.style.setProperty('--my', `${lastY}px`);

      const targets = document.querySelectorAll<HTMLElement>('[data-prox]');
      for (const el of targets) {
        const rect = el.getBoundingClientRect();
        // Distance to the element's edge, not its centre, so large cards do not
        // need the cursor in the middle before they respond.
        const dx = Math.max(rect.left - lastX, 0, lastX - rect.right);
        const dy = Math.max(rect.top - lastY, 0, lastY - rect.bottom);
        const distance = Math.hypot(dx, dy);
        const intensity = Math.max(0, 1 - distance / 260);
        el.style.setProperty('--prox', intensity.toFixed(3));
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      lastX = event.clientX;
      lastY = event.clientY;

      smokeStore.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      smokeStore.pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);

      // Texture space for the trail splat: y flipped, since GL puts 0 at the bottom.
      smokeStore.uv.x = event.clientX / window.innerWidth;
      smokeStore.uv.y = 1 - event.clientY / window.innerHeight;
      smokeStore.pointerActive = true;

      if (!frame) frame = requestAnimationFrame(updateProximity);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    // Leaving the window stops the trail emitting rather than freezing a blob at the
    // last known position.
    const onLeave = () => {
      smokeStore.pointerActive = false;
    };
    document.addEventListener('pointerleave', onLeave);

    // Scroll position only. An earlier version also tracked velocity and fed it to
    // the shader as a sideways shear plus a brightness boost — that made the whole
    // field lurch and flash whenever the wheel moved, which read as the background
    // fighting the page. Scroll now only advances the existing drift.
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      smokeStore.scroll = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      {/* Always painted: the CSS void gradient. First paint is never empty, and this
          is the whole backdrop when WebGL is unavailable or declined. */}
      <div
        aria-hidden="true"
        className="void-backdrop grain fixed inset-0 -z-30"
        style={{ pointerEvents: 'none' }}
      />

      {mode === '3d' && (
        <div aria-hidden="true" className="fixed inset-0 -z-20" style={{ pointerEvents: 'none' }}>
          <SmokeCanvas
            key={canvasKey}
            paused={!visible}
            onContextLost={() => setCanvasKey((k) => (k < MAX_CONTEXT_RETRIES ? k + 1 : k))}
          />
        </div>
      )}

      {capable && (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={mode === '3d'}
          className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-sm border border-border/60 bg-card/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur-md transition-colors hover:border-accent/50 hover:text-foreground"
        >
          {mode === '3d' ? (
            <Box aria-hidden="true" className="size-3" />
          ) : (
            <Square aria-hidden="true" className="size-3" />
          )}
          Smoke {mode === '3d' ? 'on' : 'off'}
          {process.env.NODE_ENV === 'development' && mode === '3d' && (
            <>
              <span aria-hidden="true" className="h-2.5 w-px bg-border" />
              <FpsMeter />
            </>
          )}
        </button>
      )}
    </>
  );
}
