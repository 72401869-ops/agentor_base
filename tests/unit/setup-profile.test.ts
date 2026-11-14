/**
 * Criação do profile DSH (scripts/setup-profile.mjs) num DSH_HOME temporário.
 *
 * Garante que os links do profile apontam para os pacotes do repositório em
 * qualquer sistema (junction no Windows, link simbólico relativo nos demais)
 * e que rodar o setup de novo recria os links sem apagar o código dos pacotes.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const script = join(repoRoot, 'scripts', 'setup-profile.mjs')

const expected: Record<string, string> = {
  'bundle-kernel': join('packages', 'bundles', 'kernel'),
  'bundle-training': join('packages', 'bundles', 'training'),
  'knowledge': join('packages', 'knowledge', 'knowledge'),
  'knowledge-fs': join('packages', 'knowledge', 'knowledge-fs'),
  'tool-knowledge': join('packages', 'knowledge', 'tool-knowledge'),
  'llm-offline': join('packages', 'llm', 'llm-offline'),
}

describe('setup do profile agentor', () => {
  let home: string

  before(async () => {
    home = await mkdtemp(join(tmpdir(), 'agentor-profile-'))
  })

  after(async () => {
    await rm(home, { recursive: true, force: true })
  })

  function setup(): void {
    const run = spawnSync(process.execPath, [script], { env: { ...process.env, DSH_HOME: home }, encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
  }

  const profileDir = () => join(home, 'profiles', 'agentor')

  it('cria o manifesto, a camada vazia do usuário e um link por pacote', async () => {
    setup()
    const manifest = JSON.parse(await readFile(join(profileDir(), 'package.json'), 'utf8')) as { dsh: { profile: { bundles: string[] } } }
    assert.deepEqual(manifest.dsh.profile.bundles, ['@agentor/bundle-kernel', '@agentor/bundle-training'])
    assert.equal(await readFile(join(profileDir(), 'cordis.patch.yml'), 'utf8'), '[]\n')
    const scope = join(profileDir(), 'node_modules', '@agentor')
    assert.deepEqual((await readdir(scope)).sort(), Object.keys(expected).sort())
    for (const [name, dir] of Object.entries(expected)) {
      assert.equal(await realpath(join(scope, name)), await realpath(join(repoRoot, dir)), `link de @agentor/${name}`)
    }
  })

  it('pode rodar de novo sem apagar o código dos pacotes', async () => {
    setup()
    setup()
    for (const [name, dir] of Object.entries(expected)) {
      assert.ok(existsSync(join(repoRoot, dir, 'package.json')), `package.json de @agentor/${name} sumiu`)
      assert.ok(existsSync(join(profileDir(), 'node_modules', '@agentor', name, 'package.json')), `link de @agentor/${name} quebrado`)
    }
  })
})
