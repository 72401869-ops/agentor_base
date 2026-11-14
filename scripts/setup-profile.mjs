#!/usr/bin/env node
/**
 * Cria (ou recria) o profile DSH "agentor" dentro do Harness home.
 *
 * O profile é só um manifesto: lista os bundles na ordem em que são aplicados
 * (kernel → training) e aponta, via links simbólicos em node_modules, para os
 * pacotes deste repositório. Nada é copiado; editar o código do repositório
 * tem efeito na próxima execução.
 *
 * Uso: node scripts/setup-profile.mjs
 * Variáveis: DSH_HOME (padrão: <repo>/.dsh-home)
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROFILE = 'agentor'
export const BUNDLES = ['@agentor/bundle-kernel', '@agentor/bundle-training']

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const dshHome = () => resolve(process.env.DSH_HOME ?? join(repoRoot, '.dsh-home'))

/** Todos os pacotes @agentor/* do workspace: nome → diretório. */
async function workspacePackages() {
  const found = new Map()
  const packagesDir = join(repoRoot, 'packages')
  for (const group of await readdir(packagesDir, { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    for (const pkg of await readdir(join(packagesDir, group.name), { withFileTypes: true })) {
      const manifest = join(packagesDir, group.name, pkg.name, 'package.json')
      if (!pkg.isDirectory() || !existsSync(manifest)) continue
      const { name } = JSON.parse(await readFile(manifest, 'utf8'))
      if (name?.startsWith('@agentor/')) found.set(name, dirname(manifest))
    }
  }
  return found
}

/**
 * Cria um link de diretório. No Windows, um link simbólico exige privilégio
 * (Modo de Desenvolvedor ou administrador) e falha com EPERM; uma junction
 * não exige, mas só aceita alvo absoluto. Nos demais sistemas o link é
 * relativo, para o profile continuar válido se o repositório mudar de lugar.
 */
async function linkDir(target, link) {
  if (process.platform === 'win32') await symlink(target, link, 'junction')
  else await symlink(relative(dirname(link), target), link, 'dir')
}

export async function setupProfile({ quiet = false } = {}) {
  const home = dshHome()
  const profileDir = join(home, 'profiles', PROFILE)
  const packages = await workspacePackages()
  for (const bundle of BUNDLES) {
    if (!packages.has(bundle)) throw new Error(`bundle ${bundle} não encontrado em packages/`)
  }

  await mkdir(profileDir, { recursive: true })

  const manifest = {
    name: `dsh-profile-${PROFILE}`,
    private: true,
    description: 'Profile gerado por scripts/setup-profile.mjs — não edite à mão',
    dependencies: Object.fromEntries(
      [...packages].sort(([a], [b]) => a.localeCompare(b)).map(([name, dir]) => [name, `link:${dir}`]),
    ),
    dsh: { profile: { bundles: BUNDLES } },
  }
  await writeFile(join(profileDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  // Camada do usuário do profile: vazia por padrão. Um arquivo só com
  // comentários falha o boot, por isso a lista vazia explícita.
  const userPatch = join(profileDir, 'cordis.patch.yml')
  if (!existsSync(userPatch)) await writeFile(userPatch, '[]\n')

  // node_modules do profile: links para os pacotes do repositório. O rm
  // remove só os links, nunca o conteúdo para o qual eles apontam.
  const scopeDir = join(profileDir, 'node_modules', '@agentor')
  await rm(scopeDir, { recursive: true, force: true })
  await mkdir(scopeDir, { recursive: true })
  for (const [name, dir] of packages) {
    const link = join(profileDir, 'node_modules', name)
    await linkDir(dir, link)
  }

  if (!quiet) {
    console.log(`profile "${PROFILE}" pronto em ${profileDir}`)
    console.log(`bundles: ${BUNDLES.join(' → ')}`)
    console.log(`pacotes linkados: ${[...packages.keys()].join(', ')}`)
  }
  return profileDir
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  setupProfile().catch((error) => {
    console.error(`setup falhou: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
