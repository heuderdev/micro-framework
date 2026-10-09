/*! AlpineForm v1.0.0 | MIT */

// src/ui/bootstrap.js
var BOOTSTRAP_CLASSES = {
  invalid: "is-invalid",
  valid: "is-valid",
  pending: "af-pending",
  error: "invalid-feedback d-block",
  errorItem: "d-block",
  errorPending: "af-error--pending text-body-secondary",
  summary: "alert alert-danger",
  summaryTitle: "fw-semibold mb-1",
  summaryList: "mb-0",
  fileList: "list-group mt-2",
  fileItem: "list-group-item d-flex align-items-center gap-2",
  fileItemInvalid: "list-group-item-danger",
  fileThumb: "rounded border",
  fileName: "text-break",
  fileSize: "text-body-secondary small",
  fileErrors: "text-danger small",
  fileRemove: "btn btn-sm btn-outline-danger ms-auto",
  existingRemoved: "opacity-50 text-decoration-line-through",
  dropzoneOver: "border-primary bg-body-tertiary"
};
function makeBootstrapAdapter(DefaultUiAdapter) {
  return class BootstrapUiAdapter extends DefaultUiAdapter {
    constructor(ctx, options = {}) {
      super(ctx, { ...options, classes: { ...BOOTSTRAP_CLASSES, ...options.classes || {} } });
    }
    anchorFor(field) {
      const last = field.controls[field.controls.length - 1];
      if (field.kind === "radio" || field.kind === "checkbox-group" || field.kind === "checkbox") {
        const check = last.closest(".form-check");
        if (check) {
          if (field.controls.length > 1) {
            const fieldset = field.primary.closest("fieldset");
            if (fieldset && field.controls.every((c) => fieldset.contains(c))) return { parent: fieldset, before: null };
          }
          return { parent: check.parentNode, before: check.nextSibling };
        }
      }
      const floating = last.closest(".form-floating");
      if (floating) return { parent: floating, before: null };
      const group = last.closest(".input-group");
      if (group) return { parent: group.parentNode, before: group.nextSibling };
      return super.anchorFor(field);
    }
  };
}
function bootstrapPlugin(AlpineForm) {
  if (AlpineForm.registry.has("uiAdapter", "bootstrap")) return;
  const BootstrapUiAdapter = makeBootstrapAdapter(AlpineForm.internals.DefaultUiAdapter);
  AlpineForm.uiAdapter("bootstrap", (ctx, options) => new BootstrapUiAdapter(ctx, options));
}
export {
  BOOTSTRAP_CLASSES,
  bootstrapPlugin as default,
  makeBootstrapAdapter
};
