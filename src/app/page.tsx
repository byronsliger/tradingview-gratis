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
import { MobileChartTools } from "@/components/layout/MobileChartTools";

export default function HomePage() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      <Header />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-10 md:pb-0">
          <div className="min-h-0 flex-1">
            <PriceChart symbol={symbol} timeframe={timeframe} />
          </div>
        </main>

        <RightSidebar />
      </div>
      <div className="hidden md:block">
        <BottomPanel />
      </div>
      <MobileChartTools />
      <IndicatorSettingsDialog />
      <PriceLineSettingsDialog />
      <DrawingSettingsDialog />
    </div>
  );
}
