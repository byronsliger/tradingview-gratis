import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TradingView Gratis",
    short_name: "TV Gratis",
    description:
      "Plataforma de charts crypto en vivo. Alternativa gratis a TradingView. Powered by Binance + lightweight-charts.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#131722",
    theme_color: "#131722",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // El icono tiene fondo a sangre completa y el motivo dentro de la zona
      // segura (80% central), así que sirve también como maskable.
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
