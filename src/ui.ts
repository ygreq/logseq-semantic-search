import '@logseq/libs';
import { getAllIndexedBlocks } from './db';
import { syncGraphIndex } from './indexer';
import { jumpToBlock } from './scroller';
import { semanticSearch, type SemanticResult } from './semanticSearch';

const MODAL_ID = 'semantic-search-modal-overlay';
const STYLE_ID = 'semantic-search-modal-style';

function getHostDocument(): Document {
  return window.parent?.document ?? document;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getServiceUrl(): string {
  return String(logseq.settings?.embeddingServiceUrl || 'http://127.0.0.1:8765');
}

function ensureModalStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${MODAL_ID} {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.48);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 10vh;
      font-family: var(--ls-font-family, system-ui, -apple-system, sans-serif);
    }
    .ss-dialog {
      width: min(700px, 92vw);
      max-height: 76vh;
      display: flex;
      flex-direction: column;
      background: var(--ls-primary-background-color, #ffffff);
      color: var(--ls-primary-text-color, #111827);
      border: 1px solid var(--ls-border-color, #d1d5db);
      border-radius: 10px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
      overflow: hidden;
    }
    .ss-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--ls-border-color, #e5e7eb);
      background: var(--ls-secondary-background-color, #f9fafb);
    }
    .ss-input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      color: inherit;
      font-size: 15px;
    }
    .ss-btn {
      font-size: 12px;
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid var(--ls-border-color, #d1d5db);
      background: var(--ls-primary-background-color, #ffffff);
      color: var(--ls-primary-text-color, #374151);
      cursor: pointer;
      white-space: nowrap;
    }
    .ss-btn.primary {
      background: #7c3aed;
      color: #ffffff;
      border-color: transparent;
    }
    .ss-btn.active {
      background: var(--ls-link-text-color, #2563eb);
      color: #ffffff;
      border-color: transparent;
    }
    .ss-btn:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .ss-status {
      font-size: 12px;
      padding: 6px 14px;
      color: var(--ls-secondary-text-color, #6b7280);
      border-bottom: 1px solid var(--ls-border-color, #e5e7eb);
    }
    .ss-list {
      list-style: none;
      margin: 0;
      padding: 6px;
      overflow-y: auto;
      flex: 1;
    }
    .ss-item {
      padding: 9px 12px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ss-item.selected,
    .ss-item:hover {
      background: var(--ls-tertiary-background-color, rgba(124, 58, 237, 0.12));
    }
    .ss-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .ss-page {
      font-size: 11px;
      font-weight: 600;
      color: var(--ls-link-text-color, #2563eb);
    }
    .ss-score {
      font-size: 11px;
      font-weight: 600;
      color: #7c3aed;
    }
    .ss-content {
      font-size: 13px;
      line-height: 1.4;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .ss-footer {
      display: flex;
      justify-content: space-between;
      padding: 7px 14px;
      font-size: 11px;
      color: var(--ls-secondary-text-color, #6b7280);
      border-top: 1px solid var(--ls-border-color, #e5e7eb);
      background: var(--ls-secondary-background-color, #f9fafb);
    }
  `;
  doc.head.appendChild(style);
}

export function closeSemanticModal(): void {
  getHostDocument().getElementById(MODAL_ID)?.remove();
}

export async function openSemanticModal(): Promise<void> {
  const doc = getHostDocument();
  ensureModalStyles(doc);
  closeSemanticModal();

  const currentPage = await logseq.Editor.getCurrentPage();
  const currentPageName =
    currentPage && 'name' in currentPage ? String(currentPage.name) : undefined;
  const initialIndexed = (await getAllIndexedBlocks()).length;

  let currentPageOnly = false;
  let results: SemanticResult[] = [];
  let selectedIndex = 0;
  let debounceTimer: number | undefined;

  const overlay = doc.createElement('div');
  overlay.id = MODAL_ID;
  overlay.innerHTML = `
    <div class="ss-dialog" role="dialog" aria-modal="true" aria-label="Semantic Search">
      <div class="ss-header">
        <input class="ss-input" type="text" placeholder="Ask in natural language (e.g. 'how I fixed docker permissions')..." />
        <button class="ss-btn ss-scope-btn" type="button" ${
          currentPageName ? '' : 'disabled'
        }>All Pages</button>
        <button class="ss-btn primary ss-sync-btn" type="button">Sync Index</button>
      </div>
      <div class="ss-status">${
        initialIndexed > 0
          ? `${initialIndexed} blocks indexed. Type a natural-language query...`
          : 'No blocks indexed yet. Click "Sync Index" to embed your graph.'
      }</div>
      <ul class="ss-list"></ul>
      <div class="ss-footer">
        <span>Enter: Jump to block &nbsp;|&nbsp; Shift+Enter: Right Sidebar</span>
        <span>Esc: Close</span>
      </div>
    </div>
  `;

  doc.body.appendChild(overlay);

  const input = overlay.querySelector<HTMLInputElement>('.ss-input')!;
  const scopeBtn = overlay.querySelector<HTMLButtonElement>('.ss-scope-btn')!;
  const syncBtn = overlay.querySelector<HTMLButtonElement>('.ss-sync-btn')!;
  const statusEl = overlay.querySelector<HTMLDivElement>('.ss-status')!;
  const listEl = overlay.querySelector<HTMLUListElement>('.ss-list')!;

  const renderList = () => {
    listEl.innerHTML = '';
    results.forEach((item, idx) => {
      const li = doc.createElement('li');
      li.className = `ss-item${idx === selectedIndex ? ' selected' : ''}`;
      const pct = Math.max(0, Math.min(100, Math.round(item.score * 100)));
      li.innerHTML = `
        <div class="ss-meta">
          <span class="ss-page">${escapeHtml(item.originalName)}</span>
          <span class="ss-score">${pct}% match</span>
        </div>
        <span class="ss-content">${escapeHtml(item.content)}</span>
      `;
      li.addEventListener('click', (ev) => {
        void executeJump(item, ev.shiftKey);
      });
      listEl.appendChild(li);
    });
    const active = listEl.children[selectedIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  };

  const runSearch = async () => {
    const q = input.value.trim();
    if (!q) {
      results = [];
      selectedIndex = 0;
      const count = (await getAllIndexedBlocks()).length;
      statusEl.textContent =
        count > 0
          ? `${count} blocks indexed. Type a natural-language query...`
          : 'No blocks indexed yet. Click "Sync Index" to embed your graph.';
      renderList();
      return;
    }

    statusEl.textContent = 'Embedding query & ranking blocks...';
    try {
      const maxResults = Number(logseq.settings?.maxResults) || 50;
      const minScore = Number(logseq.settings?.minScore) || 0.2;
      const res = await semanticSearch(getServiceUrl(), q, {
        maxResults,
        minScore,
        pageFilter: currentPageOnly ? currentPageName : undefined,
      });

      results = res.results;
      selectedIndex = 0;
      statusEl.textContent =
        res.indexedCount === 0
          ? 'No blocks indexed yet. Click "Sync Index" first.'
          : results.length === 0
            ? `No semantic matches above ${Math.round(minScore * 100)}% (searched ${res.indexedCount} blocks).`
            : `Top ${results.length} semantic match(es) across ${res.indexedCount} indexed blocks`;
      renderList();
    } catch (err) {
      results = [];
      statusEl.textContent = `Service error: ${err instanceof Error ? err.message : String(err)}`;
      renderList();
    }
  };

  const executeJump = async (item: SemanticResult, openInSidebar: boolean) => {
    closeSemanticModal();
    await jumpToBlock(item.pageName, item.uuid, openInSidebar);
  };

  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    try {
      const summary = await syncGraphIndex(getServiceUrl(), {
        onProgress: (p) => {
          if (p.phase === 'scanning') {
            statusEl.textContent = 'Scanning graph blocks...';
          } else if (p.phase === 'embedding') {
            statusEl.textContent =
              p.toEmbed === 0
                ? `Index up to date (${p.totalBlocks} blocks).`
                : `Embedding new/changed blocks: ${p.embedded} / ${p.toEmbed}...`;
          } else {
            statusEl.textContent = `Indexed ${p.totalBlocks} blocks (${p.embedded} updated, ${p.removed} removed).`;
          }
        },
      });
      if (input.value.trim()) {
        await runSearch();
      } else {
        statusEl.textContent = `Ready: ${summary.totalBlocks} blocks indexed (${summary.embedded} updated).`;
      }
    } catch (err) {
      statusEl.textContent = `Sync failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      syncBtn.disabled = false;
      input.focus();
    }
  });

  scopeBtn.addEventListener('click', () => {
    if (!currentPageName) return;
    currentPageOnly = !currentPageOnly;
    scopeBtn.classList.toggle('active', currentPageOnly);
    scopeBtn.textContent = currentPageOnly ? 'Current Page' : 'All Pages';
    void runSearch();
    input.focus();
  });

  input.addEventListener('input', () => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void runSearch(), 220);
  });

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeSemanticModal();
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (results.length > 0) {
        selectedIndex = (selectedIndex + 1) % results.length;
        renderList();
      }
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (results.length > 0) {
        selectedIndex = (selectedIndex - 1 + results.length) % results.length;
        renderList();
      }
    } else if (ev.key === 'Enter' && results[selectedIndex]) {
      ev.preventDefault();
      void executeJump(results[selectedIndex], ev.shiftKey);
    }
  });

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) closeSemanticModal();
  });

  input.focus();
}
