// The DOM half of the add-on UI layer: mounts the widget records that
// addon_widget_core.ts validated into one #addon-layer under #ui, one root per
// add-on, and owns player drag of movable frames and click routing.
//
// Rules this controller keeps (src/ui/CLAUDE.md, src/ui/hud/CLAUDE.md):
// - Only validated props reach here, and text goes through the shared
//   setText writer (textContent), never innerHTML: add-on text cannot inject.
// - Every repeated write goes through the shared PainterHost writers; element
//   creation and the className stamp are build-time.
// - No layout read: anchors are CSS percent + translate (anchorCss), and drag
//   adds pointer deltas divided by the UI scale dep to the stored offset.
// - Clicks are honored only when event.isTrusted; secure actions are run by
//   the runtime from the DECLARED prop, never by asking the add-on.

import type { PainterHostWriters } from '../../painter_host';
import {
  type AddonSecureAction,
  type AddonWidgetRec,
  anchorCss,
  barFraction,
} from './addon_widget_core';

export interface AddonFramesDeps {
  writers: PainterHostWriters;
  document: Document;
  uiScale(): number;
  onClick(key: string, widgetId: number, button: number, secure: AddonSecureAction | null): void;
  onMoved(key: string, rec: AddonWidgetRec): void;
}

const LAYER_Z = { low: '1', medium: '2', high: '3' } as const;
const DRAG_SLOP_PX = 3;

interface Mounted {
  el: HTMLElement;
  fill: HTMLElement | null;
}

export class AddonFramesController {
  private readonly roots = new Map<string, HTMLElement>();
  private readonly mounted = new Map<string, Map<number, Mounted>>();
  private suppressClickUntilUp = false;

  constructor(
    private readonly layer: HTMLElement,
    private readonly deps: AddonFramesDeps,
  ) {}

  /** The per-add-on root (created on first use). */
  root(key: string): HTMLElement {
    let r = this.roots.get(key);
    if (!r) {
      r = this.deps.document.createElement('div');
      r.className = 'addon-root';
      r.dataset.addon = key;
      this.layer.appendChild(r);
      this.roots.set(key, r);
      this.mounted.set(key, new Map());
    }
    return r;
  }

  /** Drop an add-on's whole subtree (stop, disable, reload). */
  removeAddon(key: string): void {
    this.roots.get(key)?.remove();
    this.roots.delete(key);
    this.mounted.delete(key);
  }

  widgetCount(key: string): number {
    return this.mounted.get(key)?.size ?? 0;
  }

  create(key: string, rec: AddonWidgetRec): void {
    const doc = this.deps.document;
    const map = this.mounted.get(key) ?? (this.root(key), this.mounted.get(key));
    if (!map) return;
    const el = doc.createElement(rec.type === 'button' ? 'button' : 'div');
    if (rec.type === 'button') (el as HTMLButtonElement).type = 'button';
    el.className = `addon-w addon-w--${rec.type}`;
    el.dataset.addonWidget = String(rec.id);
    let fill: HTMLElement | null = null;
    if (rec.type === 'bar') {
      fill = doc.createElement('div');
      fill.className = 'addon-bar-fill';
      el.appendChild(fill);
    }
    const parentEl = rec.parent === null ? this.root(key) : map.get(rec.parent)?.el;
    if (!parentEl) return;
    parentEl.appendChild(el);
    map.set(rec.id, { el, fill });
    this.wire(key, rec, el);
    this.update(key, rec);
  }

  update(key: string, rec: AddonWidgetRec): void {
    const m = this.mounted.get(key)?.get(rec.id);
    if (!m) return;
    const w = this.deps.writers;
    const p = rec.props;
    const el = m.el;
    const a = anchorCss(p);
    w.setStyleProp(el, 'left', a.left);
    w.setStyleProp(el, 'top', a.top);
    w.setTransform(el, a.transform);
    w.setStyleProp(el, 'width', p.width !== undefined ? `${p.width}px` : '');
    w.setStyleProp(el, 'height', p.height !== undefined ? `${p.height}px` : '');
    w.setDisplay(el, p.shown === false ? 'none' : '');
    w.setStyleProp(el, 'opacity', p.alpha !== undefined ? String(p.alpha) : '');
    w.setStyleProp(el, 'z-index', p.layer ? LAYER_Z[p.layer] : '');
    const interactive = !!(p.clickable || p.secure || p.movable || rec.type === 'button');
    w.toggleClass(el, 'addon-w--interactive', interactive);
    w.toggleClass(el, 'addon-w--movable', !!p.movable);
    w.toggleClass(el, 'addon-w--secure', !!p.secure);
    w.setStyleProp(
      el,
      'background-color',
      p.backdropColor ?? (rec.type === 'bar' ? (p.bgColor ?? '') : ''),
    );
    w.setStyleProp(el, 'border-color', p.borderColor ?? '');
    w.toggleClass(el, 'addon-w--bordered', !!p.borderColor);
    if (rec.type === 'text' || rec.type === 'button') {
      w.setText(el, p.text ?? '');
      w.setStyleProp(el, 'font-size', p.size !== undefined ? `${p.size}px` : '');
      w.setStyleProp(el, 'color', p.color ?? '');
      w.setStyleProp(el, 'text-align', p.align ?? '');
      w.toggleClass(el, 'addon-w--wrap', !!p.wrap);
      w.setStyleProp(el, 'font-weight', p.bold ? '700' : '');
    }
    if (m.fill) {
      const f = barFraction(p);
      w.setTransform(m.fill, p.vertical ? `scaleY(${f})` : `scaleX(${f})`);
      w.toggleClass(m.fill, 'addon-bar-fill--vertical', !!p.vertical);
      w.setStyleProp(m.fill, 'background-color', p.color ?? '');
    }
  }

  remove(key: string, ids: readonly number[]): void {
    const map = this.mounted.get(key);
    if (!map) return;
    for (const id of ids) {
      map.get(id)?.el.remove();
      map.delete(id);
    }
  }

  private wire(key: string, rec: AddonWidgetRec, el: HTMLElement): void {
    el.addEventListener('click', (e: MouseEvent) => {
      // Synthetic clicks never act: the worker cannot reach the DOM, and any
      // other script-generated click is refused here too.
      if (!e.isTrusted) return;
      if (this.suppressClickUntilUp) {
        this.suppressClickUntilUp = false;
        return;
      }
      if (!(rec.props.clickable || rec.props.secure || rec.type === 'button')) return;
      e.stopPropagation();
      this.deps.onClick(key, rec.id, e.button, rec.props.secure ?? null);
    });
    if (rec.parent !== null) return;
    let drag: {
      id: number;
      sx: number;
      sy: number;
      x0: number;
      y0: number;
      moved: boolean;
    } | null = null;
    el.addEventListener('pointerdown', (e: PointerEvent) => {
      if (!e.isTrusted || !rec.props.movable || e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('button')) return;
      this.suppressClickUntilUp = false;
      drag = {
        id: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        x0: rec.props.x ?? 0,
        y0: rec.props.y ?? 0,
        moved: false,
      };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const scale = this.deps.uiScale() || 1;
      const dx = (e.clientX - drag.sx) / scale;
      const dy = (e.clientY - drag.sy) / scale;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_SLOP_PX) return;
      drag.moved = true;
      rec.props.x = Math.round(drag.x0 + dx);
      rec.props.y = Math.round(drag.y0 + dy);
      this.deps.writers.setTransform(el, anchorCss(rec.props).transform);
    });
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      el.releasePointerCapture?.(e.pointerId);
      if (moved) {
        this.suppressClickUntilUp = true;
        this.deps.onMoved(key, rec);
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}
