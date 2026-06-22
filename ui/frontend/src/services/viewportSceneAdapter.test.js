import { describe, expect, it } from 'vitest';
import { createDefaultViewportScene } from '../contracts/coreState';
import { adaptViewportScene, createSceneBufferKey } from './viewportSceneAdapter';

const identityTransform = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

const createTestViewportScene = () => {
  const scene = createDefaultViewportScene();
  scene.solids = [
    {
      id: 'solid_MainPocket_1',
      bodyId: 2,
      sourceToken: 'feat_Extrude_1_face_0',
      pickable: {
        entityId: 'feat_Extrude_1_face_0',
        kind: 'B-rep Exact Face',
        priority: 10,
        snapPoints: [
          { id: 'solid_MainPocket_1_center', kind: 'center', position: [0, 0, 0.35] }
        ]
      },
      positions: [
        -1.8, -1.2, -0.35, 1.8, -1.2, -0.35, 1.8, 1.2, -0.35, -1.8, 1.2, -0.35,
        -1.8, -1.2, 0.35, 1.8, -1.2, 0.35, 1.8, 1.2, 0.35, -1.8, 1.2, 0.35
      ],
      normals: [
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1
      ],
      colors: [
        0.16, 0.62, 0.9, 1, 0.16, 0.62, 0.9, 1, 0.16, 0.62, 0.9, 1, 0.16, 0.62, 0.9, 1,
        0.2, 0.72, 1, 1, 0.2, 0.72, 1, 1, 0.2, 0.72, 1, 1, 0.2, 0.72, 1, 1
      ],
      indices: [
        0, 1, 2, 0, 2, 3,
        4, 6, 5, 4, 7, 6,
        0, 4, 5, 0, 5, 1,
        1, 5, 6, 1, 6, 2,
        2, 6, 7, 2, 7, 3,
        3, 7, 4, 3, 4, 0
      ],
      transform: identityTransform
    }
  ];
  scene.toolpaths = [
    {
      id: 'toolpath_op_Pocket_1',
      operationId: 'op_Pocket_1',
      status: 'Stale',
      color: [1, 0.74, 0.18, 1],
      points: [
        -1.4, -0.8, 0.55,
        -0.4, -0.8, 0.55,
        -0.4, 0.1, 0.55,
        0.8, 0.1, 0.55,
        0.8, 0.8, 0.55,
        1.4, 0.8, 0.55
      ]
    }
  ];
  return scene;
};

describe('viewport scene adapter', () => {
  it('creates typed draw buffers from the serialized scene contract', () => {
    const scene = createTestViewportScene();
    const adapted = adaptViewportScene(scene);

    expect(adapted.solidVertices).toBeInstanceOf(Float32Array);
    expect(adapted.solidIndices).toBeInstanceOf(Uint32Array);
    expect(adapted.lineVertices).toBeInstanceOf(Float32Array);
    // Origin planes added in default scene
    expect(adapted.triangleCount).toBe(54); // 12 + (3 * 14) or something
    expect(adapted.segmentCount).toBe(8);
    expect(adapted.drawCount).toBe(2);
  });

  it('uses stable keys and changes buffers when selection highlight changes', () => {
    const scene = createTestViewportScene();
    const baseKey = createSceneBufferKey(scene);
    const selectedKey = createSceneBufferKey(scene, 'feat_Extrude_1_face_0');
    const repeatedSelectedKey = createSceneBufferKey(scene, 'feat_Extrude_1_face_0');

    expect(baseKey).not.toBe(selectedKey);
    expect(selectedKey).toBe(repeatedSelectedKey);

    const selected = adaptViewportScene(scene, 'feat_Extrude_1_face_0');
    expect(Array.from(selected.solidVertices.slice(6, 10))).toEqual([1, 0.8199999928474426, 0.23999999463558197, 1]);
  });

  it('adds sketch-plane grid line segments when the grid gizmo is enabled', () => {
    const scene = createDefaultViewportScene();
    const baseline = adaptViewportScene(scene);

    scene.gizmos.sketchGrid = true;
    scene.gizmos.sketchGridFrame = {
      origin: [0, 0, 0],
      axisU: [1, 0, 0],
      axisV: [0, 1, 0],
      extent: 5
    };
    const withGrid = adaptViewportScene(scene);

    expect(withGrid.segmentCount).toBeGreaterThan(baseline.segmentCount);
    expect(withGrid.overlayLineVertices.length).toBeGreaterThan(0);
    // 21 lines per axis (extent 5, step 0.5) -> 42 grid segments added.
    expect(withGrid.segmentCount - baseline.segmentCount).toBe(42);
    expect(createSceneBufferKey(scene)).not.toBe(createSceneBufferKey(createDefaultViewportScene()));
  });

  it('adds ground-plane grid line segments when the viewport grid gizmo is enabled', () => {
    const scene = createDefaultViewportScene();
    const baseline = adaptViewportScene(scene);

    scene.gizmos.grid = true;
    const withGrid = adaptViewportScene(scene);

    expect(withGrid.segmentCount).toBeGreaterThan(baseline.segmentCount);
    expect(withGrid.segmentCount - baseline.segmentCount).toBe(42);
    expect(createSceneBufferKey(scene)).not.toBe(createSceneBufferKey(createDefaultViewportScene()));
  });

  it('renders construction planes as semi-transparent filled quads', () => {
    const scene = {
      solids: [],
      toolpaths: [],
      construction: [
        {
          id: 'construction_fill_con_Plane_1',
          token: 'con_Plane_1',
          category: 'plane',
          kind: 'OffsetPlane',
          visible: true,
          renderMode: 'planeFill',
          color: [1, 0.55, 0.15, 0.35],
          positions: [-1, -1, 10, 1, -1, 10, 1, 1, 10, -1, 1, 10],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
          indices: [0, 1, 2, 0, 2, 3]
        }
      ],
      gizmos: { axes: [] }
    };

    const adapted = adaptViewportScene(scene);
    expect(adapted.constructionIndices.length).toBe(6);
    expect(adapted.constructionVertices.length).toBe(4 * 10);
    expect(adapted.lineVertices.length).toBe(0);
    expect(adapted.triangleCount).toBe(2);
  });

  it('adds debug gizmo lines when debug mode is enabled', () => {
    const scene = createDefaultViewportScene();
    const baseline = adaptViewportScene(scene);

    scene.gizmos.debug.enabled = true;
    scene.gizmos.debug.orbitPivot = [0.5, 0.25, 0.1];
    scene.gizmos.debug.orbitActive = true;
    const withDebug = adaptViewportScene(scene);

    expect(withDebug.segmentCount).toBeGreaterThan(baseline.segmentCount);
    expect(createSceneBufferKey(scene)).not.toBe(createSceneBufferKey(createDefaultViewportScene()));
  });

  it('changes the buffer key when the orbit pivot moves', () => {
    const scene = createDefaultViewportScene();
    scene.gizmos.debug = { enabled: true, orbitPivot: [0, 0, 0], orbitActive: false, mainCamera: null };
    const firstKey = createSceneBufferKey(scene);
    scene.gizmos.debug.orbitPivot = [1, 0, 0];
    const secondKey = createSceneBufferKey(scene);
    expect(firstKey).not.toBe(secondKey);
  });

  it('preserves pickable metadata and creates separate hover highlight buffers', () => {
    const scene = createTestViewportScene();
    const hoveredKey = createSceneBufferKey(scene, null, 'feat_Extrude_1_face_0');
    const selectedKey = createSceneBufferKey(scene, 'feat_Extrude_1_face_0');
    const hovered = adaptViewportScene(scene, null, 'feat_Extrude_1_face_0');

    expect(hoveredKey).not.toBe(selectedKey);
    // Pickables order can be different
    const pickable = hovered.pickables.find(p => p.solidId === 'solid_MainPocket_1');
    expect(pickable).toMatchObject({
      solidId: 'solid_MainPocket_1',
      bodyId: 2,
      entityId: 'feat_Extrude_1_face_0',
      kind: 'B-rep Exact Face',
      priority: 10
    });
    expect(pickable.snapPoints[0].id).toBe('solid_MainPocket_1_center');
    expect(Array.from(hovered.solidVertices.slice(6, 10))).toEqual([0.5, 0.949999988079071, 1, 1]);
  });

  it('renders origin planes when originVisible is true', () => {
    const scene = createDefaultViewportScene();
    scene.gizmos.originVisible = true;
    const adapted = adaptViewportScene(scene);
    
    expect(adapted.constructionIndices.length).toBe(126);
    expect(adapted.constructionVertices.length).toBe(840);
    expect(adapted.pickables.length).toBe(21);
    expect(adapted.pickables[0]).toMatchObject({
      solidId: 'origin_XY',
      entityId: 'origin_XY',
      kind: 'Origin Plane'
    });
  });

  it('hides both axes and origin planes when originVisible is false', () => {
    const scene = createDefaultViewportScene();
    scene.gizmos.originVisible = false;
    const adapted = adaptViewportScene(scene);
    
    expect(adapted.constructionIndices.length).toBe(0);
    expect(adapted.constructionVertices.length).toBe(0);
    expect(adapted.segmentCount).toBe(0);
  });

  it('renders a translucent orange plane indicator when showSketchPlaneIndicator is true', () => {
    const scene = createDefaultViewportScene();
    scene.gizmos.showSketchPlaneIndicator = true;
    scene.gizmos.sketchGridFrame = {
      origin: [0, 0, 0],
      axisU: [1, 0, 0],
      axisV: [0, 1, 0],
      normal: [0, 0, 1],
      extent: 5
    };
    const adapted = adaptViewportScene(scene);
    
    expect(adapted.constructionIndices.length).toBe(132);
  });
});
