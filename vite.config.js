import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/mechanicalWorld/" : "/",
  server: { host: "0.0.0.0" },
  build: {
    target: "es2022",
    sourcemap: true
  }
});
