/*
 * Lógica do exemplo com CSP estrita. Na versão CSP do Alpine, as expressões do HTML só podem ser
 * caminhos de propriedade ("$form.submitting", "ehPj"); qualquer lógica fica aqui, em Alpine.data().
 * Este arquivo é carregado depois de alpine-form e antes do Alpine (que usa defer).
 */
document.addEventListener('alpine:init', () => {
    window.Alpine.data('cadastro', () => ({
        tipo: 'pf',
        get ehPj() {
            return this.tipo === 'pj'
        },
        // x-model não funciona na versão CSP do Alpine (não há atribuição em expressões);
        // o evento form:change do AlpineForm informa o valor de qualquer campo.
        init() {
            this.$el.addEventListener('form:change', event => {
                if (event.detail.name === 'tipo') this.tipo = event.detail.value
            })
        },
        get mensagemSucesso() {
            return this.$form && this.$form.result ? this.$form.result.message : ''
        },
    }))

    window.Alpine.data('envioArquivo', () => ({
        ultimoEvento: '',
        // objeto de opções lido por x-form="opcoes" (equivale a x-form="{ ... }" sem precisar avaliar código)
        opcoes: {
            debounce: 300,
            hooks: {
                beforeRequest(request) {
                    request.headers['X-Origem'] = 'exemplo-csp'
                },
            },
        },
        init() {
            this.$el.addEventListener('form:success', () => {
                this.ultimoEvento = 'Arquivo recebido pelo servidor.'
            })
            this.$el.addEventListener('form:error', event => {
                this.ultimoEvento = 'Falha: ' + event.detail.error.message
            })
        },
    }))
})
