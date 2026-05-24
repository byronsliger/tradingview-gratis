"use client";

import { List } from "lucide-react";
import { Watchlist } from "@/components/watchlist/Watchlist";
import { useChartStore } from "@/lib/store/chart-store";

export function RightSidebar() {
  const collapsed = useChartStore((s) => s.watchlistCollapsed);
  const toggle = useChartStore((s) => s.toggleWatchlistCollapsed);

  return (
    <div className="hidden h-full md:flex">
      {!collapsed ? (
        <aside className="flex w-64 flex-shrink-0 flex-col border-l border-tv-border bg-tv-panel">
          <Watchlist />
        </aside>
      ) : (
        <aside className="flex w-12 flex-shrink-0 flex-col items-center border-l border-tv-border bg-tv-panel py-2">
          <button
            onClick={toggle}
            className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
            title="Expandir Watchlist"
          >
            <List className="h-5 w-5" />
          </button>
        </aside>
      )}
    </div>
  );
}
