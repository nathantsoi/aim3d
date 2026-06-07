import { describe, expect, it } from 'vitest';
import {
  buildSketchElementFromDraft,
  canConfirmSketchElement,
  getSketchCommandDef
} from './sketchCommands.js';

describe('sketchCommands', () => {
  it('builds a center diameter circle from draft values', () => {
    const draft = {
      kind: 'CircleCenterDiameter',
      values: { center: [0, 0], radius: 'd1' }
    };
    const resolve = (raw) => (raw === 'd1' ? 12 : Number(raw));
    expect(canConfirmSketchElement(draft, resolve)).toBe(true);
    const element = buildSketchElementFromDraft(draft, resolve);
    expect(element.kind).toBe('CircleCenterDiameter');
    expect(element.radius).toBe(12);
    expect(element.points[0]).toEqual([0, 0]);
  });

  it('requires both corners for a 2-point rectangle', () => {
    const def = getSketchCommandDef('Rectangle2Point');
    expect(def.fields).toHaveLength(2);
    expect(
      canConfirmSketchElement(
        { kind: 'Rectangle2Point', values: { cornerA: [0, 0], cornerB: null } },
        Number
      )
    ).toBe(false);
  });
});
