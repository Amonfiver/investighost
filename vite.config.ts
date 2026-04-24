/**
 * Configuración Vite para Investighost
 * 
 * Propósito: Configuración del build y desarrollo
 * Alcance: Toda la aplicación (main + renderer processes)
 * Decisiones: 
 *   - Usa vite-plugin-electron para integración con Electron
 *   - Alias de paths para imports limpios
 *   - Hot reload habilitado
 * Limitaciones: build.target debe ser compatible con Electron
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import electron from 'vite-plugin-electron'

export default defineConfig({
  plugins: [
    react(),
    electron({
      entry: 'src/main/index.ts',
      onstart: options => {
        if (options.startup) {
          options.startup()
        }
      },
      vite: {
        build: {
          sourcemap: true,
          minify: false,
          outDir: 'dist-electron',
          rollupOptions: {
            external: ['better-sqlite3', 'electron'],
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@main': path.resolve(__dirname, './src/main'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@services': path.resolve(__dirname, './src/services'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
  root: '.',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'chrome118',
  },
})