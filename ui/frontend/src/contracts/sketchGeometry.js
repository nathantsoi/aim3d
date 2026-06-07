import { planeFrameFromReference, sketchPlaneToWorld } from './sketchPlane.js';

const SKETCH_PREVIEW_COLOR = [0.2, 0.85, 1, 0.95];

const appendSegment = (points, a, b) => {
  points.push(a[0], a[1], a[2], b[0], b[1], b[2]);
};

export const resolveSketchNumeric = (raw, parameters = []) => {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  const text = String(raw ?? '').trim();
  if (!text) return NaN;
  const direct = Number(text);
  if (Number.isFinite(direct)) return direct;
  const param = parameters.find((item) => item.name === text);
  if (param) return Number(param.value);
  try {
    const names = Object.fromEntries(parameters.map((item) => [item.name, item.value]));
    // eslint-disable-next-line no-new-func
    const evaluated = Function(...Object.keys(names), `return (${text});`)(...Object.values(names));
    return Number.isFinite(evaluated) ? evaluated : NaN;
  } catch {
    return NaN;
  }
};

export const sketchElementPreviewMesh = (draft, planeRef, browser, resolveNumeric) => {
  if (!draft?.kind) return null;
  const toWorld = (uv) => (uv ? sketchPlaneToWorld(planeRef, uv[0], uv[1], browser) : null);
  const points = [];
  const values = draft.values ?? {};

  if (draft.kind === 'Line' && values.start && values.end) {
    const a = toWorld(values.start);
    const b = toWorld(values.end);
    if (a && b) appendSegment(points, a, b);
  }

  if (draft.kind === 'Rectangle2Point' && values.cornerA && values.cornerB) {
    const a = toWorld(values.cornerA);
    const b = toWorld(values.cornerB);
    if (a && b) {
      const c1 = [a[0], b[1], a[2]];
      const c2 = [b[0], a[1], a[2]];
      appendSegment(points, a, c1);
      appendSegment(points, c1, b);
      appendSegment(points, b, c2);
      appendSegment(points, c2, a);
    }
  }

  if (draft.kind === 'RectangleCenter' && values.center && values.corner) {
    const center = values.center;
    const du = values.corner[0] - center[0];
    const dv = values.corner[1] - center[1];
    const corners = [
      toWorld([center[0] - du, center[1] - dv]),
      toWorld([center[0] + du, center[1] - dv]),
      toWorld([center[0] + du, center[1] + dv]),
      toWorld([center[0] - du, center[1] + dv])
    ];
    for (let i = 0; i < 4; i += 1) {
      if (corners[i] && corners[(i + 1) % 4]) {
        appendSegment(points, corners[i], corners[(i + 1) % 4]);
      }
    }
  }

  if (draft.kind === 'CircleCenterDiameter' && values.center) {
    const centerUv = values.center;
    const radius = resolveNumeric(values.radius ?? 10);
    if (Number.isFinite(radius) && radius > 0) {
      const segments = 48;
      let prev = null;
      for (let i = 0; i <= segments; i += 1) {
        const t = (i / segments) * Math.PI * 2;
        const world = sketchPlaneToWorld(
          planeRef,
          centerUv[0] + Math.cos(t) * radius,
          centerUv[1] + Math.sin(t) * radius,
          browser
        );
        if (prev) appendSegment(points, prev, world);
        prev = world;
      }
    }
  }

  if (!points.length) return null;
  return {
    id: 'sketch_preview',
    color: SKETCH_PREVIEW_COLOR,
    points
  };
};

export const sketchEntitiesViewportMesh = (entities, planeRef, browser) => {
  const points = [];
  (entities ?? []).forEach((entity) => {
    if (entity.kind === 'Line' && entity.points?.length >= 2) {
      const a = sketchPlaneToWorld(planeRef, entity.points[0][0], entity.points[0][1], browser);
      const b = sketchPlaneToWorld(planeRef, entity.points[1][0], entity.points[1][1], browser);
      appendSegment(points, a, b);
    }
    if (entity.kind === 'Rectangle2Point' && entity.points?.length >= 2) {
      const a = sketchPlaneToWorld(planeRef, entity.points[0][0], entity.points[0][1], browser);
      const b = sketchPlaneToWorld(planeRef, entity.points[1][0], entity.points[1][1], browser);
      const c1 = [a[0], b[1], a[2]];
      const c2 = [b[0], a[1], a[2]];
      appendSegment(points, a, c1);
      appendSegment(points, c1, b);
      appendSegment(points, b, c2);
      appendSegment(points, c2, a);
    }
    if (entity.kind === 'RectangleCenter' && entity.points?.length >= 2) {
      const corners = entity.points.map((uv) => sketchPlaneToWorld(planeRef, uv[0], uv[1], browser));
      for (let i = 0; i < corners.length; i += 1) {
        if (corners[i] && corners[(i + 1) % corners.length]) {
          appendSegment(points, corners[i], corners[(i + 1) % corners.length]);
        }
      }
    }
    if (entity.kind === 'CircleCenterDiameter' && entity.points?.length >= 1) {
      const centerUv = entity.points[0];
      const radius = entity.radius ?? entity.value ?? 1;
      const segments = 48;
      let prev = null;
      for (let i = 0; i <= segments; i += 1) {
        const t = (i / segments) * Math.PI * 2;
        const world = sketchPlaneToWorld(
          planeRef,
          centerUv[0] + Math.cos(t) * radius,
          centerUv[1] + Math.sin(t) * radius,
          browser
        );
        if (prev) appendSegment(points, prev, world);
        prev = world;
      }
    }
  });
  if (!points.length) return null;
  return { id: 'sketch_entities', color: [0.35, 0.9, 1, 0.85], points };
};
