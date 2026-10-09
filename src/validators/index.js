import { registerValidator, has } from '../core/registry.js'
import presence from './presence.js'
import text from './text.js'
import numbers from './numbers.js'
import comparison from './comparison.js'
import dates from './dates.js'
import brazil from './brazil.js'
import files from './files.js'
import cards from './cards.js'

export const BUILTIN_VALIDATORS = { ...presence, ...text, ...numbers, ...comparison, ...dates, ...brazil, ...cards, ...files }

export function registerBuiltinValidators() {
    for (const [name, definition] of Object.entries(BUILTIN_VALIDATORS)) {
        if (!has('validator', name)) registerValidator(name, definition)
    }
}
