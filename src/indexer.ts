import '@logseq/libs';
import type { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';
import {
  clearAllIndexedBlocks,
  deleteIndexedBlocks,
  getAllIndexedBlocks,
  putIndexedBlocks,
  type IndexedBlock,
} from './db';

export interface IndexProgress {
  phase: 'scanning' | 'embedding' | 'done';
  totalBlocks: number;
  toEmbed: number;
  embedded: number;
  removed: number;
}

function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export async function embedBatch(
  serviceUrl: string,
  texts: string[],
  mode: 'query' | 'document'
): Promise<number[][]> {
  const base = serviceUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, mode }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Embedding service error (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings;
}

/**
 * Incrementally index all blocks in the current Logseq graph.
 * Only new or modified blocks are sent to the shared EmbeddingGemma service.
 */
export async function syncGraphIndex(
  serviceUrl: string,
  opts: { fullRebuild?: boolean; onProgress?: (p: IndexProgress) => void } = {}
): Promise<IndexProgress> {
  if (opts.fullRebuild) {
    await clearAllIndexedBlocks();
  }

  opts.onProgress?.({
    phase: 'scanning',
    totalBlocks: 0,
    toEmbed: 0,
    embedded: 0,
    removed: 0,
  });

  const existing = await getAllIndexedBlocks();
  const existingMap = new Map<string, IndexedBlock>();
  for (const item of existing) {
    existingMap.set(item.uuid, item);
  }

  const pages = (await logseq.Editor.getAllPages()) ?? [];
  const currentBlocks: Array<{
    uuid: string;
    pageName: string;
    originalName: string;
    content: string;
    hash: string;
  }> = [];
  const seenUuids = new Set<string>();

  for (const page of pages) {
    if (!page?.name) continue;
    const tree = await logseq.Editor.getPageBlocksTree(page.name);
    if (!tree || tree.length === 0) continue;

    const walk = (nodes: BlockEntity[]) => {
      for (const node of nodes) {
        if (node.uuid && node.content) {
          const clean = node.content.replace(/\s+/g, ' ').trim();
          if (clean.length >= 4) {
            seenUuids.add(node.uuid);
            currentBlocks.push({
              uuid: node.uuid,
              pageName: page.name,
              originalName: page.originalName || page.name,
              content: clean,
              hash: hashText(clean),
            });
          }
        }
        if (node.children && node.children.length > 0) {
          walk(node.children as BlockEntity[]);
        }
      }
    };

    walk(tree);
  }

  // Delete blocks that no longer exist
  const toDelete: string[] = [];
  for (const uuid of existingMap.keys()) {
    if (!seenUuids.has(uuid)) {
      toDelete.push(uuid);
    }
  }
  if (toDelete.length > 0) {
    await deleteIndexedBlocks(toDelete);
  }

  // Filter to only new or modified blocks
  const dirty = currentBlocks.filter((b) => {
    const prev = existingMap.get(b.uuid);
    return !prev || prev.hash !== b.hash;
  });

  const progress: IndexProgress = {
    phase: 'embedding',
    totalBlocks: currentBlocks.length,
    toEmbed: dirty.length,
    embedded: 0,
    removed: toDelete.length,
  };
  opts.onProgress?.({ ...progress });

  const BATCH_SIZE = 32;
  for (let i = 0; i < dirty.length; i += BATCH_SIZE) {
    const chunk = dirty.slice(i, i + BATCH_SIZE);
    const vectors = await embedBatch(
      serviceUrl,
      chunk.map((c) => c.content),
      'document'
    );

    const records: IndexedBlock[] = chunk.map((c, idx) => ({
      ...c,
      vector: vectors[idx] ?? [],
    }));

    await putIndexedBlocks(records);
    progress.embedded += chunk.length;
    opts.onProgress?.({ ...progress });
  }

  progress.phase = 'done';
  opts.onProgress?.({ ...progress });
  return progress;
}
