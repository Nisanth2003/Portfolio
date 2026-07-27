import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

import { Nav } from '@/components/site/nav';
import { Footer } from '@/components/site/footer';
import { CursorAura } from '@/components/motion/cursor-aura';
import { ScrollProgress } from '@/components/motion/scroll-fx';
import { SmokeField } from '@/components/smoke/smoke-field';
import { site } from '@/lib/site';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  // Text stays visible while the webfont loads instead of flashing invisible.
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  metadataBase: new URL(`${site.url}${basePath}`),
  title: {
    default: `${site.name} — Selected Work`,
    template: `%s — ${site.shortName}`,
  },
  description: site.description,
  authors: [{ name: site.name, url: site.github || undefined }],
  openGraph: {
    type: 'website',
    title: `${site.name} — Selected Work`,
    description: site.description,
    siteName: site.name,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${site.name} — Selected Work`,
    description: site.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is never disabled.
  maximumScale: 5,
  themeColor: '#06040F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-foreground"
        >
          Skip to main content
        </a>

        {/* One smoke field for the entire site, fixed behind every section. */}
        <SmokeField />
        <ScrollProgress />
        <CursorAura />
        <Nav />
        {/* `relative` matters: Framer Motion measures useScroll offsets against the
            nearest positioned ancestor, and a static one makes the hero parallax
            compute against the wrong box. */}
        <main id="main" className="relative">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
