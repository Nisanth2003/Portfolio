import rawFile from '@/data/contact.json';
import { ContactFileSchema, ContactSchema, type ContactPoint } from './schema';
import { site } from './site';

/**
 * Contact points, from the sheet's Contact tab.
 *
 * Optional like Stack and Experience, but with one difference that matters: when the tab is
 * missing or empty this does not render nothing. A portfolio with no way to reach anyone is
 * broken in a way an absent stack section is not, so it falls back to whatever `site.ts`
 * knows — the email and the GitHub profile. Create the tab and the sheet takes over.
 */
function loadContact(): ContactPoint[] {
  const file = ContactFileSchema.safeParse(rawFile);
  if (!file.success) {
    throw new Error(
      `src/data/contact.json is malformed. Re-run \`npm run data\`.\n${file.error.message}`,
    );
  }

  const parsed: ContactPoint[] = [];
  const problems: string[] = [];

  file.data.contact.forEach((row, i) => {
    const result = ContactSchema.safeParse(row);
    if (!result.success) {
      const where =
        row && typeof row === 'object' && '_sheetRow' in row
          ? `Contact row ${(row as { _sheetRow?: number })._sheetRow}`
          : `entry ${i + 1}`;
      problems.push(
        `${where} — ${result.error.issues
          .map((issue) => `${issue.path.join('.') || '(row)'}: ${issue.message}`)
          .join('; ')}`,
      );
      return;
    }
    parsed.push(result.data);
  });

  if (problems.length) {
    throw new Error(
      `${problems.length} Contact row(s) failed validation. Fix the sheet, then rebuild:\n  - ` +
        problems.join('\n  - '),
    );
  }

  return parsed;
}

/** What `site.ts` can offer on its own, used only when the tab has nothing. */
function fromSiteConfig(): ContactPoint[] {
  const points: ContactPoint[] = [];

  if (site.email) {
    points.push({
      label: 'Email',
      value: site.email,
      href: `mailto:${site.email}`,
      icon: 'mail',
      note: '',
      primary: true,
      order: 1,
      sheetRow: null,
    });
  }
  if (site.github) {
    points.push({
      label: 'GitHub',
      value: site.github.replace(/^https?:\/\//, ''),
      href: site.github,
      icon: 'github',
      note: '',
      primary: false,
      order: 2,
      sheetRow: null,
    });
  }

  return points;
}

const fromSheet = loadContact();

export const contactSource = fromSheet.length > 0 ? 'sheet' : 'site-config';
export const contactPoints: ContactPoint[] = fromSheet.length > 0 ? fromSheet : fromSiteConfig();

/** The ones worth a button. Falls back to the first point so the page always has one. */
export const primaryContacts: ContactPoint[] = (() => {
  const flagged = contactPoints.filter((p) => p.primary && p.href);
  if (flagged.length > 0) return flagged;
  const first = contactPoints.find((p) => p.href);
  return first ? [first] : [];
})();

export const secondaryContacts: ContactPoint[] = contactPoints.filter(
  (p) => !primaryContacts.includes(p),
);
