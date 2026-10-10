import avisosPlugin from './index.js'

if (!window.AlpineForm) {
    console.error('[AlpineForm] alpine-form-avisos deve ser carregado depois de alpine-form.')
} else {
    window.AlpineForm.use(avisosPlugin)
}
