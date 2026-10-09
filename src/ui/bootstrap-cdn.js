import bootstrapPlugin from './bootstrap.js'

if (!window.AlpineForm) {
    console.error('[AlpineForm] alpine-form-bootstrap deve ser carregado depois de alpine-form.')
} else {
    window.AlpineForm.use(bootstrapPlugin)
}
