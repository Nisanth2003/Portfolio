#!/usr/bin/env node
/**
 * Emits sheet-template.csv — import it into a fresh Google Sheet to get a tab with
 * the exact headers the build expects, plus two worked example rows.
 *
 * Run: npm run sheet-template
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'sheet-template.csv');
const STACK_OUT = path.join(ROOT, 'stack-template.csv');
const EXPERIENCE_OUT = path.join(ROOT, 'experience-template.csv');
const CONTACT_OUT = path.join(ROOT, 'contact-template.csv');

/** Order here is only for human readability — the build reads columns by name. */
const COLUMNS = [
  ['published', 'TRUE to show it on the site. Anything else keeps the row private.'],
  ['order', 'Sort position. Lower shows first. Blank sorts last.'],
  ['slug', 'URL segment. Lowercase, numbers, hyphens. Becomes /work/<slug>/'],
  ['title', 'Project name shown on the card.'],
  ['tagline', 'One line, under ~90 chars. The hook on the card.'],
  ['description', 'Two to four sentences for the detail page.'],
  ['tech', 'Comma separated. Becomes the filter chips.'],
  ['category', 'Broad bucket: Web, Mobile, ML, Infra…'],
  ['status', 'shipped | wip | archived'],
  ['year', 'Four digits.'],
  ['featured', 'TRUE pins it to the top and into the 3D scene.'],
  ['liveUrl', 'Deployed site. Leave blank if there is nothing to demo.'],
  ['repoUrl', 'Source. Blank if private.'],
  ['problem', 'What was actually hard. Recruiters read this one.'],
  ['role', 'What you personally did.'],
  ['impact', 'What changed because it exists. Numbers if you have them.'],
  ['teamSize', 'Just the number.'],
  ['stats', 'Stat tiles as Label:Value pairs separated by | '],
  ['imageUrl', 'Overrides the /work/<slug>.webp convention.'],
  ['videoUrl', 'Optional demo clip.'],
  ['accentColor', 'Hex like #A855F7 (violet) or #22D3EE (cyan) to tint this one card.'],
];

const EXAMPLES = [
  {
    published: 'TRUE',
    order: '1',
    slug: 'realtime-sub-object-detector',
    title: 'Real-Time Sub-Object Detector',
    tagline: 'On-device Android detection that finds the objects inside an object, at frame rate.',
    description:
      'An Android application performing real-time sub-object detection through image classification. The detection pipeline was built as a reusable module rather than app-specific code.',
    tech: 'Kotlin, Android, Machine Learning, Image Classification',
    category: 'Mobile',
    status: 'shipped',
    year: '2024',
    featured: 'TRUE',
    liveUrl: '',
    repoUrl: 'https://github.com/Nisanth2003/RealTimeSubObjectDetector',
    problem:
      'A conventional classifier labels a whole scene. Identifying parts inside a detected object needs a second inference pass that still keeps up with the camera preview.',
    role: 'Sole developer — architecture, model integration, Android application',
    impact: 'Runs on-device at interactive frame rates, with the detection layer packaged for reuse.',
    teamSize: '1',
    stats: 'Platform:Android | Inference:On-device | Modularity:Reusable pipeline',
    imageUrl: '',
    videoUrl: '',
    accentColor: '#A855F7',
  },
  {
    published: 'FALSE',
    order: '99',
    slug: 'example-draft-row',
    title: 'Example draft (stays private)',
    tagline: 'published is FALSE, so this row never reaches the built site.',
    description: 'Use rows like this to draft a write-up before it goes public. Delete this row when you no longer need the reminder.',
    tech: 'Next.js, TypeScript',
    category: 'Web',
    status: 'wip',
    year: '2026',
    featured: 'FALSE',
    liveUrl: 'https://example.com',
    repoUrl: '',
    problem: '',
    role: '',
    impact: '',
    teamSize: '',
    stats: 'Stage:Drafting',
    imageUrl: '',
    videoUrl: '',
    accentColor: '',
  },
];

/** Second tab: the tech stack, so skills aren't limited to what a project used. */
const STACK_COLUMNS = [
  ['published', 'TRUE to show it. Anything else keeps the row private.'],
  ['order', 'Sort position within its category. Lower first. Blank sorts last.'],
  ['name', 'Display name: "TypeScript", "PostgreSQL". Required.'],
  ['icon', 'Simple Icons slug (typescript, docker) OR a full image URL. Blank = lettered tile.'],
  ['category', 'Group heading: Languages, Frameworks, Cloud, Tools…'],
  ['level', 'primary | working | familiar. Optional — blank shows no label.'],
  ['note', 'Short qualifier, shown instead of the level. "3 years", "in production".'],
  ['url', 'Optional link — docs, or your best project using it.'],
];

const STACK_EXAMPLES = [
  {
    published: 'TRUE', order: '1', name: 'Kotlin', icon: 'kotlin',
    category: 'Languages', level: 'primary', note: '', url: '',
  },
  {
    published: 'TRUE', order: '2', name: 'TypeScript', icon: 'typescript',
    category: 'Languages', level: 'working', note: '', url: '',
  },
  {
    published: 'TRUE', order: '1', name: 'Android', icon: 'android',
    category: 'Frameworks', level: 'primary', note: 'Jetpack, on-device ML', url: '',
  },
  {
    published: 'TRUE', order: '2', name: 'Next.js', icon: 'nextdotjs',
    category: 'Frameworks', level: 'working', note: '', url: '',
  },
  {
    published: 'TRUE', order: '1', name: 'GitHub Actions', icon: 'githubactions',
    category: 'Tooling', level: 'working', note: 'CI/CD for this site', url: '',
  },
  {
    published: 'FALSE', order: '99', name: 'Example draft', icon: '',
    category: 'Tooling', level: 'familiar', note: 'published is FALSE, so this never ships', url: '',
  },
];

/** Third tab: roles and dates. The section a recruiter looks for first. */
const EXPERIENCE_COLUMNS = [
  ['published', 'TRUE to show it. Anything else keeps the row private.'],
  ['order', 'Optional override. Blank means reverse-chronological, which is usually right.'],
  ['role', 'Job title. Required.'],
  ['company', 'Employer or client. Required.'],
  ['location', 'City, or Remote.'],
  ['type', 'Full-time | Internship | Contract | Freelance'],
  ['start', '"Jun 2024", "2024-06" and "2024" all parse.'],
  ['end', 'Leave BLANK for your current role — it renders as "Present".'],
  ['summary', 'One or two sentences on what the job actually was.'],
  ['highlights', 'Bullets separated by | . Lead with the outcome, not the task.'],
  ['tech', 'Comma separated.'],
  ['url', 'Optional link to the company.'],
];

const EXPERIENCE_EXAMPLES = [
  {
    published: 'TRUE', order: '', role: 'Software Developer', company: 'Cloudtechner',
    location: 'Remote', type: 'Full-time', start: 'Jun 2024', end: '',
    summary: 'Replace this row with your own. Blank end date = current role.',
    highlights: 'Shipped X, cutting Y by 40% | Automated the Z pipeline, removing a manual deploy',
    tech: 'Kotlin, Android, CI/CD', url: '',
  },
  {
    published: 'FALSE', order: '', role: 'Example draft', company: 'Stays private',
    location: '', type: 'Internship', start: '2023', end: '2023',
    summary: 'published is FALSE, so this row never reaches the built site.',
    highlights: '', tech: '', url: '',
  },
];

/** Contact tab. Only `label` is required — everything else can be blank. */
const CONTACT_COLUMNS = [
  ['published', 'TRUE to show it on the contact page.'],
  ['order', 'Sort position. Lower shows first. Blank sorts last.'],
  ['label', 'What it is: Email, GitHub, LinkedIn, Phone, Location… Required.'],
  ['value', 'What is shown. Blank falls back to the url without its scheme.'],
  ['url', 'https://, mailto: or tel:. Blank renders as text with no link.'],
  ['icon', 'mail | github | linkedin | phone | location | globe | resume | twitter | instagram | youtube | discord | telegram | whatsapp'],
  ['note', 'Optional second line, e.g. "Fastest way to reach me".'],
  ['primary', 'TRUE renders it as a button rather than a list row.'],
];

const CONTACT_EXAMPLES = [
  {
    published: 'TRUE', order: '1', label: 'Email', value: 'you@example.com',
    url: 'mailto:you@example.com', icon: 'mail', note: 'Fastest way to reach me',
    primary: 'TRUE',
  },
  {
    published: 'TRUE', order: '2', label: 'GitHub', value: 'github.com/you',
    url: 'https://github.com/you', icon: 'github', note: '', primary: 'TRUE',
  },
  {
    published: 'FALSE', order: '99', label: 'Phone', value: '',
    url: 'tel:+910000000000', icon: 'phone',
    note: 'published is FALSE, so this never ships', primary: '',
  },
];

const escape = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (columns, examples) => {
  const headers = columns.map(([name]) => name);
  return `${[
    headers.map(escape).join(','),
    ...examples.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ].join('\n')}\n`;
};

const printReference = (label, columns) => {
  console.log(`\n${label}:`);
  const pad = Math.max(...columns.map(([h]) => h.length));
  for (const [name, help] of columns) console.log(`  ${name.padEnd(pad)}  ${help}`);
};

fs.writeFileSync(OUT, toCsv(COLUMNS, EXAMPLES), 'utf8');
fs.writeFileSync(STACK_OUT, toCsv(STACK_COLUMNS, STACK_EXAMPLES), 'utf8');
fs.writeFileSync(EXPERIENCE_OUT, toCsv(EXPERIENCE_COLUMNS, EXPERIENCE_EXAMPLES), 'utf8');
fs.writeFileSync(CONTACT_OUT, toCsv(CONTACT_COLUMNS, CONTACT_EXAMPLES), 'utf8');

console.log(
  `\nWrote ${[OUT, STACK_OUT, EXPERIENCE_OUT, CONTACT_OUT]
    .map((f) => path.relative(ROOT, f))
    .join(', ')}`,
);
printReference('Projects tab columns', COLUMNS);
printReference('Stack tab columns (optional)', STACK_COLUMNS);
printReference('Experience tab columns (optional)', EXPERIENCE_COLUMNS);
printReference('Contact tab columns (optional)', CONTACT_COLUMNS);
console.log(`
Next steps
  1. sheets.new  ->  File  ->  Import  ->  upload sheet-template.csv
  2. Rename the tab to exactly: Projects
  3. Optional tabs, named exactly Stack, Experience and Contact. Add the tab, make it the
     active one, then File > Import > "Replace current sheet" with its template.
     Or: npm run create-tab -- Stack       (needs Editor, temporarily)
  4. Keep the sheet PRIVATE. Do not use File > Share > publish to web.
  5. Follow SETUP.md to create the service account and share the sheet with it.

Icons: the build downloads each one into public/tech/ so the live site makes no
third-party requests. Find slugs at simpleicons.org. A logo that vanishes against
the dark background can be recoloured by using a full URL instead of a bare slug:
  https://cdn.simpleicons.org/github/ffffff

Reordering columns is safe. Renaming a column is not — the build matches by name.
`);
