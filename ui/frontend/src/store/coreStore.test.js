import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { ACTION_TYPES } from '../contracts/coreState';
import { useCoreStore } from './index';

describe('core store action gateway', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('dispatches feature edits as stable JSON actions', async () => {
    const store = useCoreStore();

    expect(store.viewportScene.solids[0].sourceToken).toBe('feat_Extrude_1_face_0');
    expect(store.viewportScene.toolpaths[0].operationId).toBe('op_Pocket_1');

    await store.updateFeatureParameter('feat_Extrude_1', 14.5);

    expect(store.lastDispatchedAction).toMatchObject({
      type: ACTION_TYPES.UPDATE_FIELD,
      documentId: 'doc_1001',
      targetId: 'feat_Extrude_1',
      targetKind: 'feature',
      path: 'value',
      value: 14.5
    });
    expect(store.features.find((feature) => feature.id === 'feat_Extrude_1').isDirty).toBe(true);
  });

  it('routes setup and operation sheet edits through the same gateway', async () => {
    const store = useCoreStore();

    await store.updateSetupField('setup_Main_1', 'workOffset', 'G55');
    expect(store.lastDispatchedAction).toMatchObject({
      type: ACTION_TYPES.UPDATE_FIELD,
      targetId: 'setup_Main_1',
      targetKind: 'setup',
      path: 'workOffset',
      value: 'G55'
    });

    await store.updateOperationField('op_Pocket_1', 'toolDiameter', 8);
    expect(store.lastDispatchedAction).toMatchObject({
      type: ACTION_TYPES.UPDATE_FIELD,
      targetId: 'op_Pocket_1',
      targetKind: 'operation',
      path: 'toolDiameter',
      value: 8
    });
  });

  it('deletes a feature and clears selection through the gateway', async () => {
    const store = useCoreStore();

    await store.selectEntity('feat_Extrude_1_face_0');
    expect(store.selectedEntityId).toBe('feat_Extrude_1_face_0');

    await store.deleteEntity('feat_Extrude_1', 'feature');

    expect(store.lastDispatchedAction).toMatchObject({
      type: ACTION_TYPES.DELETE_ENTITY,
      targetId: 'feat_Extrude_1',
      targetKind: 'feature'
    });
    expect(store.features.some((feature) => feature.id === 'feat_Extrude_1')).toBe(false);
    expect(store.selectedEntityId).toBeNull();
  });

  it('removes the geometry a feature produced from the 3D scene on delete', async () => {
    const store = useCoreStore();

    expect(
      store.viewportScene.solids.some((solid) => solid.sourceToken === 'feat_Extrude_1_face_0')
    ).toBe(true);

    await store.deleteEntity('feat_Extrude_1', 'feature');

    expect(
      store.viewportScene.solids.some((solid) => solid.sourceToken === 'feat_Extrude_1_face_0')
    ).toBe(false);
    expect(store.viewportScene.solids).toHaveLength(0);
    expect(store.viewportScene.diagnostics.triangleCount).toBe(0);
  });

  it('clears orphaned toolpaths once every solid is removed', async () => {
    const store = useCoreStore();

    expect(store.viewportScene.toolpaths.length).toBeGreaterThan(0);

    await store.deleteEntity('feat_Extrude_1', 'feature');

    expect(store.viewportScene.solids).toHaveLength(0);
    expect(store.viewportScene.toolpaths).toHaveLength(0);
  });

  it('toggles the 3D viewport ground grid', () => {
    const store = useCoreStore();

    expect(store.viewportScene.gizmos.grid).toBe(false);

    store.toggleViewportGrid();
    expect(store.viewportScene.gizmos.grid).toBe(true);

    store.toggleViewportGrid();
    expect(store.viewportScene.gizmos.grid).toBe(false);
  });

  it('deletes a setup along with its operations and toolpaths', async () => {
    const store = useCoreStore();

    await store.deleteEntity('setup_Main_1', 'setup');

    expect(store.setups).toHaveLength(0);
    expect(store.operations.filter((operation) => operation.setupId === 'setup_Main_1')).toHaveLength(0);
    expect(
      store.viewportScene.toolpaths.some((toolpath) => toolpath.operationId === 'op_Pocket_1')
    ).toBe(false);
  });

  it('deletes a single operation while keeping its setup', async () => {
    const store = useCoreStore();

    await store.deleteEntity('op_Pocket_1', 'operation');

    expect(store.operations.some((operation) => operation.id === 'op_Pocket_1')).toBe(false);
    expect(store.operations.some((operation) => operation.id === 'op_Contour_1')).toBe(true);
    expect(store.setups.some((setup) => setup.id === 'setup_Main_1')).toBe(true);
  });

  it('enters and finishes sketch mode and toggles palette options', () => {
    const store = useCoreStore();

    expect(store.isSketchMode).toBe(false);

    store.enterSketchMode('feat_Sketch_1');
    expect(store.isSketchMode).toBe(true);
    expect(store.activeMode).toBe('design');
    expect(store.activeSketchId).toBe('feat_Sketch_1');

    expect(store.sketchPalette.slice).toBe(false);
    store.toggleSketchOption('slice');
    expect(store.sketchPalette.slice).toBe(true);

    store.finishSketch();
    expect(store.isSketchMode).toBe(false);
    expect(store.activeSketchId).toBeNull();
  });

  it('shows the sketch-plane grid on enter and removes it on finish', () => {
    const store = useCoreStore();

    expect(store.viewportScene.gizmos.sketchGrid).toBeFalsy();

    store.enterSketchMode('feat_Sketch_1');
    expect(store.viewportScene.gizmos.sketchGrid).toBe(true);

    store.toggleSketchOption('sketchGrid');
    expect(store.sketchPalette.sketchGrid).toBe(false);
    expect(store.viewportScene.gizmos.sketchGrid).toBe(false);

    store.toggleSketchOption('sketchGrid');
    expect(store.viewportScene.gizmos.sketchGrid).toBe(true);

    store.finishSketch();
    expect(store.viewportScene.gizmos.sketchGrid).toBe(false);
  });

  it('switches the camera to an orthographic plane view and restores it', () => {
    const store = useCoreStore();
    const original = { ...store.viewportScene.camera };

    store.enterSketchMode('feat_Sketch_1');
    expect(store.activeWorkspaceTab).toBe('sketch');
    expect(store.viewportScene.camera.projection).toBe('orthographic');
    expect(store.viewportScene.camera.yaw).toBe(0);
    expect(store.viewportScene.camera.pitch).toBe(0);

    store.finishSketch();
    expect(store.viewportScene.camera.projection).toBe(original.projection);
    expect(store.viewportScene.camera.yaw).toBe(original.yaw);
    expect(store.viewportScene.camera.pitch).toBe(original.pitch);
    expect(store.activeWorkspaceTab).toBe('solid');
  });

  it('exits sketch mode when switching workspace mode', () => {
    const store = useCoreStore();
    store.enterSketchMode();
    expect(store.isSketchMode).toBe(true);

    store.setMode('manufacture');
    expect(store.isSketchMode).toBe(false);
  });

  it('applies returned snapshots for recompute and CAM generation', async () => {
    const store = useCoreStore();

    await store.updateFeatureParameter('feat_Fillet_1', 4);
    await store.updateSetupField('setup_Main_1', 'stockAllowance', 3);
    await store.updateOperationField('op_Pocket_1', 'stepover', 1.5);
    await store.triggerParametricRecompute();

    expect(store.features.every((feature) => !feature.isDirty)).toBe(true);
    expect(store.setups.every((setup) => !setup.isDirty)).toBe(true);
    expect(store.operations.every((operation) => !operation.isDirty)).toBe(true);

    await store.runCAMGeneration('op_Pocket_1');
    expect(store.operations.find((operation) => operation.id === 'op_Pocket_1').status).toBe('Ready');
    expect(store.viewportScene.toolpaths.find((toolpath) => toolpath.operationId === 'op_Pocket_1').status).toBe('Ready');
    expect(store.viewportScene.diagnostics.triangleCount).toBeGreaterThan(0);
    expect(store.gcode).toContain('op_Pocket_1');
  });
});
