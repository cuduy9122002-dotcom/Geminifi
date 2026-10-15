import { GoogleGenAI } from '@google/genai'
import { buildResponseJsonSchema, ExtractionSchema, type Extraction } from './schema'
import { buildSystemInstruction, buildUserText, type PromptContext } from './prompt'

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite'

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

/** Google's docs show both spellings across pages; accept either. */
function readOutputText(interaction: unknown): string {
  const i = interaction as { output_text?: string; outputText?: string }
  return i.output_text ?? i.outputText ?? ''
}

export interface ExtractInput {
  text: string | null
  image: { base64: string; mimeType: string } | null
  context: PromptContext
}

export async function extractTransactions({ text, image, context }: ExtractInput): Promise<Extraction> {
  const userText = buildUserText(text, image !== null)

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
    system_instruction: buildSystemInstruction(context),
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: buildResponseJsonSchema(context.categories.map((c) => c.name)),
    },
    store: false,
    ...(thinking ? { generation_config: { thinking_level: thinking } } : {}),
  })

  const raw = readOutputText(interaction)
  if (!raw) throw new Error('Gemini returned an empty response')

  // Structured output guarantees valid JSON, not valid *values*, so always validate.
  const parsed = ExtractionSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    throw new Error(`Gemini output failed validation: ${parsed.error.message}`)
  }
  return parsed.data
}