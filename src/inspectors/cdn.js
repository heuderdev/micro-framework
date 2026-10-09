import inspectorsPlugin from './index.js'

if (!window.AlpineForm) {
    console.error('[AlpineForm] alpine-form-inspectors deve ser carregado depois de alpine-form.')
} else {
    window.AlpineForm.use(inspectorsPlugin)
}
