export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
export const ANTHROPIC_VERSION = '2023-06-01'
export const CLAUDE_HAIKU_MODEL = 'claude-haiku-4-5-20251001'

export type AnthropicContentBlock = {
  type?: string
  text?: string
  name?: string
  input?: unknown
}

export type AnthropicMessageResponse = {
  content?: AnthropicContentBlock[]
  error?: {
    message?: string
  }
}

export async function createAnthropicMessage(body: Record<string, unknown>): Promise<AnthropicMessageResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set.')
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json() as AnthropicMessageResponse
  if (!response.ok) {
    throw new Error(payload.error?.message || `Anthropic request failed with ${response.status}`)
  }

  return payload
}

export function readAnthropicToolInput(payload: AnthropicMessageResponse, toolName: string) {
  return payload.content?.find((part) => part.type === 'tool_use' && part.name === toolName)?.input
}

export function readAnthropicText(payload: AnthropicMessageResponse) {
  return payload.content?.map((part) => part.text ?? '').join('\n') ?? ''
}
