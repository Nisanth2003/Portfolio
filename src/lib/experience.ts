import rawFile from '@/data/experience.json';
import { ExperienceFileSchema, ExperienceSchema, type Experience } from './schema';

/**
 * The Experience tab, validated at module load — so during `next build`.
 *
 * Already sorted reverse-chronologically by the fetch script, which is where the loose
 * date strings ("Jun 2024", "2024-06") get turned into something sortable. Nothing
 * here re-sorts, so the order you see is the order the sheet produced.
 */
function loadExperience(): Experience[] {
  const file = ExperienceFileSchema.safeParse(rawFile);
  if (!file.success) {
    throw new Error(
      `src/data/experience.json is malformed. Re-run \`npm run data\`.\n${file.error.message}`,
    );
  }

  const parsed: Experience[] = [];
  const problems: string[] = [];

  file.data.experience.forEach((row, i) => {
    const result = ExperienceSchema.safeParse(row);
    if (!result.success) {
      const where =
        row && typeof row === 'object' && '_sheetRow' in row
          ? `Experience row ${(row as { _sheetRow?: number })._sheetRow}`
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
      `${problems.length} Experience row(s) failed validation. Fix the sheet, then rebuild:\n  - ` +
        problems.join('\n  - '),
    );
  }

  return parsed;
}

export const experience: Experience[] = loadExperience();

export const currentRole: Experience | null = experience.find((e) => e.current) ?? null;
