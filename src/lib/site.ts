/**
 * Everything about you that isn't a project. One file, so there is exactly one
 * place to edit when something changes.
 */
export const site = {
  name: 'Medapati Nisanth Reddy',
  shortName: 'Nisanth Reddy',
  initials: 'NR',
  role: 'Software Developer',

  /** Personal, deliberately — a portfolio outlives any one employer's domain. */
  email: 'nisanthreddymedapati@gmail.com',

  github: 'https://github.com/Nisanth2003',
  linkedin: '',

  /** Set in the deploy workflow. Used for canonical URLs and social cards. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nisanth2003.github.io',

  /** Lives in /public. Served through asset() so basePath is applied. */
  resume: '/Medapati_Nisanth_Reddy.pdf',

  description:
    'Selected work by Medapati Nisanth Reddy — Android, web, and the pipelines that ship them. Every project links straight to the live build or the source.',
} as const;
