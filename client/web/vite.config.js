import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    server: { port: 5173 },
    // ffmpeg packages ship their own workers; don't let Vite try to pre-bundle them.
    optimizeDeps: { exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"] },
    // The vendored wasm core is large; keep it out of the JS bundle (it lives in public/).
    assetsInclude: ["**/*.wasm"],
});
