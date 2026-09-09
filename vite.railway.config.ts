import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 plugins:[react()],
 resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},
 css:{postcss:{plugins:[tailwindcss()]}},
 define:{'process.env.NODE_ENV':JSON.stringify(process.env.NODE_ENV||'production')},
 build:{outDir:'build/railway/client',emptyOutDir:true},
 server:{proxy:{'/api':'http://localhost:4173'}}
});
