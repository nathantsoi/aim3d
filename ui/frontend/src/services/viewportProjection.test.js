import { describe, expect, it } from 'vitest';
import { sketchCameraSettings } from '../contracts/sketchPlane';
import { clipDepthForCameraPoint, createViewProjectionMatrix } from './viewportProjection';

describe('viewportProjection', () => {
  it('maps sketch orthographic depth into WebGPU clip range', () => {
    const camera = sketchCameraSettings({ kind: 'Origin', originPlane: 'XY' });
    const depth = clipDepthForCameraPoint(camera, [800, 600], [0, 0, 0]);

    expect(depth).toBeGreaterThanOrEqual(0);
    expect(depth).toBeLessThanOrEqual(1);
  });

  it('keeps scene geometry in clip depth for a top-down sketch camera', () => {
    const camera = sketchCameraSettings({ kind: 'Origin', originPlane: 'XY' });
    const depth = clipDepthForCameraPoint(camera, [800, 600], [0, 0, 0.35]);

    expect(depth).toBeGreaterThanOrEqual(0);
    expect(depth).toBeLessThanOrEqual(1);
  });

  it('builds a view-projection matrix for orthographic cameras', () => {
    const camera = sketchCameraSettings({ kind: 'Origin', originPlane: 'XY' });
    const matrix = createViewProjectionMatrix(camera, 800, 600);
    expect(matrix).toHaveLength(16);
    expect(matrix.some((value) => Number.isFinite(value))).toBe(true);
  });
});
