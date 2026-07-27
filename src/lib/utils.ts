import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Prefixes a public asset path with the Pages basePath so it resolves on both
 *  `user.github.io` and `user.github.io/repo`. Use for anything in /public. */
export function asset(path: string) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Turns `https://github.com/Nisanth2003/my-twitter-clone` into `github.com/…`
 *  for display, so link text stays short without hiding the destination. */
export function prettyUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return url;
  }
}
