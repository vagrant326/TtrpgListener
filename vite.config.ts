import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "web/index.html"),
        projector: resolve(import.meta.dirname, "web/projector.html"),
      },
    },
  },
  server: {
    proxy: {
      "/ws": { target: "ws://127.0.0.1:8888", ws: true },
      "/api": "http://127.0.0.1:8888",
    },
  },
});
