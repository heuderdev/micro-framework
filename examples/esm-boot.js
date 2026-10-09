import Alpine from '/vendor/alpine.esm.js'
import AlpineFormPlugin, { AlpineForm } from '/dist/alpine-form.esm.js'
import masks from '/dist/alpine-form-masks.esm.js'

AlpineForm.use(masks)
AlpineForm.configure({ validation: 'live', debounce: 200 })
Alpine.plugin(AlpineFormPlugin)
window.Alpine = Alpine
window.AlpineForm = AlpineForm
Alpine.start()
