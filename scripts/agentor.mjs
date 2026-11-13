#!/usr/bin/env node
/**
 * Lançador do Agentor: monta a linha de comando do `dsh` para um cliente.
 *
 *   node scripts/agentor.mjs --client <cliente> [--offline] [--dump-config] [args do headless...]
 *
 * Equivale a:
 *   DSH_HOME=<repo>/.dsh-home AGENTOR_CLIENT_DIR=config/clients/<cliente> \
 *     dsh --profile agentor --patch config/clients/<cliente>/cordis.patch.yml \
 *         [--patch config/offline.patch.yml] [args...]
 *
 * --offline troca o LLM pelo adaptador determinístico (sem chave, sem rede).
 * Tudo depois das opções do lançador vai para o app headless do DSH
 * (ex.: a pergunta, --json, --session-id).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { PROFILE, dshHome, repoRoot, setupProfile } from './setup-profile.mjs'

function usage(message) {
  if (message) console.error(`erro: ${message}\n`)
  console.error('uso: node scripts/agentor.mjs --client <cliente> [--offline] [--dump-config] [pergunta | opções do headless]')
  console.error(`clientes ficam em ${join('config', 'clients')}/<cliente>/cordis.patch.yml`)
  process.exit(2)
}

const args = process.argv.slice(2)
let client = process.env.AGENTOR_CLIENT
let offline = false
const launcherFlags = []
const rest = []
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (rest.length > 0) rest.push(arg)
  else if (arg === '--client') client = args[++i]
  else if (arg.startsWith('--client=')) client = arg.slice('--client='.length)
  else if (arg === '--offline') offline = true
  else if (arg === '--dump-config') launcherFlags.push(arg)
  else if (arg === '-h' || arg === '--help') usage()
  else rest.push(arg)
}

if (!client) usage('informe o cliente com --client (ou AGENTOR_CLIENT)')
if (!/^[a-z0-9][a-z0-9-]*$/.test(client)) usage(`nome de cliente inválido: ${client}`)
const clientDir = join(repoRoot, 'config', 'clients', client)
const clientPatch = join(clientDir, 'cordis.patch.yml')
if (!existsSync(clientPatch)) usage(`cliente não encontrado: ${clientPatch}`)

const home = dshHome()
await setupProfile({ quiet: true })

const require = createRequire(import.meta.url)
const dshBin = join(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib', 'bin.js')

const dshArgs = ['--profile', PROFILE, '--patch', clientPatch]
if (offline) dshArgs.push('--patch', join(repoRoot, 'config', 'offline.patch.yml'))
dshArgs.push(...launcherFlags, ...rest)

const child = spawn(process.execPath, [dshBin, ...dshArgs], {
  stdio: 'inherit',
  env: { ...process.env, DSH_HOME: home, AGENTOR_CLIENT: client, AGENTOR_CLIENT_DIR: clientDir },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0)
})
