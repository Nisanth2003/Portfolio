'use client';

import { useCallback, useEffect, useState } from 'react';

export type VisualMode = '3d' | 'flat';

const STORAGE_KEY = 'portfolio:visual-mode';

/**
 * Cheap capability probe. Creating and immediately discarding a context is the only
 * reliable way to know WebGL actually works on this machine.
 *
 * Deliberately permissive: the scene IS the page, so the bar to show it is low.
 * Only two things veto it — the visitor asked for reduced motion, or WebGL is
 * genuinely unavailable. Small viewports fall back because the composition is built
 * around a wide frame, not because of performance paranoia.
 */
/**
 * Cached across the page's lifetime. Browsers cap how many live WebGL contexts a
 * document may hold and evict the oldest when the cap is hit — so probing on every
 * mount can knock out the context belonging to the real canvas. Probe once.
 */
let webglProbe: boolean | null = null;

function hasWebgl(): boolean {
  if (webglProbe !== null) return webglProbe;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    webglProbe = gl !== null;
    // Deliberately NOT calling WEBGL_lose_context.loseContext() here. Forcing a loss
    // counts against the same context budget and was evicting the hero canvas.
    // Dropping the references is enough — the context is collected with the canvas.
  } catch {
    webglProbe = false;
  }
  return webglProbe;
}

function deviceSupports3d(): boolean {
  if (typeof window === 'undefined') return false;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (!window.matchMedia('(min-width: 768px)').matches) return false;

  return hasWebgl();
}

/**
 * Resolves how rich the hero should be, and lets the visitor override it.
 *
 * Starts as 'flat' on every render including the server one, so first paint is
 * always the cheap path and there is no hydration mismatch. Upgrading to '3d'
 * happens after mount, and only once the browser is idle — the shader must never
 * compete with LCP.
 */
export function useVisualMode() {
  const [mode, setMode] = useState<VisualMode>('flat');
  const [capable, setCapable] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supports = deviceSupports3d();
    setCapable(supports);

    let stored: VisualMode | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === '3d' || raw === 'flat') stored = raw;
    } catch {
      // Private mode or blocked storage — fall through to the capability default.
    }

    // An explicit opt-in wins over the capability probe, so someone on reduced
    // motion who wants the scene can still ask for it.
    const target: VisualMode = stored ?? (supports ? '3d' : 'flat');

    if (target === 'flat') {
      setReady(true);
      return;
    }

    const upgrade = () => {
      setMode('3d');
      setReady(true);
    };

    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(upgrade, { timeout: 1200 });
      return () => window.cancelIdleCallback?.(handle);
    }

    const handle = window.setTimeout(upgrade, 500);
    return () => window.clearTimeout(handle);
  }, []);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next: VisualMode = prev === '3d' ? 'flat' : '3d';
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Non-fatal: the toggle still works for this session.
      }
      return next;
    });
  }, []);

  return { mode, capable, ready, toggle };
}

/** True while the tab is actually visible. Used to stop the render loop when it
 *  cannot possibly be seen. */
export function usePageVisible() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    onChange();
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}
