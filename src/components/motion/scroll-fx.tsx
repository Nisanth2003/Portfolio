'use client';

import { useRef } from 'react';
import {
  motion,
  useMotionTemplate,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';

import { cn } from '@/lib/utils';

/**
 * Everything here is *scrubbed* — driven continuously by the element's own scroll
 * progress rather than fired once when it enters the viewport.
 *
 * That is the difference between "content slides up once and is done" and a page that
 * responds to the scrollbar: scroll back up and every transform runs backwards,
 * because the transform is a pure function of scroll position. Nothing is one-shot.
 */

type ScrollOptions = NonNullable<Parameters<typeof useScroll>[0]>;
type Offset = NonNullable<ScrollOptions['offset']>;

/** Element progress, spring-smoothed so the scrub feels weighted rather than glued
 *  to raw wheel deltas. */
function useElementProgress(
  ref: React.RefObject<HTMLElement | null>,
  offset: Offset,
): MotionValue<number> {
  const { scrollYProgress } = useScroll({ target: ref, offset });
  return useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.35 });
}

/**
 * Rotates content up out of Z-space as it enters. This is the "3D reveal" — real
 * perspective rotation and depth translation, not an opacity fade.
 */
export function ScrollReveal3D({
  children,
  className,
  intensity = 1,
  from = 'bottom',
}: {
  children: React.ReactNode;
  className?: string;
  /** Scales the whole effect. 0.6 for text blocks, 1.4 for hero-scale moments. */
  intensity?: number;
  from?: 'bottom' | 'left' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const progress = useElementProgress(ref, ['start end', 'center 68%']);

  const rotateX = useTransform(progress, [0, 1], [26 * intensity, 0]);
  const rotateY = useTransform(
    progress,
    [0, 1],
    [from === 'left' ? -22 * intensity : from === 'right' ? 22 * intensity : 0, 0],
  );
  const y = useTransform(progress, [0, 1], [80 * intensity, 0]);
  const z = useTransform(progress, [0, 1], [-260 * intensity, 0]);
  const scale = useTransform(progress, [0, 1], [1 - 0.12 * intensity, 1]);
  const opacity = useTransform(progress, [0, 0.55, 1], [0, 0.75, 1]);
  const blurPx = useTransform(progress, [0, 0.8, 1], [10 * intensity, 1, 0]);
  const filter = useMotionTemplate`blur(${blurPx}px)`;

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <div ref={ref} className={cn('[perspective:1100px]', className)}>
      <motion.div
        style={{ rotateX, rotateY, y, z, scale, opacity, filter, transformStyle: 'preserve-3d' }}
        className="h-full will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Wipes content in behind a moving edge. Reverses on scroll-up like everything else. */
export function ClipWipe({
  children,
  className,
  direction = 'right',
}: {
  children: React.ReactNode;
  className?: string;
  direction?: 'right' | 'up';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const progress = useElementProgress(ref, ['start end', 'center 72%']);

  const amount = useTransform(progress, [0, 1], [100, 0]);
  const clipRight = useMotionTemplate`inset(0% ${amount}% 0% 0%)`;
  const clipUp = useMotionTemplate`inset(${amount}% 0% 0% 0%)`;
  const y = useTransform(progress, [0, 1], [18, 0]);

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <div ref={ref} className={className}>
      <motion.div
        style={{ clipPath: direction === 'right' ? clipRight : clipUp, y }}
        className="will-change-[clip-path,transform]"
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Moves content at a different rate than the page. Depth through disagreement. */
export function Parallax({
  children,
  className,
  distance = 60,
}: {
  children: React.ReactNode;
  className?: string;
  distance?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y }} className="will-change-transform">
        {children}
      </motion.div>
    </div>
  );
}

/** Draws a hairline rule in from the left as its row is reached. */
export function ScrollRule({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const progress = useElementProgress(ref, ['start end', 'center 80%']);

  if (reduce) {
    return <div className={cn('h-px bg-border/60', className)} />;
  }

  return (
    <div ref={ref} className={cn('h-px overflow-hidden', className)}>
      <motion.div
        style={{ scaleX: progress }}
        className="h-full origin-left bg-gradient-to-r from-accent via-system to-transparent"
      />
    </div>
  );
}

/** Page-level progress bar. Cheap, and it makes the scroll position legible. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 30, mass: 0.3 });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[70] h-0.5 origin-left bg-gradient-to-r from-accent via-energy to-system shadow-glow"
    />
  );
}
