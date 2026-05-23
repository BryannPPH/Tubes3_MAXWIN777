import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/content/contentScript.ts"),
      formats: ["iife"],
      fileName: () => "content.js",
      name: "JudolDetectorContent",
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
