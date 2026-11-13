import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { chunksOf, createFsSource, normalize, scoreChunk, terms } from '@agentor/knowledge-fs'

describe('knowledge-fs: funções puras', () => {
  it('normaliza acentos e caixa', () => {
    assert.equal(normalize('Eletrônico AÇÃO'), 'eletronico acao')
  })

  it('extrai termos significativos sem stopwords nem duplicatas', () => {
    assert.deepEqual(terms('Como funciona o ponto eletrônico do ponto?'), ['ponto', 'eletronico'])
  })

  it('pontua pela cobertura dos termos e desempata por repetição', () => {
    const q = ['ponto', 'eletronico']
    assert.equal(scoreChunk('nada relacionado', q), 0)
    assert.ok(scoreChunk('ponto', q) < scoreChunk('ponto eletrônico', q))
    assert.ok(scoreChunk('ponto eletrônico', q) < scoreChunk('ponto eletrônico, ajuste de ponto', q))
    assert.ok(scoreChunk('ponto ponto ponto ponto eletrônico eletrônico', q) <= 1)
  })

  it('divide Markdown por seções e texto simples por parágrafos', () => {
    assert.deepEqual(chunksOf('# A\ntexto a\n\n## B\ntexto b'), ['# A\ntexto a', '## B\ntexto b'])
    assert.deepEqual(chunksOf('um\n\ndois'), ['um', 'dois'])
  })

  it('junta seções que só têm título à seção seguinte', () => {
    assert.deepEqual(chunksOf('# Férias\n\n## Pedido\ntexto'), ['# Férias\n\n## Pedido\ntexto'])
    assert.deepEqual(chunksOf('# Só título'), ['# Só título'])
  })
})

describe('knowledge-fs: fonte em pasta', () => {
  let root: string

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'agentor-kfs-'))
    await mkdir(join(root, 'sub'))
    await writeFile(join(root, 'ferias.md'), '# Férias\n\n## Pedido\nO pedido de férias é feito no portal com 30 dias de antecedência.\n')
    await writeFile(join(root, 'sub', 'ponto.txt'), 'Registro de ponto\n\nO ponto é batido no aplicativo.')
    await writeFile(join(root, 'ignorado.pdf'), 'férias férias férias')
  })

  after(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const source = () => createFsSource({ id: 'teste', description: 'pasta de teste', root, extensions: ['.md', '.txt'], maxExcerptChars: 60 })

  it('encontra a seção relevante, com título e origem', async () => {
    const hits = await source().search({ text: 'Como pedir férias?', limit: 5 })
    assert.equal(hits.length, 1)
    const [hit] = hits
    assert.equal(hit!.sourceId, 'teste')
    assert.equal(hit!.documentId, 'ferias.md')
    assert.equal(hit!.title, 'Férias')
    assert.match(hit!.excerpt, /^# Férias ## Pedido O pedido de férias/)
    assert.ok(hit!.excerpt.length <= 60)
  })

  it('lê subpastas, ignora extensões fora da lista e respeita o limite', async () => {
    const hits = await source().search({ text: 'ponto férias', limit: 1 })
    assert.equal(hits.length, 1)
    const all = await source().search({ text: 'ponto férias', limit: 10 })
    assert.deepEqual(all.map(hit => hit.documentId).sort(), ['ferias.md', join('sub', 'ponto.txt')])
  })

  it('devolve lista vazia quando nada casa ou a consulta só tem stopwords', async () => {
    assert.deepEqual(await source().search({ text: 'orçamento trimestral', limit: 5 }), [])
    assert.deepEqual(await source().search({ text: 'como o de', limit: 5 }), [])
  })
})
