// The one author-space anchor for a world-anchored HUD prompt: the coach's
// interact bubble (bootcamp.ts), the hub practice yard's bubble
// (hud/practice/hub_lesson_controller.ts) and any later chip that stands
// over a world point. Pure: no DOM, no renderer, registered in UI_PURE_CORES
// (tests/architecture.test.ts); driven by tests/world_prompt_anchor_core.test.ts.
//
// Why this exists: Renderer.worldToScreen returns a point in UNZOOMED viewport
// CSS pixels (the nameplate layer's own space, #nameplates), but the prompts
// are children of #ui, which carries `zoom: var(--ui-scale)`. A viewport pixel
// written straight into a #ui child's left/top is re-multiplied by the zoom,
// so at any UI Scale other than 1 the bubble landed at scale times the target's
// screen position: over an empty field, in the middle of the screen, far from
// the NPC it named (the public-server report). The FCT painter already divides
// by getUiScale for exactly this reason (fct_painter.ts); this core is that
// divide, shared, plus the show gate the viewport implies.
//
// The projection itself is aspect-correct by construction (the same camera and
// the same viewport size the nameplates use), which is why the test drives it
// through a real perspective camera at 16:9, 21:9 and 2.4:1: at every aspect the
// author-space anchor is the nameplate's screen point over the UI scale.

/** Renderer.worldToScreen's exact return shape. */
export interface ProjectedScreenPoint {
  x: number;
  y: number;
  /** Camera-space depth past the far plane or behind the eye. */
  behind: boolean;
}

/** The unzoomed viewport the projection was made against (CSS px). */
export interface PromptViewport {
  width: number;
  height: number;
}

/** The inline left/top (author px inside #ui) a visible prompt writes. */
export interface WorldPromptAnchor {
  left: number;
  top: number;
}

/** Half-pixel grid: the bubble moves every frame the camera turns, and a
 *  sub-pixel write would churn the style attribute without moving anything. */
function halfPx(v: number): number {
  return Math.round(v * 2) / 2;
}

/** A scale a host could not resolve is 1 (the default UI Scale), never NaN
 *  or zero, which would park every bubble at infinity. */
function safeScale(uiScale: number): number {
  return Number.isFinite(uiScale) && uiScale > 0 ? uiScale : 1;
}

/**
 * Resolve where a world-anchored prompt stands, or whether it hides.
 *
 * Returns true and fills `out` when the prompt is VISIBLE: there is a candidate
 * (`projected` is not null), it is in front of the camera, and its anchor lies
 * inside the viewport with `topClearancePx` of room above it (the bubble draws
 * UPWARD from its anchor, so an anchor too near the top edge has nowhere to
 * go). Returns false otherwise, and `out` is left untouched. No candidate in
 * range is the null arm: the caller passes null and the chip hides entirely
 * rather than floating alone.
 *
 * `out` is caller-owned and reused across frames (allocation-light, the
 * per-frame core contract in src/ui/CLAUDE.md).
 */
export function worldPromptAnchor(
  projected: ProjectedScreenPoint | null,
  viewport: PromptViewport,
  uiScale: number,
  topClearancePx: number,
  out: WorldPromptAnchor,
): boolean {
  if (projected === null || projected.behind) return false;
  const { x, y } = projected;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < 0 || x > viewport.width) return false;
  if (y < topClearancePx || y > viewport.height) return false;
  const scale = safeScale(uiScale);
  out.left = halfPx(x / scale);
  out.top = halfPx(y / scale);
  return true;
}
