import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Relative base so the built console works from file:// or any sub-path
// (teaching machines, USB sticks, GitHub Pages, intranet static hosting).
export default defineConfig({
  base: './',
  plugins: [vue()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022'
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts']
  }
})
