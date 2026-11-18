import '@logseq/libs';
import type { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';

const HIGHLIGHT_STYLE_ID = 'semantic-jump-highlight-style';

function getHostDocument(): Document | null {
  try {
    return window.parent?.document ?? null;
  } catch {
    return null;
  }
}

export function findMainScrollContainer(doc: Document): HTMLElement | null {
  return (
    doc.getElementById('main-content-container') ??
    doc.querySelector<HTMLElement>('.cp__sidebar-main-content') ??
    doc.documentElement
  );
}

export function findBlockElement(doc: Document, blockUuid: string): HTMLElement | null {
  const escaped = CSS.escape(blockUuid);
  const scope: ParentNode = findMainScrollContainer(doc) ?? doc;
  return (
    scope.querySelector<HTMLElement>(`[blockid="${escaped}"]`) ??
    scope.querySelector<HTMLElement>(`#block-content-${escaped}`)
  );
}

function ensureHighlightStyles(doc: Document): void {
  if (doc.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    .semantic-jump-highlight {
      outline: 2px solid #7c3aed !important;
      outline-offset: 2px;
      background-color: rgba(124, 58, 237, 0.14) !important;
      border-radius: 4px;
      transition: background-color 0.4s ease, outline-color 0.4s ease;
    }
  `;
  doc.head.appendChild(style);
}

export function highlightBlockElement(doc: Document, el: HTMLElement): void {
  ensureHighlightStyles(doc);
  el.classList.add('semantic-jump-highlight');
  window.setTimeout(() => {
    el.classList.remove('semantic-jump-highlight');
  }, 2600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextFrame(doc: Document): Promise<void> {
  const win = doc.defaultView ?? window;
  return new Promise((resolve) => win.requestAnimationFrame(() => resolve()));
}

async function expandBlockAncestors(blockUuid: string): Promise<void> {
  const ancestorUuids: string[] = [];
  let currentId: string | number | undefined = blockUuid;
  const visited = new Set<string>();

  for (let depth = 0; depth < 30 && currentId !== undefined; depth++) {
    const block = await logseq.Editor.getBlock(currentId);
    if (!block || !block.parent || !block.parent.id) break;
    if (block.page && block.parent.id === block.page.id) break;

    const parentBlock = await logseq.Editor.getBlock(block.parent.id);
    if (!parentBlock || !parentBlock.uuid || visited.has(parentBlock.uuid)) break;

    visited.add(parentBlock.uuid);
    ancestorUuids.push(parentBlock.uuid);
    currentId = parentBlock.uuid;
  }

  for (let i = ancestorUuids.length - 1; i >= 0; i--) {
    try {
      await logseq.Editor.setBlockCollapsed(ancestorUuids[i], false);
    } catch {
      // Ignore
    }
  }
}

async function estimateBlockRatio(
  pageName: string,
  blockUuid: string
): Promise<number | null> {
  try {
    const tree = await logseq.Editor.getPageBlocksTree(pageName);
    if (!tree || tree.length === 0) return null;

    let total = 0;
    let foundIndex = -1;

    const walk = (nodes: BlockEntity[]) => {
      for (const node of nodes) {
        if (node.uuid === blockUuid) foundIndex = total;
        total++;
        if (node.children && node.children.length > 0) {
          walk(node.children as BlockEntity[]);
        }
      }
    };

    walk(tree);
    if (foundIndex < 0 || total <= 1) return null;
    return foundIndex / (total - 1);
  } catch {
    return null;
  }
}

async function centerAndHighlight(doc: Document, el: HTMLElement): Promise<void> {
  el.scrollIntoView({ behavior: 'auto', block: 'center' });
  await nextFrame(doc);
  await sleep(120);
  el.scrollIntoView({ behavior: 'auto', block: 'center' });
  highlightBlockElement(doc, el);
}

export async function jumpToBlock(
  pageName: string,
  blockUuid: string,
  openInSidebar = false
): Promise<boolean> {
  if (openInSidebar) {
    logseq.Editor.openInRightSidebar(blockUuid);
    return true;
  }

  const doc = getHostDocument();
  if (!doc) {
    await logseq.Editor.scrollToBlockInPage(pageName, blockUuid);
    return false;
  }

  await logseq.App.pushState('page', { name: pageName });
  await sleep(120);
  await expandBlockAncestors(blockUuid);
  await nextFrame(doc);

  const container = findMainScrollContainer(doc);
  if (!container) {
    await logseq.Editor.scrollToBlockInPage(pageName, blockUuid);
    return false;
  }

  let target = findBlockElement(doc, blockUuid);
  if (target) {
    await centerAndHighlight(doc, target);
    return true;
  }

  const ratio = await estimateBlockRatio(pageName, blockUuid);
  if (ratio !== null) {
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.floor(maxScroll * ratio);
    await nextFrame(doc);
    await sleep(60);

    target = findBlockElement(doc, blockUuid);
    if (target) {
      await centerAndHighlight(doc, target);
      return true;
    }
  }

  let stagnantCount = 0;
  for (let step = 0; step < 150; step++) {
    target = findBlockElement(doc, blockUuid);
    if (target) {
      await centerAndHighlight(doc, target);
      return true;
    }

    const prevHeight = container.scrollHeight;
    container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    await nextFrame(doc);
    await sleep(35);

    target = findBlockElement(doc, blockUuid);
    if (target) {
      await centerAndHighlight(doc, target);
      return true;
    }

    if (container.scrollHeight === prevHeight) {
      stagnantCount++;
      if (stagnantCount >= 8) break;
      await sleep(100);
    } else {
      stagnantCount = 0;
    }
  }

  target = findBlockElement(doc, blockUuid);
  if (target) {
    await centerAndHighlight(doc, target);
    return true;
  }

  logseq.Editor.openInRightSidebar(blockUuid);
  return false;
}
