import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFile } from 'node:fs/promises';

export default defineConfig({
  plugins: [react(), tailwindcss(),{
    name:'safe-contact-development-preview',
    configureServer(server){
      server.middlewares.use('/api/release-config',(_request,response)=>{
        response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');
        response.end(JSON.stringify({globalBarangayReleased:false}));
      });
      // Optional public-only snapshot lets the preview show the new counts
      // before its production endpoint is deployed. No credentials or writes.
      server.middlewares.use('/api/music-stats',async(_request,response)=>{
        response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');
        try{response.end(await readFile(new URL('./.preview/music-stats.json',import.meta.url),'utf8'));}
        catch{response.statusCode=503;response.end(JSON.stringify({error:'Music counts unavailable'}));}
      });
      server.middlewares.use('/api/contact-config',(_request,response)=>{
        response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');
        response.end(JSON.stringify({enabled:false,siteKey:'',authCaptchaEnabled:false}));
      });
    },
  }],
  server: {
    host: '127.0.0.1', port: 5181, strictPort: true,
    proxy: {
      '/api': { target: 'https://dj-buang.com', changeOrigin: true },
      '/files': { target: 'https://dj-buang.com', changeOrigin: true },
    },
  },
});
