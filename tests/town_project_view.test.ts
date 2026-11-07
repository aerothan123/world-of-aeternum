// The town restoration project window (src/ui/hud/housing/town_project_view.ts
// and the townProject arm of house_event_feedback.ts): the progress text, the
// Contribute button routing to the interact key, and the complete banner.
import { describe, expect, it } from 'vitest';
import { TOWN_PROJECTS } from '../src/sim/content/town_projects';
import { handleHouseEvent } from '../src/ui/hud/housing/house_event_feedback';
import { townProjectWindowPlan } from '../src/ui/hud/housing/town_project_view';

const WELL = TOWN_PROJECTS[0];
const ev = (stage: number, bundles: number) => ({
  type: 'townProject' as const,
  pid: 1,
  projectId: WELL.id,
  stage,
  bundles,
  contributed: false,
});

describe('townProjectWindowPlan', () => {
  it('names the project, the stage, the progress and the bundle', () => {
    const plan = townProjectWindowPlan(ev(0, 12))!;
    expect(plan.canContribute).toBe(true);
    expect(plan.text).toContain('The Yard Well');
    expect(plan.text).toContain('Line the shaft');
    expect(plan.text).toContain('12');
    expect(plan.text).toContain(String(WELL.stages[0].bundlesNeeded));
    expect(plan.text).toContain('Copper Ore');
  });
  it('reads complete past the last stage and ignores an unknown project', () => {
    const done = townProjectWindowPlan(ev(WELL.stages.length, 0))!;
    expect(done.canContribute).toBe(false);
    expect(done.text).toContain('complete');
    expect(townProjectWindowPlan({ ...ev(0, 0), projectId: 'nope' })).toBeNull();
  });
});

describe('the project window', () => {
  it('opens a prompt whose Contribute presses interact; a finished project banners', () => {
    const calls: string[] = [];
    let accept: (() => void) | null = null;
    const host = {
      log: () => calls.push('log'),
      showError: () => calls.push('error'),
      showBanner: (text: string) => calls.push(`banner:${text}`),
    };
    const prompt = (_text: string, label: string, onAccept: () => void) => {
      calls.push(`prompt:${label}`);
      accept = onAccept;
      return { isConnected: true };
    };
    const world = { buyHouse: () => calls.push('buy'), interact: () => calls.push('interact') };
    handleHouseEvent(ev(1, 3), host, prompt, world);
    expect(calls).toEqual(['prompt:Contribute']);
    accept!();
    expect(calls[1]).toBe('interact');
    handleHouseEvent(ev(WELL.stages.length, 0), host, prompt, world);
    expect(calls[2]).toMatch(/^banner:/);
  });
});
