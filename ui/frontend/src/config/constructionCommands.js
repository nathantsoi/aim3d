// Interactive CONSTRUCT command definitions: each tool lists the inputs the user
// must confirm before the feature is committed to the model tree.

const ORIGIN_PLANE_OPTIONS = [
  { id: 'origin_XY', label: 'Origin XY' },
  { id: 'origin_XZ', label: 'Origin XZ' },
  { id: 'origin_YZ', label: 'Origin YZ' }
];

const ORIGIN_AXIS_OPTIONS = [
  { id: 'axis_x', label: 'Origin X Axis' },
  { id: 'axis_y', label: 'Origin Y Axis' },
  { id: 'axis_z', label: 'Origin Z Axis' }
];

const field = (key, type, label, extra = {}) => ({ key, type, label, ...extra });

export const CONSTRUCTION_COMMAND_DEFS = {
  UCS: {
    label: 'User Coordinate System',
    category: 'plane',
    fields: [
      field('origin', 'point', 'Origin', { placeholder: 'Pick a vertex or point' }),
      field('xAxis', 'axis', 'X axis', { placeholder: 'Pick an edge or axis' }),
      field('yAxis', 'axis', 'Y axis', { placeholder: 'Pick an edge or axis' })
    ],
    buildParams(values) {
      return { inputs: [values.origin || 'origin_XY', values.xAxis || 'axis_x', values.yAxis || 'axis_y'], value: 0 };
    }
  },
  OffsetPlane: {
    label: 'Offset Plane',
    category: 'plane',
    fields: [
      field('plane', 'plane', 'Plane', { default: 'origin_XY' }),
      field('distance', 'number', 'Offset distance', { default: 10, unit: 'mm', bindValue: true })
    ],
    buildParams(values) {
      return { inputs: [values.plane || 'origin_XY'], value: Number(values.distance ?? 10) };
    }
  },
  PlaneAtAngle: {
    label: 'Plane at Angle',
    category: 'plane',
    fields: [
      field('plane', 'plane', 'Plane', { default: 'origin_XY' }),
      field('axis', 'axis', 'Rotation axis'),
      field('angle', 'number', 'Angle', { default: 45, unit: 'deg', bindValue: true })
    ],
    buildParams(values) {
      return {
        inputs: [values.plane || 'origin_XY', values.axis || 'axis_x'],
        value: Number(values.angle ?? 45)
      };
    }
  },
  TangentPlane: {
    label: 'Tangent Plane',
    category: 'plane',
    fields: [
      field('face', 'face', 'Cylindrical face'),
      field('plane', 'plane', 'Reference plane', { default: 'origin_XY' })
    ],
    buildParams(values) {
      return { inputs: [values.plane || 'origin_XY', values.face || ''], value: 0 };
    }
  },
  Midplane: {
    label: 'Midplane',
    category: 'plane',
    fields: [
      field('planeA', 'plane', 'First plane'),
      field('planeB', 'plane', 'Second plane')
    ],
    buildParams(values) {
      return { inputs: [values.planeA || 'origin_XY', values.planeB || 'origin_XZ'], value: 0 };
    }
  },
  PerpendicularPlane: {
    label: 'Perpendicular Plane',
    category: 'plane',
    fields: [
      field('plane', 'plane', 'Plane', { default: 'origin_XY' }),
      field('edge', 'edge', 'Line or edge')
    ],
    buildParams(values) {
      return { inputs: [values.plane || 'origin_XY', values.edge || ''], value: 0 };
    }
  },
  PlaneThroughTwoEdges: {
    label: 'Plane Through Two Edges',
    category: 'plane',
    fields: [
      field('edgeA', 'edge', 'First edge'),
      field('edgeB', 'edge', 'Second edge')
    ],
    buildParams(values) {
      return { inputs: [values.edgeA || '', values.edgeB || ''], value: 0 };
    }
  },
  PlaneThroughThreePoints: {
    label: 'Plane Through Three Points',
    category: 'plane',
    fields: [
      field('pointA', 'point', 'First point'),
      field('pointB', 'point', 'Second point'),
      field('pointC', 'point', 'Third point')
    ],
    buildParams(values) {
      return { inputs: [values.pointA || '', values.pointB || '', values.pointC || ''], value: 0 };
    }
  },
  PlaneAlongPath: {
    label: 'Plane Along Path',
    category: 'plane',
    fields: [
      field('path', 'path', 'Path or curve'),
      field('parameter', 'number', 'Position along path', { default: 0.5, bindValue: true, min: 0, max: 1, step: 0.01 })
    ],
    buildParams(values) {
      return { inputs: [values.path || ''], value: Number(values.parameter ?? 0.5) };
    }
  },
  AxisThroughCylinderConeTorus: {
    label: 'Axis Through Cylinder/Cone/Torus',
    category: 'axis',
    fields: [field('face', 'face', 'Cylindrical or conical face')]
  },
  AxisPerpendicularToFace: {
    label: 'Axis Perpendicular To Face',
    category: 'axis',
    fields: [field('face', 'face', 'Planar face')]
  },
  AxisThroughTwoPlanes: {
    label: 'Axis Through Two Planes',
    category: 'axis',
    fields: [
      field('planeA', 'plane', 'First plane'),
      field('planeB', 'plane', 'Second plane')
    ],
    buildParams(values) {
      return { inputs: [values.planeA || 'origin_XY', values.planeB || 'origin_XZ'], value: 0 };
    }
  },
  AxisThroughTwoPoints: {
    label: 'Axis Through Two Points',
    category: 'axis',
    fields: [
      field('pointA', 'point', 'First point'),
      field('pointB', 'point', 'Second point')
    ],
    buildParams(values) {
      return { inputs: [values.pointA || '', values.pointB || ''], value: 0 };
    }
  },
  AxisThroughEdge: {
    label: 'Axis Through Edge',
    category: 'axis',
    fields: [field('edge', 'edge', 'Linear edge')]
  },
  PointAtVertex: {
    label: 'Point At Vertex',
    category: 'point',
    fields: [field('vertex', 'vertex', 'Vertex')]
  },
  PointThroughTwoEdges: {
    label: 'Point Through Two Edges',
    category: 'point',
    fields: [
      field('edgeA', 'edge', 'First edge'),
      field('edgeB', 'edge', 'Second edge')
    ],
    buildParams(values) {
      return { inputs: [values.edgeA || '', values.edgeB || ''], value: 0 };
    }
  },
  PointThroughThreePlanes: {
    label: 'Point Through Three Planes',
    category: 'point',
    fields: [
      field('planeA', 'plane', 'First plane'),
      field('planeB', 'plane', 'Second plane'),
      field('planeC', 'plane', 'Third plane')
    ],
    buildParams(values) {
      return { inputs: [values.planeA || 'origin_XY', values.planeB || 'origin_XZ', values.planeC || 'origin_YZ'], value: 0 };
    }
  },
  PointAtCenter: {
    label: 'Point At Center Of Circle/Sphere/Torus',
    category: 'point',
    fields: [field('face', 'face', 'Circular or spherical face')]
  },
  PointAtEdgeAndPlane: {
    label: 'Point At Edge And Plane',
    category: 'point',
    fields: [
      field('edge', 'edge', 'Edge'),
      field('plane', 'plane', 'Plane', { default: 'origin_XY' })
    ],
    buildParams(values) {
      return { inputs: [values.edge || '', values.plane || 'origin_XY'], value: 0 };
    }
  },
  PointAlongPath: {
    label: 'Point Along Path',
    category: 'point',
    fields: [
      field('path', 'path', 'Path or curve'),
      field('parameter', 'number', 'Position along path', { default: 0.5, bindValue: true, min: 0, max: 1, step: 0.01 })
    ],
    buildParams(values) {
      return { inputs: [values.path || ''], value: Number(values.parameter ?? 0.5) };
    }
  }
};

// Default buildParams when only pick fields exist.
Object.values(CONSTRUCTION_COMMAND_DEFS).forEach((def) => {
  if (!def.buildParams) {
    def.buildParams = (values) => {
      const inputs = def.fields
        .filter((item) => item.type !== 'number')
        .map((item) => values[item.key] || '')
        .filter(Boolean);
      const numberField = def.fields.find((item) => item.bindValue);
      return { inputs: inputs.length ? inputs : ['origin_XY'], value: numberField ? Number(values[numberField.key] ?? 0) : 0 };
    };
  }
});

export const getConstructionCommandDef = (kind) => CONSTRUCTION_COMMAND_DEFS[kind] ?? null;

export const defaultFieldValues = (def) => {
  const values = {};
  def.fields.forEach((item) => {
    if (item.default !== undefined) {
      values[item.key] = item.default;
    } else if (item.type === 'number') {
      values[item.key] = item.default ?? 0;
    } else {
      values[item.key] = '';
    }
  });
  return values;
};

export const canConfirmConstructionDraft = (draft) => {
  if (!draft?.kind) return false;
  const def = getConstructionCommandDef(draft.kind);
  if (!def) return false;
  return def.fields.every((item) => {
    if (item.type === 'number') {
      return Number.isFinite(Number(draft.values[item.key]));
    }
    const value = draft.values[item.key];
    return typeof value === 'string' && value.length > 0;
  });
};

export const buildConstructionParams = (draft) => {
  const def = getConstructionCommandDef(draft.kind);
  if (!def) {
    return { inputs: ['origin_XY'], value: 0 };
  }
  return def.buildParams(draft.values);
};

export const pickOptionsForField = (fieldType, browser = {}) => {
  const construction = browser.construction ?? [];
  if (fieldType === 'plane') {
    const built = construction
      .filter((item) => item.category === 'plane' || item.category === 'ucs')
      .map((item) => ({ id: item.id, label: item.label }));
    return [...ORIGIN_PLANE_OPTIONS, ...built];
  }
  if (fieldType === 'axis') {
    const built = construction
      .filter((item) => item.category === 'axis')
      .map((item) => ({ id: item.id, label: item.label }));
    return [...ORIGIN_AXIS_OPTIONS, ...built];
  }
  if (fieldType === 'point') {
    return construction
      .filter((item) => item.category === 'point')
      .map((item) => ({ id: item.id, label: item.label }));
  }
  return [];
};

export const mapViewportPickToField = (entityId, fieldType, browser = {}) => {
  if (!entityId) return null;
  if (fieldType === 'plane') {
    if (entityId.startsWith('origin_')) return entityId;
    const plane = browser.construction?.find((item) => item.id === entityId && item.category === 'plane');
    return plane?.id ?? null;
  }
  if (fieldType === 'axis') {
    if (entityId === 'axis_x' || entityId === 'axis_y' || entityId === 'axis_z') return entityId;
    const axis = browser.construction?.find((item) => item.id === entityId && item.category === 'axis');
    return axis?.id ?? null;
  }
  if (fieldType === 'point') {
    const point = browser.construction?.find((item) => item.id === entityId && item.category === 'point');
    return point?.id ?? null;
  }
  if (fieldType === 'face' && entityId.includes('_face_')) return entityId;
  if (fieldType === 'edge' && entityId.includes('_edge_')) return entityId;
  if (fieldType === 'vertex' && entityId.includes('_vertex_')) return entityId;
  return entityId;
};
