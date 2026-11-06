import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 开发期由 Vite 把接口请求代理到后端，浏览器看到的是同源，不需要处理 CORS
const BACKEND = 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': BACKEND,
      '/healthz': BACKEND,
      // 本地开发的视频文件（含 Range 请求）由后端提供
      '/media': BACKEND,
    },
  },
});
