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
