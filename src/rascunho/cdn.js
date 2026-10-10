import rascunhoPlugin from './index.js'

if (!window.AlpineForm) {
    console.error('[AlpineForm] alpine-form-rascunho deve ser carregado depois de alpine-form.')
} else {
    window.AlpineForm.use(rascunhoPlugin)
}
