import type { NextConfig } from "next";
import os from "os";

const allowedDevOrigins: string[] = [];

if (process.env.NODE_ENV === "development") {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === "IPv4" && !iface.internal) {
        allowedDevOrigins.push(iface.address);
      }
    }
  }
  // Dominios extra (p. ej. el túnel de ngrok), separados por comas
  for (const origin of (process.env.DEV_ALLOWED_ORIGINS ?? "").split(",")) {
    if (origin.trim()) allowedDevOrigins.push(origin.trim());
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  /* config options here */
};

export default nextConfig;
