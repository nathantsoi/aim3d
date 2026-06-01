// Declarative ribbon definition modeled on Fusion 360's workspaces.
// Shape: RIBBON_MODES[mode] -> { label, tabs: [{ id, label, groups: [{ id, label, commands: [{ id, label, hotkey?, hasSubmenu?, submenu? }] }] }] }
// A command with a `submenu` array expands inline to reveal its sub-tools.
// Only the first command group of each mode is fully populated for now
// (CREATE for Design, 2D for Manufacture). Remaining groups are declared
// with labels but no commands and render as placeholder dropdowns.

const placeholderGroups = (labels) =>
  labels.map((label) => ({
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label,
    commands: []
  }));

const designCreateGroup = {
  id: 'create',
  label: 'CREATE',
  commands: [
    { id: 'create-sketch', label: 'Create Sketch', action: 'beginSketch' },
    { id: 'create-form', label: 'Create Form' },
    { id: 'derive', label: 'Derive' },
    { id: 'automated-modeling', label: 'Automated Modeling' },
    { id: 'extrude', label: 'Extrude', hotkey: 'E' },
    { id: 'revolve', label: 'Revolve' },
    { id: 'sweep', label: 'Sweep' },
    { id: 'loft', label: 'Loft' },
    { id: 'rib', label: 'Rib' },
    { id: 'web', label: 'Web' },
    { id: 'emboss', label: 'Emboss' },
    { id: 'hole', label: 'Hole', hotkey: 'H' },
    { id: 'thread', label: 'Thread' },
    { id: 'box', label: 'Box' },
    { id: 'cylinder', label: 'Cylinder' },
    { id: 'sphere', label: 'Sphere' },
    { id: 'torus', label: 'Torus' },
    { id: 'coil', label: 'Coil' },
    { id: 'pipe', label: 'Pipe' },
    { id: 'pattern', label: 'Pattern', hasSubmenu: true },
    { id: 'mirror', label: 'Mirror' },
    { id: 'thicken', label: 'Thicken' },
    { id: 'boundary-fill', label: 'Boundary Fill' },
    { id: 'create-base-feature', label: 'Create Base Feature' },
    { id: 'create-pcb', label: 'Create PCB', hasSubmenu: true },
    { id: 'joint-origin', label: 'Joint Origin' }
  ]
};

const designConstructGroup = {
  id: 'construct',
  label: 'CONSTRUCT',
  commands: [
    {
      id: 'construct-planes',
      label: 'Planes',
      submenu: [
        { id: 'ucs', label: 'User Coordinate System', action: 'beginConstruction', constructKind: 'UCS' },
        { id: 'offset-plane', label: 'Offset Plane', action: 'beginConstruction', constructKind: 'OffsetPlane' },
        { id: 'plane-at-angle', label: 'Plane at Angle', action: 'beginConstruction', constructKind: 'PlaneAtAngle' },
        { id: 'tangent-plane', label: 'Tangent Plane', action: 'beginConstruction', constructKind: 'TangentPlane' },
        { id: 'midplane', label: 'Midplane', action: 'beginConstruction', constructKind: 'Midplane' },
        { id: 'perpendicular-plane', label: 'Perpendicular Plane', action: 'beginConstruction', constructKind: 'PerpendicularPlane' },
        { id: 'plane-through-two-edges', label: 'Plane Through Two Edges', action: 'beginConstruction', constructKind: 'PlaneThroughTwoEdges' },
        { id: 'plane-through-three-points', label: 'Plane Through Three Points', action: 'beginConstruction', constructKind: 'PlaneThroughThreePoints' },
        { id: 'plane-along-path', label: 'Plane Along Path', action: 'beginConstruction', constructKind: 'PlaneAlongPath' }
      ]
    },
    {
      id: 'construct-axes',
      label: 'Axes',
      submenu: [
        { id: 'axis-through-cylinder-cone-torus', label: 'Axis Through Cylinder/Cone/Torus', action: 'beginConstruction', constructKind: 'AxisThroughCylinderConeTorus' },
        { id: 'axis-perpendicular-to-face', label: 'Axis Perpendicular To Face', action: 'beginConstruction', constructKind: 'AxisPerpendicularToFace' },
        { id: 'axis-through-two-planes', label: 'Axis Through Two Planes', action: 'beginConstruction', constructKind: 'AxisThroughTwoPlanes' },
        { id: 'axis-through-two-points', label: 'Axis Through Two Points', action: 'beginConstruction', constructKind: 'AxisThroughTwoPoints' },
        { id: 'axis-through-edge', label: 'Axis Through Edge', action: 'beginConstruction', constructKind: 'AxisThroughEdge' }
      ]
    },
    {
      id: 'construct-points',
      label: 'Points',
      submenu: [
        { id: 'point-at-vertex', label: 'Point At Vertex', action: 'beginConstruction', constructKind: 'PointAtVertex' },
        { id: 'point-through-two-edges', label: 'Point Through Two Edges', action: 'beginConstruction', constructKind: 'PointThroughTwoEdges' },
        { id: 'point-through-three-planes', label: 'Point Through Three Planes', action: 'beginConstruction', constructKind: 'PointThroughThreePlanes' },
        { id: 'point-at-center', label: 'Point At Center Of Circle/Sphere/Torus', action: 'beginConstruction', constructKind: 'PointAtCenter' },
        { id: 'point-at-edge-and-plane', label: 'Point At Edge And Plane', action: 'beginConstruction', constructKind: 'PointAtEdgeAndPlane' },
        { id: 'point-along-path', label: 'Point Along Path', action: 'beginConstruction', constructKind: 'PointAlongPath' }
      ]
    }
  ]
};

const manufacture2dGroup = {
  id: '2d',
  label: '2D',
  commands: [
    { id: '2d-adaptive-clearing', label: '2D Adaptive Clearing', action: 'generateToolpath' },
    { id: '2d-pocket', label: '2D Pocket', action: 'generateToolpath', operationId: 'op_Pocket_1' },
    { id: 'face', label: 'Face', action: 'generateToolpath' },
    { id: '2d-contour', label: '2D Contour', action: 'generateToolpath', operationId: 'op_Contour_1' },
    { id: 'slot', label: 'Slot', action: 'generateToolpath' },
    { id: 'trace', label: 'Trace', action: 'generateToolpath' },
    { id: 'thread', label: 'Thread', action: 'generateToolpath' },
    { id: 'bore', label: 'Bore', action: 'generateToolpath' },
    { id: 'circular', label: 'Circular', action: 'generateToolpath' },
    { id: 'engrave', label: 'Engrave', action: 'generateToolpath' },
    { id: '2d-chamfer', label: '2D Chamfer', action: 'generateToolpath' }
  ]
};

const manufactureActionsGroup = {
  id: 'actions',
  label: 'ACTIONS',
  commands: [
    { id: 'generate-toolpath', label: 'Generate Toolpath', action: 'generateToolpath' },
    { id: 'simulate', label: 'Simulate', action: 'runSimulation' },
    { id: 'post-process', label: 'Post Process', action: 'postProcess' },
    { id: 'recompute', label: 'Recompute', action: 'recompute' }
  ]
};

const sketchCreateGroup = {
  id: 'create',
  label: 'CREATE',
  commands: [
    { id: 'line', label: 'Line', hotkey: 'L' },
    { id: 'midpoint-line', label: 'Midpoint Line' },
    {
      id: 'rectangle',
      label: 'Rectangle',
      submenu: [
        { id: 'rectangle-2-point', label: '2-Point Rectangle', hotkey: 'R' },
        { id: 'rectangle-3-point', label: '3-Point Rectangle' },
        { id: 'rectangle-center', label: 'Center Rectangle' }
      ]
    },
    {
      id: 'circle',
      label: 'Circle',
      submenu: [
        { id: 'circle-center-diameter', label: 'Center Diameter Circle', hotkey: 'C' },
        { id: 'circle-2-point', label: '2-Point Circle' },
        { id: 'circle-3-point', label: '3-Point Circle' },
        { id: 'circle-2-tangent', label: '2-Tangent Circle' },
        { id: 'circle-3-tangent', label: '3-Tangent Circle' }
      ]
    },
    {
      id: 'arc',
      label: 'Arc',
      submenu: [
        { id: 'arc-3-point', label: '3-Point Arc', hotkey: 'A' },
        { id: 'arc-center-point', label: 'Center Point Arc' },
        { id: 'arc-tangent', label: 'Tangent Arc' }
      ]
    },
    {
      id: 'polygon',
      label: 'Polygon',
      submenu: [
        { id: 'polygon-circumscribed', label: 'Circumscribed Polygon' },
        { id: 'polygon-inscribed', label: 'Inscribed Polygon' },
        { id: 'polygon-edge', label: 'Edge Polygon' }
      ]
    },
    { id: 'ellipse', label: 'Ellipse' },
    {
      id: 'slot',
      label: 'Slot',
      submenu: [
        { id: 'slot-center-to-center', label: 'Center to Center Slot' },
        { id: 'slot-overall', label: 'Overall Slot' },
        { id: 'slot-center-point', label: 'Center Point Slot' },
        { id: 'slot-three-point-arc', label: 'Three Point Arc Slot' },
        { id: 'slot-center-point-arc', label: 'Center Point Arc Slot' }
      ]
    },
    {
      id: 'spline',
      label: 'Spline',
      submenu: [
        { id: 'spline-fit-point', label: 'Fit Point Spline' },
        { id: 'spline-control-point', label: 'Control Point Spline' }
      ]
    },
    { id: 'conic-curve', label: 'Conic Curve' },
    { id: 'point', label: 'Point' },
    { id: 'text', label: 'Text' },
    { id: 'mirror', label: 'Mirror' },
    { id: 'circular-pattern', label: 'Circular Pattern' },
    { id: 'rectangular-pattern', label: 'Rectangular Pattern' },
    {
      id: 'project-include',
      label: 'Project / Include',
      submenu: [
        { id: 'project', label: 'Project', hotkey: 'P' },
        { id: 'include-3d-geometry', label: 'Include 3D Geometry' },
        { id: 'project-to-surface', label: 'Project to Surface' },
        { id: 'intersection-curve', label: 'Intersection Curve' }
      ]
    },
    { id: 'sketch-dimension', label: 'Sketch Dimension', hotkey: 'D' }
  ]
};

// Contextual tab shown only while sketch mode is active.
export const SKETCH_TAB = {
  id: 'sketch',
  label: 'SKETCH',
  contextual: true,
  groups: [
    sketchCreateGroup,
    ...placeholderGroups(['MODIFY', 'CONSTRAINTS', 'CONFIGURE', 'INSPECT', 'INSERT', 'SELECT'])
  ]
};

export const RIBBON_MODES = {
  design: {
    label: 'DESIGN',
    tabs: [
      {
        id: 'solid',
        label: 'SOLID',
        groups: [
          designCreateGroup,
          ...placeholderGroups(['MODIFY', 'CONFIGURE']),
          designConstructGroup,
          ...placeholderGroups(['INSPECT', 'INSERT', 'ASSEMBLE', 'SELECT'])
        ]
      },
      { id: 'surface', label: 'SURFACE', groups: placeholderGroups(['CREATE', 'MODIFY']) },
      { id: 'mesh', label: 'MESH', groups: placeholderGroups(['CREATE', 'MODIFY']) },
      { id: 'sheet-metal', label: 'SHEET METAL', groups: placeholderGroups(['CREATE', 'MODIFY']) },
      { id: 'plastic', label: 'PLASTIC', groups: placeholderGroups(['CREATE', 'MODIFY']) },
      { id: 'manage', label: 'MANAGE', groups: placeholderGroups(['UPDATE', 'CHANGES']) },
      { id: 'utilities', label: 'UTILITIES', groups: placeholderGroups(['MAKE', 'ADD-INS']) }
    ]
  },
  manufacture: {
    label: 'MANUFACTURE',
    tabs: [
      {
        id: 'milling',
        label: 'MILLING',
        groups: [
          ...placeholderGroups(['SETUP']),
          manufacture2dGroup,
          ...placeholderGroups(['3D', 'DRILLING', 'MULTI-AXIS', 'MODIFY']),
          manufactureActionsGroup,
          ...placeholderGroups(['MANAGE', 'INSPECT', 'SELECT'])
        ]
      },
      { id: 'turning', label: 'TURNING', groups: placeholderGroups(['SETUP', 'TURNING']) },
      { id: 'additive', label: 'ADDITIVE', groups: placeholderGroups(['SETUP', 'ADDITIVE']) },
      { id: 'inspection', label: 'INSPECTION', groups: placeholderGroups(['SETUP', 'PROBING']) },
      { id: 'fabrication', label: 'FABRICATION', groups: placeholderGroups(['SETUP', 'CUTTING']) },
      { id: 'utilities', label: 'UTILITIES', groups: placeholderGroups(['MAKE', 'ADD-INS']) }
    ]
  }
};

export const RIBBON_MODE_ORDER = ['design', 'manufacture'];
