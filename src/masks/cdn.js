import masksPlugin from './index.js'

if (!window.AlpineForm) {
    console.error('[AlpineForm] alpine-form-masks deve ser carregado depois de alpine-form.')
} else {
    window.AlpineForm.use(masksPlugin)
}
