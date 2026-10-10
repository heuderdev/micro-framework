import autocompletarPlugin from './index.js'

if (!window.AlpineForm) {
    console.error('[AlpineForm] alpine-form-autocompletar deve ser carregado depois de alpine-form.')
} else {
    window.AlpineForm.use(autocompletarPlugin)
}
