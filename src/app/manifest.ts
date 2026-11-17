import type { MetadataRoute } from "next";

// Lets phones install the site as an app: its own icon, full screen, no browser address bar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dave FFL",
    short_name: "Dave FFL",
    description: "Weekly pick'em league: lineups, live scores and payouts.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#1f6f43",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
