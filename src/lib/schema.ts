import { z } from 'zod';

/**
 * Single source of truth for what a project is.
 *
 * The sheet hands us strings and nothing else, so every field is parsed and
 * coerced here rather than trusted. Adding a column to the sheet means adding one
 * optional field here — existing rows keep working because everything except
 * `slug` and `title` has a default.
 */

export const PROJECT_STATUSES = ['shipped', 'wip', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const str = z.string().default('');

/** Shape as it arrives from scripts/fetch-projects.mjs (lowercased header keys). */
const RawProject = z
  .object({
    slug: z.string().min(1, 'slug is required'),
    title: z.string().min(1, 'title is required'),
    tagline: str,
    description: str,
    tech: str,
    category: str,
    status: str,
    year: str,
    featured: str,
    order: str,
    published: str,
    liveurl: str,
    repourl: str,
    problem: str,
    role: str,
    impact: str,
    teamsize: str,
    stats: str,
    imageurl: str,
    videourl: str,
    accentcolor: str,
    _sheetRow: z.number().optional(),
  })
  // z.object strips unknown keys by default, which is exactly what we want: a
  // private notes column in the sheet must never be able to break the build.
  .strip();

const truthy = (v: string) => /^(true|yes|y|1|x|✓)$/i.test(v.trim());

const list = (v: string) =>
  v
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** `Users:1.2k | Stars:340` -> [{label:'Users',value:'1.2k'}, …] */
const statPairs = (v: string) =>
  v
    .split('|')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const idx = chunk.indexOf(':');
      if (idx === -1) return { label: chunk, value: '' };
      return { label: chunk.slice(0, idx).trim(), value: chunk.slice(idx + 1).trim() };
    })
    .filter((s) => s.label && s.value);

const urlOrNull = (v: string) => {
  const t = v.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === 'https:' || u.protocol === 'http:' ? t : null;
  } catch {
    return null;
  }
};

const hexOrNull = (v: string) => {
  const t = v.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t) ? t : null;
};

const statusOrDefault = (v: string): ProjectStatus => {
  const t = v.trim().toLowerCase().replace(/\s+/g, '');
  if (t === 'wip' || t === 'inprogress' || t === 'building') return 'wip';
  if (t === 'archived' || t === 'archive' || t === 'sunset') return 'archived';
  return 'shipped';
};

export const ProjectSchema = RawProject.transform((r) => {
  const liveUrl = urlOrNull(r.liveurl);
  const repoUrl = urlOrNull(r.repourl);
  const yearNum = Number.parseInt(r.year, 10);
  const orderNum = Number.parseInt(r.order, 10);

  return {
    slug: r.slug.trim(),
    title: r.title.trim(),
    tagline: r.tagline.trim(),
    description: r.description.trim(),
    tech: list(r.tech),
    category: r.category.trim(),
    status: statusOrDefault(r.status),
    year: Number.isFinite(yearNum) ? yearNum : null,
    featured: truthy(r.featured),
    // Unset order sorts last rather than first, so a blank cell is harmless.
    order: Number.isFinite(orderNum) ? orderNum : 9999,
    liveUrl,
    repoUrl,
    problem: r.problem.trim(),
    role: r.role.trim(),
    impact: r.impact.trim(),
    teamSize: r.teamsize.trim(),
    stats: statPairs(r.stats),
    imageUrl: urlOrNull(r.imageurl),
    videoUrl: urlOrNull(r.videourl),
    accentColor: hexOrNull(r.accentcolor),
    /** True when there's nothing to demo — the card says so instead of surprising you. */
    codeOnly: !liveUrl && !!repoUrl,
    sheetRow: r._sheetRow ?? null,
  };
});

export type Project = z.infer<typeof ProjectSchema>;

export const ProjectsFileSchema = z.object({
  generatedAt: z.string().optional(),
  source: z.string().optional(),
  count: z.number().optional(),
  projects: z.array(z.unknown()),
});

/* ------------------------------------------------------------------ stack (tab 2)
 *
 * The Stack tab exists so "what I know" isn't limited to "what I've shipped a
 * portfolio project with". Same contract as projects: sheet gives strings, this
 * coerces, only `name` is required, unknown columns are stripped.
 */

export const STACK_LEVELS = ['primary', 'working', 'familiar'] as const;
export type StackLevel = (typeof STACK_LEVELS)[number];

const RawStackItem = z
  .object({
    name: z.string().min(1, 'name is required'),
    icon: str,
    category: str,
    level: str,
    note: str,
    url: str,
    order: str,
    published: str,
    /** Both computed by the fetch script, not typed into the sheet. */
    _slug: z.string().min(1),
    _iconPath: str,
    _sheetRow: z.number().optional(),
  })
  .strip();

const levelOrNull = (v: string): StackLevel | null => {
  const t = v.trim().toLowerCase();
  return (STACK_LEVELS as readonly string[]).includes(t) ? (t as StackLevel) : null;
};

export const StackItemSchema = RawStackItem.transform((r) => {
  const orderNum = Number.parseInt(r.order, 10);
  return {
    slug: r._slug,
    name: r.name.trim(),
    /** Local path under /public, already downloaded. Empty means "render a tile". */
    iconPath: r._iconPath.trim(),
    category: r.category.trim(),
    level: levelOrNull(r.level),
    note: r.note.trim(),
    url: urlOrNull(r.url),
    order: Number.isFinite(orderNum) ? orderNum : 9999,
    sheetRow: r._sheetRow ?? null,
  };
});

export type StackItem = z.infer<typeof StackItemSchema>;

export const StackFileSchema = z.object({
  generatedAt: z.string().optional(),
  source: z.string().optional(),
  count: z.number().optional(),
  stack: z.array(z.unknown()),
});

/* ------------------------------------------------------------- experience (tab 3) */

const RawExperience = z
  .object({
    role: z.string().min(1, 'role is required'),
    company: z.string().min(1, 'company is required'),
    location: str,
    type: str,
    start: str,
    end: str,
    summary: str,
    highlights: str,
    tech: str,
    url: str,
    order: str,
    published: str,
    /** Computed by the fetch script from the loose date strings. */
    _startKey: z.number().default(0),
    _current: z.boolean().default(false),
    _sheetRow: z.number().optional(),
  })
  .strip();

/** `Shipped X | Cut Y by 40%` -> ['Shipped X', 'Cut Y by 40%'] */
const bullets = (v: string) =>
  v
    .split(/[|\n]/)
    .map((s) => s.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean);

export const ExperienceSchema = RawExperience.transform((r) => {
  const orderNum = Number.parseInt(r.order, 10);
  const end = r.end.trim();
  return {
    role: r.role.trim(),
    company: r.company.trim(),
    location: r.location.trim(),
    type: r.type.trim(),
    start: r.start.trim(),
    end,
    /** No end date means it's the current role — say "Present", don't leave it blank. */
    current: r._current || !end,
    period: [r.start.trim(), end || 'Present'].filter(Boolean).join(' — '),
    summary: r.summary.trim(),
    highlights: bullets(r.highlights),
    tech: list(r.tech),
    url: urlOrNull(r.url),
    order: Number.isFinite(orderNum) ? orderNum : 9999,
    startKey: r._startKey,
    sheetRow: r._sheetRow ?? null,
  };
});

export type Experience = z.infer<typeof ExperienceSchema>;

export const ExperienceFileSchema = z.object({
  generatedAt: z.string().optional(),
  source: z.string().optional(),
  count: z.number().optional(),
  experience: z.array(z.unknown()),
});
