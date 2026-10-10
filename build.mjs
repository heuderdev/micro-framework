import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))
const banner = `/*! AlpineForm v${pkg.version} | MIT */`
const target = ['es2020', 'chrome92', 'firefox90', 'safari15', 'edge92']

/**
 * Cada módulo gera:
 *   - ESM (para import/bundlers):          dist/<nome>.esm.js
 *   - IIFE para <script> (não minificado):  dist/<nome>.js
 *   - IIFE minificado:                      dist/<nome>.min.js
 * Módulos opcionais acessam o núcleo pela API pública (window.AlpineForm / objeto passado ao plugin).
 */
const modules = [
    { name: 'alpine-form', esm: 'src/index.js', iife: 'src/cdn.js' },
    { name: 'alpine-form-masks', esm: 'src/masks/index.js', iife: 'src/masks/cdn.js' },
    { name: 'alpine-form-chunks', esm: 'src/chunks/index.js', iife: 'src/chunks/cdn.js' },
    { name: 'alpine-form-inspectors', esm: 'src/inspectors/index.js', iife: 'src/inspectors/cdn.js' },
    { name: 'alpine-form-bootstrap', esm: 'src/ui/bootstrap.js', iife: 'src/ui/bootstrap-cdn.js' },
    { name: 'alpine-form-rascunho', esm: 'src/rascunho/index.js', iife: 'src/rascunho/cdn.js' },
    { name: 'alpine-form-lista', esm: 'src/lista/index.js', iife: 'src/lista/cdn.js' },
    { name: 'alpine-form-opcoes', esm: 'src/opcoes/index.js', iife: 'src/opcoes/cdn.js' },
]

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })

const sizes = []
for (const mod of modules) {
    await build({ entryPoints: [mod.esm], outfile: `dist/${mod.name}.esm.js`, bundle: true, format: 'esm', target, banner: { js: banner }, legalComments: 'none' })
    await build({ entryPoints: [mod.iife], outfile: `dist/${mod.name}.js`, bundle: true, format: 'iife', target, banner: { js: banner }, legalComments: 'none' })
    await build({ entryPoints: [mod.iife], outfile: `dist/${mod.name}.min.js`, bundle: true, format: 'iife', target, minify: true, banner: { js: banner }, legalComments: 'none' })
    const min = readFileSync(`dist/${mod.name}.min.js`)
    sizes.push({ module: mod.name, min: min.length, gzip: gzipSync(min).length, esm: statSync(`dist/${mod.name}.esm.js`).size })
}

writeFileSync('dist/sizes.json', JSON.stringify(sizes, null, 2) + '\n')
for (const s of sizes) {
    console.log(`${s.module.padEnd(26)} min ${(s.min / 1024).toFixed(1).padStart(6)} KiB   gzip ${(s.gzip / 1024).toFixed(1).padStart(5)} KiB`)
}
