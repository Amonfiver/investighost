export interface OpenAIResponseRequest {
  model: string
  input: Array<{
    role: 'system' | 'user'
    content: string
  }>
  text: {
    format: {
      type: 'json_schema'
      name: string
      strict: true
      schema: Record<string, unknown>
    }
  }
  max_output_tokens: number
  store: false
}

export interface OpenAIResponsePayloadIssue {
  path: string
  code:
    | 'invalid_request_shape'
    | 'invalid_input'
    | 'invalid_parameter'
    | 'unsupported_parameter'
    | 'unsupported_schema'
  message: string
}

export interface OpenAIResponsePayloadInspection {
  valid: boolean
  issues: OpenAIResponsePayloadIssue[]
}

const REQUEST_KEYS = new Set(['model', 'input', 'text', 'max_output_tokens', 'store'])
const INPUT_KEYS = new Set(['role', 'content'])
const TEXT_KEYS = new Set(['format'])
const FORMAT_KEYS = new Set(['type', 'name', 'strict', 'schema'])
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  'allOf',
  'not',
  'dependentRequired',
  'dependentSchemas',
  'if',
  'then',
  'else',
  'patternProperties',
])

export function inspectOpenAIResponseRequest(
  candidate: unknown,
): OpenAIResponsePayloadInspection {
  const issues: OpenAIResponsePayloadIssue[] = []
  if (!isRecord(candidate)) {
    issue(issues, '$', 'invalid_request_shape', 'La petición debe ser un objeto')
    return { valid: false, issues }
  }
  rejectUnknownKeys(candidate, REQUEST_KEYS, '$', issues)

  if (typeof candidate.model !== 'string' || !candidate.model.trim()) {
    issue(issues, '$.model', 'invalid_parameter', 'El identificador API del modelo es obligatorio')
  }

  if (!Array.isArray(candidate.input) || candidate.input.length === 0) {
    issue(issues, '$.input', 'invalid_input', 'Responses requiere al menos un mensaje de entrada')
  } else {
    candidate.input.forEach((message, index) => {
      const path = `$.input[${index}]`
      if (!isRecord(message)) {
        issue(issues, path, 'invalid_input', 'Cada entrada debe ser un mensaje')
        return
      }
      rejectUnknownKeys(message, INPUT_KEYS, path, issues)
      if (message.role !== 'system' && message.role !== 'user') {
        issue(issues, `${path}.role`, 'invalid_input', 'El rol debe ser system o user')
      }
      if (typeof message.content !== 'string' || !message.content.trim()) {
        issue(issues, `${path}.content`, 'invalid_input', 'El contenido debe ser texto no vacío')
      }
    })
  }

  if (!isRecord(candidate.text)) {
    issue(issues, '$.text', 'invalid_parameter', 'Falta la configuración de salida estructurada')
  } else {
    rejectUnknownKeys(candidate.text, TEXT_KEYS, '$.text', issues)
    const format = candidate.text.format
    if (!isRecord(format)) {
      issue(issues, '$.text.format', 'invalid_parameter', 'El formato debe ser un objeto')
    } else {
      rejectUnknownKeys(format, FORMAT_KEYS, '$.text.format', issues)
      if (format.type !== 'json_schema') {
        issue(issues, '$.text.format.type', 'invalid_parameter', 'El formato debe ser json_schema')
      }
      if (
        typeof format.name !== 'string'
        || !/^[A-Za-z0-9_-]{1,64}$/.test(format.name)
      ) {
        issue(issues, '$.text.format.name', 'invalid_parameter', 'El nombre del esquema no es válido')
      }
      if (format.strict !== true) {
        issue(issues, '$.text.format.strict', 'invalid_parameter', 'Structured Outputs debe ser estricto')
      }
      inspectStructuredOutputSchema(format.schema, issues)
    }
  }

  if (
    !Number.isInteger(candidate.max_output_tokens)
    || Number(candidate.max_output_tokens) < 1
    || Number(candidate.max_output_tokens) > 50_000
  ) {
    issue(
      issues,
      '$.max_output_tokens',
      'invalid_parameter',
      'max_output_tokens debe ser un entero entre 1 y 50000',
    )
  }
  if (candidate.store !== false) {
    issue(issues, '$.store', 'invalid_parameter', 'El piloto no permite almacenar la respuesta en el proveedor')
  }
  return { valid: issues.length === 0, issues }
}

function inspectStructuredOutputSchema(
  candidate: unknown,
  issues: OpenAIResponsePayloadIssue[],
): void {
  if (!isRecord(candidate)) {
    issue(issues, '$.text.format.schema', 'unsupported_schema', 'El esquema JSON debe ser un objeto')
    return
  }
  if (candidate.type !== 'object' || 'anyOf' in candidate) {
    issue(
      issues,
      '$.text.format.schema',
      'unsupported_schema',
      'La raíz de Structured Outputs debe ser un objeto y no puede ser anyOf',
    )
  }
  const metrics = { properties: 0, maxDepth: 0 }
  inspectSchemaNode(candidate, '$.text.format.schema', 1, metrics, issues)
  if (metrics.properties > 5_000) {
    issue(
      issues,
      '$.text.format.schema',
      'unsupported_schema',
      'El esquema supera el máximo de 5000 propiedades',
    )
  }
  if (metrics.maxDepth > 10) {
    issue(
      issues,
      '$.text.format.schema',
      'unsupported_schema',
      'El esquema supera diez niveles de objetos',
    )
  }
}

function inspectSchemaNode(
  node: unknown,
  path: string,
  objectDepth: number,
  metrics: { properties: number; maxDepth: number },
  issues: OpenAIResponsePayloadIssue[],
): void {
  if (Array.isArray(node)) {
    node.forEach((value, index) =>
      inspectSchemaNode(value, `${path}[${index}]`, objectDepth, metrics, issues))
    return
  }
  if (!isRecord(node)) return

  for (const keyword of UNSUPPORTED_SCHEMA_KEYWORDS) {
    if (keyword in node) {
      issue(
        issues,
        `${path}.${keyword}`,
        'unsupported_schema',
        `Structured Outputs no admite ${keyword}`,
      )
    }
  }

  if (node.type === 'object') {
    metrics.maxDepth = Math.max(metrics.maxDepth, objectDepth)
    if (node.additionalProperties !== false) {
      issue(
        issues,
        `${path}.additionalProperties`,
        'unsupported_schema',
        'Cada objeto debe declarar additionalProperties: false',
      )
    }
    if (!isRecord(node.properties)) {
      issue(
        issues,
        `${path}.properties`,
        'unsupported_schema',
        'Cada objeto debe declarar sus propiedades de forma cerrada',
      )
    } else {
      const propertyNames = Object.keys(node.properties)
      metrics.properties += propertyNames.length
      const required = Array.isArray(node.required)
        ? node.required.filter((value): value is string => typeof value === 'string')
        : []
      if (
        propertyNames.length > 0
        && (
          required.length !== propertyNames.length
          || propertyNames.some(name => !required.includes(name))
        )
      ) {
        issue(
          issues,
          `${path}.required`,
          'unsupported_schema',
          'Todas las propiedades de Structured Outputs deben ser obligatorias',
        )
      }
      for (const [name, property] of Object.entries(node.properties)) {
        inspectSchemaNode(property, `${path}.properties.${name}`, objectDepth + 1, metrics, issues)
      }
    }
    if (isRecord(node.$defs)) {
      for (const [name, definition] of Object.entries(node.$defs)) {
        inspectSchemaNode(definition, `${path}.$defs.${name}`, objectDepth + 1, metrics, issues)
      }
    }
    return
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' || key === '$defs') continue
    inspectSchemaNode(value, `${path}.${key}`, objectDepth, metrics, issues)
  }
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  issues: OpenAIResponsePayloadIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issue(
        issues,
        `${path}.${key}`,
        'unsupported_parameter',
        `El parámetro ${key} no forma parte del contrato editorial de Responses`,
      )
    }
  }
}

function issue(
  issues: OpenAIResponsePayloadIssue[],
  path: string,
  code: OpenAIResponsePayloadIssue['code'],
  message: string,
): void {
  issues.push({ path, code, message })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
