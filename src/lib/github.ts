import raw from '@/data/github.json';

/**
 * Build-time GitHub snapshot, read from src/data/github.json.
 *
 * Written by scripts/fetch-github.mjs, which soft-fails to a committed fallback, so this
 * file's only job is to describe the shape and answer one question: is there enough here to
 * render a section? A missing or empty snapshot is a normal state — the section simply does
 * not appear, exactly like the optional sheet tabs.
 */

export type GithubMonth = { month: string; count: number };
export type GithubLanguage = { name: string; count: number };
export type GithubRepo = {
  name: string;
  url: string;
  description: string;
  language: string;
  pushedAt: string;
  stars: number;
};

export type GithubSnapshot = {
  source: string;
  login: string;
  name: string;
  url: string;
  publicRepos: number;
  followers: number;
  joined: string;
  lastPush: string;
  activeMonths: number;
  months: GithubMonth[];
  languages: GithubLanguage[];
  recent: GithubRepo[];
};

const EMPTY: GithubSnapshot = {
  source: 'none',
  login: '',
  name: '',
  url: '',
  publicRepos: 0,
  followers: 0,
  joined: '',
  lastPush: '',
  activeMonths: 0,
  months: [],
  languages: [],
  recent: [],
};

export const github: GithubSnapshot = { ...EMPTY, ...(raw as Partial<GithubSnapshot>) };

/**
 * The bar for rendering. A profile url and at least a few months of series, because a strip
 * of two cells is not a chart — it is a rounding error with a caption.
 */
export const hasGithubActivity =
  github.source !== 'none' && !!github.url && github.months.length >= 6;
