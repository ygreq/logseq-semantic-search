import { getAllIndexedBlocks } from './db';
import { embedBatch } from './indexer';

export interface SemanticResult {
  uuid: string;
  pageName: string;
  originalName: string;
  content: string;
  score: number;
}

function dotProduct(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export async function semanticSearch(
  serviceUrl: string,
  query: string,
  opts: { maxResults?: number; minScore?: number; pageFilter?: string } = {}
): Promise<{ results: SemanticResult[]; indexedCount: number }> {
  const cleanQuery = query.trim();
  const blocks = await getAllIndexedBlocks();
  if (!cleanQuery || blocks.length === 0) {
    return { results: [], indexedCount: blocks.length };
  }

  const [queryVec] = await embedBatch(serviceUrl, [cleanQuery], 'query');
  if (!queryVec || queryVec.length === 0) {
    return { results: [], indexedCount: blocks.length };
  }

  const minScore = opts.minScore ?? 0.2;
  const maxResults = opts.maxResults ?? 50;
  const scored: SemanticResult[] = [];

  for (const b of blocks) {
    if (opts.pageFilter && b.pageName !== opts.pageFilter) continue;
    if (!b.vector || b.vector.length === 0) continue;

    const score = dotProduct(queryVec, b.vector);
    if (score >= minScore) {
      scored.push({
        uuid: b.uuid,
        pageName: b.pageName,
        originalName: b.originalName,
        content: b.content,
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    results: scored.slice(0, maxResults),
    indexedCount: blocks.length,
  };
}
