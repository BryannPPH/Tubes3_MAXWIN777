export interface TrieNode {
  children: Map<string, TrieNode>;
  failureLink: TrieNode | null;
  patterns: string[];
  isEndOfPattern: boolean;
}

export interface AhoCorasickMatch {
  pattern: string;
  position: number;
  length: number;
}

export interface AhoCorasickSearchResult {
  matches: AhoCorasickMatch[];
  comparisons: number;
  trie: TrieNode;
}

export function buildTrie(patterns: string[]): TrieNode {
  const root: TrieNode = {
    children: new Map(),
    failureLink: null,
    patterns: [],
    isEndOfPattern: false,
  };

  // Build trie for all patterns
  for (const pattern of patterns) {
    let currentNode = root;

    for (const character of pattern) {
      if (!currentNode.children.has(character)) {
        currentNode.children.set(character, {
          children: new Map(),
          failureLink: null,
          patterns: [],
          isEndOfPattern: false,
        });
      }

      currentNode = currentNode.children.get(character)!;
    }

    currentNode.isEndOfPattern = true;
    currentNode.patterns.push(pattern);
  }

  return root;
}

export function buildFailureLinks(root: TrieNode): void {
  const queue: TrieNode[] = [];

  // Initialize first level failure links
  for (const child of root.children.values()) {
    child.failureLink = root;
    queue.push(child);
  }

  // BFS to build failure links for deeper levels
  while (queue.length > 0) {
    const currentNode = queue.shift()!;

    for (const [character, childNode] of currentNode.children) {
      queue.push(childNode);

      let failureNode = currentNode.failureLink;

      while (failureNode !== null && !failureNode.children.has(character)) {
        failureNode = failureNode.failureLink;
      }

      if (failureNode === null) {
        childNode.failureLink = root;
      } else {
        childNode.failureLink = failureNode.children.get(character)!;
      }

      // Merge patterns from failure link
      childNode.patterns.push(...childNode.failureLink.patterns);
    }
  }
}

export function searchWithAhoCorasick(
  text: string,
  patterns: string[],
): AhoCorasickSearchResult {
  if (patterns.length === 0 || text.length === 0) {
    return {
      matches: [],
      comparisons: 0,
      trie: buildTrie(patterns),
    };
  }

  const root = buildTrie(patterns);
  buildFailureLinks(root);

  const matches: AhoCorasickMatch[] = [];
  let comparisons = 0;
  let currentNode = root;

  for (let position = 0; position < text.length; position += 1) {
    const character = text[position];

    comparisons += 1;

    // Follow failure links until we find a matching character or reach root
    while (currentNode !== root && !currentNode.children.has(character)) {
      currentNode = currentNode.failureLink!;
      comparisons += 1;
    }

    if (currentNode.children.has(character)) {
      currentNode = currentNode.children.get(character)!;
    } else {
      currentNode = root;
    }

    // Check if current node marks end of any patterns
    if (currentNode.isEndOfPattern) {
      for (const pattern of currentNode.patterns) {
        matches.push({
          pattern,
          position: position - pattern.length + 1,
          length: pattern.length,
        });
      }
    }
  }

  return {
    matches,
    comparisons,
    trie: root,
  };
}
