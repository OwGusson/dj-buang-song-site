import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss(),{
    name:'safe-contact-development-preview',
    configureServer(server){
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
