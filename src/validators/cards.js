import { isValidCard } from '../lib/cards.js'

/** card: Luhn + comprimento da bandeira detectada. Não verifica se o cartão existe ou tem saldo. */
export default {
    card: {
        rest: { name: 'brands', type: 'string' },
        validate: (value, ctx) => isValidCard(String(value ?? ''), ctx.params.brands?.length ? ctx.params.brands : null),
    },
}
