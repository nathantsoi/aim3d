import { describe, expect, it } from 'vitest';
import { pickAllViewportEntities, pickViewportEntity } from './viewportPicking';

// A single-face plane at y = 0 with topology-aware pick data: one face range,
// one edge through the origin, and one vertex at the origin. The default camera
// (yaw 0 / pitch 0) looks down -Y, so world origin projects to screen center.
const createTopologyScene = () => ({
  camera: { target: [0, 0, 0], distance: 5, yaw: 0, pitch: 0, near: 0.01, far: 100 },
  solids: [{
    id: 'solid_topo',
    bodyId: 7,
    sourceToken: 'feat_Extrude_1_face_0',
    bodyToken: 'body:7',
    pickable: { entityId: 'feat_Extrude_1_face_0', kind: 'B-rep Exact Face', priority: 10, snapPoints: [] },
    positions: [-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
    faceRanges: [{ token: 'body:7/face:0', kind: 'face', triangleStart: 0, triangleCount: 2 }],
    edgePickables: [{ token: 'body:7/edge:0', kind: 'edge', points: [-1, 0, 0, 1, 0, 0] }],
    vertexPickables: [{ token: 'body:7/vertex:0', kind: 'vertex', position: [0, 0, 0] }]
  }]
});

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
    expect(result.hit.kind).toBe('face');
    expect(result.hit.snapCandidate.id).toBe('snap_center');
    expect(result.latencyMs).toBeLessThan(16);
  });

  it('returns an empty hit when the ray misses all pickable triangles', () => {
    const result = pickViewportEntity(createPickScene(), 99, 1, 100, 100);

    expect(result.hit).toBeNull();
  });

  it('can pick origin planes when originVisible is true', () => {
    const scene = createPickScene();
    scene.gizmos = {
      originVisible: true,
      originPlanes: [
        {
          id: 'origin_XZ',
          color: [0.6, 0.3, 0.6, 0.25],
          positions: [
            0, 0, 0,
            0.5, 0, 0,
            0.5, 0, 0.5,
            0, 0, 0.5
          ],
          indices: [0, 1, 2, 0, 2, 3]
        }
      ]
    };

    // The solid has priority 10, while the origin plane has priority -10.
    // At x = 45, y = 45, the ray intersects both the solid (Y = 0) and the origin XZ plane.
    // The solid should win because it has higher priority.
    const pick1 = pickViewportEntity(scene, 45, 45, 100, 100);
    expect(pick1.hit.entityId).toBe('face_center');

    // If we clear solids, we should pick the origin plane XZ
    scene.solids = [];
    const pick2 = pickViewportEntity(scene, 45, 45, 100, 100);
    expect(pick2.hit.entityId).toBe('origin_XZ');
    expect(pick2.hit.kind).toBe('workGeometry');

    // If originVisible is false, we should not pick the origin plane
    scene.gizmos.originVisible = false;
    const pick3 = pickViewportEntity(scene, 45, 45, 100, 100);
    expect(pick3.hit).toBeNull();
  });

  it('resolves a triangle hit to its face range token', () => {
    const scene = createTopologyScene();
    // Off-center so no vertex/edge steals the pick; still on the face.
    const pick = pickViewportEntity(scene, 70, 30, 100, 100, {
      filters: { bodyFaces: true, bodyEdges: false, bodyVertices: false }
    });
    expect(pick.hit.kind).toBe('face');
    expect(pick.hit.entityId).toBe('body:7/face:0');
  });

  it('prefers a nearby vertex, then edge, over the face at the same pixel', () => {
    const scene = createTopologyScene();
    const vertex = pickViewportEntity(scene, 50, 50, 100, 100);
    expect(vertex.hit.kind).toBe('vertex');
    expect(vertex.hit.entityId).toBe('body:7/vertex:0');

    const edge = pickViewportEntity(scene, 50, 50, 100, 100, {
      filters: { bodyFaces: true, bodyEdges: true, bodyVertices: false }
    });
    expect(edge.hit.kind).toBe('edge');
    expect(edge.hit.entityId).toBe('body:7/edge:0');
  });

  it('promotes a face hit to its body under Select Body Priority', () => {
    const scene = createTopologyScene();
    const pick = pickViewportEntity(scene, 70, 30, 100, 100, { priority: 'body' });
    expect(pick.hit.kind).toBe('body');
    expect(pick.hit.entityId).toBe('body:7');
  });

  it('excludes an entity class when its selection filter is off', () => {
    const scene = createTopologyScene();
    const pick = pickViewportEntity(scene, 70, 30, 100, 100, {
      filters: { bodyFaces: false, bodyEdges: false, bodyVertices: false }
    });
    expect(pick.hit).toBeNull();
  });

  it('lists overlapping entities front-to-back for Select Other', () => {
    const scene = createTopologyScene();
    const { candidates } = pickAllViewportEntities(scene, 50, 50, 100, 100);
    const kinds = candidates.map((c) => c.kind);
    expect(kinds).toContain('face');
    expect(kinds).toContain('edge');
    expect(kinds).toContain('vertex');
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i].distance).toBeGreaterThanOrEqual(candidates[i - 1].distance);
    }
  });
});
