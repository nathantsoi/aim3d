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
});
