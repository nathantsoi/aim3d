export const ACTION_TYPES = Object.freeze({
  SELECT_ENTITY: 'ui.selectEntity',
  UPDATE_FIELD: 'ui.updateField',
  RECOMPUTE_DOCUMENT: 'core.recomputeDocument',
  GENERATE_TOOLPATH: 'cam.generateToolpath',
  RUN_SIMULATION: 'sim.runSimulation'
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
  gizmos: {
    axes: [
      { id: 'axis_x', label: 'X', color: [0.95, 0.18, 0.2, 1], points: [0, 0, 0, 1.1, 0, 0] },
      { id: 'axis_y', label: 'Y', color: [0.2, 0.82, 0.28, 1], points: [0, 0, 0, 0, 1.1, 0] },
      { id: 'axis_z', label: 'Z', color: [0.28, 0.48, 1, 1], points: [0, 0, 0, 0, 0, 1.1] }
    ],
    workOrigin: [0, 0, 0]
  },
  camera: {
    target: [0, 0, 0],
    distance: 5.2,
    yaw: 0.72,
    pitch: 0.62,
    near: 0.01,
    far: 100
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

export const createInitialCoreState = () => ({
  activeDocumentId: 'doc_1001',
  documentPath: 'Untitled.a3d',
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

const syncViewportScene = (state) => {
  if (!state.viewportScene) {
    state.viewportScene = createDefaultViewportScene();
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

  state.viewportScene.diagnostics = {
    ...state.viewportScene.diagnostics,
    triangleCount,
    segmentCount: toolpathSegments + axisSegments
  };
};

export const applyMockCoreAction = (currentState, action) => {
  const state = cloneCoreState(currentState);

  if (action.type === ACTION_TYPES.SELECT_ENTITY) {
    state.selectedEntityId = action.value;
    state.selectedEntity = selectionFromToken(state, action.value);
  }

  if (action.type === ACTION_TYPES.UPDATE_FIELD) {
    applyFieldUpdate(state, action);
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
