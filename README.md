# Logseq Semantic Search (EmbeddingGemma)

Natural-language semantic search for Logseq powered by a **shared, text-only EmbeddingGemma service** (no image/vision tower loaded), paired with direct force-scroll block jumping.

## Architecture

1. **Shared Embedding Service**
   - Runs **once** locally on `http://127.0.0.1:8765` and can be shared across multiple apps.
   - Exposes `POST /embed` and OpenAI-compatible `POST /v1/embeddings` using only the text encoder (`google/embeddinggemma-300m` by default, or override via `EMBEDDING_MODEL_ID`).
2. **Logseq Plugin (`logseq-semantic-search`)**
   - Incrementally indexes your graph blocks into browser IndexedDB (only embeds new or edited blocks).
   - Opens with **`Ctrl+Alt+S`** (`Cmd+Option+S`) or the toolbar icon.
   - Ranks blocks by cosine similarity and jumps directly to the selected note (expanding collapsed parents and loading lazy blocks).

## Setup

### 1. Start the Shared Embedding Service
Run your local text-only EmbeddingGemma service (`start-service.bat`) so `http://127.0.0.1:8765` is active (or point `embeddingServiceUrl` in plugin settings to your own endpoint).

### 2. Build & Load the Logseq Plugin
```bash
npm install
npm run build
```
In Logseq Desktop: **Settings -> Advanced -> Developer mode (ON)** -> **Plugins -> Load unpacked plugin** -> select the cloned `logseq-semantic-search` folder.

Press **`Ctrl+Alt+S`**, click **Sync Index**, and search in plain natural language.

---

## ☕ Support

If this plugin helps your workflow, consider supporting future updates:

<p>
  <a href="https://www.buymeacoffee.com/ygreq" target="_blank">
    <img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" height="44" alt="Buy Me A Coffee" />
  </a>
  &nbsp;
  <a href="https://paypal.me/ygreqro" target="_blank">
    <img src="https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white" height="44" alt="PayPal" />
  </a>
  &nbsp;
  <a href="https://revolut.me/ygreqro" target="_blank">
    <img src="https://img.shields.io/badge/Revolut-191C1F?style=for-the-badge&logo=revolut&logoColor=white" height="44" alt="Revolut" />
  </a>
</p>

Direct links: [buymeacoffee.com/ygreq](https://www.buymeacoffee.com/ygreq) | [paypal.me/ygreqro](https://paypal.me/ygreqro) | [revolut.me/ygreqro](https://revolut.me/ygreqro)
