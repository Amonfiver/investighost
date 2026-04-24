/**
 * Investighost - Esquemas de Base de Datos (Drizzle ORM)
 * 
 * Propósito: Definición de tablas SQLite con Drizzle
 * Alcance: Modelo de datos completo preparado
 * Estado: Esquemas definidos, sin migraciones ejecutadas aún
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// ============================================
// Tabla: Investigaciones
// ============================================

export const researches = sqliteTable('researches', {
  id: text('id').primaryKey(),
  country: text('country').notNull(),
  city: text('city').notNull(),
  zone: text('zone'),
  travelerProfile: text('traveler_profile'),
  tripDurationDays: integer('trip_duration_days'),
  researchMode: text('research_mode').notNull().default('general'),
  status: text('status').notNull().default('pending'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

// ============================================
// Tabla: Datos Estructurados (Resultados)
// ============================================

export const structuredData = sqliteTable('structured_data', {
  id: text('id').primaryKey(),
  researchId: text('research_id').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  type: text('type').notNull(),
  factualSummary: text('factual_summary').notNull(),
  whyWorthIt: text('why_worth_it').notNull(),
  idealTravelerProfile: text('ideal_traveler_profile'),
  recommendedTime: text('recommended_time'),
  budgetEstimate: text('budget_estimate'),
  reviewStatus: text('review_status').notNull().default('pending'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ============================================
// Tabla: Señales (Signals)
// ============================================

export const signals = sqliteTable('signals', {
  id: text('id').primaryKey(),
  structuredDataId: text('structured_data_id').notNull(),
  type: text('type').notNull(),
  source: text('source').notNull(),
  content: text('content').notNull(),
  relevance: real('relevance').notNull(),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ============================================
// Tabla: Fuentes (Sources)
// ============================================

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  structuredDataId: text('structured_data_id').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  type: text('type').notNull(),
  trustScore: real('trust_score').notNull(),
  accessedAt: integer('accessed_at', { mode: 'timestamp' }).notNull(),
})

// ============================================
// Tabla: Borradores Editoriales
// ============================================

export const editorialDrafts = sqliteTable('editorial_drafts', {
  id: text('id').primaryKey(),
  structuredDataId: text('structured_data_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tone: text('tone').notNull(),
  targetAudience: text('target_audience'),
  wordCount: integer('word_count').notNull(),
  generatedAt: integer('generated_at', { mode: 'timestamp' }).notNull(),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  reviewNotes: text('review_notes'),
  published: integer('published', { mode: 'boolean' }).notNull().default(false),
})