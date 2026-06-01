import { constructionViewportMesh, createConstructionObject } from './constructionGeometry.js';

export const ACTION_TYPES = Object.freeze({
  SELECT_ENTITY: 'ui.selectEntity',
  UPDATE_FIELD: 'ui.updateField',
  DELETE_ENTITY: 'core.deleteEntity',
  RECOMPUTE_DOCUMENT: 'core.recomputeDocument',
  CREATE_CONSTRUCTION: 'core.createConstruction',
  CREATE_SKETCH: 'core.createSketch',
  GENERATE_TOOLPATH: 'cam.generateToolpath',
  RUN_SIMULATION: 'sim.runSimulation',
  LOAD_DOCUMENT_STATE: 'core.loadDocumentState'
});

const identityTransform = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

export const createDefaultViewportScene = () => ({
  solids: [
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
  ],
  toolpaths: [
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
  ],
  construction: [],
  gizmos: {
    axes: [
      { id: 'axis_x', label: 'X', color: [0.95, 0.18, 0.2, 1], points: [0, 0, 0, 1.1, 0, 0] },
      { id: 'axis_y', label: 'Y', color: [0.2, 0.82, 0.28, 1], points: [0, 0, 0, 0, 1.1, 0] },
      { id: 'axis_z', label: 'Z', color: [0.28, 0.48, 1, 1], points: [0, 0, 0, 0, 0, 1.1] }
    ],
    grid: false,
    workOrigin: [0, 0, 0]
  },
  camera: {
    target: [0, 0, 0],
    distance: 5.2,
    yaw: 0.72,
    pitch: 0.62,
    near: 0.01,
    far: 100,
    projection: 'perspective'
  },
  diagnostics: {
    webgpuAvailable: false,
    frameTimeMs: 0,
    fps: 0,
    drawCount: 0,
    triangleCount: 12,
    segmentCount: 8,
    lastPickLatencyMs: 0,
    hoverTargetId: null,
    snapCandidateId: null
  }
});

// The hierarchical model-tree browser introduced with snapshot schemaVersion 2
// (Origin default planes, construction objects, sketches with nested entities,
// and produced bodies). v1 snapshots leave this at its empty default.
export const createDefaultBrowser = () => ({
  origin: { planes: ['origin_XY', 'origin_XZ', 'origin_YZ'], visible: true },
  construction: [],
  sketches: [],
  bodies: []
});

export const createInitialCoreState = () => ({
  activeDocumentId: 'doc_1001',
  documentPath: 'Untitled.a3d',
  schemaVersion: 1,
  browser: createDefaultBrowser(),
  activeMode: 'design',
  activeWorkspaceTab: 'solid',
  isSketchMode: false,
  activeSketchId: null,
  preSketchCamera: null,
  sketchPalette: {
    sketchGrid: true,
    snap: true,
    slice: false,
    profile: true,
    points: true,
    dimensions: true,
    constraints: true,
    projectedGeometries: true,
    constructionGeometries: true,
    threeDSketch: false
  },
  sketchConstraints: [
    { id: 'con_h_1', type: 'Horizontal', glyph: '—', entities: 'Line 1' },
    { id: 'con_v_1', type: 'Vertical', glyph: '|', entities: 'Line 4' },
    { id: 'con_coin_1', type: 'Coincident', glyph: '◦', entities: 'P1, P3' },
    { id: 'con_perp_1', type: 'Perpendicular', glyph: '⊾', entities: 'Line 1, Line 4' },
    { id: 'con_par_1', type: 'Parallel', glyph: '∥', entities: 'Line 2, Line 4' },
    { id: 'con_eq_1', type: 'Equal', glyph: '=', entities: 'Line 1, Line 3' }
  ],
  selectedEntityId: null,
  selectedEntity: null,
  features: [
    {
      id: 'feat_Sketch_1',
      type: 'Sketch',
      label: 'Base sketch',
      value: 0,
      unit: 'mm',
      isDirty: false,
      selectionToken: 'feat_Sketch_1_face_0'
    },
    {
      id: 'feat_Extrude_1',
      type: 'Extrude',
      label: 'Main pocket body',
      value: 10,
      unit: 'mm',
      isDirty: false,
      selectionToken: 'feat_Extrude_1_face_0'
    },
    {
      id: 'feat_Fillet_1',
      type: 'Fillet',
      label: 'Top edge relief',
      value: 2,
      unit: 'mm',
      isDirty: false,
      selectionToken: 'feat_Fillet_1_face_0'
    }
  ],
  setups: [
    {
      id: 'setup_Main_1',
      name: 'Top setup',
      workOffset: 'G54',
      stockMode: 'fixed_box',
      stockAllowance: 2,
      units: 'mm',
      isDirty: false,
      operationIds: ['op_Pocket_1', 'op_Contour_1']
    }
  ],
  operations: [
    {
      id: 'op_Pocket_1',
      setupId: 'setup_Main_1',
      type: 'Pocket2D',
      name: 'Adaptive pocket',
      toolDiameter: 6,
      stepover: 2.4,
      feedRate: 800,
      status: 'Stale',
      isDirty: false
    },
    {
      id: 'op_Contour_1',
      setupId: 'setup_Main_1',
      type: 'Contour2D',
      name: 'Finish contour',
      toolDiameter: 3,
      stepover: 1,
      feedRate: 600,
      status: 'Ready',
      isDirty: false
    }
  ],
  gcode: '; No code posted',
  isSimulating: false,
  simulationStats: { collisions: 0, materialRemoved: 0 },
  viewportScene: createDefaultViewportScene()
});

export const cloneCoreState = (state) => JSON.parse(JSON.stringify(state));

export const createUiAction = ({
  type,
  documentId,
  targetId = null,
  targetKind = null,
  path = null,
  value = null,
  meta = {}
}) => ({
  type,
  documentId,
  targetId,
  targetKind,
  path,
  value,
  meta,
  issuedAt: new Date().toISOString()
});

const findById = (items, id) => items.find((item) => item.id === id);

const selectionFromToken = (state, entityId) => {
  if (!entityId) return null;

  const feature = state.features.find((item) => item.selectionToken === entityId);
  if (feature) {
    return {
      id: entityId,
      type: 'B-rep Exact Face',
      parentId: feature.id,
      parentLabel: feature.label
    };
  }

  const setup = findById(state.setups, entityId);
  if (setup) {
    return {
      id: entityId,
      type: 'CAM Setup',
      parentId: state.activeDocumentId,
      parentLabel: state.documentPath
    };
  }

  const operation = findById(state.operations, entityId);
  if (operation) {
    return {
      id: entityId,
      type: operation.type,
      parentId: operation.setupId,
      parentLabel: operation.setupId
    };
  }

  return {
    id: entityId,
    type: 'Unknown Entity',
    parentId: state.activeDocumentId,
    parentLabel: state.documentPath
  };
};

const applyFieldUpdate = (state, action) => {
  if (action.targetKind === 'feature') {
    const feature = findById(state.features, action.targetId);
    if (!feature) return;
    feature.value = action.value;
    feature.isDirty = true;
    state.operations.forEach((operation) => {
      operation.status = 'Stale';
    });
  }

  if (action.targetKind === 'setup') {
    const setup = findById(state.setups, action.targetId);
    if (!setup || !action.path) return;
    setup[action.path] = action.value;
    setup.isDirty = true;
    state.operations
      .filter((operation) => operation.setupId === setup.id)
      .forEach((operation) => {
        operation.status = 'Stale';
      });
  }

  if (action.targetKind === 'operation') {
    const operation = findById(state.operations, action.targetId);
    if (!operation || !action.path) return;
    operation[action.path] = action.value;
    operation.isDirty = true;
    operation.status = 'Stale';
  }
};

const clearSelectionIf = (state, ...ids) => {
  if (ids.filter(Boolean).includes(state.selectedEntityId)) {
    state.selectedEntityId = null;
    state.selectedEntity = null;
  }
};

// A solid is "produced by" a feature when its source/pickable token resolves
// back to that feature. Tokens look like `${featureId}_face_0`, so we accept an
// exact match against the feature's selectionToken/id or a `${featureId}_`
// prefix (guarding against prefix collisions like feat_Extrude_1 vs _10).
const solidBelongsToFeature = (solid, feature) => {
  if (!solid || !feature) return false;
  const tokens = [solid.sourceToken, solid.pickable?.entityId, solid.id].filter(Boolean);
  return tokens.some((token) =>
    token === feature.selectionToken ||
    token === feature.id ||
    token.startsWith(`${feature.id}_`)
  );
};

const applyEntityDeletion = (state, action) => {
  const { targetKind, targetId } = action;

  if (targetKind === 'feature') {
    const removed = findById(state.features, targetId);
    state.features = state.features.filter((feature) => feature.id !== targetId);
    state.operations.forEach((operation) => {
      operation.status = 'Stale';
    });
    // Remove the geometry this feature produced so the 3D view stays in sync
    // with the model tree / timeline.
    if (removed && Array.isArray(state.viewportScene?.solids)) {
      state.viewportScene.solids = state.viewportScene.solids.filter(
        (solid) => !solidBelongsToFeature(solid, removed)
      );
    }
    clearSelectionIf(state, targetId, removed?.selectionToken);
  }

  if (targetKind === 'setup') {
    state.setups = state.setups.filter((setup) => setup.id !== targetId);
    state.operations = state.operations.filter((operation) => operation.setupId !== targetId);
    clearSelectionIf(state, targetId);
  }

  if (targetKind === 'operation') {
    state.operations = state.operations.filter((operation) => operation.id !== targetId);
    state.setups.forEach((setup) => {
      if (Array.isArray(setup.operationIds)) {
        setup.operationIds = setup.operationIds.filter((id) => id !== targetId);
      }
    });
    clearSelectionIf(state, targetId);
  }

  if (state.viewportScene?.toolpaths) {
    const liveOperationIds = new Set(state.operations.map((operation) => operation.id));
    state.viewportScene.toolpaths = state.viewportScene.toolpaths.filter((toolpath) =>
      liveOperationIds.has(toolpath.operationId)
    );
  }
};

const syncViewportScene = (state) => {
  if (!state.viewportScene) {
    state.viewportScene = createDefaultViewportScene();
  }

  // A toolpath only has meaning relative to a body it machines. Once every
  // solid is gone, drop any orphaned toolpaths so the 3D view doesn't keep
  // showing a path floating in empty space.
  if (Array.isArray(state.viewportScene.solids) && state.viewportScene.solids.length === 0) {
    state.viewportScene.toolpaths = [];
  }

  const readyOperationIds = new Set(
    state.operations
      .filter((operation) => operation.status === 'Ready')
      .map((operation) => operation.id)
  );

  state.viewportScene.toolpaths.forEach((toolpath) => {
    toolpath.status = readyOperationIds.has(toolpath.operationId) ? 'Ready' : 'Stale';
  });

  const triangleCount = state.viewportScene.solids.reduce(
    (count, solid) => count + Math.floor((solid.indices?.length ?? 0) / 3),
    0
  );
  const toolpathSegments = state.viewportScene.toolpaths.reduce(
    (count, toolpath) => count + Math.max(0, Math.floor((toolpath.points?.length ?? 0) / 3) - 1),
    0
  );
  const axisSegments = state.viewportScene.gizmos?.axes?.length ?? 0;
  const constructionSegments = (state.viewportScene.construction ?? []).reduce((count, item) => {
    if (item.renderMode === 'planeFill' || item.category === 'plane' || item.category === 'ucs') {
      return count;
    }
    return count + Math.max(0, Math.floor((item.points?.length ?? 0) / 6));
  }, 0);

  state.viewportScene.diagnostics = {
    ...state.viewportScene.diagnostics,
    triangleCount,
    segmentCount: toolpathSegments + axisSegments + constructionSegments
  };
};

const featureFromSnapshot = (feature) => ({
  id: feature.id,
  type: feature.type,
  label: feature.label ?? feature.type,
  value: feature.value ?? 0,
  unit: feature.unit ?? 'mm',
  isDirty: Boolean(feature.isDirty),
  selectionToken: feature.selectionToken ?? `${feature.id}_face_0`,
  // Schema v2 enrichments (absent on v1 snapshots).
  ...(feature.plane !== undefined ? { plane: feature.plane } : {}),
  ...(feature.operation !== undefined ? { operation: feature.operation } : {}),
  ...(feature.sketchId !== undefined ? { sketchId: feature.sketchId } : {}),
  ...(feature.entityCount !== undefined ? { entityCount: feature.entityCount } : {})
});

// Projects a flat core-state snapshot (emitted by the native C++/Rust core)
// onto the UI store. The core is the source of truth: features and produced
// solids are replaced wholesale, while UI-only presentation state (camera,
// gizmos, selection that still resolves) is preserved.
export const applyCoreSnapshot = (currentState, snapshot) => {
  const state = cloneCoreState(currentState);
  if (!snapshot || typeof snapshot !== 'object') {
    return state;
  }

  if (typeof snapshot.activeDocumentId === 'string') {
    state.activeDocumentId = snapshot.activeDocumentId;
  }
  if (typeof snapshot.documentPath === 'string') {
    state.documentPath = snapshot.documentPath;
  }
  if (Number.isFinite(snapshot.schemaVersion)) {
    state.schemaVersion = snapshot.schemaVersion;
  }
  if (Array.isArray(snapshot.features)) {
    state.features = snapshot.features.map(featureFromSnapshot);
  }

  // Project the hierarchical browser tree (schemaVersion >= 2). A v1 snapshot
  // omits `browser`, so the model tree falls back to the flat timeline.
  if (snapshot.browser && typeof snapshot.browser === 'object') {
    const fallback = createDefaultBrowser();
    state.browser = {
      origin: snapshot.browser.origin ?? fallback.origin,
      construction: Array.isArray(snapshot.browser.construction) ? snapshot.browser.construction : [],
      sketches: Array.isArray(snapshot.browser.sketches) ? snapshot.browser.sketches : [],
      bodies: Array.isArray(snapshot.browser.bodies) ? snapshot.browser.bodies : []
    };
  } else if (Array.isArray(snapshot.features)) {
    // No browser payload: keep the tree empty so it doesn't show stale nodes.
    state.browser = createDefaultBrowser();
  }

  if (!state.viewportScene) {
    state.viewportScene = createDefaultViewportScene();
  }
  const snapshotScene = snapshot.viewportScene ?? {};
  if (Array.isArray(snapshotScene.solids)) {
    state.viewportScene.solids = snapshotScene.solids;
  }
  if (Array.isArray(snapshotScene.toolpaths)) {
    state.viewportScene.toolpaths = snapshotScene.toolpaths;
  }
  if (Array.isArray(snapshotScene.construction)) {
    state.viewportScene.construction = snapshotScene.construction;
  } else if (!state.viewportScene.construction) {
    state.viewportScene.construction = [];
  }

  // Always derive renderable construction lines from the browser tree so planes
  // stay visible even when a snapshot omits viewportScene.construction meshes.
  if (state.browser?.construction?.length) {
    state.viewportScene.construction = state.browser.construction
      .filter((item) => item.visible !== false)
      .map((item) => constructionViewportMesh(item));
  }

  // Drop a dangling selection that no longer resolves to a live entity.
  if (state.selectedEntityId) {
    const tokens = new Set();
    state.features.forEach((feature) => {
      tokens.add(feature.id);
      if (feature.selectionToken) tokens.add(feature.selectionToken);
    });
    state.viewportScene.solids.forEach((solid) => {
      if (solid.sourceToken) tokens.add(solid.sourceToken);
      if (solid.pickable?.entityId) tokens.add(solid.pickable.entityId);
      if (solid.id) tokens.add(solid.id);
    });
    if (!tokens.has(state.selectedEntityId)) {
      state.selectedEntityId = null;
      state.selectedEntity = null;
    }
  }

  syncViewportScene(state);
  return state;
};

export const applyMockCoreAction = (currentState, action) => {
  const state = cloneCoreState(currentState);

  if (action.type === ACTION_TYPES.LOAD_DOCUMENT_STATE) {
    return applyCoreSnapshot(currentState, action.value);
  }

  if (action.type === ACTION_TYPES.SELECT_ENTITY) {
    state.selectedEntityId = action.value;
    state.selectedEntity = selectionFromToken(state, action.value);
  }

  if (action.type === ACTION_TYPES.UPDATE_FIELD) {
    applyFieldUpdate(state, action);
    syncViewportScene(state);
  }

  if (action.type === ACTION_TYPES.DELETE_ENTITY) {
    applyEntityDeletion(state, action);
    syncViewportScene(state);
  }

  if (action.type === ACTION_TYPES.RECOMPUTE_DOCUMENT) {
    state.features.forEach((feature) => {
      feature.isDirty = false;
    });
    state.setups.forEach((setup) => {
      setup.isDirty = false;
    });
    state.operations.forEach((operation) => {
      operation.isDirty = false;
    });
    syncViewportScene(state);
  }

  if (action.type === ACTION_TYPES.CREATE_SKETCH) {
    if (!state.browser) {
      state.browser = createDefaultBrowser();
    }
    const plane = action.meta?.plane ?? action.value?.plane ?? { kind: 'Origin', originPlane: 'XY' };
    const sketchCount = state.browser.sketches.length + 1;
    const sketchId = `feat_Sketch_${sketchCount}`;
    const label = `Sketch ${sketchCount}`;
    const sketch = {
      id: sketchId,
      plane,
      visible: true,
      entities: []
    };
    state.browser.sketches = [...state.browser.sketches, sketch];
    state.features = [
      ...state.features,
      {
        id: sketchId,
        type: 'Sketch',
        label,
        value: 0,
        unit: 'mm',
        isDirty: false,
        plane,
        entityCount: 0,
        selectionToken: `${sketchId}_face_0`
      }
    ];
    if (Number.isFinite(state.schemaVersion) && state.schemaVersion < 2) {
      state.schemaVersion = 2;
    }
    syncViewportScene(state);
  }

  if (action.type === ACTION_TYPES.CREATE_CONSTRUCTION) {
    if (!state.browser) {
      state.browser = createDefaultBrowser();
    }
    const kind = action.meta?.kind ?? action.value?.kind ?? 'OffsetPlane';
    const value = action.meta?.value ?? action.value?.value ?? 0;
    const inputs = action.meta?.inputs ?? action.value?.inputs ?? ['origin_XY'];
    const object = createConstructionObject(kind, value, inputs, state.browser.construction);
    state.browser.construction = [...state.browser.construction, object];
    if (!state.viewportScene) {
      state.viewportScene = createDefaultViewportScene();
    }
    if (!Array.isArray(state.viewportScene.construction)) {
      state.viewportScene.construction = [];
    }
    state.viewportScene.construction = [
      ...state.viewportScene.construction,
      constructionViewportMesh(object)
    ];
    if (Number.isFinite(state.schemaVersion) && state.schemaVersion < 2) {
      state.schemaVersion = 2;
    }
    syncViewportScene(state);
  }

  if (action.type === ACTION_TYPES.GENERATE_TOOLPATH) {
    const operation = findById(state.operations, action.targetId);
    if (operation) {
      operation.status = 'Ready';
      operation.isDirty = false;
    }
    state.gcode = [
      `; aim3d Posted G-code for ${action.targetId}`,
      'T1 M6',
      'G0 X0 Y0 Z10',
      'G1 X12 Y8 Z-2 F800',
      'G1 X24 Y8 Z-2',
      'M30'
    ].join('\n');
    syncViewportScene(state);
  }

  if (action.type === ACTION_TYPES.RUN_SIMULATION) {
    state.isSimulating = false;
    state.simulationStats = { collisions: 0, materialRemoved: 1420.5 };
  }

  syncViewportScene(state);
  return state;
};
