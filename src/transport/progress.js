/**
 * Medidor de progresso baseado SOMENTE em eventos reais de transporte (nenhum timer simula avanço).
 *
 * percent = floor(loaded / total * 100), apenas quando lengthComputable e total > 0.
 * velocidade (bytes/s) = (loaded_atual - loaded_mais_antigo_na_janela) / (t_atual - t_mais_antigo) * 1000,
 *   usando amostras dos últimos `windowMs` (padrão 3 s); exige ao menos 500 ms de janela.
 * ETA (s) = (total - loaded) / velocidade, somente após 1 s de envio, com total conhecido e velocidade > 0.
 * Velocidade e ETA são estimativas e oscilam com a rede.
 */
export class ProgressTracker {
    constructor({ windowMs = 3000, now = () => performance.now() } = {}) {
        this.windowMs = windowMs
        this.now = now
        this.reset()
    }

    reset() {
        this.startedAt = null
        this.samples = []
        this.loaded = 0
        this.total = null
        this.lengthComputable = false
        this.uploadedAt = null
    }

    start() {
        this.reset()
        this.startedAt = this.now()
        this.samples.push({ t: this.startedAt, loaded: 0 })
    }

    update({ loaded, total, lengthComputable }) {
        const t = this.now()
        if (this.startedAt == null) this.start()
        this.loaded = Math.max(0, loaded)
        this.lengthComputable = !!lengthComputable && total > 0
        this.total = this.lengthComputable ? total : null
        this.samples.push({ t, loaded: this.loaded })
        while (this.samples.length > 2 && t - this.samples[0].t > this.windowMs) this.samples.shift()
    }

    markUploaded() {
        this.uploadedAt = this.now()
        if (this.lengthComputable) this.loaded = this.total
    }

    speed() {
        if (this.samples.length < 2) return null
        const first = this.samples[0]
        const last = this.samples[this.samples.length - 1]
        const dt = last.t - first.t
        if (dt < 500) return null
        return Math.max(0, ((last.loaded - first.loaded) / dt) * 1000)
    }

    snapshot() {
        const t = this.now()
        const elapsed = this.startedAt == null ? 0 : Math.max(0, (this.uploadedAt ?? t) - this.startedAt)
        const computable = this.lengthComputable && this.total > 0
        const percent = computable ? Math.min(100, Math.floor((this.loaded / this.total) * 100)) : null
        const speed = this.uploadedAt ? null : this.speed()
        const eta = computable && speed && speed > 0 && elapsed >= 1000 && !this.uploadedAt
            ? Math.max(0, Math.round((this.total - this.loaded) / speed))
            : null
        return {
            loaded: this.loaded,
            total: computable ? this.total : null,
            percent,
            indeterminate: !computable,
            lengthComputable: computable,
            speed: speed == null ? null : Math.round(speed),
            eta,
            elapsed: Math.round(elapsed),
            uploaded: this.uploadedAt != null,
        }
    }
}

export function emptyProgress() {
    return { loaded: 0, total: null, percent: null, indeterminate: true, lengthComputable: false, speed: null, eta: null, elapsed: 0, uploaded: false }
}
