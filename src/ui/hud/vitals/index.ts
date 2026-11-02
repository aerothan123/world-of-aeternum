// The vitals bar domain (docs/design/project-h-interface.md, "Vitals bar"): the
// Project H player frame as a descriptor of the unit_frame family. Pure
// decisions in vitals_view.ts, the thin facet-routed painter in
// vitals_painter.ts; Hud composes both and keeps the coordinator-only side
// effects (the low-health vignette, the low-resource label) beside the call.
export * from './vitals_painter';
export * from './vitals_view';
