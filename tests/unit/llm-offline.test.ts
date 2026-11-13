import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { GenerateOptions, RequestMessage, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ANSWER_PREFIX, OfflineAdapter } from '@agentor/llm-offline'

async function collect(messages: unknown[]): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  const adapter = new OfflineAdapter('knowledge_search')
  for await (const chunk of adapter.stream({ messages: messages as RequestMessage[] } as GenerateOptions)) chunks.push(chunk)
  return chunks
}

describe('llm-offline', () => {
  it('primeiro passo: chama knowledge_search com a pergunta do usuário', async () => {
    const chunks = await collect([{ role: 'user', content: [{ type: 'text', text: 'Onde pego o crachá?' }] }])
    const end = chunks.find(chunk => chunk.type === 'block-end')
    assert.ok(end?.type === 'block-end' && end.block.type === 'tool-call')
    assert.equal(end.block.name, 'knowledge_search')
    assert.deepEqual(JSON.parse(end.block.arguments), { query: 'Onde pego o crachá?' })
    assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'tool-calls' } })
  })

  it('segundo passo: responde com o resultado da tool', async () => {
    const chunks = await collect([
      { role: 'user', content: [{ type: 'text', text: 'Onde pego o crachá?' }] },
      { role: 'tool', content: [{ type: 'text', text: 'Na recepção.' }] },
    ])
    const end = chunks.find(chunk => chunk.type === 'block-end')
    assert.ok(end?.type === 'block-end' && end.block.type === 'text')
    assert.equal(end.block.text, `${ANSWER_PREFIX}\nNa recepção.`)
    assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
  })
})
