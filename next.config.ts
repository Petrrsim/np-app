import type { NextConfig } from "next";

// GitHub Pages build (see .github/workflows/pages.yml): a fully static export
// served from https://petrrsim.github.io/np-app/. Vercel builds without the
// flag and keeps the normal server output at the domain root.
const pages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = pages
  ? {
      output: "export",
      basePath: "/np-app",
      trailingSlash: true, // emit history/index.html etc. so Pages serves /history/
      images: { unoptimized: true }, // no image optimizer on a static host
    }
  : {};

export default nextConfig;
