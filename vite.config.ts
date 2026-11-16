import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' 讓產物可部署在 GitHub Pages 的任意子路徑；路由使用 HashRouter 避免重新整理 404
export default defineConfig({
  base: './',
  plugins: [react()],
})
