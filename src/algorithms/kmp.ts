export interface KmpSearchResult {
  positions: number[];
  comparisons: number;
  failureFunction: number[];
}

export function buildFailureFunction(pattern: string): number[] {
  const failureFunction = new Array<number>(pattern.length).fill(0);
  let borderLength = 0;

  for (let index = 1; index < pattern.length; ) {
    if (pattern[index] === pattern[borderLength]) {
      borderLength += 1;
      failureFunction[index] = borderLength;
      index += 1;
      continue;
    }

    if (borderLength > 0) {
      borderLength = failureFunction[borderLength - 1];
      continue;
    }

    failureFunction[index] = 0;
    index += 1;
  }

  return failureFunction;
}

export function searchWithKmp(text: string, pattern: string): KmpSearchResult {
  if (pattern.length === 0 || text.length === 0 || pattern.length > text.length) {
    return {
      positions: [],
      comparisons: 0,
      failureFunction: buildFailureFunction(pattern),
    };
  }

  const positions: number[] = [];
  const failureFunction = buildFailureFunction(pattern);
  let comparisons = 0;
  let textIndex = 0;
  let patternIndex = 0;

  while (textIndex < text.length) {
    comparisons += 1;

    if (text[textIndex] === pattern[patternIndex]) {
      textIndex += 1;
      patternIndex += 1;

      if (patternIndex === pattern.length) {
        positions.push(textIndex - patternIndex);
        patternIndex = failureFunction[patternIndex - 1];
      }

      continue;
    }

    if (patternIndex > 0) {
      patternIndex = failureFunction[patternIndex - 1];
      continue;
    }

    textIndex += 1;
  }

  return {
    positions,
    comparisons,
    failureFunction,
  };
}
