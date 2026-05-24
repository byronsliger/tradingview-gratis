// src/lib/chart/event-utils.ts

import { type IChartApi } from "lightweight-charts";

/**
 * Detiene por completo un evento en cualquier fase de propagación
 */
export function stopEvent(e: Event) {
  e.stopPropagation();
  e.stopImmediatePropagation();
  e.preventDefault();
}

/**
 * Activa o desactiva dinámicamente el desplazamiento y paneo del gráfico
 */
export function toggleChartScroll(chart: IChartApi | null, enabled: boolean) {
  if (!chart) return;
  try {
    chart.applyOptions({
      handleScroll: {
        pressedMouseMove: enabled,
        horzTouchDrag: enabled,
        vertTouchDrag: enabled,
      },
    });
  } catch {}
}

/**
 * Registra todos los bloqueadores de eventos nativos/heredados en el contenedor.
 * Retorna una función de limpieza (cleanup) lista para usar en el useEffect.
 */
export function registerLegacyEventBlockers(
  container: HTMLDivElement,
  shouldBlock: (e: Event) => boolean
) {
  const legacyEvents = [
    "mousedown", "mousemove", "mouseup", 
    "touchstart", "touchmove", "touchend", "touchcancel"
  ];

  const handler = (e: Event) => {
    if (shouldBlock(e)) {
      stopEvent(e);
    }
  };

  legacyEvents.forEach((evt) => {
    container.addEventListener(evt, handler, true);
  });

  // Retorna la función de limpieza para el useEffect
  return () => {
    legacyEvents.forEach((evt) => {
      container.removeEventListener(evt, handler, true);
    });
  };
}
