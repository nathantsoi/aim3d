import { cameraBasis } from './viewportControls';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

const normalize = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

export const createCameraRay = (camera, x, y, width, height) => {
  const { eye, forward, right, up } = cameraBasis(camera);
  const aspect = Math.max(1, width) / Math.max(1, height);
  const ndcX = (x / Math.max(1, width)) * 2 - 1;
  const ndcY = 1 - (y / Math.max(1, height)) * 2;

  if (camera?.projection === 'orthographic') {
    const halfHeight = camera?.orthoSize ?? (camera?.distance ?? 5) * 0.5;
    const halfWidth = halfHeight * aspect;
    return {
      origin: add(add(eye, scale(right, ndcX * halfWidth)), scale(up, ndcY * halfHeight)),
      direction: normalize(forward)
    };
  }

  const tanHalfFov = Math.tan(Math.PI / 8);
  const direction = normalize(add(
    add(forward, scale(right, ndcX * aspect * tanHalfFov)),
    scale(up, ndcY * tanHalfFov)
  ));
  return { origin: eye, direction };
};

const vertexAt = (positions, index) => {
  const offset = index * 3;
  return [positions[offset], positions[offset + 1], positions[offset + 2]];
};

const intersectTriangle = (ray, a, b, c) => {
  const edge1 = sub(b, a);
  const edge2 = sub(c, a);
  const h = cross(ray.direction, edge2);
  const det = dot(edge1, h);
  if (Math.abs(det) < 1e-8) return null;

  const invDet = 1 / det;
  const s = sub(ray.origin, a);
  const u = invDet * dot(s, h);
  if (u < 0 || u > 1) return null;

  const q = cross(s, edge1);
  const v = invDet * dot(ray.direction, q);
  if (v < 0 || u + v > 1) return null;

  const t = invDet * dot(edge2, q);
  if (t <= 1e-8) return null;
  return { distance: t, position: add(ray.origin, scale(ray.direction, t)) };
};

const nearestSnap = (snapPoints, hitPosition) => {
  let best = null;
  snapPoints.forEach((snap) => {
    const position = snap.position ?? null;
    if (!position) return;
    const distance = Math.hypot(
      position[0] - hitPosition[0],
      position[1] - hitPosition[1],
      position[2] - hitPosition[2]
    );
    if (!best || distance < best.distance) {
      best = { ...snap, distance };
    }
  });
  return best;
};

export const pickViewportEntity = (scene, x, y, width, height) => {
  const startedAt = performance.now();
  const ray = createCameraRay(scene?.camera, x, y, width, height);
  let best = null;

  (scene?.solids ?? []).forEach((solid, solidIndex) => {
    const positions = solid.positions ?? [];
    const indices = solid.indices ?? [];
    const pickable = solid.pickable ?? {};
    const entityId = pickable.entityId ?? solid.sourceToken ?? solid.id ?? null;
    if (!entityId || positions.length < 9 || indices.length < 3) return;

    for (let i = 0; i + 2 < indices.length; i += 3) {
      const hit = intersectTriangle(
        ray,
        vertexAt(positions, indices[i]),
        vertexAt(positions, indices[i + 1]),
        vertexAt(positions, indices[i + 2])
      );
      if (!hit) continue;

      const priority = pickable.priority ?? 0;
      if (
        !best ||
        hit.distance < best.distance - 1e-6 ||
        (Math.abs(hit.distance - best.distance) <= 1e-6 && priority > best.priority)
      ) {
        best = {
          entityId,
          solidId: solid.id ?? `solid_${solidIndex}`,
          bodyId: solid.bodyId ?? null,
          kind: pickable.kind ?? 'B-rep Entity',
          priority,
          distance: hit.distance,
          position: hit.position,
          snapCandidate: nearestSnap(pickable.snapPoints ?? [], hit.position)
        };
      }
    }
  });

  if (scene?.gizmos?.originVisible !== false && Array.isArray(scene?.gizmos?.originPlanes)) {
    scene.gizmos.originPlanes.forEach((plane) => {
      const positions = plane.positions ?? [];
      const indices = plane.indices ?? [];
      const entityId = plane.id;
      const priority = -10;

      for (let i = 0; i + 2 < indices.length; i += 3) {
        const hit = intersectTriangle(
          ray,
          vertexAt(positions, indices[i]),
          vertexAt(positions, indices[i + 1]),
          vertexAt(positions, indices[i + 2])
        );
        if (!hit) continue;

        if (
          !best ||
          hit.distance < best.distance - 1e-6 ||
          (Math.abs(hit.distance - best.distance) <= 1e-6 && priority > best.priority)
        ) {
          best = {
            entityId,
            solidId: plane.id,
            bodyId: null,
            kind: 'Origin Plane',
            priority,
            distance: hit.distance,
            position: hit.position,
            snapCandidate: null
          };
        }
      }
    });
  }

  if (Array.isArray(scene?.gizmos?.axes)) {
    scene.gizmos.axes.forEach((axis) => {
      if (scene?.gizmos?.originVisible === false && axis.id.startsWith('axis_')) return;
      const positions = axis.positions ?? [];
      const indices = axis.indices ?? [];
      const entityId = axis.id;
      const priority = 10;

      if (!positions.length || !indices.length) return;

      for (let i = 0; i + 2 < indices.length; i += 3) {
        const hit = intersectTriangle(
          ray,
          vertexAt(positions, indices[i]),
          vertexAt(positions, indices[i + 1]),
          vertexAt(positions, indices[i + 2])
        );
        if (!hit) continue;

        if (
          !best ||
          hit.distance < best.distance - 1e-6 ||
          (Math.abs(hit.distance - best.distance) <= 1e-6 && priority > best.priority)
        ) {
          best = {
            entityId,
            solidId: axis.id,
            bodyId: null,
            kind: 'Axis',
            priority,
            distance: hit.distance,
            position: hit.position,
            snapCandidate: null
          };
        }
      }
    });
  }

  return {
    hit: best,
    latencyMs: performance.now() - startedAt
  };
};
