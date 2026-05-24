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
}

const nextConfig: NextConfig = {
  output: "standalone",
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  /* config options here */
};

export default nextConfig;
