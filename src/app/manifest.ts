import type { MetadataRoute } from "next";

// Lets the app be added to the home screen and open full-screen (no browser bar).
// The GitHub Pages copy lives under /np-app (next.config.ts), and manifest URLs don't get the
// basePath added automatically, so prefix them here.
const base = process.env.GITHUB_PAGES === "true" ? "/np-app" : "";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${base}/`,
    name: "NP Diary",
    short_name: "NP",
    description: "Personal daily mood, energy, flow & success diary.",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f5f2",
    theme_color: "#f6f5f2",
    icons: [
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      // The logo's letters already sit inside the maskable safe zone on an opaque background.
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
