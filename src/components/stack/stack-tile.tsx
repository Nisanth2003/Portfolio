import { asset } from '@/lib/utils';
import type { StackItem } from '@/lib/schema';

const LEVEL_LABEL: Record<NonNullable<StackItem['level']>, string> = {
  primary: 'Daily',
  working: 'Working',
  familiar: 'Familiar',
};

/**
 * One tool in the loadout. Lives in its own file because the scrolling columns are a
 * client component and the section around them is not — this is the piece both need,
 * and it has no state of its own to argue about.
 */
export function StackTile({ item }: { item: StackItem }) {
  const content = (
    <>
      {/* Icons are downloaded to /public/tech at build time and served locally, so
          nothing here reaches a third-party host at runtime. <img> rather than inline
          SVG: a pasted icon URL can then never execute script in the page. */}
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-sm bg-foreground/[0.04] ring-1 ring-inset ring-border/40 transition-colors duration-300 group-hover/tile:bg-foreground/[0.07]">
        {item.iconPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset(item.iconPath)}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            width={24}
            height={24}
            className="size-6 object-contain transition-transform duration-300 ease-expo group-hover/tile:scale-110"
          />
        ) : (
          <span aria-hidden="true" className="select-none font-mono text-sm font-bold text-system/60">
            {item.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground transition-colors duration-300 group-hover/tile:text-accent">
          {item.name}
        </span>
        {(item.level || item.note) && (
          <span className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {item.note || LEVEL_LABEL[item.level!]}
          </span>
        )}
      </span>
    </>
  );

  const className =
    'group/tile flex items-center gap-3 rounded-md border border-border/50 bg-card/60 p-3 ' +
    'backdrop-blur-sm transition-[border-color,box-shadow] duration-300 ease-expo ' +
    'hover:border-accent/40 hover:shadow-glow focus-visible:border-accent/40';

  // Only linked when there's somewhere to go — a tile that looks clickable and isn't
  // is worse than a plain tile.
  return item.url ? (
    <a href={item.url} target="_blank" rel="noreferrer noopener" className={className}>
      {content}
      <span className="sr-only">(opens {item.name} in a new tab)</span>
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}
