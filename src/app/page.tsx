"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import { Header } from "@/components/layout/Header";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { PriceChart } from "@/components/chart/PriceChart";
import { IndicatorSettingsDialog } from "@/components/chart/IndicatorSettingsDialog";
import { PriceLineSettingsDialog } from "@/components/chart/PriceLineSettingsDialog";
import { DrawingSettingsDialog } from "@/components/chart/DrawingSettingsDialog";
import { useChartStore } from "@/lib/store/chart-store";
import { useUrlSymbolSync } from "@/hooks/useUrlSymbolSync";
import { useDriveSync } from "@/hooks/useDriveSync";
import { MobileChartTools } from "@/components/layout/MobileChartTools";

// CodeMirror no soporta SSR y el editor no debe entrar en el chunk inicial:
// se carga bajo demanda la primera vez que se abre.
const PineEditorDialog = dynamic(
  () => import("@/components/pine/PineEditorDialog").then((m) => m.PineEditorDialog),
  { ssr: false },
);

if (typeof window !== "undefined" && typeof Element !== "undefined") {
  const originalReleasePointerCapture = Element.prototype.releasePointerCapture;
  Element.prototype.releasePointerCapture = function (pointerId) {
    try {
      if (this.hasPointerCapture(pointerId)) {
        originalReleasePointerCapture.call(this, pointerId);
      }
    } catch {
      // Ignore NotFoundError thrown by third-party libs like Base UI ScrollArea
    }
  };
}

export default function HomePage() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const pineEditorOpen = useChartStore((s) => s.pineEditorOpen);
  // Montar el Editor Pine solo tras la primera apertura (y dejarlo montado
  // después para conservar la animación de cierre del dialog).
  const pineEditorEverOpened = useRef(false);
  if (pineEditorOpen) {
    // eslint-disable-next-line react-hooks/refs
    pineEditorEverOpened.current = true;
  }
  // eslint-disable-next-line react-hooks/refs
  const pineEditorMounted = pineEditorOpen || pineEditorEverOpened.current;
  useUrlSymbolSync();
  useDriveSync();

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-tv-bg">
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
      {pineEditorMounted && <PineEditorDialog />}
    </div>
  );
}
