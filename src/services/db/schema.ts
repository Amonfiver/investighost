/**
 * Investighost - Esquemas de Base de Datos (MVP)
 * 
 * Propósito: Esquemas SQLite con Drizzle, alineados con el contrato de datos del MVP
 * Alcance: Persistencia mínima necesaria para el flujo investigación → revisión → publicación
 * Estado: Consolidado para MVP - tablas simplificadas y coherentes
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// ============================================
// Tabla: Solicitudes de Investigación
// ============================================

export const researchRequests = sqliteTable('research_requests', {
  id: text('id').primaryKey(),
  country: text('country').notNull(),
  region: text('region'),
  focus: text('focus'),
  outputLanguage: text('output_language').notNull().default('es'),
  userNotes: text('user_notes'),
  // Estados: pending, researching, structured, drafted, under_review, approved, published, error
  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ============================================
// Tabla: Resultados de Investigación (datos estructurados)
// ============================================

export const researchResults = sqliteTable('research_results', {
  id: text('id').primaryKey(),
  researchId: text('research_id').notNull(),
  // Destino (normalizado de country + region)
  destinationCountry: text('destination_country').notNull(),
  destinationRegion: text('destination_region').notNull(),
  destinationDescription: text('destination_description').notNull(),
  // Resumen general
  summary: text('summary').notNull(),
  // Nivel de confianza 0-1
  confidence: real('confidence').notNull(),
  generatedAt: integer('generated_at', { mode: 'timestamp' }).notNull(),
})

// ============================================
// Tabla: Lugares recomendados
// ============================================

export const places = sqliteTable('places', {
  id: text('id').primaryKey(),
  resultId: text('result_id').notNull(),
  name: text('name').notNull(),
  // Categorías: landmark, neighborhood, museum, viewpoint, beach, park, market, other
  category: text('category').notNull(),
  description: text('description').notNull(),
  whyVisit: text('why_visit').notNull(),
  bestFor: text('best_for'),
  estimatedTime: text('estimated_time'),
  practicalInfo: text('practical_info'),
})

// ============================================
// Tabla: Actividades/Planes
// ============================================

export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  resultId: text('result_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  // Categorías: experience, tour, food, nightlife, shopping, relax, other
  category: text('category').notNull(),
  idealFor: text('ideal_for'),
  duration: text('duration'),
})

// ============================================
// Tabla: Consejos (tips) - almacenados como JSON o filas separadas
// ============================================

export const tips = sqliteTable('tips', {
  id: text('id').primaryKey(),
  resultId: text('result_id').notNull(),
  content: text('content').notNull(),
  order: integer('order').notNull().default(0),
})

// ============================================
// Tabla: Fuentes consultadas
// ============================================

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  resultId: text('result_id').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  // Tipos: official, blog, guide, review, other
  type: text('type').notNull(),
  reliability: real('reliability').notNull(),
  accessedAt: integer('accessed_at', { mode: 'timestamp' }).notNull(),
})

// ============================================
// Tabla: Borradores Editoriales
// ============================================

export const editorialDrafts = sqliteTable('editorial_drafts', {
  id: text('id').primaryKey(),
  resultId: text('result_id').notNull(),
  title: text('title').notNull(),
  introduction: text('introduction').notNull(),
  // Tono: friendly, informative, enthusiastic, relaxed
  tone: text('tone').notNull(),
  language: text('language').notNull(),
  // Estados: generating, ready, in_review, approved, rejected
  status: text('status').notNull().default('generating'),
  wordCount: integer('word_count').notNull(),
  generatedAt: integer('generated_at', { mode: 'timestamp' }).notNull(),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  reviewNotes: text('review_notes'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
})

// ============================================
// Tabla: Secciones del borrador
// ============================================

export const draftSections = sqliteTable('draft_sections', {
  id: text('id').primaryKey(),
  draftId: text('draft_id').notNull(),
  heading: text('heading').notNull(),
  content: text('content').notNull(),
  order: integer('order').notNull(),
})