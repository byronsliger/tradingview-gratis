"use client";

import { Header } from "@/components/layout/Header";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { PriceChart } from "@/components/chart/PriceChart";
import { IndicatorSettingsDialog } from "@/components/chart/IndicatorSettingsDialog";
import { PriceLineSettingsDialog } from "@/components/chart/PriceLineSettingsDialog";
import { DrawingSettingsDialog } from "@/components/chart/DrawingSettingsDialog";
import { useChartStore } from "@/lib/store/chart-store";
import { MobileNavBar } from "@/components/layout/MobileNavBar";
import { MobileChartTools } from "@/components/layout/MobileChartTools";
import { Watchlist } from "@/components/watchlist/Watchlist";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const mobileTab = useChartStore((s) => s.mobileTab);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      <Header />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        
        <main className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", mobileTab !== "chart" && "hidden md:flex")}>
          <div className="min-h-0 flex-1">
            <PriceChart symbol={symbol} timeframe={timeframe} />
          </div>
        </main>

        <div className={cn("flex-1 min-h-0 bg-tv-panel overflow-hidden md:hidden", mobileTab !== "watchlist" && "hidden")}>
          <Watchlist />
        </div>

        <RightSidebar />
      </div>
      <div className="hidden md:block">
        <BottomPanel />
      </div>
      <MobileNavBar />
      <MobileChartTools />
      <IndicatorSettingsDialog />
      <PriceLineSettingsDialog />
      <DrawingSettingsDialog />
    </div>
  );
}
