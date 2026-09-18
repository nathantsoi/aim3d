import { describe, expect, it } from 'vitest';
import {
  createTopologyBoxSolid,
  ensureSolidTopology
} from './topologyBoxSolid.js';
import { pickViewportEntity } from '../services/viewportPicking.js';
import { adaptViewportScene } from '../services/viewportSceneAdapter.js';

describe('topology box solid', () => {
  it('emits six faces, twelve edges, eight vertices, and a body token', () => {
    const solid = createTopologyBoxSolid({
      min: [-1, -1, -1],
      max: [1, 1, 1],
      bodyId: 2,
      sourceToken: 'feat_Extrude_1_face_0'
    });

    expect(solid.bodyToken).toBe('body:2');
    expect(solid.faceRanges).toHaveLength(6);
    expect(solid.edgePickables).toHaveLength(12);
    expect(solid.vertexPickables).toHaveLength(8);
    expect(solid.positions.length / 3).toBe(24); // unique verts per face
    expect(solid.indices.length / 3).toBe(12);
    expect(solid.faceRanges[0].token).toBe('body:2/face:0');
    expect(solid.edgePickables[0].token).toBe('body:2/edge:0');
    expect(solid.vertexPickables[0].token).toBe('body:2/vertex:0');
  });

  it('upgrades a shared-vertex demo cube so face pick and highlight work', () => {
    const legacy = {
      id: 'solid_MainPocket_1',
      bodyId: 2,
      sourceToken: 'feat_Extrude_1_face_0',
      pickable: { entityId: 'feat_Extrude_1_face_0', kind: 'B-rep Exact Face', priority: 10 },
      positions: [
        -1.8, -1.2, -0.35, 1.8, -1.2, -0.35, 1.8, 1.2, -0.35, -1.8, 1.2, -0.35,
        -1.8, -1.2, 0.35, 1.8, -1.2, 0.35, 1.8, 1.2, 0.35, -1.8, 1.2, 0.35
      ],
      indices: [
        0, 1, 2, 0, 2, 3,
        4, 6, 5, 4, 7, 6,
        0, 4, 5, 0, 5, 1,
        1, 5, 6, 1, 6, 2,
        2, 6, 7, 2, 7, 3,
        3, 7, 4, 3, 4, 0
      ]
    };

    const upgraded = ensureSolidTopology(legacy);
    expect(upgraded.faceRanges).toHaveLength(6);
    expect(upgraded.edgePickables).toHaveLength(12);
    expect(upgraded.bodyToken).toBe('body:2');

    const scene = {
      camera: { target: [0, 0, 0], distance: 5, yaw: 0, pitch: 0, near: 0.01, far: 100 },
      solids: [legacy]
    };
    // Ray through screen center hits the front face of the upgraded cube.
    const facePick = pickViewportEntity(scene, 50, 50, 100, 100, {
      filters: { bodyFaces: true, bodyEdges: false, bodyVertices: false, bodies: true }
    });
    expect(facePick.hit?.kind).toBe('face');
    expect(facePick.hit?.entityId).toMatch(/^body:2\/face:\d+$/);

    const bodyPick = pickViewportEntity(scene, 50, 50, 100, 100, { priority: 'body' });
    expect(bodyPick.hit?.kind).toBe('body');
    expect(bodyPick.hit?.entityId).toBe('body:2');

    const adapted = adaptViewportScene(scene, [facePick.hit.entityId], null);
    // Find the selected face's first vertex color (10 floats per vertex).
    const solid = ensureSolidTopology(legacy);
    const range = solid.faceRanges.find((r) => r.token === facePick.hit.entityId);
    expect(range).toBeTruthy();
    const firstIndex = solid.indices[range.triangleStart * 3];
    const colorOffset = firstIndex * 10 + 6;
    const selectedColor = Array.from(adapted.solidVertices.slice(colorOffset, colorOffset + 4));
    expect(selectedColor[0]).toBeCloseTo(1, 5);
    expect(selectedColor[1]).toBeCloseTo(0.82, 5);
  });
});
