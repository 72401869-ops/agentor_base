import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as nativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import KnowledgeRegistry from '@agentor/knowledge'
import * as knowledgeFs from '@agentor/knowledge-fs'
import * as toolKnowledge from '@agentor/tool-knowledge'

describe('tool knowledge_search no pipeline real de tools do DSH', () => {
  let root: string
  let ctx: Context

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'agentor-tool-'))
    await writeFile(join(root, 'acessos.md'), '# Acessos\n\n## VPN\nA VPN é liberada pelo suporte após o primeiro login.\n')
    ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(nativeToolExecutor)
    await ctx.plugin(KnowledgeRegistry)
    await ctx.plugin(knowledgeFs, { id: 'cliente', description: 'docs', root, extensions: ['.md'], maxExcerptChars: 400 })
    await ctx.plugin(toolKnowledge, { maxResults: 3 })
  })

  after(async () => {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })

  async function call(query: string): Promise<string> {
    const result = await ctx.tools.execute({
      calls: [{ type: 'tool-call', id: ToolCallId('teste-1'), name: toolKnowledge.TOOL_NAME, arguments: JSON.stringify({ query }) }],
      signal: new AbortController().signal,
    })
    return result.results[0]!.result.content.map(block => (block.type === 'text' ? block.text : '')).join('')
  }

  it('devolve o trecho com a origem citada', async () => {
    const text = await call('como acessar a VPN')
    assert.match(text, /\[1\] Acessos \(fonte: cliente, documento: acessos\.md\)/)
    assert.match(text, /liberada pelo suporte/)
  })

  it('avisa quando nada é encontrado', async () => {
    assert.equal(await call('plano de saúde odontológico'), 'Nenhum trecho encontrado na base de conhecimento do cliente.')
  })
})
