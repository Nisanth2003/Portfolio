import {
  Github,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Twitter,
  Youtube,
  FileText,
  type LucideIcon,
} from 'lucide-react';

import type { ContactIcon, ContactPoint } from '@/lib/schema';

/**
 * Sheet icon name -> component.
 *
 * An explicit map rather than a dynamic lookup on purpose. lucide exports hundreds of
 * icons; resolving an arbitrary string against them would either pull the whole library
 * into the bundle or let a typo in a spreadsheet render nothing. A closed list means the
 * bundle holds thirteen icons and an unknown name degrades to a dot.
 */
const ICONS: Record<ContactIcon, LucideIcon> = {
  mail: Mail,
  github: Github,
  linkedin: Linkedin,
  phone: Phone,
  location: MapPin,
  globe: Globe,
  resume: FileText,
  twitter: Twitter,
  instagram: Instagram,
  youtube: Youtube,
  discord: MessageCircle,
  telegram: Send,
  whatsapp: MessageCircle,
};

function Glyph({ icon }: { icon: ContactIcon | null }) {
  const Icon = icon ? ICONS[icon] : null;
  if (!Icon) {
    return <span aria-hidden="true" className="size-1.5 rounded-full bg-system/70" />;
  }
  return <Icon aria-hidden="true" className="size-4" />;
}

/** One contact point as a row. Linked only when the sheet gave it a usable href. */
export function ContactRow({ point }: { point: ContactPoint }) {
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-foreground/[0.04] text-system ring-1 ring-inset ring-border/40 transition-colors duration-300 group-hover/row:bg-foreground/[0.07] group-hover/row:text-accent">
        <Glyph icon={point.icon} />
      </span>

      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {point.label}
        </span>
        <span className="truncate text-sm font-medium text-foreground transition-colors duration-300 group-hover/row:text-accent">
          {point.value || point.label}
        </span>
        {point.note && (
          <span className="mt-0.5 truncate text-xs text-muted-foreground/80">{point.note}</span>
        )}
      </span>
    </>
  );

  const className =
    'group/row flex items-center gap-4 rounded-md border border-border/50 bg-card/60 p-4 ' +
    'backdrop-blur-sm transition-[border-color,box-shadow] duration-300 ease-expo';

  if (!point.href) return <div className={className}>{body}</div>;

  const external = !point.href.startsWith('mailto:') && !point.href.startsWith('tel:');

  return (
    <a
      href={point.href}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      className={`${className} hover:border-accent/40 hover:shadow-glow`}
    >
      {body}
      {external && <span className="sr-only">(opens in a new tab)</span>}
    </a>
  );
}

export { Glyph as ContactGlyph };
