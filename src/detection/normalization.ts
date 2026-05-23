const COMBINING_MARK_PATTERN = /\p{M}/u;

const VISUAL_SIMILARITY_GROUPS = [
  ["a", "4", "@", "\u03b1"],
  ["b", "8"],
  ["e", "3"],
  ["g", "6", "9"],
  ["i", "1", "l", "|", "!"],
  ["o", "0", "q"],
  ["s", "5", "$"],
  ["t", "7", "+"],
  ["z", "2"],
];

const VISUAL_BASE_MAP = new Map<string, string>();

for (const group of VISUAL_SIMILARITY_GROUPS) {
  const base = group[0];
  for (const character of group) {
    VISUAL_BASE_MAP.set(character, base);
  }
}

function mapVisualCharacter(character: string): string {
  const mapped = VISUAL_BASE_MAP.get(character);
  if (mapped !== undefined) {
    return mapped;
  }

  return character;
}

export function normalizeForExact(input: string): string {
  return input.toLocaleLowerCase("en-US");
}

export function normalizeForFuzzy(input: string): string {
  let normalized = "";
  const canonical = input.normalize("NFKD").toLocaleLowerCase("en-US");

  for (const character of canonical) {
    if (COMBINING_MARK_PATTERN.test(character)) {
      continue;
    }

    normalized += character;
  }

  return normalized;
}

export function foldVisualSimilarity(input: string): string {
  let folded = "";
  const canonical = normalizeForFuzzy(input);

  for (const character of canonical) {
    folded += mapVisualCharacter(character);
  }

  return folded;
}

export function getVisualSubstitutionCost(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (mapVisualCharacter(left) === mapVisualCharacter(right)) {
    return 0.2;
  }

  if (/\d/u.test(left) && /\d/u.test(right)) {
    return 0.6;
  }

  return 1;
}
