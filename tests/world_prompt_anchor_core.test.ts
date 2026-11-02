// The world-anchored prompt's author-space anchor (src/ui/world_prompt_anchor_core.ts):
// the coach's "F Talk" bubble and the hub practice yard's bubble live inside
// the zoomed #ui while Renderer.worldToScreen answers in unzoomed viewport
// pixels, the nameplates' space. The public-server report: at one client the
// bubble floated far from the NPC in the middle of the screen while another
// client (16:9, UI Scale 1) showed it over the head. The projection is
// aspect-neutral by construction (same camera, same viewport size as the
// nameplates), so this suite drives a real perspective camera at 16:9, 21:9
// and the reported 2.4:1 and pins that the anchor is the nameplate's screen
// point divided by the UI scale at every aspect, plus the show gate: no
// candidate, behind the camera or off the viewport hides the chip entirely.

import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  type ProjectedScreenPoint,
  type WorldPromptAnchor,
  worldPromptAnchor,
} from '../src/ui/world_prompt_anchor_core';

/** Renderer.worldToScreen's exact formula (renderer.ts), which is also the
 *  nameplate painter's (nameplate_painter.ts): NDC to viewport CSS px. */
function worldToScreen(
  camera: PerspectiveCamera,
  viewport: { width: number; height: number },
  x: number,
  y: number,
  z: number,
): ProjectedScreenPoint {
  const v = new Vector3(x, y, z).project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * viewport.width,
    y: (-v.y * 0.5 + 0.5) * viewport.height,
    behind: v.z > 1,
  };
}

/** A third-person camera over a standing player, looking at an NPC's head
 *  a few yards ahead, at the given viewport. */
function cameraFor(viewport: { width: number; height: number }): PerspectiveCamera {
  const cam = new PerspectiveCamera(70, viewport.width / viewport.height, 0.1, 500);
  cam.position.set(0, 4, -8);
  cam.lookAt(0, 1.5, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

const ASPECTS = [
  { name: '16:9 (1920x1080)', width: 1920, height: 1080 },
  { name: '21:9 (2560x1080)', width: 2560, height: 1080 },
  { name: '2.4:1 (1517x633, the reported capture)', width: 1517, height: 633 },
  { name: '4:3 (1024x768)', width: 1024, height: 768 },
] as const;

/** The NPC's head: a yard to the side so x is not trivially the centre. */
const HEAD = { x: 1.2, y: 2.5, z: 2 };

describe('worldPromptAnchor: the nameplate point over the UI scale, at every aspect', () => {
  for (const vp of ASPECTS) {
    it(`matches the nameplate projection at UI Scale 1 on ${vp.name}`, () => {
      const cam = cameraFor(vp);
      const projected = worldToScreen(cam, vp, HEAD.x, HEAD.y, HEAD.z);
      const out: WorldPromptAnchor = { left: 0, top: 0 };
      expect(worldPromptAnchor(projected, vp, 1, 0, out)).toBe(true);
      expect(out.left).toBeCloseTo(projected.x, 0);
      expect(out.top).toBeCloseTo(projected.y, 0);
      // Half-pixel grid, as the bubble always wrote.
      expect(out.left * 2).toBe(Math.round(out.left * 2));
      expect(out.top * 2).toBe(Math.round(out.top * 2));
    });

    it(`divides by the UI scale so the zoomed #ui lands it on the head on ${vp.name}`, () => {
      const cam = cameraFor(vp);
      const projected = worldToScreen(cam, vp, HEAD.x, HEAD.y, HEAD.z);
      for (const scale of [0.75, 1.25, 1.5, 2]) {
        const out: WorldPromptAnchor = { left: 0, top: 0 };
        expect(worldPromptAnchor(projected, vp, scale, 0, out)).toBe(true);
        // What the browser paints: author px times the zoom is the viewport px.
        expect(out.left * scale).toBeCloseTo(projected.x, 0);
        expect(out.top * scale).toBeCloseTo(projected.y, 0);
      }
    });
  }

  it('the anchor NDC fraction is aspect-independent in height: the head keeps its row', () => {
    // The camera's vertical FOV is fixed, so the head's vertical screen
    // fraction is the same on every aspect; only the horizontal spread moves.
    const rows = ASPECTS.map((vp) => {
      const projected = worldToScreen(cameraFor(vp), vp, HEAD.x, HEAD.y, HEAD.z);
      return projected.y / vp.height;
    });
    for (const row of rows) expect(row).toBeCloseTo(rows[0], 6);
  });

  it('the undivided write is the reported bug: scale 2 parks the bubble mid-screen', () => {
    const vp = ASPECTS[2];
    const projected = worldToScreen(cameraFor(vp), vp, HEAD.x, HEAD.y, HEAD.z);
    const out: WorldPromptAnchor = { left: 0, top: 0 };
    worldPromptAnchor(projected, vp, 2, 0, out);
    // The old write put the viewport pixel straight into #ui: painted at twice
    // the distance from the top-left corner, far from the head.
    const oldPaintedX = projected.x * 2;
    const newPaintedX = out.left * 2;
    expect(Math.abs(oldPaintedX - projected.x)).toBeGreaterThan(200);
    expect(Math.abs(newPaintedX - projected.x)).toBeLessThan(1);
  });
});

describe('worldPromptAnchor: the show gate', () => {
  const vp = { width: 1517, height: 633 };
  const untouched: WorldPromptAnchor = { left: -1, top: -1 };

  it('hides with no candidate in range (null projection) and leaves out untouched', () => {
    const out = { ...untouched };
    expect(worldPromptAnchor(null, vp, 1, 0, out)).toBe(false);
    expect(out).toEqual(untouched);
  });

  it('hides a target behind the camera', () => {
    const out = { ...untouched };
    expect(worldPromptAnchor({ x: 700, y: 300, behind: true }, vp, 1, 0, out)).toBe(false);
    expect(out).toEqual(untouched);
  });

  it('hides an anchor off the viewport, on either axis', () => {
    const out = { ...untouched };
    expect(worldPromptAnchor({ x: -1, y: 300, behind: false }, vp, 1, 0, out)).toBe(false);
    expect(worldPromptAnchor({ x: 1518, y: 300, behind: false }, vp, 1, 0, out)).toBe(false);
    expect(worldPromptAnchor({ x: 700, y: 634, behind: false }, vp, 1, 0, out)).toBe(false);
    expect(out).toEqual(untouched);
  });

  it('hides an anchor too near the top for the upward bubble to fit', () => {
    const out = { ...untouched };
    expect(worldPromptAnchor({ x: 700, y: 39, behind: false }, vp, 1, 40, out)).toBe(false);
    expect(worldPromptAnchor({ x: 700, y: 40, behind: false }, vp, 1, 40, out)).toBe(true);
  });

  it('hides a projection that is not a number (a headless host)', () => {
    const out = { ...untouched };
    expect(worldPromptAnchor({ x: Number.NaN, y: Number.NaN, behind: false }, vp, 1, 0, out)).toBe(
      false,
    );
    expect(out).toEqual(untouched);
  });

  it('treats an unusable scale as 1 rather than parking the bubble at infinity', () => {
    const out = { ...untouched };
    const p = { x: 700, y: 300, behind: false };
    expect(worldPromptAnchor(p, vp, 0, 0, out)).toBe(true);
    expect(out).toEqual({ left: 700, top: 300 });
    expect(worldPromptAnchor(p, vp, Number.NaN, 0, out)).toBe(true);
    expect(out).toEqual({ left: 700, top: 300 });
  });

  it('is allocation-light: the caller-owned slot is reused across frames', () => {
    const out = { ...untouched };
    worldPromptAnchor({ x: 10, y: 60, behind: false }, vp, 1, 0, out);
    const first = out;
    worldPromptAnchor({ x: 20, y: 70, behind: false }, vp, 1, 0, out);
    expect(out).toBe(first);
    expect(out).toEqual({ left: 20, top: 70 });
  });
});
