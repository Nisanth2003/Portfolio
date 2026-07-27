import rawFile from '@/data/stack.json';
import { StackFileSchema, StackItemSchema, type StackItem } from './schema';

/**
 * The Stack tab, validated at module load — so during `next build`, same as projects.
 *
 * Unlike projects, an empty stack is a normal state rather than an error: the tab is
 * optional and the section simply doesn't render until there's something in it.
 */
function loadStack(): StackItem[] {
  const file = StackFileSchema.safeParse(rawFile);
  if (!file.success) {
    throw new Error(
      `src/data/stack.json is malformed. Re-run \`npm run data\`.\n${file.error.message}`,
    );
  }

  const parsed: StackItem[] = [];
  const problems: string[] = [];

  file.data.stack.forEach((row, i) => {
    const result = StackItemSchema.safeParse(row);
    if (!result.success) {
      const where =
        row && typeof row === 'object' && '_sheetRow' in row
          ? `Stack row ${(row as { _sheetRow?: number })._sheetRow}`
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
      `${problems.length} Stack row(s) failed validation. Fix the sheet, then rebuild:\n  - ` +
        problems.join('\n  - '),
    );
  }

  return parsed;
}

export const stack: StackItem[] = loadStack();

export const stackSource = (rawFile as { source?: string }).source ?? 'unknown';

export type StackGroup = { category: string; items: StackItem[] };

/**
 * Grouped for display, in first-appearance order of the category.
 *
 * Category order follows the sheet's `order` column rather than being alphabetical
 * or hardcoded, so the arrangement stays yours: put the things you want read first
 * at the top of the tab and they lead here too. Uncategorised items collect into a
 * single trailing group instead of vanishing.
 */
export function stackGroups(): StackGroup[] {
  const groups = new Map<string, StackItem[]>();

  for (const item of stack) {
    const key = item.category || 'Other';
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  // 'Other' last — a catch-all shouldn't outrank a deliberate category.
  const entries = [...groups.entries()].map(([category, items]) => ({ category, items }));
  return [
    ...entries.filter((g) => g.category !== 'Other'),
    ...entries.filter((g) => g.category === 'Other'),
  ];
}

/**
 * Categories dealt out into columns for the scrolling loadout.
 *
 * The column count comes from how many tools there are, not from how many categories. A
 * column that holds a single tile is not a column, it is a strip — so there is one column
 * per MIN_PER_COLUMN tools, up to maxColumns, and they fill out on their own as the sheet
 * grows rather than being three stubs on day one.
 *
 * Groups are dealt round-robin rather than packed by size, because the sheet's order is
 * deliberate — dealing in order keeps the first category top-left where it gets read
 * first. Uneven columns cost nothing; each one loops on its own clock.
 */
const MIN_PER_COLUMN = 2;

export function stackColumns(maxColumns = 3): StackGroup[][] {
  const groups = stackGroups();
  if (groups.length === 0) return [];

  const items = groups.reduce((n, g) => n + g.items.length, 0);
  const count = Math.max(
    1,
    Math.min(maxColumns, groups.length, Math.floor(items / MIN_PER_COLUMN)),
  );

  const columns: StackGroup[][] = Array.from({ length: count }, () => []);
  groups.forEach((group, i) => columns[i % count].push(group));
  return columns;
}

/** Names only, for the ticker. Superset of the tech attached to projects. */
export const stackNames: string[] = stack.map((s) => s.name);
