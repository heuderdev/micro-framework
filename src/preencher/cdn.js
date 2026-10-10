import preencherPlugin from './index.js'

if (!window.AlpineForm) {
    console.error('[AlpineForm] alpine-form-preencher deve ser carregado depois de alpine-form.')
} else {
    window.AlpineForm.use(preencherPlugin)
}
