import {defineConfig} from 'vite';
export default defineConfig({build:{ssr:'server/index.ts',outDir:'build/railway/server',emptyOutDir:true,rolldownOptions:{output:{entryFileNames:'index.js'}}}});
