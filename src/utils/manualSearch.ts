import { searchWithKmp } from "../algorithms/kmp";

export function containsPattern(text: string, pattern: string): boolean {
  if (pattern.length === 0 || text.length === 0 || pattern.length > text.length) {
    return false;
  }

  return searchWithKmp(text, pattern).positions.length > 0;
}

export function collectContainedPatterns(
  text: string,
  patterns: string[],
): string[] {
  const matches: string[] = [];

  for (const pattern of patterns) {
    if (containsPattern(text, pattern)) {
      matches.push(pattern);
    }
  }

  return matches;
}
