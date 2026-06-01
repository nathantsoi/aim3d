const ORIGIN_FRAMES = {
  origin_XY: {
    origin: [0, 0, 0],
    axisU: [1, 0, 0],
    axisV: [0, 1, 0],
    normal: [0, 0, 1]
  },
  origin_XZ: {
    origin: [0, 0, 0],
    axisU: [1, 0, 0],
    axisV: [0, 0, 1],
    normal: [0, 1, 0]
  },
  origin_YZ: {
    origin: [0, 0, 0],
    axisU: [0, 1, 0],
    axisV: [0, 0, 1],
    normal: [1, 0, 0]
  }
};

const PLANE_KINDS = new Set([
  'UCS',
  'OffsetPlane',
  'PlaneAtAngle',
  'TangentPlane',
  'Midplane',
  'PerpendicularPlane',
  'PlaneThroughTwoEdges',
  'PlaneThroughThreePoints',
  'PlaneAlongPath'
]);

const AXIS_KINDS = new Set([
  'AxisThroughCylinderConeTorus',
  'AxisPerpendicularToFace',
  'AxisThroughTwoPlanes',
  'AxisThroughTwoPoints',
  'AxisThroughEdge'
]);

const POINT_KINDS = new Set([
  'PointAtVertex',
  'PointThroughTwoEdges',
  'PointThroughThreePlanes',
  'PointAtCenter',
  'PointAtEdgeAndPlane',
  'PointAlongPath'
]);

// Semi-transparent construction plane fill (Fusion-style orange).
export const CONSTRUCTION_PLANE_FILL_COLOR = [1, 0.55, 0.15, 0.35];

export const constructionCategoryFromKind = (kind) => {
  if (kind === 'UCS') return 'ucs';
  if (PLANE_KINDS.has(kind)) return 'plane';
  if (AXIS_KINDS.has(kind)) return 'axis';
  if (POINT_KINDS.has(kind)) return 'point';
  return 'plane';
};

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
const normalize = (v) => {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len <= 1e-12) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

export const evaluateConstructionGeometry = (kind, value = 0, inputs = []) => {
  const category = constructionCategoryFromKind(kind);
  const ref = inputs[0] ?? 'origin_XY';
  const frame = ORIGIN_FRAMES[ref] ?? ORIGIN_FRAMES.origin_XY;
  let { origin, axisU, axisV, normal } = {
    origin: [...frame.origin],
    axisU: [...frame.axisU],
    axisV: [...frame.axisV],
    normal: [...frame.normal]
  };
  let extent = 4;

  if (category === 'plane' || kind === 'UCS') {
    if (kind === 'PlaneAtAngle') {
      const radians = (value * Math.PI) / 180;
      axisV = normalize(add(scale(axisV, Math.cos(radians)), scale(normal, Math.sin(radians))));
      normal = normalize(cross(axisU, axisV));
    } else if (kind === 'OffsetPlane' || kind === 'Midplane' || kind === 'TangentPlane') {
      origin = add(origin, scale(normal, value || 10));
    } else if (kind === 'PerpendicularPlane') {
      normal = normalize(axisU);
      axisU = [0, 0, 1];
      axisV = normalize(cross(normal, axisU));
      axisU = normalize(cross(axisV, normal));
    }
    return { origin, axisU, axisV, normal, extent, category };
  }

  if (category === 'axis') {
    origin = [0, 0, 0];
    axisU = kind === 'AxisPerpendicularToFace' || kind === 'AxisThroughTwoPlanes' ? [0, 1, 0] : [1, 0, 0];
    normal = [...axisU];
    extent = 3;
    return { origin, axisU, axisV: [0, 1, 0], normal, extent, category };
  }

  if (category === 'point') {
    origin = kind === 'PointAtCenter' ? [1, 0.5, 0] : kind === 'PointAlongPath' ? [0.5, 0.5, 0.5] : [0, 0, 0];
    extent = 0.15;
    return { origin, axisU: [1, 0, 0], axisV: [0, 1, 0], normal: [0, 0, 1], extent, category };
  }

  return { origin, axisU, axisV, normal, extent, category };
};

const appendLine = (points, x0, y0, z0, x1, y1, z1) => {
  points.push(x0, y0, z0, x1, y1, z1);
};

const planeCornersFromGeometry = ({ origin, axisU, axisV, extent }) => {
  const [ox, oy, oz] = origin;
  const [ux, uy, uz] = axisU;
  const [vx, vy, vz] = axisV;
  const e = extent;
  return [
    [ox - ux * e - vx * e, oy - uy * e - vy * e, oz - uz * e - vz * e],
    [ox + ux * e - vx * e, oy + uy * e - vy * e, oz + uz * e - vz * e],
    [ox + ux * e + vx * e, oy + uy * e + vy * e, oz + uz * e + vz * e],
    [ox - ux * e + vx * e, oy - uy * e + vy * e, oz - uz * e + vz * e]
  ];
};

export const constructionPlaneFillMesh = (object, options = {}) => {
  const { id, kind, category, visible = true, value = 0, inputs = [] } = object;
  const geometry =
    Array.isArray(object.origin) && Array.isArray(object.axisU) && Array.isArray(object.axisV)
      ? object
      : evaluateConstructionGeometry(kind, value, inputs);
  const { normal } = geometry;
  const corners = planeCornersFromGeometry(geometry);
  const color = options.preview
    ? [CONSTRUCTION_PLANE_FILL_COLOR[0], CONSTRUCTION_PLANE_FILL_COLOR[1], CONSTRUCTION_PLANE_FILL_COLOR[2], 0.22]
    : [...CONSTRUCTION_PLANE_FILL_COLOR];
  const [nx, ny, nz] = normal;
  const positions = corners.flat();
  const normals = [nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz];
  return {
    id: `construction_fill_${id}`,
    token: id,
    category: category ?? 'plane',
    kind,
    visible,
    renderMode: 'planeFill',
    color,
    positions,
    normals,
    indices: [0, 1, 2, 0, 2, 3]
  };
};

export const constructionViewportMesh = (object, options = {}) => {
  const { id, kind, category, visible = true, value = 0, inputs = [] } = object;
  const geometry =
    Array.isArray(object.origin) && Array.isArray(object.axisU) && Array.isArray(object.axisV)
      ? object
      : evaluateConstructionGeometry(kind, value, inputs);
  const { origin, axisU, axisV, extent } = geometry;
  const resolvedCategory = category ?? constructionCategoryFromKind(kind);

  if (resolvedCategory === 'plane' || kind === 'UCS') {
    return constructionPlaneFillMesh(
      { id, kind, category: resolvedCategory, visible, value, inputs, ...geometry },
      options
    );
  }

  const mesh = {
    id: `construction_${id}`,
    token: id,
    category: resolvedCategory,
    kind,
    visible,
    color: [0.95, 0.85, 0.25, 1],
    points: []
  };

  const [ox, oy, oz] = origin;
  const [ux, uy, uz] = axisU;
  const e = extent;

  if (resolvedCategory === 'axis') {
    appendLine(mesh.points, ox - ux * e, oy - uy * e, oz - uz * e, ox + ux * e, oy + uy * e, oz + uz * e);
    return mesh;
  }

  if (resolvedCategory === 'point') {
    mesh.color = [1, 0.45, 0.2, 1];
    appendLine(mesh.points, ox - e, oy, oz, ox + e, oy, oz);
    appendLine(mesh.points, ox, oy - e, oz, ox, oy + e, oz);
    appendLine(mesh.points, ox, oy, oz - e, ox, oy, oz + e);
  }

  return mesh;
};

export const nextConstructionIdentity = (construction, kind) => {
  const category = constructionCategoryFromKind(kind);
  const prefix = {
    ucs: 'Ucs',
    plane: 'Plane',
    axis: 'Axis',
    point: 'Point'
  }[category];
  const labelPrefix = {
    ucs: 'UCS ',
    plane: 'Plane ',
    axis: 'Axis ',
    point: 'Point '
  }[category];
  const count = construction.filter((item) => item.category === category).length + 1;
  return {
    id: `con_${prefix}_${count}`,
    label: `${labelPrefix}${count}`,
    category
  };
};

export const createConstructionObject = (kind, value = 0, inputs = [], construction = []) => {
  const geometry = evaluateConstructionGeometry(kind, value, inputs);
  const identity = nextConstructionIdentity(construction, kind);
  return {
    id: identity.id,
    kind,
    category: identity.category,
    label: identity.label,
    value,
    visible: true,
    inputs: [...inputs],
    origin: geometry.origin,
    axisU: geometry.axisU,
    axisV: geometry.axisV,
    normal: geometry.normal,
    extent: geometry.extent
  };
};
