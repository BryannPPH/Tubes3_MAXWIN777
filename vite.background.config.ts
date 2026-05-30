import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/background/background.ts"),
      formats: ["iife"],
      fileName: () => "background.js",
      name: "JudolDetectorBackground",
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
