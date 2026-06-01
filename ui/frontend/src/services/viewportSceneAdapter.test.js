import { describe, expect, it } from 'vitest';
import { createDefaultViewportScene } from '../contracts/coreState';
import { adaptViewportScene, createSceneBufferKey } from './viewportSceneAdapter';

describe('viewport scene adapter', () => {
  it('creates typed draw buffers from the serialized scene contract', () => {
    const scene = createDefaultViewportScene();
    const adapted = adaptViewportScene(scene);

    expect(adapted.solidVertices).toBeInstanceOf(Float32Array);
    expect(adapted.solidIndices).toBeInstanceOf(Uint32Array);
    expect(adapted.lineVertices).toBeInstanceOf(Float32Array);
    expect(adapted.triangleCount).toBe(12);
    expect(adapted.segmentCount).toBe(8);
    expect(adapted.drawCount).toBe(2);
  });

  it('uses stable keys and changes buffers when selection highlight changes', () => {
    const scene = createDefaultViewportScene();
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
    const withGrid = adaptViewportScene(scene);

    expect(withGrid.segmentCount).toBeGreaterThan(baseline.segmentCount);
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

  it('preserves pickable metadata and creates separate hover highlight buffers', () => {
    const scene = createDefaultViewportScene();
    const hoveredKey = createSceneBufferKey(scene, null, 'feat_Extrude_1_face_0');
    const selectedKey = createSceneBufferKey(scene, 'feat_Extrude_1_face_0');
    const hovered = adaptViewportScene(scene, null, 'feat_Extrude_1_face_0');

    expect(hoveredKey).not.toBe(selectedKey);
    expect(hovered.pickables[0]).toMatchObject({
      solidId: 'solid_MainPocket_1',
      bodyId: 2,
      entityId: 'feat_Extrude_1_face_0',
      kind: 'B-rep Exact Face',
      priority: 10
    });
    expect(hovered.pickables[0].snapPoints[0].id).toBe('solid_MainPocket_1_center');
    expect(Array.from(hovered.solidVertices.slice(6, 10))).toEqual([0.5, 0.949999988079071, 1, 1]);
  });
});
