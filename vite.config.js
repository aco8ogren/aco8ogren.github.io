/*
 * @Author: alex 
 * @Date: 2025-10-18 15:51:31 
 * @Last Modified by:   alex 
 * @Last Modified time: 2025-10-18 15:51:31 
 */
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  // Base stays '/' for a user site like username.github.io
  base: '/',
  build: {
    target: 'esnext',              // keep top-level await
    outDir: 'dist',
    modulePreload: { polyfill: true } // helps older Safari with <link rel="modulepreload">
  },
  esbuild: {
    target: 'esnext',              // be explicit
    supported: { 'top-level-await': true } // tell esbuild not to transform TLA away
  }
});
