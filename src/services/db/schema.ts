/**
 * Investighost - Esquemas de Base de Datos (MVP + Arquitectura Extendida)
 * 
 * Propósito: Esquemas SQLite con Drizzle para el flujo completo
 * Alcance: Investigación → Producción → Cola Editorial → Publicación + Auditoría
 * Estado: Actualizado con soporte para cola editorial y auditoría multi-proveedor
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

// ============================================
// NUEVAS TABLAS: Cola Editorial y Auditoría
// ============================================

// ============================================
// Tabla: Cola Editorial (Publishing Queue)
// ============================================

export const publishingQueue = sqliteTable('publishing_queue', {
  id: text('id').primaryKey(),
  draftId: text('draft_id').notNull(),
  resultId: text('result_id').notNull(),
  
  // Contenido para publicación
  title: text('title').notNull(),
  destinationCountry: text('destination_country').notNull(),
  destinationRegion: text('destination_region').notNull(),
  
  // Estado en la cola: queued, scheduled, publishing, published, failed, paused, archived
  status: text('status').notNull().default('queued'),
  
  // Prioridad y orden
  priority: integer('priority').notNull().default(5),
  queuePosition: integer('queue_position').notNull().default(0),
  
  // Fechas
  addedToQueueAt: integer('added_to_queue_at', { mode: 'timestamp' }).notNull(),
  scheduledPublishAt: integer('scheduled_publish_at', { mode: 'timestamp' }),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  publishedBy: text('published_by'),
  
  // Target y opciones
  targetPlatform: text('target_platform').notNull().default('trawel'),
  publishOptionsJson: text('publish_options_json'), // JSON con category, tags, featured
  
  // Notas editoriales
  editorialNotes: text('editorial_notes'),
})

// ============================================
// Tabla: Configuración de Ritmo de Publicación
// ============================================

export const publishingRateConfigs = sqliteTable('publishing_rate_configs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  
  // Límites
  maxDailyPosts: integer('max_daily_posts').notNull(),
  
  // Ventana horaria
  preferredHoursStart: integer('preferred_hours_start'),
  preferredHoursEnd: integer('preferred_hours_end'),
  
  // Días permitidos (almacenados como string separado por comas)
  allowedDays: text('allowed_days').notNull(), // ej: "mon,tue,wed,thu,fri"
  
  // Intervalo mínimo
  minIntervalMinutes: integer('min_interval_minutes'),
  
  // Estado
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ============================================
// Tabla: Auditoría de Uso de Proveedores
// ============================================

export const providerUsageLogs = sqliteTable('provider_usage_logs', {
  id: text('id').primaryKey(),
  operationId: text('operation_id').notNull(),
  
  // Tipo de operación: research, draft_generation, text_improvement, search
  operationType: text('operation_type').notNull(),
  
  // Estrategia usada: auto, openai, kimi, fallback, compare
  strategy: text('strategy').notNull(),
  
  // Proveedor de búsqueda (si aplica)
    searchProvider: text('search_provider'), // mock, serpapi, searchapi, brave, tavily
  searchModel: text('search_model'),
  searchCostEstimated: real('search_cost_estimated'),
  
  // Proveedor de IA/redacción (si aplica)
  aiProvider: text('ai_provider'), // openai, kimi, local
  aiModel: text('ai_model'),
  aiCostEstimated: real('ai_cost_estimated'),
  
  // Tokens consumidos
  tokensInput: integer('tokens_input'),
  tokensOutput: integer('tokens_output'),
  tokensTotal: integer('tokens_total'),
  
  // Timestamp
  usedAt: integer('used_at', { mode: 'timestamp' }).notNull(),
  
  // Evaluación de calidad
  qualityNotes: text('quality_notes'),
  qualityRating: integer('quality_rating'), // 1-5
  wasUseful: integer('was_useful', { mode: 'boolean' }),
})

// ============================================
// Tabla: Entidad ContentPiece (Producción vs Publicación)
// ============================================

export const contentPieces = sqliteTable('content_pieces', {
  id: text('id').primaryKey(),
  
  // Identificación del destino
  destinationCountry: text('destination_country').notNull(),
  destinationRegion: text('destination_region').notNull(),
  
  // Referencias a entidades relacionadas
  requestId: text('request_id').notNull(),
  resultId: text('result_id').notNull(),
  draftId: text('draft_id').notNull(),
  queueItemId: text('queue_item_id'),
  
  // Estados separados
  productionStatus: text('production_status').notNull().default('pending'),
  publishingStatus: text('publishing_status').notNull().default('not_published'),
  
  // Control de versiones
  version: integer('version').notNull().default(1),
  previousVersionId: text('previous_version_id'),
  
  // Fechas clave
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  approvedAt: integer('approved_at', { mode: 'timestamp' }),
  queuedAt: integer('queued_at', { mode: 'timestamp' }),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
})

// FASE 2B: importación local verificada de contribuciones, sin SQL remoto.
export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  foundCount: integer('found_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

export const contributionImportJobs = sqliteTable('contribution_import_jobs', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').notNull().references(() => importBatches.id),
  remoteId: text('remote_id').notNull().unique(),
  sourceType: text('source_type').notNull(),
  remoteCreatedAt: integer('remote_created_at', { mode: 'timestamp' }),
  localCreatedAt: integer('local_created_at', { mode: 'timestamp' }).notNull(),
  status: text('status').notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastError: text('last_error'),
  nextRetryAt: integer('next_retry_at', { mode: 'timestamp' }),
  remoteChecksum: text('remote_checksum'),
  localChecksum: text('local_checksum'),
  remotePayloadSize: integer('remote_payload_size'),
  localPayloadSize: integer('local_payload_size'),
  downloadedAt: integer('downloaded_at', { mode: 'timestamp' }),
  verifiedAt: integer('verified_at', { mode: 'timestamp' }),
  deletedRemoteAt: integer('deleted_remote_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const importedContributions = sqliteTable('imported_contributions', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => contributionImportJobs.id),
  remoteId: text('remote_id').notNull().unique(),
  sourceType: text('source_type').notNull(),
  payloadJson: text('payload_json').notNull(),
  payloadSha256: text('payload_sha256').notNull(),
  payloadSize: integer('payload_size').notNull(),
  version: integer('version').notNull(),
  importedAt: integer('imported_at', { mode: 'timestamp' }).notNull(),
})

export const contributionFiles = sqliteTable('contribution_files', {
  id: text('id').primaryKey(),
  contributionId: text('contribution_id').notNull().references(() => importedContributions.id),
  remoteFileId: text('remote_file_id').notNull(),
  safeLocalName: text('safe_local_name').notNull(),
  relativePath: text('relative_path').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
  verifiedAt: integer('verified_at', { mode: 'timestamp' }).notNull(),
})

export const importAttempts = sqliteTable('import_attempts', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => contributionImportJobs.id),
  operation: text('operation').notNull(),
  outcome: text('outcome').notNull(),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  attemptedAt: integer('attempted_at', { mode: 'timestamp' }).notNull(),
})

export const importConflicts = sqliteTable('import_conflicts', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => contributionImportJobs.id),
  kind: text('kind').notNull(),
  expectedValue: text('expected_value'),
  actualValue: text('actual_value'),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const localBackupRecords = sqliteTable('local_backup_records', {
  id: text('id').primaryKey(),
  path: text('path').notNull(),
  databaseSha256: text('database_sha256'),
  fileCount: integer('file_count').notNull(),
  status: text('status').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  verifiedAt: integer('verified_at', { mode: 'timestamp' }),
})
