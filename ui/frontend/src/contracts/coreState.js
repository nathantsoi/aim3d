import { constructionViewportMesh, createConstructionObject } from './constructionGeometry.js';

export const ACTION_TYPES = Object.freeze({
  SELECT_ENTITY: 'ui.selectEntity',
  UPDATE_FIELD: 'ui.updateField',
  DELETE_ENTITY: 'core.deleteEntity',
  RECOMPUTE_DOCUMENT: 'core.recomputeDocument',
  CREATE_CONSTRUCTION: 'core.createConstruction',
  CREATE_SKETCH: 'core.createSketch',
  CREATE_SKETCH_ENTITY: 'core.createSketchEntity',
  GENERATE_TOOLPATH: 'cam.generateToolpath',
  RUN_SIMULATION: 'sim.runSimulation',
  CREATE_STOCK: 'sim.createStock',
  CREATE_TOOL: 'sim.createTool',
  LOAD_DOCUMENT_STATE: 'core.loadDocumentState'
});

const identityTransform = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

export const createDefaultViewportScene = () => ({
  solids: [],
  toolpaths: [],
  construction: [],
  gizmos: {
    axes: [
      { id: 'axis_x', label: 'X', color: [0.95, 0.18, 0.2, 1], points: [0, 0, 0, 1.1, 0, 0] },
      { id: 'axis_y', label: 'Y', color: [0.2, 0.82, 0.28, 1], points: [0, 0, 0, 0, 1.1, 0] },
      { id: 'axis_z', label: 'Z', color: [0.28, 0.48, 1, 1], points: [0, 0, 0, 0, 0, 1.1] }
    ],
    originVisible: true,
    originPlanes: [
      {
        id: 'origin_XY',
        color: [0.6, 0.8, 0.2, 0.25],
        positions: [
          0, 0, 0,
          0.5, 0, 0,
          0.5, 0.5, 0,
          0, 0.5, 0
        ],
        normals: [
          0, 0, 1,
          0, 0, 1,
          0, 0, 1,
          0, 0, 1
        ],
        indices: [0, 1, 2, 0, 2, 3]
      },
      {
        id: 'origin_XZ',
        color: [0.6, 0.3, 0.6, 0.25],
        positions: [
          0, 0, 0,
          0.5, 0, 0,
          0.5, 0, 0.5,
          0, 0, 0.5
        ],
        normals: [
          0, 1, 0,
          0, 1, 0,
          0, 1, 0,
          0, 1, 0
        ],
        indices: [0, 1, 2, 0, 2, 3]
      },
      {
        id: 'origin_YZ',
        color: [0.2, 0.6, 0.6, 0.25],
        positions: [
          0, 0, 0,
          0, 0.5, 0,
          0, 0.5, 0.5,
          0, 0, 0.5
        ],
        normals: [
          1, 0, 0,
          1, 0, 0,
          1, 0, 0,
          1, 0, 0
        ],
        indices: [0, 1, 2, 0, 2, 3]
      }
    ],
    grid: false,
    workOrigin: [0, 0, 0],
    debug: {
      enabled: false,
      orbitPivot: null,
      orbitActive: false,
      mainCamera: null
    }
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
    triangleCount: 0,
    segmentCount: 3,
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
  sketchParameters: [
    { name: 'd1', value: 10, unit: 'mm' },
    { name: 'd2', value: 25, unit: 'mm' }
  ],
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
  sketchConstraints: [],
  selectedEntityId: null,
  selectedEntity: null,
  features: [],
  setups: [],
  operations: [],
  gcode: '; No code posted',
  showGcodeEditor: false,
  stockSize: { x: 100, y: 100, z: 25 },
  toolDiameter: 6,
  toolLength: 25,
  toolRadius: 0,
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

export const syncViewportScene = (state) => {
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

  // Dynamic Toolhead mesh for simulation
  if (state.activeMode === 'simulation' || state.isSimulating) {
    const td = state.toolDiameter || 6;
    const tl = state.toolLength || 25;
    const offsetZ = state.stockSize?.z || 25;
    const toolPositions = [
        -td/2, -td/2, offsetZ,  td/2, -td/2, offsetZ,  td/2, td/2, offsetZ,  -td/2, td/2, offsetZ,
        -td/2, -td/2, offsetZ+tl,  td/2, -td/2, offsetZ+tl,  td/2, td/2, offsetZ+tl,  -td/2, td/2, offsetZ+tl
    ];
    const toolNormals = [
        0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
        0,0,1,  0,0,1,  0,0,1,  0,0,1
    ];
    const toolIndices = [
        0, 2, 1, 0, 3, 2,
        4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4,
        1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6,
        3, 0, 4, 3, 4, 7
    ];
    const toolColors = Array(8 * 4).fill(0).map((_, i) => {
        if (i % 4 === 0) return 0.9; // R
        if (i % 4 === 1) return 0.2; // G
        if (i % 4 === 2) return 0.2; // B
        return 0.9; // A
    });

    const toolSolid = {
      id: 'solid_toolhead',
      bodyId: 9997,
      sourceToken: 'toolhead',
      positions: toolPositions,
      normals: toolNormals,
      indices: toolIndices,
      colors: toolColors,
      transform: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ],
      pickable: null
    };
    
    state.viewportScene.solids = state.viewportScene.solids.filter(s => s.id !== 'solid_toolhead');
    state.viewportScene.solids.push(toolSolid);
  } else if (state.viewportScene?.solids) {
    state.viewportScene.solids = state.viewportScene.solids.filter(s => s.id !== 'solid_toolhead');
  }

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

  if (action.type === ACTION_TYPES.CREATE_SKETCH_ENTITY) {
    if (!state.browser) {
      state.browser = createDefaultBrowser();
    }
    const sketchId = action.meta?.sketchId ?? action.targetId;
    const entity = action.value;
    const sketch = state.browser.sketches.find((item) => item.id === sketchId);
    if (sketch && entity) {
      const entityId = `sk_ent_${sketch.entities.length + 1}`;
      sketch.entities = [...sketch.entities, { ...entity, id: entityId }];
      const feature = state.features.find((item) => item.id === sketchId);
      if (feature) {
        feature.entityCount = sketch.entities.length;
        feature.isDirty = true;
      }
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

  if (action.type === ACTION_TYPES.CREATE_STOCK) {
    const { x, y, z, kind } = action.value;
    const stockId = `feat_Stock_1`;
    const label = `Stock (${kind})`;
    
    // Create feature
    state.features = state.features.filter(f => f.id !== stockId);
    state.features.push({
      id: stockId,
      type: 'Stock',
      label,
      value: 0,
      unit: 'mm',
      isDirty: false,
      selectionToken: `${stockId}_body_0`
    });

    if (!state.browser) state.browser = createDefaultBrowser();
    state.browser.bodies = state.browser.bodies.filter(b => b.id !== stockId);
    state.browser.bodies.push({
      id: stockId,
      label: label,
      visible: true
    });

    // Generate basic box mesh for Stock
    const w = x;
    const d = y || x;
    const h = z;
    const positions = [
        0, 0, 0,  w, 0, 0,  w, d, 0,  0, d, 0,
        0, 0, h,  w, 0, h,  w, d, h,  0, d, h
    ];
    const normals = [
        0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
        0,0,1,  0,0,1,  0,0,1,  0,0,1
    ];
    const indices = [
        0, 2, 1, 0, 3, 2,
        4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4,
        1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6,
        3, 0, 4, 3, 4, 7
    ];
    const colors = Array(8 * 4).fill(0).map((_, i) => i % 4 === 3 ? 0.7 : 0.8); // slight transparency

    const stockSolid = {
      id: 'solid_stock',
      bodyId: 9998,
      sourceToken: stockId,
      positions,
      normals,
      indices,
      colors,
      transform: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ],
      pickable: {
        entityId: stockId,
        kind: 'Stock',
        priority: 5,
        snapPoints: []
      }
    };
    
    if (!state.viewportScene) state.viewportScene = createDefaultViewportScene();
    state.viewportScene.solids = state.viewportScene.solids.filter(s => s.id !== 'solid_stock');
    state.viewportScene.solids.push(stockSolid);
    
    syncViewportScene(state);
  }

  syncViewportScene(state);
  return state;
};
