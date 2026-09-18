import { createTopologyBoxSolid } from '../contracts/topologyBoxSolid.js';

// Test-only fixture: seeds a representative sample document (features, setups,
// operations, and a pickable viewport solid) into a fresh store. Production
// `createInitialCoreState` intentionally starts empty (a new document has no
// geometry), so component tests that need something to render/edit/pick seed it
// explicitly via this helper rather than relying on built-in sample data.

// Topology-complete box matching the legacy demo extents, with per-face verts
// and face/edge/vertex/body pickables so Fusion-style selection works out of
// the box on the default cube.
const SAMPLE_SOLID = createTopologyBoxSolid({
  min: [-1.8, -1.2, -0.35],
  max: [1.8, 1.2, 0.35],
  id: 'solid_MainPocket_1',
  bodyId: 2,
  sourceToken: 'feat_Extrude_1_face_0',
  kind: 'B-rep Exact Face',
  priority: 10,
  color: [0.2, 0.72, 1, 1]
});

const SAMPLE_TOOLPATH = {
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
};

export const sampleFeatures = () => [
  { id: 'feat_Sketch_1', type: 'Sketch', label: 'Base sketch', value: 0, unit: 'mm', isDirty: false, selectionToken: 'feat_Sketch_1_face_0' },
  { id: 'feat_Extrude_1', type: 'Extrude', label: 'Main pocket body', value: 10, unit: 'mm', isDirty: false, selectionToken: 'feat_Extrude_1_face_0' },
  { id: 'feat_Fillet_1', type: 'Fillet', label: 'Top edge relief', value: 2, unit: 'mm', isDirty: false, selectionToken: 'feat_Fillet_1_face_0' }
];

export const sampleSetups = () => [
  { id: 'setup_Main_1', name: 'Top setup', workOffset: 'G54', stockMode: 'fixed_box', stockAllowance: 2, units: 'mm', isDirty: false, operationIds: ['op_Pocket_1', 'op_Contour_1'] }
];

export const sampleOperations = () => [
  { id: 'op_Pocket_1', setupId: 'setup_Main_1', type: 'Pocket2D', name: 'Adaptive pocket', toolDiameter: 6, stepover: 2.4, feedRate: 800, status: 'Stale', isDirty: false },
  { id: 'op_Contour_1', setupId: 'setup_Main_1', type: 'Contour2D', name: 'Finish contour', toolDiameter: 3, stepover: 1, feedRate: 600, status: 'Ready', isDirty: false }
];

export const sampleSketchConstraints = () => [
  { id: 'con_h_1', type: 'Horizontal', glyph: '—', entities: 'Line 1' },
  { id: 'con_v_1', type: 'Vertical', glyph: '|', entities: 'Line 4' },
  { id: 'con_coin_1', type: 'Coincident', glyph: '◦', entities: 'P1, P3' },
  { id: 'con_perp_1', type: 'Perpendicular', glyph: '⊾', entities: 'Line 1, Line 4' },
  { id: 'con_par_1', type: 'Parallel', glyph: '∥', entities: 'Line 2, Line 4' },
  { id: 'con_eq_1', type: 'Equal', glyph: '=', entities: 'Line 1, Line 3' }
];

// Patches a store with the sample document. Returns the store for chaining.
export const seedSampleDocument = (store) => {
  store.$patch((state) => {
    state.features = sampleFeatures();
    state.setups = sampleSetups();
    state.operations = sampleOperations();
    state.sketchConstraints = sampleSketchConstraints();
    state.viewportScene.solids = [SAMPLE_SOLID];
    state.viewportScene.toolpaths = [SAMPLE_TOOLPATH];
  });
  return store;
};
