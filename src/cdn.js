import { AlpineForm } from './index.js'

/**
 * Entrada para <script> tradicional (build IIFE).
 * Carregue ANTES do Alpine: <script src="alpine-form.min.js"></script> <script defer src="alpine.min.js"></script>
 */
window.AlpineForm = AlpineForm

if (window.Alpine && typeof window.Alpine.plugin === 'function') {
    window.Alpine.plugin(AlpineForm.plugin)
    if (document.querySelector('[x-data]') && window.Alpine.version && document.readyState === 'complete') {
        console.warn('[AlpineForm] O Alpine parece já ter sido iniciado; carregue alpine-form antes do Alpine.')
    }
} else {
    document.addEventListener('alpine:init', () => window.Alpine.plugin(AlpineForm.plugin), { once: true })
}
