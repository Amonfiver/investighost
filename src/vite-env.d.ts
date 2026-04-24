/**
 * Investighost - Tipos Vite
 * 
 * Propósito: Declaraciones de tipos para Vite
 */

/// <reference types="vite/client" />

declare module '*.css' {
  const css: string
  export default css
}