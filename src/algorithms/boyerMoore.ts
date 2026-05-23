export interface BoyerMooreSearchResult {
  positions: number[];
  comparisons: number;
  lastOccurrenceTable: Map<string, number>;
}

export function buildLastOccurrenceTable(pattern: string): Map<string, number> {
  const table = new Map<string, number>();

  for (let index = 0; index < pattern.length; index += 1) {
    table.set(pattern[index], index);
  }

  return table;
}

export function searchWithBoyerMoore(
  text: string,
  pattern: string,
): BoyerMooreSearchResult {
  const lastOccurrenceTable = buildLastOccurrenceTable(pattern);

  if (pattern.length === 0 || text.length === 0 || pattern.length > text.length) {
    return {
      positions: [],
      comparisons: 0,
      lastOccurrenceTable,
    };
  }

  const positions: number[] = [];
  let comparisons = 0;
  let shift = 0;

  while (shift <= text.length - pattern.length) {
    let patternIndex = pattern.length - 1;

    while (patternIndex >= 0) {
      comparisons += 1;

      if (pattern[patternIndex] !== text[shift + patternIndex]) {
        break;
      }

      patternIndex -= 1;
    }

    if (patternIndex < 0) {
      positions.push(shift);

      if (shift + pattern.length < text.length) {
        const nextCharacter = text[shift + pattern.length];
        const lastOccurrence = lastOccurrenceTable.get(nextCharacter) ?? -1;
        shift += pattern.length - lastOccurrence;
      } else {
        shift += 1;
      }

      continue;
    }

    const mismatchedCharacter = text[shift + patternIndex];
    const lastOccurrence = lastOccurrenceTable.get(mismatchedCharacter) ?? -1;
    shift += Math.max(1, patternIndex - lastOccurrence);
  }

  return {
    positions,
    comparisons,
    lastOccurrenceTable,
  };
}
