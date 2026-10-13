/**
 * Gera pacote/alpine-form-<versão>.zip com tudo que um projeto precisa para usar a biblioteca:
 *   js/   núcleo, módulos e pacote completo minificados (<script>) + Alpine e Alpine CSP
 *   esm/  as mesmas entradas em ESM (para bundlers)
 *   css/  CSS opcional
 *   php/  helpers PHP (Resposta, Entrada, Validador, Consulta, Csv, Csrf)
 *   LEIAME.md  ordem de carregamento e o que ficou de fora
 *
 * Uso: npm run pacote            (roda o build antes)
 *      npm run pacote -- --sem-build
 * Sem dependências: o zip é montado aqui mesmo (deflate do node:zlib).
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { deflateRawSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'))
const versao = pkg.version

if (!process.argv.includes('--sem-build')) {
    const r = spawnSync(process.execPath, [join(raiz, 'build.mjs')], { cwd: raiz, stdio: 'inherit' })
    if (r.status !== 0) {
        console.error('Build falhou; pacote não gerado.')
        process.exit(1)
    }
}

function exigir(caminho) {
    const completo = join(raiz, caminho)
    if (!existsSync(completo)) {
        console.error(`Arquivo ausente: ${caminho}` + (caminho.startsWith('node_modules') ? ' (rode npm install)' : ''))
        process.exit(1)
    }
    return readFileSync(completo)
}

function versaoDe(pacote) {
    return JSON.parse(exigir(`node_modules/${pacote}/package.json`)).version
}

// [caminho no zip, conteúdo]
const entradas = []
const dist = readdirSync(join(raiz, 'dist')).sort()
for (const nome of dist.filter((n) => n.endsWith('.min.js'))) entradas.push([`js/${nome}`, exigir(`dist/${nome}`)])
for (const nome of dist.filter((n) => n.endsWith('.esm.js'))) entradas.push([`esm/${nome}`, exigir(`dist/${nome}`)])
entradas.push(['js/alpine.min.js', exigir('node_modules/alpinejs/dist/cdn.min.js')])
entradas.push(['js/alpine-csp.min.js', exigir('node_modules/@alpinejs/csp/dist/cdn.min.js')])
entradas.push(['css/alpine-form.css', exigir('css/alpine-form.css')])
entradas.push(['php/alpine-form.php', exigir('php/alpine-form.php')])

const modulos = dist
    .filter((n) => n.endsWith('.min.js') && n !== 'alpine-form.min.js' && n !== 'alpine-form-completo.min.js')
    .map((n) => `- \`js/${n}\``)
    .join('\n')

const leiame = `# AlpineForm ${versao}

Pacote para usar a biblioteca em um projeto. Gerado por \`npm run pacote\` em ${new Date().toISOString().slice(0, 10)}.

## Conteúdo

| Pasta | Uso |
|---|---|
| \`js/\` | Arquivos para \`<script>\` (minificados) |
| \`esm/\` | Mesmas entradas em ESM, para Vite/bundlers (\`import AlpineFormPlugin from './esm/alpine-form.esm.js'\`) |
| \`css/alpine-form.css\` | CSS opcional |
| \`php/alpine-form.php\` | Helpers PHP 7.0+: \`Resposta\`, \`Entrada\`, \`Validador\`, \`Consulta\`, \`Csv\`, \`Csrf\` (\`require __DIR__ . '/alpine-form.php';\`) |

Alpine incluído: \`js/alpine.min.js\` (alpinejs ${versaoDe('alpinejs')}) e \`js/alpine-csp.min.js\` (@alpinejs/csp ${versaoDe('@alpinejs/csp')}, para CSP estrita). Use **um** dos dois.

## Ordem de carregamento

\`\`\`html
<link rel="stylesheet" href="/alpine-form/css/alpine-form.css">
<script src="/alpine-form/js/alpine-form-completo.min.js"></script> <!-- núcleo + todos os módulos -->
<script src="/js/app.js"></script>                                  <!-- configure(), extensões, Alpine.data() -->
<script defer src="/alpine-form/js/alpine.min.js"></script>         <!-- SEMPRE por último, com defer -->
\`\`\`

Para páginas mais leves, troque o \`completo\` por \`js/alpine-form.min.js\` (núcleo, obrigatório) seguido só dos módulos usados:

${modulos}

Atributo de um módulo não carregado gera erro de configuração e bloqueia o envio (nada é ignorado em silêncio).

## Fora do pacote

Upload em partes (\`data-form-chunked\`), processamento assíncrono (HTTP 202 + polling) e exportação em segundo plano da lista
precisam de backend próprio. O backend de referência do repositório (\`server/src/ChunkStore.php\`, \`JobQueue.php\`,
\`Exportacao.php\`, \`server/bin/worker.php\` e \`cleanup.php\`; PHP 8.1+) serve de modelo para adaptar.

Toda regra precisa ser revalidada no servidor: a biblioteca melhora a experiência, não substitui a validação do backend.
`
entradas.push(['LEIAME.md', Buffer.from(leiame.replace(/\n/g, '\r\n'), 'utf8')])

// ---- zip (PKZIP 2.0, deflate) ----
const tabelaCrc = new Uint32Array(256).map((_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
})
function crc32(buf) {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) c = tabelaCrc[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

const agora = new Date()
const horaDos = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1)
const dataDos = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate()
const prefixo = `alpine-form-${versao}/`

const partes = []
const central = []
let deslocamento = 0
for (const [caminho, dados] of entradas) {
    const nome = Buffer.from(prefixo + caminho, 'utf8')
    const comprimido = deflateRawSync(dados, { level: 9 })
    const crc = crc32(dados)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // versão necessária
    local.writeUInt16LE(0x0800, 6) // nomes em UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(horaDos, 10)
    local.writeUInt16LE(dataDos, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(dados.length, 22)
    local.writeUInt16LE(nome.length, 26)
    local.writeUInt16LE(0, 28)
    partes.push(local, nome, comprimido)

    const cabecalho = Buffer.alloc(46)
    cabecalho.writeUInt32LE(0x02014b50, 0)
    cabecalho.writeUInt16LE(20, 4) // feito por
    cabecalho.writeUInt16LE(20, 6)
    cabecalho.writeUInt16LE(0x0800, 8)
    cabecalho.writeUInt16LE(8, 10)
    cabecalho.writeUInt16LE(horaDos, 12)
    cabecalho.writeUInt16LE(dataDos, 14)
    cabecalho.writeUInt32LE(crc, 16)
    cabecalho.writeUInt32LE(comprimido.length, 20)
    cabecalho.writeUInt32LE(dados.length, 24)
    cabecalho.writeUInt16LE(nome.length, 28)
    cabecalho.writeUInt32LE(deslocamento, 42)
    central.push(cabecalho, nome)

    deslocamento += local.length + nome.length + comprimido.length
}

const tamanhoCentral = central.reduce((s, b) => s + b.length, 0)
const fim = Buffer.alloc(22)
fim.writeUInt32LE(0x06054b50, 0)
fim.writeUInt16LE(entradas.length, 8)
fim.writeUInt16LE(entradas.length, 10)
fim.writeUInt32LE(tamanhoCentral, 12)
fim.writeUInt32LE(deslocamento, 16)

const saida = join(raiz, 'pacote', `alpine-form-${versao}.zip`)
mkdirSync(dirname(saida), { recursive: true })
const zip = Buffer.concat([...partes, ...central, fim])
writeFileSync(saida, zip)
console.log(`pacote/alpine-form-${versao}.zip: ${entradas.length} arquivos, ${(zip.length / 1024).toFixed(0)} KB`)
