import type { WatchlistSection } from "@/lib/store/watchlist-sections";

interface DragEntity {
  id: string | number;
  group?: string | number;
  index?: number;
}

interface AssetDropEvent {
  canceled: boolean;
  operation: { source: DragEntity | null; target: DragEntity | null };
}

export function resolveAssetDrop(sections: WatchlistSection[], event: AssetDropEvent) {
  if (event.canceled) return null;
  const source = event.operation.source;
  const sourceId = String(source?.id ?? "");
  const targetId = String(event.operation.target?.id ?? "");
  if (!sourceId.startsWith("asset:")) return null;
  const symbol = sourceId.slice(6);
  const sourceSection = sections.find((section) => section.symbols.includes(symbol));
  if (!sourceSection) return null;
  const isContainer = targetId.startsWith("section-assets:");
  if (!isContainer && !targetId.startsWith("asset:")) return null;
  const sourceIndex = sourceSection.symbols.indexOf(symbol);
  const projected = source?.group !== sourceSection.id || source?.index !== sourceIndex;
  if (!isContainer && !projected) {
    const targetAsset = targetId.slice(6);
    if (symbol === targetAsset) return null;
    const targetSection = sections.find((section) => section.symbols.includes(targetAsset));
    if (!targetSection) return null;
    const targetIndex = targetSection.symbols.indexOf(targetAsset);
    const beforeSymbol = sourceSection.id === targetSection.id && sourceIndex < targetIndex
      ? targetSection.symbols[targetIndex + 1] : targetAsset;
    return { symbol, sectionId: targetSection.id, beforeSymbol };
  }
  // Optimistic sorting updates the source's group/index and can target the source itself.
  // Plain containers (including empty sections) do not update that sortable metadata.
  const sectionId = isContainer ? targetId.slice(15) : source?.group;
  const targetSection = sections.find((section) => section.id === sectionId);
  if (!targetSection) return null;
  const remaining = targetSection.symbols.filter((asset) => asset !== symbol);
  const index = isContainer ? remaining.length : source?.index;
  if (index === undefined || !Number.isInteger(index) || index < 0 || index > remaining.length) return null;
  if (sourceSection.id === sectionId && sourceIndex === index) return null;
  return { symbol, sectionId: targetSection.id, beforeSymbol: remaining[index] };
}
