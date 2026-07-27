'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/utils';

/**
 * Per-character reveal for short headlines.
 *
 * Characters are split in React rather than by a GSAP plugin — no licence, no DOM
 * surprises, and cleanup is automatic. The whole string is exposed once via
 * aria-label and every character is aria-hidden, so assistive tech reads a sentence
 * instead of spelling it out. Reduced motion returns plain text with no wrappers.
 */
export function SplitText({
  text,
  className,
  delay = 0,
  stagger = 0.028,
  as: Tag = 'span',
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  as?: 'span' | 'h1' | 'h2';
}) {
  const reduce = useReducedMotion();

  if (reduce) return <Tag className={className}>{text}</Tag>;

  const words = text.split(' ');
  let charIndex = 0;

  return (
    <Tag className={className} aria-label={text}>
      {words.map((word, wordIndex) => (
        <span key={wordIndex} className="inline-block whitespace-nowrap">
          {[...word].map((char) => {
            const index = charIndex++;
            return (
              <motion.span
                key={index}
                aria-hidden="true"
                className="inline-block will-change-transform"
                initial={{ opacity: 0, y: '0.55em', rotateX: -80, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)' }}
                transition={{
                  duration: 0.75,
                  delay: delay + index * stagger,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {char}
              </motion.span>
            );
          })}
          {wordIndex < words.length - 1 && (
            <span aria-hidden="true" className="inline-block">
              &nbsp;
            </span>
          )}
        </span>
      ))}
    </Tag>
  );
}

/** Types a string out character by character. Used for the System notification. */
export function Typewriter({
  text,
  className,
  delay = 0,
  speed = 26,
}: {
  text: string;
  className?: string;
  delay?: number;
  speed?: number;
}) {
  const reduce = useReducedMotion();

  return (
    <span className={cn('inline-flex items-center', className)} aria-label={text}>
      {reduce ? (
        <span>{text}</span>
      ) : (
        <>
          {[...text].map((char, i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.01, delay: delay + (i * speed) / 1000 }}
              className="whitespace-pre"
            >
              {char}
            </motion.span>
          ))}
          <motion.span
            aria-hidden="true"
            className="ml-0.5 inline-block h-[1em] w-[2px] bg-system"
            animate={{ opacity: [1, 1, 0, 0] }}
            transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
          />
        </>
      )}
    </span>
  );
}
