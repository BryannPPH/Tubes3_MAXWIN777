export interface RabinKarpSearchResult {
  positions: number[];
  comparisons: number;
  fingerprints: number[];
  baseAndModulus: { base: number; modulus: number };
}

const PRIME_BASE = 256;
const MOD_PRIME = 101;

export function computeHash(
  text: string,
  length: number,
  base: number,
  modulus: number,
): number {
  let hash = 0;

  for (let i = 0; i < length; i += 1) {
    hash = (hash * base + text.charCodeAt(i)) % modulus;
  }

  return hash;
}

export function searchWithRabinKarp(
  text: string,
  pattern: string,
  base: number = PRIME_BASE,
  modulus: number = MOD_PRIME,
): RabinKarpSearchResult {
  if (
    pattern.length === 0 ||
    text.length === 0 ||
    pattern.length > text.length
  ) {
    return {
      positions: [],
      comparisons: 0,
      fingerprints: [],
      baseAndModulus: { base, modulus },
    };
  }

  const positions: number[] = [];
  const fingerprints: number[] = [];
  let comparisons = 0;

  // Calculate base^(pattern.length - 1) % modulus for rolling hash
  let basePower = 1;
  for (let i = 0; i < pattern.length - 1; i += 1) {
    basePower = (basePower * base) % modulus;
  }

  // Calculate pattern hash
  const patternHash = computeHash(pattern, pattern.length, base, modulus);

  // Calculate first window hash
  let windowHash = computeHash(text, pattern.length, base, modulus);
  fingerprints.push(windowHash);

  // Slide the pattern over the text
  for (let i = 0; i <= text.length - pattern.length; i += 1) {
    comparisons += 1;

    // If hash values match, verify character by character to avoid false positives
    if (windowHash === patternHash) {
      comparisons += 1;

      let matches = true;
      for (let j = 0; j < pattern.length; j += 1) {
        comparisons += 1;
        if (text[i + j] !== pattern[j]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        positions.push(i);
      }
    }

    // Calculate hash of next window using rolling hash
    if (i < text.length - pattern.length) {
      // Remove first character of current window and add new character
      windowHash =
        (windowHash - (text.charCodeAt(i) * basePower) % modulus + modulus) %
        modulus;
      windowHash = (windowHash * base + text.charCodeAt(i + pattern.length)) %
        modulus;

      fingerprints.push(windowHash);
    }
  }

  return {
    positions,
    comparisons,
    fingerprints,
    baseAndModulus: { base, modulus },
  };
}

export function searchMultipleWithRabinKarp(
  text: string,
  patterns: string[],
  base: number = PRIME_BASE,
  modulus: number = MOD_PRIME,
): Record<string, RabinKarpSearchResult> {
  const results: Record<string, RabinKarpSearchResult> = {};

  for (const pattern of patterns) {
    results[pattern] = searchWithRabinKarp(text, pattern, base, modulus);
  }

  return results;
}
