/**
 * Static export for GitHub Pages.
 *
 * basePath: a repo named `<user>.github.io` is served from the domain root, but any
 * other repo is served from `/<repo>`, which breaks every absolute asset path unless
 * we tell Next about it. The deploy workflow sets NEXT_PUBLIC_BASE_PATH from the repo
 * name so this is correct without anyone remembering to edit it.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  // Pages has no image optimizer, so next/image must not try to use one.
  images: { unoptimized: true },
  // Emits `work/slug/index.html` rather than `work/slug.html`, which is what
  // Pages' static file server actually resolves.
  trailingSlash: true,
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
