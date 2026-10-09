import chunksPlugin from './index.js'

if (!window.AlpineForm) {
    console.error('[AlpineForm] alpine-form-chunks deve ser carregado depois de alpine-form.')
} else {
    window.AlpineForm.use(chunksPlugin)
}
