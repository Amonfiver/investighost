import { z } from 'zod'

const LocalSupabaseEnvironmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
}).superRefine((value, context) => {
  const url = new URL(value.SUPABASE_URL)
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['SUPABASE_URL'], message: 'Supabase debe ser local (localhost/127.0.0.1)' })
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['SUPABASE_URL'], message: 'Protocolo de Supabase no permitido' })
  }
})

export interface LocalSupabaseConfig {
  url: string
  serviceRoleKey: string
}

export function parseLocalSupabaseConfig(environment: NodeJS.ProcessEnv): LocalSupabaseConfig {
  const result = LocalSupabaseEnvironmentSchema.safeParse(environment)
  if (!result.success) {
    throw new Error(`SUPABASE_LOCAL_CONFIG_INVALID: ${result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  }
  return { url: result.data.SUPABASE_URL.replace(/\/$/, ''), serviceRoleKey: result.data.SUPABASE_SERVICE_ROLE_KEY }
}

