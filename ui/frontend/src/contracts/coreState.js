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

export const createAxisCylinder = (id, label, color, axisIndex, ox = 0, oy = 0, oz = 0, length = 1.1, radius = 0.015, segments = 6) => {
  const positions = [];
  const normals = [];
  const indices = [];
  
  for (let i = 0; i < segments; i++) {
    const theta0 = (i / segments) * Math.PI * 2;
    const theta1 = ((i + 1) / segments) * Math.PI * 2;
    
    const c0 = Math.cos(theta0) * radius;
    const s0 = Math.sin(theta0) * radius;
    const c1 = Math.cos(theta1) * radius;
    const s1 = Math.sin(theta1) * radius;
    
    const p = (v1, v2, l) => {
      if (axisIndex === 0) return [ox + l, oy + v1, oz + v2];
      if (axisIndex === 1) return [ox + v2, oy + l, oz + v1];
      return [ox + v1, oy + v2, oz + l];
    };
    
    const b0 = p(c0, s0, 0);
    const b1 = p(c1, s1, 0);
    const t0 = p(c0, s0, length);
    const t1 = p(c1, s1, length);
    
    const pN = (v1, v2, l) => {
      if (axisIndex === 0) return [l, v1, v2];
      if (axisIndex === 1) return [v2, l, v1];
      return [v1, v2, l];
    };
    
    const nx = Math.cos((theta0 + theta1) / 2);
    const ny = Math.sin((theta0 + theta1) / 2);
    const n = pN(nx, ny, 0);
    
    const baseIndex = positions.length / 3;
    positions.push(...b0, ...b1, ...t1, ...t0);
    normals.push(...n, ...n, ...n, ...n);
    indices.push(
      baseIndex, baseIndex + 1, baseIndex + 2,
      baseIndex, baseIndex + 2, baseIndex + 3
    );
  }
  
  return { id, label, color, positions, normals, indices };
};

export const createDefaultViewportScene = () => ({
  solids: [],
  toolpaths: [],
  construction: [],
  gizmos: {
    axes: [
      createAxisCylinder('axis_x', 'X', [0.95, 0.18, 0.2, 1], 0),
      createAxisCylinder('axis_y', 'Y', [0.2, 0.82, 0.28, 1], 1),
      createAxisCylinder('axis_z', 'Z', [0.28, 0.48, 1, 1], 2)
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
  units: 'inch',
  stockSize: { x: 1, y: 1, z: 1, kind: 'cuboid' },
  stockLocation: { x: 0, y: 0, z: 0 },
  simulationResolution: 256,
  toolDiameter: 0.25,
  toolLength: 1,
  toolRadius: 0,
  toolholderDiameter: 2,
  toolholderLength: 1,
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

  if (state.browser?.origin?.visible !== undefined) {
    state.viewportScene.gizmos.originVisible = state.browser.origin.visible;
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

  // Dynamic Stock mesh for simulation
  const hasStockFeature = (
    state.features.some(f => f.type === 'Stock') || 
    state.pendingStockSetup || 
    state.activeMode === 'machine' || 
    state.isSimulating
  ) && (state.showStock !== false);
  if (hasStockFeature) {
    const x = state.pendingStockSetup?.x ?? state.stockSize?.x ?? 1;
    const y = state.pendingStockSetup?.y ?? state.stockSize?.y ?? 1;
    const z = state.pendingStockSetup?.z ?? state.stockSize?.z ?? 1;
    const kind = state.pendingStockSetup?.kind ?? state.stockSize?.kind ?? 'cuboid';
    const locX = state.pendingStockSetup?.locX ?? state.stockLocation?.x ?? 0;
    const locY = state.pendingStockSetup?.locY ?? state.stockLocation?.y ?? 0;
    const locZ = state.pendingStockSetup?.locZ ?? state.stockLocation?.z ?? 0;
    
    let stockPositions = [];
    let stockNormals = [];
    let stockIndices = [];
    let stockColors = [];
    
    if (kind === 'cylinder') {
      const radius = x / 2;
      const h = z;
      const segments = 32;
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const cx = Math.cos(theta) * radius;
        const cy = Math.sin(theta) * radius;
        
        // Bottom circle
        stockPositions.push(cx + locX, cy + locY, 0 + locZ);
        stockNormals.push(0, 0, -1);
        stockColors.push(c, c, c, 0.7);
        
        // Top circle
        stockPositions.push(cx + locX, cy + locY, h + locZ);
        stockNormals.push(0, 0, 1);
        
        // Side bottom
        stockPositions.push(cx + locX, cy + locY, 0 + locZ);
        stockNormals.push(cx, cy, 0);
        stockColors.push(c, c, c, 0.7);
        
        // Side top
        stockPositions.push(cx + locX, cy + locY, h + locZ);
        stockNormals.push(cx, cy, 0);
        
        const c = i % 2 === 0 ? 0.7 : 0.8;
        stockColors.push(c, c, c, 0.7, c, c, c, 0.7, c, c, c, 0.7, c, c, c, 0.7);
        
        if (i < segments) {
          const base = i * 4;
          // Sides
          stockIndices.push(base + 2, base + 6, base + 3);
          stockIndices.push(base + 3, base + 6, base + 7);
        }
      }
      
      // Caps
      const centerBottom = stockPositions.length / 3;
      stockPositions.push(0 + locX, 0 + locY, 0 + locZ);
      stockNormals.push(0, 0, -1);
      stockColors.push(0.7, 0.7, 0.7, 0.7);
      
      const centerTop = stockPositions.length / 3;
      stockPositions.push(0 + locX, 0 + locY, h + locZ);
      stockNormals.push(0, 0, 1);
      stockColors.push(0.8, 0.8, 0.8, 0.7);
      
      for (let i = 0; i < segments; i++) {
        stockIndices.push(centerBottom, i * 4, ((i + 1) % segments) * 4);
        stockIndices.push(centerTop, ((i + 1) % segments) * 4 + 1, i * 4 + 1);
      }
    } else {
      const w = x;
      const d = y;
      const h = z;
      stockPositions = [
          0 + locX, 0 + locY, 0 + locZ,  w + locX, 0 + locY, 0 + locZ,  w + locX, d + locY, 0 + locZ,  0 + locX, d + locY, 0 + locZ,
          0 + locX, 0 + locY, h + locZ,  w + locX, 0 + locY, h + locZ,  w + locX, d + locY, h + locZ,  0 + locX, d + locY, h + locZ
      ];
      stockNormals = [
          0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
          0,0,1,  0,0,1,  0,0,1,  0,0,1
      ];
      stockIndices = [
          0, 2, 1, 0, 3, 2,
          4, 5, 6, 4, 6, 7,
          0, 1, 5, 0, 5, 4,
          1, 2, 6, 1, 6, 5,
          2, 3, 7, 2, 7, 6,
          3, 0, 4, 3, 4, 7
      ];
      stockColors = Array(8 * 4).fill(0).map((_, i) => i % 4 === 3 ? 0.7 : 0.8);
    }
    
    // Override with simulated mesh if available
    if (state.simulatedStockMesh && state.simulatedStockMesh.positions?.length > 0) {
      stockPositions = state.simulatedStockMesh.positions;
      stockNormals = state.simulatedStockMesh.normals;
      stockIndices = state.simulatedStockMesh.indices;
      // Re-generate solid colors based on the number of vertices
      const numVerts = stockPositions.length / 3;
      stockColors = new Array(numVerts * 4);
      for (let i = 0; i < numVerts * 4; i++) {
        stockColors[i] = i % 4 === 3 ? 0.8 : 0.7;
      }
    }
    
    const stockSolid = {
      id: 'solid_stock',
      bodyId: 9998,
      sourceToken: 'feat_Stock_1',
      positions: stockPositions,
      normals: stockNormals,
      indices: stockIndices,
      colors: stockColors,
      transform: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ],
      pickable: {
        entityId: 'feat_Stock_1',
        kind: 'Stock',
        priority: 5,
        snapPoints: []
      }
    };
    
    state.viewportScene.solids = state.viewportScene.solids.filter(s => s.id !== 'solid_stock');
    if (!state.viewportScene.solids.some(s => s.id === 'solid_simulated_stock')) {
      state.viewportScene.solids.push(stockSolid);
    }
  } else if (state.viewportScene?.solids) {
    state.viewportScene.solids = state.viewportScene.solids.filter(s => s.id !== 'solid_stock');
  }

  // Dynamic Toolhead mesh for simulation
  if (state.activeMode === 'machine' || state.isSimulating) {
    const td = state.toolDiameter || 6;
    const tl = state.toolLength || 25;
    
    const hd = state.toolholderDiameter || 20;
    const hl = state.toolholderLength || 30;
    
    // Position tool at current simulation position, or fall back to top of stock
    const tX = state.simulationToolPosition?.[0] ?? 0;
    const tY = state.simulationToolPosition?.[1] ?? 0;
    const tZ = state.simulationToolPosition?.[2] ?? (state.pendingStockSetup?.z ?? state.stockSize?.z ?? 25);
    
    const toolPositions = [];
    const toolNormals = [];
    const toolIndices = [];
    const toolColors = [];
    
    const segments = 32;
    
    // Generate Cylinder function
    const generateCylinder = (radius, z0, z1, r, g, b, a) => {
      const startVertex = toolPositions.length / 3;
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const cx = tX + Math.cos(theta) * radius;
        const cy = tY + Math.sin(theta) * radius;
        
        // Bottom circle
        toolPositions.push(cx, cy, z0);
        toolNormals.push(0, 0, -1);
        
        // Top circle
        toolPositions.push(cx, cy, z1);
        toolNormals.push(0, 0, 1);
        
        // Side bottom
        toolPositions.push(cx, cy, z0);
        toolNormals.push(cx, cy, 0);
        
        // Side top
        toolPositions.push(cx, cy, z1);
        toolNormals.push(cx, cy, 0);
        
        const shade = i % 2 === 0 ? 1.0 : 0.9;
        toolColors.push(r*shade, g*shade, b*shade, a, r*shade, g*shade, b*shade, a, r*shade, g*shade, b*shade, a, r*shade, g*shade, b*shade, a);
        
        if (i < segments) {
          const base = startVertex + i * 4;
          // Sides
          toolIndices.push(base + 2, base + 6, base + 3);
          toolIndices.push(base + 3, base + 6, base + 7);
        }
      }
      
      // Caps
      const centerBottom = toolPositions.length / 3;
      toolPositions.push(tX, tY, z0);
      toolNormals.push(0, 0, -1);
      toolColors.push(r, g, b, a);
      
      const centerTop = toolPositions.length / 3;
      toolPositions.push(tX, tY, z1);
      toolNormals.push(0, 0, 1);
      toolColors.push(r, g, b, a);
      
      for (let i = 0; i < segments; i++) {
        toolIndices.push(centerBottom, startVertex + i * 4, startVertex + ((i + 1) % segments) * 4);
        toolIndices.push(centerTop, startVertex + ((i + 1) % segments) * 4 + 1, startVertex + i * 4 + 1);
      }
    };

    // Tool body (red)
    generateCylinder(td/2, tZ, tZ + tl, 0.9, 0.2, 0.2, 0.9);
    // Tool holder (dark gray)
    generateCylinder(hd/2, tZ + tl, tZ + tl + hl, 0.3, 0.3, 0.3, 1.0);

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
      pickable: null,
      _positionKey: `${tX},${tY},${tZ}`
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

  // Dynamic G54 Frame
  if (state.activeMode === 'machine' && state.showG54Frame && state.workOffsets && state.workOffsets[54]) {
    const ox = state.workOffsets[54][0] || 0;
    const oy = state.workOffsets[54][1] || 0;
    const oz = state.workOffsets[54][2] || 0;
    
    const size = 1.1; // Same size as normal origin frame
    
    // Remove old g54 axes
    state.viewportScene.gizmos.axes = state.viewportScene.gizmos.axes.filter(a => !a.id.startsWith('g54_axis_'));
    
    state.viewportScene.gizmos.axes.push(
      createAxisCylinder('g54_axis_x', 'G54 X', [0.95, 0.4, 0.2, 1], 0, ox, oy, oz, size),
      createAxisCylinder('g54_axis_y', 'G54 Y', [0.4, 0.95, 0.2, 1], 1, ox, oy, oz, size),
      createAxisCylinder('g54_axis_z', 'G54 Z', [0.2, 0.6, 1.0, 1], 2, ox, oy, oz, size)
    );
  } else if (state.viewportScene?.gizmos?.axes) {
    state.viewportScene.gizmos.axes = state.viewportScene.gizmos.axes.filter(a => !a.id.startsWith('g54_axis_'));
  }

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
    
    syncViewportScene(state);
    
    syncViewportScene(state);
  }

  syncViewportScene(state);
  return state;
};
