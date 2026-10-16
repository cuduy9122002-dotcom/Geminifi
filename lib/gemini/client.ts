import { GoogleGenAI, type GenerateContentConfig, type Part } from '@google/genai'
import { buildResponseJsonSchema, ExtractionSchema, type Extraction } from './schema'
import { buildSystemInstruction, buildUserText, type PromptContext } from './prompt'

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite'

/**
 * Which Gemini endpoint to use:
 *  - "generate"     (default): generateContent. Google's long-standing, stateless endpoint.
 *  - "interactions": the newer Interactions API. Set GEMINI_API=interactions to try it.
 * Both receive exactly the same prompt, schema and image; only the wrapper differs.
 */
const API_MODE: 'generate' | 'interactions' =
  process.env.GEMINI_API === 'interactions' ? 'interactions' : 'generate'

const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const
type ThinkingLevel = (typeof THINKING_LEVELS)[number]

function readThinkingLevel(): ThinkingLevel | undefined {
  return THINKING_LEVELS.find((level) => level === process.env.GEMINI_THINKING_LEVEL)
}

let client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
    client = new GoogleGenAI({ apiKey })
  }
  return client
}

function statusOf(err: unknown): number | undefined {
  const e = err as { statusCode?: number; status?: number }
  return e?.statusCode ?? e?.status
}

/** One readable line instead of a 200-line SDK error dump. */
function describeError(err: unknown): string {
  const e = err as { body?: unknown; message?: string }
  const status = statusOf(err)
  const body = typeof e?.body === 'string' ? e.body : e?.body ? JSON.stringify(e.body) : ''
  return [status ? `HTTP ${status}` : null, body || e?.message || String(err)].filter(Boolean).join(': ')
}

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504])
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** "High demand" (503) and rate limits are temporary: wait a moment and try the same request again. */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const status = statusOf(err)
      if (status === undefined || !TRANSIENT_STATUSES.has(status) || attempt >= tries) throw err
      await sleep(800 * attempt)
    }
  }
}

interface CallArgs {
  userText: string
  image: { base64: string; mimeType: string } | null
  systemInstruction: string
  schema: unknown
}

/** Models sometimes wrap JSON in ```json fences or add a sentence around it. */
function extractJsonText(raw: string): string {
  const unfenced = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  return start !== -1 && end > start ? unfenced.slice(start, end + 1) : unfenced
}

/* ---------- TEMPORARY DIAGNOSTICS (development only) ----------
 * When Google rejects our JSON schema, the request is replayed once, in the background, with modified
 * copies of the schema, and the console shows which variants Google accepts.
 * Delete this whole block, plus probeSchema() and its call below, once the schema is fixed.
 */
type Json = Record<string, unknown>

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

/** Removes object keys matching `shouldDrop`, at any depth. */
function dropKeys(node: unknown, shouldDrop: (key: string, value: unknown) => boolean): unknown {
  if (Array.isArray(node)) return node.map((n) => dropKeys(n, shouldDrop))
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Json)
        .filter(([k, v]) => !shouldDrop(k, v))
        .map(([k, v]) => [k, dropKeys(v, shouldDrop)])
    )
  }
  return node
}

const RESERVED_RENAMES: Record<string, string> = { type: 'tx_type', description: 'label' }

/** Renames properties called "type" / "description" (names that collide with schema keywords). */
function renameReservedProperties(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(renameReservedProperties)
  if (node && typeof node === 'object') {
    const out: Json = {}
    for (const [k, v] of Object.entries(node as Json)) {
      if (k === 'properties' && v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = Object.fromEntries(
          Object.entries(v as Json).map(([name, schema]) => [
            RESERVED_RENAMES[name] ?? name,
            renameReservedProperties(schema),
          ])
        )
      } else if (k === 'required' && Array.isArray(v)) {
        out[k] = v.map((name) => (typeof name === 'string' ? (RESERVED_RENAMES[name] ?? name) : name))
      } else {
        out[k] = renameReservedProperties(v)
      }
    }
    return out
  }
  return node
}

function withoutProperty(schema: Json, name: string): Json {
  const properties = { ...((schema.properties as Json) ?? {}) }
  delete properties[name]
  const required = Array.isArray(schema.required) ? schema.required.filter((r) => r !== name) : schema.required
  return { ...schema, properties, required }
}

const SCHEMA_PROBES: { label: string; make: (schema: Json) => unknown }[] = [
  { label: 'control: the real schema, unchanged', make: (s) => clone(s) },
  {
    label: 'tiny schema (one boolean)',
    make: () => ({ type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }),
  },
  {
    label: 'without "description" texts',
    make: (s) => dropKeys(clone(s), (k, v) => k === 'description' && typeof v === 'string'),
  },
  {
    label: 'without "enum" lists',
    make: (s) => dropKeys(clone(s), (k, v) => k === 'enum' && Array.isArray(v)),
  },
  { label: 'without "maxItems"', make: (s) => dropKeys(clone(s), (k) => k === 'maxItems') },
  { label: 'without the "query" object', make: (s) => withoutProperty(clone(s), 'query') },
  { label: 'without the "transactions" list', make: (s) => withoutProperty(clone(s), 'transactions') },
  {
    label: 'properties renamed: type -> tx_type, description -> label',
    make: (s) => renameReservedProperties(clone(s)),
  },
]

/* ---------- Path A: generateContent (default) ---------- */

/**
 * "Google said 400 but not which field" is hard to debug, so the request is retried in progressively
 * simpler forms, but ONLY when Google answers 400. The console tells you which form finally worked,
 * and if everything fails, the error lists every attempt.
 *   full             system instruction + JSON schema (+ thinking level, if you set one)
 *   no-thinking      the same without the thinking level
 *   schema-in-prompt JSON mode, with the schema pasted into the instruction instead of sent as a schema
 *   plain            no JSON mode at all; everything in one user message; JSON extracted from the text
 */
type Variant = 'full' | 'no-thinking' | 'schema-in-prompt' | 'plain'

async function generateOnce(variant: Variant, { userText, image, systemInstruction, schema }: CallArgs) {
  const jsonRules =
    '\n\nReturn ONLY one JSON object (no markdown, no commentary) that conforms to this JSON Schema:\n' +
    JSON.stringify(schema)

  const plain = variant === 'plain'
  const parts: Part[] = [
    { text: plain ? `${systemInstruction}${jsonRules}\n\n---\nUser input:\n${userText}` : userText },
  ]
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } })

  const thinking = readThinkingLevel()
  const config: Record<string, unknown> = {}

  if (!plain) {
    config.systemInstruction = variant === 'schema-in-prompt' ? systemInstruction + jsonRules : systemInstruction
    config.responseMimeType = 'application/json'
  }
  if (variant === 'full' || variant === 'no-thinking') config.responseJsonSchema = schema
  if (variant === 'full' && thinking) config.thinkingConfig = { thinkingLevel: thinking.toUpperCase() }

  const response = await getClient().models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts }],
    config: config as unknown as GenerateContentConfig,
  })
  return response.text ?? ''
}

/** Remembered after a fallback works, so later requests skip the forms Google already rejected. */
let preferredVariant: Variant | null = null
let probed = false

/** Dev only, once: replays the request with modified schemas to find out which part Google rejects. */
async function probeSchema(args: CallArgs) {
  if (probed || process.env.NODE_ENV === 'production') return
  probed = true

  const lines: string[] = []
  for (const { label, make } of SCHEMA_PROBES) {
    try {
      await withRetry(() =>
        generateOnce('full', { ...args, schema: make(args.schema as Record<string, unknown>) })
      )
      lines.push(`   PASS  ${label}`)
    } catch (err) {
      lines.push(`   FAIL  ${label}: ${describeError(err).slice(0, 160)}`)
    }
  }
  console.warn(`[gemini] schema probe (development only, runs once per server start):\n${lines.join('\n')}`)
}

async function viaGenerateContent(args: CallArgs): Promise<string> {
  const all: Variant[] = readThinkingLevel()
    ? ['full', 'no-thinking', 'schema-in-prompt', 'plain']
    : ['full', 'schema-in-prompt', 'plain']
  const ladder = preferredVariant && all.includes(preferredVariant) ? all.slice(all.indexOf(preferredVariant)) : all

  const failures: string[] = []

  for (const variant of ladder) {
    try {
      const raw = await withRetry(() => generateOnce(variant, args))

      if (failures.length > 0) {
        preferredVariant = variant
        console.warn(
          `[gemini] Google rejected the more complete request(s) but accepted "${variant}".\n` +
            failures.map((f) => `   - ${f}`).join('\n')
        )
        void probeSchema(args) // background, dev only
      }
      return variant === 'plain' ? extractJsonText(raw) : raw
    } catch (err) {
      failures.push(`${variant}: ${describeError(err)}`)
      if (statusOf(err) !== 400) break // 401/403/404/429/5xx won't be fixed by simplifying the request
    }
  }

  throw new Error(failures.join(' | '))
}

/* ---------- Path B: Interactions API (opt-in) ---------- */

/** Google's docs show both spellings across pages; accept either. */
function readOutputText(interaction: unknown): string {
  const i = interaction as { output_text?: string; outputText?: string }
  return i.output_text ?? i.outputText ?? ''
}

async function viaInteractions({ userText, image, systemInstruction, schema }: CallArgs): Promise<string> {
  const input = image
    ? [
        { type: 'text' as const, text: userText },
        { type: 'image' as const, data: image.base64, mime_type: image.mimeType },
      ]
    : userText

  const thinking = readThinkingLevel()

  const interaction = await getClient().interactions.create({
    model: GEMINI_MODEL,
    input,
    system_instruction: systemInstruction,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: schema as Record<string, unknown>,
    },
    store: false, // don't keep this interaction on Google's servers
    ...(thinking ? { generation_config: { thinking_level: thinking } } : {}),
  })

  return readOutputText(interaction)
}

/* ---------- Public API ---------- */

export interface ExtractInput {
  text: string | null
  image: { base64: string; mimeType: string } | null
  context: PromptContext
}

export async function extractTransactions({ text, image, context }: ExtractInput): Promise<Extraction> {
  const args: CallArgs = {
    userText: buildUserText(text, image !== null),
    image,
    systemInstruction: buildSystemInstruction(context),
    schema: buildResponseJsonSchema(context.categories.map((c) => c.name)),
  }

  let raw: string
  try {
    raw = API_MODE === 'interactions' ? await viaInteractions(args) : await viaGenerateContent(args)
  } catch (err) {
    const detail = API_MODE === 'interactions' ? describeError(err) : (err as Error).message
    throw new Error(`Gemini request failed (${API_MODE}, ${GEMINI_MODEL}). ${detail}`)
  }

  if (!raw) throw new Error(`Gemini returned an empty response (${API_MODE}, ${GEMINI_MODEL})`)

  // Structured output guarantees valid JSON, not valid *values*, so always validate.
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error(`Gemini did not return valid JSON: ${raw.slice(0, 200)}`)
  }

  const parsed = ExtractionSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error(`Gemini output failed validation: ${parsed.error.message}`)
  }
  return parsed.data
}