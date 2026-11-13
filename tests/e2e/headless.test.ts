/**
 * Testes ponta a ponta: sobem o launcher `dsh` publicado (versão fixada) com o
 * profile agentor, num DSH_HOME temporário, sem rede e sem chave real.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const launcher = join(repoRoot, 'scripts', 'agentor.mjs')

interface Run {
  code: number | null
  stdout: string
  stderr: string
}

let home: string

function agentor(args: string[], env: Record<string, string | undefined> = {}): Promise<Run> {
  return new Promise((resolvePromise, reject) => {
    const childEnv: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: home, ...env }
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete childEnv[key]
    const child = spawn(process.execPath, [launcher, ...args], { cwd: repoRoot, env: childEnv })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    const timer = setTimeout(() => child.kill('SIGKILL'), 90_000)
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolvePromise({ code, stdout, stderr })
    })
  })
}

describe('agentor headless (e2e)', { timeout: 300_000 }, () => {
  before(async () => {
    home = await mkdtemp(join(tmpdir(), 'agentor-e2e-home-'))
  })

  after(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it('kernel por inclusão: nenhum pacote DeepSeek na árvore composta', async () => {
    const run = await agentor(['--client', 'exemplo', '--dump-config'])
    assert.equal(run.code, 0, run.stderr)
    const names = [...run.stdout.matchAll(/^\s*name: '?([^'\n]+)'?$/gm)].map(match => match[1]!)
    assert.ok(names.includes('@deepseek-ai/dsh-agent-loop'), 'o agent-loop deveria estar na árvore')
    assert.ok(names.includes('@agentor/knowledge'), 'o seam de conhecimento deveria estar na árvore')
    const deepseekSpecific = names.filter(name => /deepseek/.test(name.replace('@deepseek-ai/', '')))
    assert.deepEqual(deepseekSpecific, [], `plugins específicos da DeepSeek na árvore: ${deepseekSpecific.join(', ')}`)
    assert.ok(!names.includes('@deepseek-ai/dsh-base'))
  })

  it('responde offline usando a base de conhecimento do cliente e persiste a sessão', async () => {
    const run = await agentor(['--client', 'exemplo', '--offline', 'Como funciona o ponto eletrônico?'])
    assert.equal(run.code, 0, run.stderr)
    assert.match(run.stdout, /fonte: exemplo-manual, documento: manual-do-estagiario\.md/)
    assert.match(run.stdout, /30 horas semanais/)
    const sessions = await readdir(join(home, 'sessions'), { recursive: true })
    assert.ok(sessions.some(file => file.endsWith('.jsonl')), `nenhuma sessão gravada: ${sessions.join(', ')}`)
  })

  it('emite eventos NDJSON com --json', async () => {
    const run = await agentor(['--client', 'exemplo', '--offline', '--json', 'Qual a regra de senhas?'])
    assert.equal(run.code, 0, run.stderr)
    const events = run.stdout.trim().split('\n').map(line => JSON.parse(line) as { type?: string })
    assert.ok(events.length > 0)
    assert.match(run.stdout, /politica-de-seguranca\.md/)
  })

  it('sem a chave do cliente, falha com MISSING_CREDENTIAL antes de qualquer rede', async () => {
    const run = await agentor(['--client', 'exemplo', 'oi'], { AGENTOR_EXEMPLO_OPENAI_KEY: undefined })
    assert.equal(run.code, 1)
    assert.match(run.stderr, /MISSING_CREDENTIAL/)
    assert.match(run.stderr, /AGENTOR_EXEMPLO_OPENAI_KEY/)
  })

  it('recusa cliente inexistente com código 2', async () => {
    const run = await agentor(['--client', 'nao-existe', 'oi'])
    assert.equal(run.code, 2)
    assert.match(run.stderr, /cliente não encontrado/)
  })
})
