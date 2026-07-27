'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * A track that scrolls itself forever, and hands control over when you ask for it.
 *
 * Shared by the stack columns (vertical) and the project rail (horizontal), because the
 * hard parts are identical in both and none of them are the direction:
 *
 *   - Seamless wrap. The item list is repeated and the track is translated by
 *     `offset mod period`, where period is one copy plus one gap. At the moment the
 *     translation passes a whole period the next copy is sitting exactly where the
 *     first one started, so the reset is invisible and nothing is ever measured
 *     mid-animation.
 *   - Enough copies. Two copies only loop cleanly if one copy is at least as long as
 *     the viewport; with four tech tiles in a 500px column it is not, and the track
 *     runs out and leaves a hole. The copy count is computed from the measured sizes
 *     instead of hardcoded, which is also what lets this work with three items or
 *     thirty.
 *   - Engagement, not hover. A track stops when you *double-tap* it, and stays stopped
 *     until you double-tap again, press Escape, or tap somewhere else. Pausing on hover
 *     was the first attempt and it is wrong: the cursor crosses these on the way down
 *     the page, so the thing froze constantly without anyone asking it to, and there was
 *     no way to tell a deliberate stop from an accidental one.
 *
 *     Engagement is also what makes taking the wheel legitimate. An engaged track
 *     swallows wheel events and scrolls itself; an idle one never does, so the page
 *     keeps scrolling normally under a cursor that happens to be parked on it.
 *   - Yielding anyway. Auto-advance still stops while dragging, while something inside
 *     has keyboard focus, when scrolled out of view, when the tab is hidden, and under
 *     prefers-reduced-motion. Everything except reduced motion is a ref, so none of it
 *     re-renders the list.
 *
 * Movement is written straight to `transform` in a rAF loop rather than going through
 * React or CSS animations: the same loop has to serve auto-advance, drag, wheel and
 * keyboard, and a CSS animation cannot be scrubbed by any of the last three.
 */

export type LoopAxis = 'x' | 'y';

export type LoopTrackOptions = {
  axis: LoopAxis;
  /** Auto-advance speed, px per second. */
  speed: number;
  /** Gap between items *and* between copies, in px. Applied to the track by the caller. */
  gap: number;
  /** Run the other way. Alternating direction per column is what stops a grid of
   *  columns reading as one sliding sheet. */
  reverse?: boolean;
  /** How far one keypress or chevron press moves the track, in px. */
  step?: number;
  /**
   * When one copy already fits the viewport, render a single static copy instead of
   * looping. Wanted for the project rail — three repeats of the same two cards looks
   * like a rendering bug — and not wanted for tech tiles, where a repeating ticker is
   * the point.
   */
  staticWhenShort?: boolean;
  /**
   * Held still from outside. Lets one control stop several tracks at once, which is how
   * the stack columns share a single pause button; drag and the arrow keys keep working
   * while it is set.
   */
  paused?: boolean;
  /**
   * Engagement, controlled from outside. Optional: leave both of these off and the track
   * owns its own engaged state. The stack columns pass them so that engaging one column
   * releases the others — three columns all holding at once is not a state anybody asked
   * for.
   */
  engaged?: boolean;
  onEngagedChange?: (engaged: boolean) => void;
};

/** Max gap between the two taps of a double-tap, ms. */
const DOUBLE_TAP_MS = 400;
/** How far the two taps may drift apart and still count as one gesture, px. */
const DOUBLE_TAP_SLOP = 34;

export function useLoopTrack({
  axis,
  speed,
  gap,
  reverse = false,
  step = 220,
  staticWhenShort = false,
  paused = false,
  engaged: controlledEngaged,
  onEngagedChange,
}: LoopTrackOptions) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  /** The first copy of the item list. Measured to get the wrap period. */
  const setRef = useRef<HTMLDivElement | null>(null);

  const [copies, setCopies] = useState(2);
  const [looping, setLooping] = useState(!staticWhenShort);
  /**
   * Measured size of one copy along the axis, published so a caller can size the viewport
   * to it. A viewport exactly one copy tall can never show the same item twice at once,
   * which is the difference between "a ticker" and "why is Docker listed three times".
   */
  const [setSize, setSetSize] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [grabbing, setGrabbing] = useState(false);
  const [selfEngaged, setSelfEngaged] = useState(false);

  // Controlled when a parent passed `engaged`, self-managed otherwise.
  const engaged = controlledEngaged ?? selfEngaged;

  const setEngaged = useCallback(
    (next: boolean) => {
      if (onEngagedChange) onEngagedChange(next);
      else setSelfEngaged(next);
    },
    [onEngagedChange],
  );

  const reduceMotion = useReducedMotion();

  const period = useRef(0);
  const offset = useRef(0);
  /** Outstanding distance from a keypress or chevron, eased out over a few frames. */
  const glide = useRef(0);

  const playingRef = useRef(true);
  const pausedRef = useRef(false);
  const engagedRef = useRef(false);
  const reduceRef = useRef(false);
  const focused = useRef(false);
  const held = useRef(false);
  const inView = useRef(true);
  const lastPointer = useRef(0);
  /** Distance dragged since pointerdown, so a drag doesn't fire the link underneath. */
  const dragged = useRef(0);
  /** Time and place of the last tap, for double-tap detection. */
  const lastTap = useRef({ at: 0, x: 0, y: 0 });

  playingRef.current = playing;
  pausedRef.current = paused;
  engagedRef.current = engaged;
  reduceRef.current = Boolean(reduceMotion);

  /* ------------------------------------------------------------------ measurement */

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const set = setRef.current;
    if (!viewport || !set) return;

    const copySize = axis === 'x' ? set.offsetWidth : set.offsetHeight;
    const viewSize = axis === 'x' ? viewport.clientWidth : viewport.clientHeight;

    // Nothing has a size yet — first commit before the stylesheet applies, or the track
    // is inside something display:none. Keep the current numbers and wait for the
    // observer: measuring here would lock in a period of one gap and a copy count from
    // a layout that never existed.
    if (copySize <= 0 || viewSize <= 0) return;

    period.current = copySize + gap;
    setSetSize(copySize);

    if (staticWhenShort && copySize <= viewSize) {
      setLooping(false);
      setCopies(1);
      return;
    }

    setLooping(true);
    // +1 so there is always a copy queued beyond the far edge, whatever the wrap
    // position happens to be when a frame lands.
    setCopies(period.current > 0 ? Math.max(2, Math.ceil(viewSize / period.current) + 1) : 2);
  }, [axis, gap, staticWhenShort]);

  useEffect(() => {
    measure();

    const observer = new ResizeObserver(measure);
    if (viewportRef.current) observer.observe(viewportRef.current);
    if (setRef.current) observer.observe(setRef.current);

    // Belt to the observer's braces. A resize that changes the *breakpoint* can change
    // the track's height through a class rather than through anything we observe, and a
    // stale period shows up as a visible seam mid-loop.
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  /* -------------------------------------------------------------------- visibility */

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        inView.current = entry.isIntersecting;
      },
      { rootMargin: '120px' },
    );
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  /* -------------------------------------------------------------------------- loop */

  useEffect(() => {
    if (!looping) {
      if (trackRef.current) trackRef.current.style.transform = '';
      offset.current = 0;
      return;
    }

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      // Clamped: a tab that was backgrounded for a minute must not arrive with a
      // one-minute delta and teleport the track.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const p = period.current;
      if (p > 0) {
        const idle =
          !playingRef.current ||
          pausedRef.current ||
          engagedRef.current ||
          reduceRef.current ||
          focused.current ||
          held.current ||
          !inView.current ||
          document.hidden;

        if (!idle) offset.current += (reverse ? -1 : 1) * speed * dt;

        // Ease out whatever a keypress or chevron asked for, in both states — a nudge
        // while paused is the whole point of the controls.
        if (glide.current !== 0) {
          const move = glide.current * Math.min(1, dt * 9);
          offset.current += move;
          glide.current -= move;
          if (Math.abs(glide.current) < 0.4) glide.current = 0;
        }

        offset.current = ((offset.current % p) + p) % p;

        const track = trackRef.current;
        if (track) {
          track.style.transform =
            axis === 'x'
              ? `translate3d(${-offset.current}px, 0, 0)`
              : `translate3d(0, ${-offset.current}px, 0)`;
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [axis, looping, reverse, speed]);

  /* ---------------------------------------------------------------------- controls */

  const nudge = useCallback((distance: number) => {
    glide.current += distance;
  }, []);

  const togglePlaying = useCallback(() => setPlaying((p) => !p), []);

  /* ------------------------------------------------------------------------- wheel */

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    /**
     * Engaged: the wheel belongs to the track, on whichever axis it runs. That is the
     * deal the double-tap struck, and it is the only state in which taking the page's
     * scroll away from someone is defensible.
     *
     * Idle: the page keeps the wheel. The one exception is a sideways gesture on a
     * horizontal rail — a trackpad swipe left or right cannot have been meant for a
     * vertically scrolling page, so there is nothing to steal.
     *
     * Registered natively because React's wheel listener is passive at the root, where
     * preventDefault does nothing. Reads engagement from a ref so nothing re-binds.
     */
    const onWheel = (event: WheelEvent) => {
      const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY);

      if (engagedRef.current) {
        event.preventDefault();
        offset.current += axis === 'x' ? event.deltaX + event.deltaY : event.deltaY;
        return;
      }

      if (axis === 'x' && sideways) {
        event.preventDefault();
        offset.current += event.deltaX;
      }
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [axis]);

  /* -------------------------------------------------------------------- disengaging */

  useEffect(() => {
    if (!engaged) return;

    // Tapping anywhere else hands the page back. Without this the only way out would be
    // to find the same track again, which is a trap rather than a mode.
    const onOutside = (event: PointerEvent) => {
      const viewport = viewportRef.current;
      if (viewport && event.target instanceof Node && !viewport.contains(event.target)) {
        setEngaged(false);
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEngaged(false);
    };

    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [engaged, setEngaged]);

  /* ----------------------------------------------------------------------- pointer */

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // A finger on an idle vertical track belongs to the page: dragging a column and
      // scrolling the page down are the same gesture, so until the track has been engaged
      // the page wins. Once engaged, the finger is ours.
      if (axis === 'y' && event.pointerType !== 'mouse' && !engagedRef.current) return;

      held.current = true;
      dragged.current = 0;
      lastPointer.current = axis === 'x' ? event.clientX : event.clientY;
      // Throws NotFoundError if the pointer is no longer active, which is not worth
      // losing the drag over — capture is an improvement here, not a requirement.
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        /* keep dragging without capture */
      }
      setGrabbing(true);
    },
    [axis],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!held.current) return;
      const position = axis === 'x' ? event.clientX : event.clientY;
      const delta = position - lastPointer.current;
      lastPointer.current = position;
      dragged.current += Math.abs(delta);
      // Content follows the pointer, so the offset moves against it.
      offset.current -= delta;
    },
    [axis],
  );

  const endDrag = useCallback(() => {
    if (!held.current) return;
    held.current = false;
    setGrabbing(false);
  }, []);

  /**
   * Drag release and double-tap detection in one place, because they are the same event.
   *
   * Detected by hand from pointer timings rather than using `dblclick`: this has to work
   * identically for a finger and a mouse, and the tap has to be disqualified if it was
   * really the end of a drag or landed on a link — double-clicking a tool tile would
   * otherwise open its site twice *and* engage the column.
   */
  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const wasDrag = dragged.current > 8;
      endDrag();

      if (wasDrag) return;
      if (event.target instanceof Element && event.target.closest('a, button')) return;

      const previous = lastTap.current;
      const near =
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < DOUBLE_TAP_SLOP;

      if (event.timeStamp - previous.at < DOUBLE_TAP_MS && near) {
        setEngaged(!engagedRef.current);
        // Consumed, so a third tap starts a fresh gesture instead of toggling again.
        lastTap.current = { at: 0, x: 0, y: 0 };
        return;
      }

      lastTap.current = { at: event.timeStamp, x: event.clientX, y: event.clientY };
    },
    [endDrag, setEngaged],
  );

  /** Swallows the click that ends a drag, so scrubbing never opens a project. */
  const onClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (dragged.current > 8) {
      event.preventDefault();
      event.stopPropagation();
    }
    dragged.current = 0;
  }, []);

  /* ---------------------------------------------------------------------- keyboard */

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
      const forward = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
      if (event.key !== back && event.key !== forward) return;
      event.preventDefault();
      nudge(event.key === forward ? step : -step);
    },
    [axis, nudge, step],
  );

  const handlers = {
    // No hover handlers. Crossing a track with the cursor is not a request to stop it.
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
    },
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: endDrag,
    onClickCapture,
    onKeyDown,
  };

  return {
    viewportRef,
    trackRef,
    setRef,
    copies,
    looping,
    playing,
    grabbing,
    engaged,
    setEngaged,
    setSize,
    /**
     * What the viewport's `touch-action` must be. An engaged track needs the finger, so
     * it takes `none`; an idle one must never block a page scroll.
     */
    touchAction: engaged ? 'none' : axis === 'x' ? 'pan-y' : 'auto',
    togglePlaying,
    nudge,
    step,
    handlers,
  };
}
