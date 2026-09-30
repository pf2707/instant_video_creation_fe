import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // For GitHub Pages project sites the app is served from /<repo>/, so the
  // build sets VITE_BASE (e.g. "/marketing-video-creator/"). Defaults to "/"
  // for local dev and user/organization Pages served at the domain root.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: { port: 5173 },
  // ffmpeg packages ship their own workers; don't let Vite try to pre-bundle them.
  optimizeDeps: { exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"] },
  // The vendored wasm core is large; keep it out of the JS bundle (it lives in public/).
  assetsInclude: ["**/*.wasm"],
});
