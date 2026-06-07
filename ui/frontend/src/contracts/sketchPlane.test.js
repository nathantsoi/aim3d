import { describe, expect, it } from 'vitest';
import { planeFrameFromReference, sketchCameraSettings, worldToSketchPlane } from './sketchPlane.js';

describe('sketchCameraSettings', () => {
  it('frames origin XY with pitch looking down +Z normal', () => {
    const settings = sketchCameraSettings({ kind: 'Origin', originPlane: 'XY' });
    expect(settings.projection).toBe('orthographic');
    expect(settings.pitch).toBeCloseTo(Math.PI / 2, 5);
    expect(settings.orthoSize).toBeGreaterThan(5);
    expect(settings.sketchUp).toEqual([0, 1, 0]);
  });

  it('maps world points to sketch UV on XZ plane', () => {
    const frame = planeFrameFromReference({ kind: 'Origin', originPlane: 'XZ' });
    const uv = worldToSketchPlane({ kind: 'Origin', originPlane: 'XZ' }, [2, 0, 3]);
    expect(uv[0]).toBeCloseTo(2, 5);
    expect(uv[1]).toBeCloseTo(3, 5);
    expect(frame.normal).toEqual([0, 1, 0]);
  });
});
