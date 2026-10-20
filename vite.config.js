import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1', port: 5181, strictPort: true,
    proxy: {
      '/api': { target: 'https://dj-buang.com', changeOrigin: true },
      '/files': { target: 'https://dj-buang.com', changeOrigin: true },
    },
  },
});
