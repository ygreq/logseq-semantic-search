import '@logseq/libs';
import { syncGraphIndex } from './indexer';
import { openSemanticModal } from './ui';

async function main(): Promise<void> {
  logseq.useSettingsSchema([
    {
      key: 'embeddingServiceUrl',
      type: 'string',
      default: 'http://127.0.0.1:8765',
      title: 'Shared EmbeddingGemma Service URL',
      description:
        'URL of the shared text-only EmbeddingGemma service (also usable by HomesteadVault and other apps).',
    },
    {
      key: 'maxResults',
      type: 'number',
      default: 50,
      title: 'Max semantic results',
      description: 'Maximum number of matching blocks returned per query.',
    },
    {
      key: 'minScore',
      type: 'number',
      default: 0.2,
      title: 'Minimum similarity score (0.0 - 1.0)',
      description: 'Filter out matches below this cosine similarity threshold.',
    },
  ]);

  logseq.provideModel({
    openSemanticSearch() {
      void openSemanticModal();
    },
  });

  logseq.App.registerUIItem('toolbar', {
    key: 'semantic-search-toolbar',
    template: `
      <a class="button" data-on-click="openSemanticSearch" title="Semantic Search (EmbeddingGemma)">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M6 17 L12 5 L18 15 L6 17 Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
          <circle cx="12" cy="5" r="2.2" fill="currentColor" />
          <circle cx="6" cy="17" r="2" fill="currentColor" />
          <circle cx="18" cy="15" r="2.6" fill="var(--ls-primary-background-color, #fff)" stroke="currentColor" stroke-width="2" />
        </svg>
      </a>
    `,
  });

  logseq.App.registerCommandPalette(
    {
      key: 'semantic-search-open',
      label: 'Semantic Search: Natural Language Search',
      keybinding: {
        binding: 'mod+alt+k',
      },
    },
    () => {
      void openSemanticModal();
    }
  );

  logseq.App.registerCommandPalette(
    {
      key: 'semantic-search-sync',
      label: 'Semantic Search: Sync Graph Index',
    },
    async () => {
      const url = String(logseq.settings?.embeddingServiceUrl || 'http://127.0.0.1:8765');
      await logseq.UI.showMsg('Syncing semantic index...', 'info');
      try {
        const res = await syncGraphIndex(url);
        await logseq.UI.showMsg(
          `Semantic index synced: ${res.totalBlocks} blocks (${res.embedded} updated).`,
          'success'
        );
      } catch (err) {
        await logseq.UI.showMsg(
          `Semantic sync failed: ${err instanceof Error ? err.message : String(err)}`,
          'error'
        );
      }
    }
  );

  console.log('[Semantic Search] Plugin initialized');
}

logseq.ready(main).catch(console.error);
