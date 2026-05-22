export const ACTION_TYPES = Object.freeze({
  SELECT_ENTITY: 'ui.selectEntity',
  UPDATE_FIELD: 'ui.updateField',
  RECOMPUTE_DOCUMENT: 'core.recomputeDocument',
  GENERATE_TOOLPATH: 'cam.generateToolpath',
  RUN_SIMULATION: 'sim.runSimulation'
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
  simulationStats: { collisions: 0, materialRemoved: 0 }
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

export const applyMockCoreAction = (currentState, action) => {
  const state = cloneCoreState(currentState);

  if (action.type === ACTION_TYPES.SELECT_ENTITY) {
    state.selectedEntityId = action.value;
    state.selectedEntity = selectionFromToken(state, action.value);
  }

  if (action.type === ACTION_TYPES.UPDATE_FIELD) {
    applyFieldUpdate(state, action);
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
  }

  if (action.type === ACTION_TYPES.RUN_SIMULATION) {
    state.isSimulating = false;
    state.simulationStats = { collisions: 0, materialRemoved: 1420.5 };
  }

  return state;
};
