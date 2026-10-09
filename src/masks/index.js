import { BUILTIN_MASKS } from './definitions.js'
import { attachMask, MASK_ATTRIBUTES } from './runtime.js'

export { patternMask } from './definitions.js'
export { compilePattern, applySlots, formatWithCaret } from './pattern-engine.js'
export { NumericEngine } from './numeric-engine.js'

/**
 * Módulo opcional de máscaras. Uso:
 *   ESM:    import masks from 'alpine-form/masks'; AlpineForm.use(masks)
 *   script: <script src="alpine-form-masks.min.js"></script> (após alpine-form.min.js)
 */
export default function masksPlugin(AlpineForm) {
    for (const [name, factory] of Object.entries(BUILTIN_MASKS)) {
        if (!AlpineForm.registry.has('mask', name)) AlpineForm.mask(name, factory)
    }
    AlpineForm.fieldAttributes(MASK_ATTRIBUTES)
    AlpineForm.internals.setMaskProvider({ attach: (field, name) => attachMask(field, name, AlpineForm.registry) })
}
