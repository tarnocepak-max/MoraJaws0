import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function distSecurityPlugin(): Plugin {
  return {
    name: 'security-clean-dist-backups',
    closeBundle() {
      const distDir = path.resolve(import.meta.dirname, 'dist');
      if (fs.existsSync(distDir)) {
        const scanAndPurge = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              scanAndPurge(fullPath);
            } else if (
              entry.name.endsWith('.zip') ||
              entry.name.endsWith('.bak') ||
              entry.name.endsWith('.sql') ||
              entry.name.includes('backup') ||
              entry.name.includes('database.json')
            ) {
              fs.unlinkSync(fullPath);
              console.warn(`[Security Plugin] Purged sensitive file from dist: ${entry.name}`);
            }
          }
        };
        scanAndPurge(distDir);
      }
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), distSecurityPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        process.env.SUPABASE_URL ? (() => {
          try { return new URL(process.env.SUPABASE_URL).origin; } catch { return ''; }
        })() : ''
      ),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY || ''),
    },
  };
});
