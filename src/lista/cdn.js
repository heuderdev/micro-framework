import listaPlugin from './index.js'

if (!window.AlpineForm) {
    console.error('[AlpineForm] alpine-form-lista deve ser carregado depois de alpine-form.')
} else {
    window.AlpineForm.use(listaPlugin)
}
