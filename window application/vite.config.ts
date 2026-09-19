import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tauri from "@tauri-apps/vite-plugin-tauri";

export default defineConfig({
  plugins: [react(), tailwindcss(), tauri()],
  build: {
    target: "es2022",
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
});