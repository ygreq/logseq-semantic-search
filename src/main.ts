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
          <circle cx="10.5" cy="10.5" r="5.5" stroke="currentColor" stroke-width="2" />
          <path d="M14.5 14.5 L20 20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          <path d="M10.5 7.5 L11.3 9.7 L13.5 10.5 L11.3 11.3 L10.5 13.5 L9.7 11.3 L7.5 10.5 L9.7 9.7 Z" fill="currentColor" />
        </svg>
      </a>
    `,
  });

  logseq.App.registerCommandPalette(
    {
      key: 'semantic-search-open',
      label: 'Semantic Search: Natural Language Search',
      keybinding: {
        binding: 'mod+alt+s',
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
