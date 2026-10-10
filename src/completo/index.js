/**
 * Pacote completo: núcleo + todos os módulos opcionais já carregados.
 *   ESM:    import AlpineFormPlugin, { AlpineForm } from 'alpine-form/completo'
 *   script: <script src="alpine-form-completo.min.js"></script> (no lugar do núcleo e dos módulos, antes do Alpine)
 * Prático para começar um projeto; em produção, carregar só os módulos usados deixa a página mais leve.
 */
import AlpineFormPlugin, { AlpineForm } from '../index.js'
import masks from '../masks/index.js'
import chunks from '../chunks/index.js'
import inspectors from '../inspectors/index.js'
import bootstrap from '../ui/bootstrap.js'
import rascunho from '../rascunho/index.js'
import lista from '../lista/index.js'
import opcoes from '../opcoes/index.js'
import preencher from '../preencher/index.js'
import avisos from '../avisos/index.js'
import autocompletar from '../autocompletar/index.js'

AlpineForm.use(masks).use(chunks).use(inspectors).use(bootstrap).use(rascunho).use(lista).use(opcoes).use(preencher).use(avisos).use(autocompletar)

export * from '../index.js'
export default AlpineFormPlugin
