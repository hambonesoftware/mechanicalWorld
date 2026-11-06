import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/mechanicalWorld/" : "/",
  server: { host: "0.0.0.0" },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: {
        laboratory: resolve(process.cwd(), "index.html"),
        career: resolve(process.cwd(), "career.html")
      }
    }
  }
});
