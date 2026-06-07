import { describe, expect, it } from 'vitest';
import { createDefaultViewportScene } from '../contracts/coreState';
import {
  buildCameraGizmoLines,
  buildCameraLookAxisLine,
  buildOrbitPivotLines,
  overviewCamera
} from './viewportDebugGizmos';
import { cameraEye } from './viewportControls';

describe('viewportDebugGizmos', () => {
  it('builds a three-axis cross for an orbit pivot', () => {
    const lines = buildOrbitPivotLines([1, 2, 3], { active: true });
    expect(lines).toHaveLength(3);
    expect(lines[0].color).toEqual([1, 0.2, 0.85, 1]);
    expect(lines[0].points[0]).toBeCloseTo(0.82, 5);
    expect(lines[0].points.slice(1, 3)).toEqual([2, 3]);
  });

  it('dims the pivot cross when the gesture is idle', () => {
    const lines = buildOrbitPivotLines([0, 0, 0], { active: false });
    expect(lines[0].color[3]).toBeLessThan(1);
  });

  it('returns no pivot lines when the pivot is missing', () => {
    expect(buildOrbitPivotLines(null)).toEqual([]);
  });

  it('builds a look axis from eye to target', () => {
    const camera = { target: [0, 0, 0], distance: 5, yaw: 0, pitch: 0 };
    const lines = buildCameraLookAxisLine(camera);
    expect(lines).toHaveLength(1);
    expect(lines[0].points.slice(0, 3)).toEqual(cameraEye(camera));
    expect(lines[0].points.slice(3)).toEqual([0, 0, 0]);
  });

  it('adds a target cross for orthographic look-axis lines', () => {
    const camera = {
      target: [0, 0, 0],
      distance: 12,
      yaw: 0,
      pitch: Math.PI / 2,
      projection: 'orthographic',
      orthoSize: 11
    };
    const lines = buildCameraLookAxisLine(camera);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('builds an orthographic frustum box for sketch cameras', () => {
    const camera = {
      target: [0, 0, 0],
      distance: 12,
      yaw: 0,
      pitch: Math.PI / 2,
      projection: 'orthographic',
      orthoSize: 11
    };
    const lines = buildCameraGizmoLines(camera);
    expect(lines.length).toBeGreaterThan(6);
  });

  it('builds a frustum wireframe for the main camera gizmo', () => {
    const camera = { target: [0, 0, 0], distance: 5, yaw: 0.5, pitch: 0.4, near: 0.01 };
    const lines = buildCameraGizmoLines(camera);
    expect(lines.length).toBeGreaterThan(4);
    expect(lines.some((line) => line.points.slice(0, 3).every((value, index) => value === cameraEye(camera)[index]))).toBe(true);
  });

  it('frames overview camera on scene bounds', () => {
    const scene = createDefaultViewportScene();
    const camera = overviewCamera(scene);
    expect(camera.target.some((value) => Math.abs(value) < 2)).toBe(true);
    expect(camera.distance).toBeGreaterThan(2);
    expect(camera.projection).toBe('perspective');
  });
});
