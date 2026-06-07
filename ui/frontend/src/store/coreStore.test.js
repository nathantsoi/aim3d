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

  it('toggles viewport debug mode', () => {
    const store = useCoreStore();

    expect(store.viewportScene.gizmos.debug.enabled).toBe(false);

    store.toggleViewportDebugMode();
    expect(store.viewportScene.gizmos.debug.enabled).toBe(true);

    store.toggleViewportDebugMode();
    expect(store.viewportScene.gizmos.debug.enabled).toBe(false);
  });

  it('stores orbit pivot debug state', () => {
    const store = useCoreStore();

    store.setViewportOrbitDebug({ pivot: [1, 2, 3], active: true });
    expect(store.viewportScene.gizmos.debug.orbitPivot).toEqual([1, 2, 3]);
    expect(store.viewportScene.gizmos.debug.orbitActive).toBe(true);

    store.setViewportOrbitDebug({ active: false });
    expect(store.viewportScene.gizmos.debug.orbitActive).toBe(false);
    expect(store.viewportScene.gizmos.debug.orbitPivot).toEqual([1, 2, 3]);
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

  it('shows sketch plane selection before creating a new sketch', async () => {
    const store = useCoreStore();
    const initialSketchCount = store.browser.sketches.length;

    store.beginSketchCreation();
    expect(store.pendingSketchCreation).toBeTruthy();
    expect(store.isSketchMode).toBe(false);
    expect(store.viewportScene.gizmos.sketchGrid).toBe(true);
    expect(store.viewportScene.gizmos.sketchGridFrame?.normal).toEqual([0, 0, 1]);
    expect(store.viewportScene.camera.projection).toBe('orthographic');

    await store.confirmSketchCreation();

    expect(store.pendingSketchCreation).toBeNull();
    expect(store.browser.sketches.length).toBe(initialSketchCount + 1);
    expect(store.isSketchMode).toBe(true);
    expect(store.activeSketchId).toBe(store.browser.sketches.at(-1).id);
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

  it('switches the camera to an orthographic plane view and restores it', async () => {
    const store = useCoreStore();
    const original = { ...store.viewportScene.camera };

    await store.createSketch({ kind: 'Origin', originPlane: 'XY' });
    const sketchId = store.browser.sketches.at(-1).id;
    store.enterSketchMode(sketchId);
    expect(store.activeWorkspaceTab).toBe('sketch');
    expect(store.viewportScene.camera.projection).toBe('orthographic');
    expect(store.viewportScene.camera.pitch).toBeCloseTo(Math.PI / 2, 5);
    expect(store.viewportScene.gizmos.sketchGridFrame?.normal).toEqual([0, 0, 1]);

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

describe('core snapshot projection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const sketchRectExtrudeSnapshot = () => ({
    activeDocumentId: 'doc_2002',
    documentPath: 'Untitled.a3d',
    features: [
      { id: 'feat_Sketch_1', type: 'Sketch', label: 'Sketch1', value: 0, unit: 'mm', isDirty: false, selectionToken: 'feat_Sketch_1_face_0' },
      { id: 'feat_Extrude_1', type: 'Extrude', label: 'Extrude1', value: 10, unit: 'mm', isDirty: false, selectionToken: 'feat_Extrude_1_face_0' }
    ],
    viewportScene: {
      solids: [
        {
          id: 'solid_1',
          bodyId: 1,
          sourceToken: 'feat_Extrude_1_face_0',
          pickable: { entityId: 'feat_Extrude_1_face_0', kind: 'B-rep Exact Face', priority: 10, snapPoints: [] },
          positions: [0, 0, 0, 2, 0, 0, 2, 1, 0],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          colors: [],
          indices: [0, 1, 2]
        }
      ],
      toolpaths: []
    }
  });

  it('projects a core snapshot from a scripted sketch/rectangle/extrude onto the store', () => {
    const store = useCoreStore();

    store.loadCoreSnapshot(sketchRectExtrudeSnapshot());

    expect(store.activeDocumentId).toBe('doc_2002');
    expect(store.features.map((feature) => feature.type)).toEqual(['Sketch', 'Extrude']);
    expect(store.features.find((feature) => feature.id === 'feat_Extrude_1').value).toBe(10);
    expect(store.viewportScene.solids).toHaveLength(1);
    expect(store.viewportScene.solids[0].sourceToken).toBe('feat_Extrude_1_face_0');
    expect(store.viewportScene.diagnostics.triangleCount).toBe(1);
  });

  it('projects a schemaVersion 2 browser tree (origin, construction, sketches, bodies)', () => {
    const store = useCoreStore();

    store.loadCoreSnapshot({
      schemaVersion: 2,
      activeDocumentId: 'doc_4004',
      documentPath: 'Untitled.a3d',
      features: [
        { id: 'feat_Sketch_1', type: 'Sketch', label: 'feat_Sketch_1', value: 0, unit: 'mm', isDirty: false, plane: { kind: 'Origin', originPlane: 'XY' }, entityCount: 1, selectionToken: 'feat_Sketch_1_face_0' },
        { id: 'feat_Extrude_1', type: 'Extrude', label: 'Extrude1', value: 10, unit: 'mm', isDirty: false, operation: 'NewBody', sketchId: 'feat_Sketch_1', selectionToken: 'feat_Extrude_1_face_0' }
      ],
      browser: {
        origin: { planes: ['origin_XY', 'origin_XZ', 'origin_YZ'], visible: true },
        construction: [{ id: 'con_Plane_1', kind: 'OffsetPlane', category: 'plane', label: 'Plane1', value: 5, visible: true, inputs: ['origin_XY'] }],
        sketches: [{ id: 'feat_Sketch_1', plane: { kind: 'Origin', originPlane: 'XY' }, visible: true, entities: [{ id: 'sk_ent_1', kind: 'Rectangle2Point', points: [[0, 0], [2, 1]], construction: false }] }],
        bodies: [{ id: 'body_1', name: 'Body1', sourceFeature: 'feat_Extrude_1' }]
      },
      viewportScene: { solids: [], toolpaths: [] }
    });

    expect(store.schemaVersion).toBe(2);
    expect(store.browser.origin.planes).toEqual(['origin_XY', 'origin_XZ', 'origin_YZ']);
    expect(store.browser.construction).toHaveLength(1);
    expect(store.browser.construction[0].id).toBe('con_Plane_1');
    expect(store.browser.sketches[0].entities.map((entity) => entity.kind)).toEqual(['Rectangle2Point']);
    expect(store.browser.bodies[0].sourceFeature).toBe('feat_Extrude_1');
    expect(store.features.find((feature) => feature.id === 'feat_Extrude_1').operation).toBe('NewBody');
  });

  it('leaves the browser tree empty for a v1 snapshot without a browser payload', () => {
    const store = useCoreStore();

    store.loadCoreSnapshot(sketchRectExtrudeSnapshot());

    expect(store.browser.construction).toEqual([]);
    expect(store.browser.sketches).toEqual([]);
    expect(store.browser.bodies).toEqual([]);
  });

  it('guides center diameter circle creation with viewport picks', async () => {
    const store = useCoreStore();
    await store.createSketch({ kind: 'Origin', originPlane: 'XY' });
    const sketchId = store.browser.sketches.at(-1).id;
    store.enterSketchMode(sketchId);

    store.beginSketchElement('CircleCenterDiameter', 'Center Diameter Circle');
    expect(store.pendingSketchElement?.activeFieldKey).toBe('center');

    const ray = {
      origin: [0, 0, 10],
      direction: [0, 0, -1]
    };
    expect(store.applyViewportSketchPick(ray)).toBe(true);
    expect(store.pendingSketchElement.values.center).toEqual([0, 0]);
    expect(store.pendingSketchElement.activeFieldKey).toBe('radius');

    store.updateSketchElementDraft({ radius: 'd1' });
    await store.confirmSketchElement();

    expect(store.pendingSketchElement).toBeNull();
    const sketch = store.browser.sketches.find((item) => item.id === sketchId);
    expect(sketch.entities).toHaveLength(1);
    expect(sketch.entities[0].radius).toBe(10);
    expect(store.viewportScene.sketchOverlay?.points?.length).toBeGreaterThan(0);
  });

  it('creates construction geometry after the CONSTRUCT command is confirmed', async () => {
    const store = useCoreStore();
    store.beginConstructionCommand('OffsetPlane', 'Offset Plane');
    expect(store.pendingConstruction).toBeTruthy();
    expect(store.viewportScene.previewConstruction?.renderMode).toBe('planeFill');

    await store.confirmConstructionCommand();

    expect(store.pendingConstruction).toBeNull();
    expect(store.browser.construction).toHaveLength(1);
    expect(store.browser.construction[0].kind).toBe('OffsetPlane');
    expect(store.browser.construction[0].category).toBe('plane');
    expect(store.viewportScene.construction).toHaveLength(1);
    expect(store.viewportScene.construction[0].renderMode).toBe('planeFill');
    expect(store.viewportScene.construction[0].positions.length).toBe(12);
  });

  it('projects an empty new-document snapshot as a blank timeline and viewport', () => {
    const store = useCoreStore();

    store.loadCoreSnapshot({
      activeDocumentId: 'doc_3003',
      documentPath: 'Untitled.a3d',
      features: [],
      viewportScene: { solids: [], toolpaths: [] }
    });

    expect(store.features).toEqual([]);
    expect(store.viewportScene.solids).toEqual([]);
    expect(store.viewportScene.toolpaths).toEqual([]);
    expect(store.viewportScene.diagnostics.triangleCount).toBe(0);
  });

  it('drops a stale selection that the new snapshot no longer contains', () => {
    const store = useCoreStore();

    store.selectedEntityId = 'feat_Pocket_99_face_0';
    store.selectedEntity = { id: 'feat_Pocket_99_face_0', type: 'B-rep Exact Face' };

    store.loadCoreSnapshot(sketchRectExtrudeSnapshot());

    expect(store.selectedEntityId).toBeNull();
    expect(store.selectedEntity).toBeNull();
  });
});
