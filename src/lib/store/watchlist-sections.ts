export interface WatchlistSection {
  id: string;
  name: string;
  symbols: string[];
}

export const DEFAULT_SECTION_ID = "default";

export function flattenWatchlist(sections: WatchlistSection[]): string[] {
  return sections.flatMap((section) => section.symbols);
}

/** Moves a whole section to the target section's position without changing its assets. */
export function moveWatchlistSection(
  sections: WatchlistSection[],
  sourceId: string,
  targetId: string,
): WatchlistSection[] {
  const sourceIndex = sections.findIndex((section) => section.id === sourceId);
  const targetIndex = sections.findIndex((section) => section.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return sections;
  const next = [...sections];
  next.splice(targetIndex, 0, ...next.splice(sourceIndex, 1));
  return next;
}

/** Accepts old flat snapshots and repairs malformed or duplicated section data. */
export function normalizeWatchlistSections(
  sections: WatchlistSection[] | undefined,
  legacySymbols: string[] | undefined,
): WatchlistSection[] {
  const seen = new Set<string>();
  const ids = new Set<string>();
  const normalized: WatchlistSection[] = [];
  const addSymbols = (symbols: unknown): string[] => {
    if (!Array.isArray(symbols)) return [];
    return symbols.filter((symbol): symbol is string => {
      if (typeof symbol !== "string" || !symbol || seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    });
  };

  if (Array.isArray(sections)) {
    for (const section of sections) {
      if (!section || typeof section.id !== "string" || !section.id || ids.has(section.id)) continue;
      ids.add(section.id);
      normalized.push({
        id: section.id,
        name: typeof section.name === "string" && section.name.trim() ? section.name.trim() : "Untitled section",
        symbols: addSymbols(section.symbols),
      });
    }
  }

  const defaultSection = normalized.find((section) => section.id === DEFAULT_SECTION_ID);
  const unassigned = addSymbols(legacySymbols);
  if (defaultSection) defaultSection.symbols.push(...unassigned);
  else normalized.unshift({ id: DEFAULT_SECTION_ID, name: "Main", symbols: unassigned });
  return normalized;
}

/** Moves one existing symbol before a target symbol, or to the end of a section. */
export function moveWatchlistSymbol(
  sections: WatchlistSection[],
  symbol: string,
  targetSectionId: string,
  beforeSymbol?: string,
): WatchlistSection[] {
  const source = sections.find((section) => section.symbols.includes(symbol));
  const target = sections.find((section) => section.id === targetSectionId);
  if (!source || !target || beforeSymbol === symbol) return sections;
  if (beforeSymbol && !target.symbols.includes(beforeSymbol)) return sections;

  const next = sections.map((section) => ({ ...section, symbols: [...section.symbols] }));
  const nextSource = next.find((section) => section.id === source.id)!;
  const nextTarget = next.find((section) => section.id === target.id)!;
  nextSource.symbols.splice(nextSource.symbols.indexOf(symbol), 1);
  const index = beforeSymbol ? nextTarget.symbols.indexOf(beforeSymbol) : nextTarget.symbols.length;
  nextTarget.symbols.splice(index, 0, symbol);
  return next;
}
