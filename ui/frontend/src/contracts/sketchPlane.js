import { evaluateConstructionGeometry, ORIGIN_FRAMES } from './constructionGeometry.js';

const ORIGIN_PLANE_OPTIONS = [
  { id: 'origin_XY', label: 'Origin XY' },
  { id: 'origin_XZ', label: 'Origin XZ' },
  { id: 'origin_YZ', label: 'Origin YZ' }
];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];

export const SKETCH_GRID_EXTENT = 5;

export const planeReferenceFromToken = (token) => {
  if (!token) {
    return { kind: 'Origin', originPlane: 'XY' };
  }
  if (token.startsWith('origin_')) {
    return { kind: 'Origin', originPlane: token.replace('origin_', '') };
  }
  if (token.startsWith('con_')) {
    return { kind: 'ConstructionPlane', constructionPlane: token };
  }
  if (token.includes('_face_')) {
    return { kind: 'PlanarFace', face: token };
  }
  return { kind: 'Origin', originPlane: 'XY' };
};

export const planeFrameFromReference = (planeRef, browser = {}) => {
  if (planeRef?.kind === 'ConstructionPlane') {
    const con = browser.construction?.find((item) => item.id === planeRef.constructionPlane);
    if (con?.origin) {
      return {
        origin: [...con.origin],
        axisU: [...con.axisU],
        axisV: [...con.axisV],
        normal: [...con.normal],
        extent: con.extent ?? SKETCH_GRID_EXTENT
      };
    }
    return evaluateConstructionGeometry('OffsetPlane', 0, [planeRef.constructionPlane]);
  }
  if (planeRef?.kind === 'Origin') {
    const token = `origin_${planeRef.originPlane ?? 'XY'}`;
    const frame = ORIGIN_FRAMES[token] ?? ORIGIN_FRAMES.origin_XY;
    return { ...frame, extent: SKETCH_GRID_EXTENT };
  }
  const frame = ORIGIN_FRAMES.origin_XY;
  return { ...frame, extent: SKETCH_GRID_EXTENT };
};

export const sketchPlaneOptions = (browser = {}) => {
  const construction = browser.construction ?? [];
  const built = construction
    .filter((item) => item.category === 'plane' || item.category === 'ucs')
    .map((item) => ({ id: item.id, label: item.label }));
  return [...ORIGIN_PLANE_OPTIONS, ...built];
};

export const mapViewportPickToSketchPlane = (entityId, browser = {}) => {
  if (!entityId) return null;
  const fromPlane = sketchPlaneOptions(browser).some((option) => option.id === entityId);
  if (fromPlane || entityId.startsWith('origin_') || entityId.startsWith('con_')) {
    return entityId;
  }
  if (entityId.includes('_face_')) {
    return entityId;
  }
  return null;
};

export const canConfirmSketchPlane = (draft) =>
  typeof draft?.values?.plane === 'string' && draft.values.plane.length > 0;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Camera that looks straight at the sketch plane with an ortho frustum that fits the grid. */
export const sketchCameraSettings = (planeRef, browser = {}, gridExtent = SKETCH_GRID_EXTENT) => {
  const frame = planeFrameFromReference(planeRef, browser);
  const { origin, axisV, normal } = frame;
  const nz = normal[2];
  const pitch = Math.asin(clamp(nz, -1, 1));
  const cp = Math.cos(pitch);
  const yaw = Math.abs(cp) > 1e-6 ? Math.atan2(normal[0], normal[1]) : 0;
  const distance = Math.max(gridExtent * 2.4, 10);
  const orthoSize = gridExtent * 2.2;

  return {
    target: [...origin],
    yaw,
    pitch,
    distance,
    projection: 'orthographic',
    orthoSize,
    near: 0.01,
    far: Math.max(500, distance * 30),
    sketchUp: [...axisV]
  };
};

export const worldToSketchPlane = (planeRef, point, browser = {}) => {
  const frame = planeFrameFromReference(planeRef, browser);
  const rel = sub(point, frame.origin);
  return [dot(rel, frame.axisU), dot(rel, frame.axisV)];
};

export const sketchPlaneToWorld = (planeRef, u, v, browser = {}) => {
  const frame = planeFrameFromReference(planeRef, browser);
  return add(add(frame.origin, scale(frame.axisU, u)), scale(frame.axisV, v));
};

export const intersectRayWithSketchPlane = (ray, planeRef, browser = {}) => {
  if (!ray) return null;
  const frame = planeFrameFromReference(planeRef, browser);
  const denom = dot(ray.direction, frame.normal);
  if (Math.abs(denom) < 1e-8) return null;
  const t = dot(sub(frame.origin, ray.origin), frame.normal) / denom;
  if (t <= 1e-6) return null;
  const world = add(ray.origin, scale(ray.direction, t));
  const uv = worldToSketchPlane(planeRef, world, browser);
  return { world, uv };
};
