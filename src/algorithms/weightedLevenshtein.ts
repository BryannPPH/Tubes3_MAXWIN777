import { getVisualSubstitutionCost } from "../detection/normalization";

export interface WeightedLevenshteinResult {
  distance: number;
  similarity: number;
  comparisons: number;
}

export function calculateWeightedLevenshtein(
  left: string,
  right: string,
): WeightedLevenshteinResult {
  if (left === right) {
    return {
      distance: 0,
      similarity: 1,
      comparisons: 0,
    };
  }

  if (left.length === 0 || right.length === 0) {
    const distance = Math.max(left.length, right.length);
    return {
      distance,
      similarity: distance === 0 ? 1 : 0,
      comparisons: 0,
    };
  }

  const previousRow = new Array<number>(right.length + 1).fill(0);
  const currentRow = new Array<number>(right.length + 1).fill(0);

  for (let column = 0; column <= right.length; column += 1) {
    previousRow[column] = column;
  }

  let comparisons = 0;

  for (let row = 1; row <= left.length; row += 1) {
    currentRow[0] = row;

    for (let column = 1; column <= right.length; column += 1) {
      comparisons += 1;

      const deletionCost = previousRow[column] + 1;
      const insertionCost = currentRow[column - 1] + 1;
      const substitutionCost =
        previousRow[column - 1] +
        getVisualSubstitutionCost(left[row - 1], right[column - 1]);

      currentRow[column] = Math.min(deletionCost, insertionCost, substitutionCost);
    }

    for (let column = 0; column <= right.length; column += 1) {
      previousRow[column] = currentRow[column];
    }
  }

  const distance = previousRow[right.length];
  const longestLength = Math.max(left.length, right.length);
  const similarity = longestLength === 0 ? 1 : Math.max(0, 1 - distance / longestLength);

  return {
    distance,
    similarity,
    comparisons,
  };
}
