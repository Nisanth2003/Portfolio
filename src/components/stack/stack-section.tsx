import { ClipWipe, Parallax, ScrollReveal3D, ScrollRule } from '@/components/motion/scroll-fx';
import { stackGroups } from '@/lib/stack';
import { asset } from '@/lib/utils';
import type { StackItem } from '@/lib/schema';

const LEVEL_LABEL: Record<NonNullable<StackItem['level']>, string> = {
  primary: 'Daily',
  working: 'Working',
  familiar: 'Familiar',
};

function StackTile({ item }: { item: StackItem }) {
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
          <span
            aria-hidden="true"
            className="select-none font-mono text-sm font-bold text-system/60"
          >
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

export function StackSection() {
  const groups = stackGroups();

  // Nothing in the sheet yet, or no Stack tab at all. Render nothing rather than an
  // empty heading — a "Stack" section with no stack reads as a broken build.
  if (groups.length === 0) return null;

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <section id="stack" aria-labelledby="stack-heading" className="relative border-t border-border/40">
      <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/55" />

      <div className="container max-w-7xl py-24">
        <div className="grid gap-12 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
          <Parallax distance={40}>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-system">Loadout</p>
            <ScrollRule className="mt-3 w-28" />
            <ClipWipe>
              <h2
                id="stack-heading"
                className="mt-4 text-balance text-headline font-bold text-monarch"
              >
                {total} {total === 1 ? 'tool' : 'tools'} I actually reach for
              </h2>
            </ClipWipe>
            <p className="mt-4 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
              Kept in the same spreadsheet as the projects, so it stays honest — this
              list changes when what I use changes, not when I remember to edit a file.
            </p>
          </Parallax>

          <div className="space-y-10">
            {groups.map((group, gi) => (
              <ScrollReveal3D key={group.category} intensity={0.5} from={gi % 2 === 0 ? 'right' : 'left'}>
                <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-system/70">
                  {group.category}
                </h3>
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {group.items.map((item) => (
                    <li key={item.slug}>
                      <StackTile item={item} />
                    </li>
                  ))}
                </ul>
              </ScrollReveal3D>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
