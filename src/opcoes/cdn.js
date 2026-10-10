import opcoesPlugin from './index.js'

if (!window.AlpineForm) {
    console.error('[AlpineForm] alpine-form-opcoes deve ser carregado depois de alpine-form.')
} else {
    window.AlpineForm.use(opcoesPlugin)
}
