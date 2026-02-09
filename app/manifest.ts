import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SportsRank",
    short_name: "SportsRank",
    description: "Portfolio semanal de picks deportivos con analytics y simulador live.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#E3DCD2",
    theme_color: "#013328",
    lang: "es-ES",
    orientation: "portrait",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
