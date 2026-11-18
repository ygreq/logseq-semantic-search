# Architecture Options: Running EmbeddingGemma for Logseq Semantic Search

Because Logseq plugins execute inside a sandboxed browser `<iframe>` (with no Node.js `child_process` or OS process control), a plugin cannot directly spawn or terminate `python.exe` or `uvicorn`.

There are two main ways to run EmbeddingGemma 2 (`google/embeddinggemma-2` or a 270M text-only export) for Logseq:

---

## Option 1: Shared Local Python Service + Launcher Wrapper (Current Setup)

The embedding model runs in a lightweight FastAPI server (`server.py` on `http://127.0.0.1:8765`), and a silent launcher (`launch-logseq.vbs` + `launch-logseq.ps1`) starts the service, opens Logseq, and stops the service when Logseq exits.

### Pros
- **Fast indexing:** Native PyTorch (CPU or CUDA GPU) embeds thousands of blocks much faster than browser WebAssembly.
- **Shared across apps:** Exposes `POST /embed` and OpenAI-compatible `POST /v1/embeddings`, so other local tools can reuse the same model in memory and on disk.
- **No model duplication:** One `HF_HOME` cache folder on disk.

### Cons
- Requires Python + `uv`/dependencies installed locally.
- Needs the launcher wrapper (`launch-logseq.vbs`) if you want automatic start/stop tied to Logseq's lifecycle.

---

## Option 2: 100% In-Plugin via Transformers.js (ONNX / WebGPU / WASM)

The plugin bundles `@huggingface/transformers` and loads `onnx-community/embeddinggemma-300m-ONNX` (`q8` quantized) directly inside Logseq's plugin iframe.

### Pros
- **Zero external setup:** No Python, no `uvicorn`, no launcher script, no extra ports.
- **Automatic lifecycle:** Starts when Logseq loads the plugin and unloads when Logseq closes.
- **Cross-platform:** Works identically on Windows, macOS, and Linux.

### Cons
- **Slower initial indexing:** Embedding 5,000+ blocks in WebAssembly is noticeably slower than native PyTorch (though WebGPU helps where supported).
- **Isolated to Logseq:** Other desktop/backend apps cannot share the browser-cached ONNX model.
