import { describe, expect, it } from 'vitest';
import { pickViewportEntity } from './viewportPicking';

const createPickScene = () => ({
  camera: {
    target: [0, 0, 0],
    distance: 5,
    yaw: 0,
    pitch: 0,
    near: 0.01,
    far: 100
  },
  solids: [{
    id: 'solid_test',
    bodyId: 7,
    sourceToken: 'face_center',
    pickable: {
      entityId: 'face_center',
      kind: 'B-rep Exact Face',
      priority: 10,
      snapPoints: [{ id: 'snap_center', kind: 'center', position: [0, 0, 0] }]
    },
    positions: [
      -1, 0, -1,
      1, 0, -1,
      1, 0, 1,
      -1, 0, 1
    ],
    indices: [0, 1, 2, 0, 2, 3]
  }]
});

describe('viewport picking', () => {
  it('returns the expected token for a known screen ray and triangle fixture', () => {
    const result = pickViewportEntity(createPickScene(), 50, 50, 100, 100);

    expect(result.hit.entityId).toBe('face_center');
    expect(result.hit.kind).toBe('B-rep Exact Face');
    expect(result.hit.snapCandidate.id).toBe('snap_center');
    expect(result.latencyMs).toBeLessThan(16);
  });

  it('returns an empty hit when the ray misses all pickable triangles', () => {
    const result = pickViewportEntity(createPickScene(), 99, 1, 100, 100);

    expect(result.hit).toBeNull();
  });
});
