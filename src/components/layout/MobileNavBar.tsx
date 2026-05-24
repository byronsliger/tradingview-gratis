"use client";

import { BarChart2, List } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

export function MobileNavBar() {
  const mobileTab = useChartStore((s) => s.mobileTab);
  const setMobileTab = useChartStore((s) => s.setMobileTab);

  return (
    <div className="md:hidden flex h-14 items-center justify-around border-t border-tv-border bg-tv-panel px-4 pb-safe">
      <button
        onClick={() => setMobileTab("chart")}
        className={cn(
          "flex flex-col items-center justify-center gap-1 w-full h-full",
          mobileTab === "chart" ? "text-tv-blue" : "text-tv-text-muted"
        )}
      >
        <BarChart2 className="h-5 w-5" />
        <span className="text-[10px] font-medium">Gráfico</span>
      </button>

      <button
        onClick={() => setMobileTab("watchlist")}
        className={cn(
          "flex flex-col items-center justify-center gap-1 w-full h-full",
          mobileTab === "watchlist" ? "text-tv-blue" : "text-tv-text-muted"
        )}
      >
        <List className="h-5 w-5" />
        <span className="text-[10px] font-medium">Watchlist</span>
      </button>
    </div>
  );
}
