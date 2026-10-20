import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Cross-origin isolation lets onnxruntime-web use multithreaded WASM (SharedArrayBuffer).
// Model files come from the Hugging Face CDN over CORS, which COEP require-corp allows.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  server: {
    headers: isolationHeaders,
    // Quick tunnels (cloudflared) forward a random *.trycloudflare.com host for phone testing over HTTPS.
    allowedHosts: [".trycloudflare.com"],
  },
  preview: { headers: isolationHeaders, allowedHosts: [".trycloudflare.com"] },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
});
