"use client";

import { useEffect } from "react";
import { useChartStore } from "@/lib/store/chart-store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useChartStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
  }, [theme]);

  return <>{children}</>;
}
