import { cameraBasis, cameraEye, projectToScreen } from './viewportControls';
import { ensureSolidTopology } from '../contracts/topologyBoxSolid';

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

// Fusion-style selection filter categories. All-on / select-through-on mirrors
// the Fusion default and keeps prior single-click behaviour unchanged.
export const DEFAULT_SELECTION_FILTERS = Object.freeze({
  bodies: true,
  bodyFaces: true,
  bodyEdges: true,
  bodyVertices: true,
  workGeometry: true,
  selectThrough: true
});

// Screen-space pick tolerances (in CSS pixels). Vertices win over edges, which
// win over faces, when the cursor is within these radii.
const VERTEX_PIXEL_RADIUS = 9;
const EDGE_PIXEL_RADIUS = 6;

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
  (snapPoints ?? []).forEach((snap) => {
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

// Resolve the face token for a triangle at `triangleIndex` (0-based) using the
// solid's faceRanges. Falls back to the whole-solid pickable token when the
// mesh has no per-face ranges (legacy/mock solids).
const faceTokenForTriangle = (solid, triangleIndex) => {
  const ranges = solid.faceRanges ?? [];
  for (let r = 0; r < ranges.length; r++) {
    const range = ranges[r];
    const start = range.triangleStart ?? 0;
    const count = range.triangleCount ?? 0;
    if (triangleIndex >= start && triangleIndex < start + count) {
      return range.token;
    }
  }
  return solid.pickable?.entityId ?? solid.sourceToken ?? solid.id ?? null;
};

const solidFaceEntityId = (solid) =>
  solid.pickable?.entityId ?? solid.sourceToken ?? solid.id ?? null;

// Distance from a 2D point to a 2D segment, plus the interpolation parameter.
const pointSegmentDistance2d = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 1e-9 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { distance: Math.hypot(px - cx, py - cy), t };
};

const filtersAllow = (filters, kind) => {
  const f = filters ?? DEFAULT_SELECTION_FILTERS;
  switch (kind) {
    case 'face':
      return f.bodyFaces !== false;
    case 'edge':
      return f.bodyEdges !== false;
    case 'vertex':
      return f.bodyVertices !== false;
    case 'body':
      return f.bodies !== false;
    case 'workGeometry':
      return f.workGeometry !== false;
    default:
      return true;
  }
};

// Collect every pickable entity under the cursor as an unordered candidate
// list. Each candidate carries a semantic `kind` (face/edge/vertex/body/
// workGeometry), a stable `entityId`, camera `distance` (depth), and, for
// edges/vertices, the screen-space pixel distance used for proximity ranking.
const collectCandidates = (scene, x, y, width, height) => {
  const camera = scene?.camera;
  const ray = createCameraRay(camera, x, y, width, height);
  const eye = cameraEye(camera);
  const candidates = [];

  (scene?.solids ?? []).forEach((solid, solidIndex) => {
    // Upgrade legacy shared-vertex boxes that lack topology pickables so the
    // default cube supports face/edge/body pick without a core rebuild.
    solid = ensureSolidTopology(solid);
    const positions = solid.positions ?? [];
    const indices = solid.indices ?? [];
    const solidId = solid.id ?? `solid_${solidIndex}`;
    const bodyId = solid.bodyId ?? null;

    // Faces: nearest triangle hit per face token.
    if (positions.length >= 9 && indices.length >= 3) {
      const priority = solid.pickable?.priority ?? 10;
      const perFace = new Map();
      for (let i = 0; i + 2 < indices.length; i += 3) {
        const hit = intersectTriangle(
          ray,
          vertexAt(positions, indices[i]),
          vertexAt(positions, indices[i + 1]),
          vertexAt(positions, indices[i + 2])
        );
        if (!hit) continue;
        const triangleIndex = i / 3;
        const token = faceTokenForTriangle(solid, triangleIndex);
        if (!token) continue;
        const existing = perFace.get(token);
        if (!existing || hit.distance < existing.distance) {
          perFace.set(token, { distance: hit.distance, position: hit.position });
        }
      }
      perFace.forEach((hit, token) => {
        candidates.push({
          entityId: token,
          kind: 'face',
          solidId,
          bodyId,
          bodyToken: solid.bodyToken ?? null,
          priority,
          distance: hit.distance,
          position: hit.position,
          pixelDistance: 0,
          snapCandidate: nearestSnap(solid.pickable?.snapPoints, hit.position)
        });
      });
    }

    // Vertices: screen-space proximity to the cursor.
    if (scene?.gizmos?.pointsVisible !== false) {
      (solid.vertexPickables ?? []).forEach((vertex) => {
        const projected = projectToScreen(camera, vertex.position, width, height);
        if (!projected.visible) return;
        const pixelDistance = Math.hypot(projected.x - x, projected.y - y);
        if (pixelDistance > VERTEX_PIXEL_RADIUS) return;
        candidates.push({
          entityId: vertex.token,
          kind: 'vertex',
          solidId,
          bodyId,
          bodyToken: solid.bodyToken ?? null,
          priority: (solid.pickable?.priority ?? 10) + 2,
          distance: Math.hypot(...sub(vertex.position, eye)),
          position: [...vertex.position],
          pixelDistance
        });
      });
    }

    // Edges: closest point on the projected polyline to the cursor.
    if (scene?.gizmos?.edgesVisible !== false) {
      (solid.edgePickables ?? []).forEach((edge) => {
        const points = edge.points ?? [];
        let best = null;
        for (let i = 0; i + 5 < points.length; i += 3) {
          const a = [points[i], points[i + 1], points[i + 2]];
          const b = [points[i + 3], points[i + 4], points[i + 5]];
          const pa = projectToScreen(camera, a, width, height);
          const pb = projectToScreen(camera, b, width, height);
          if (!pa.visible || !pb.visible) continue;
          const seg = pointSegmentDistance2d(x, y, pa.x, pa.y, pb.x, pb.y);
          if (!best || seg.distance < best.distance) {
            const position = add(a, scale(sub(b, a), seg.t));
            best = { distance: seg.distance, position };
          }
        }
        if (!best || best.distance > EDGE_PIXEL_RADIUS) return;
        candidates.push({
          entityId: edge.token,
          kind: 'edge',
          solidId,
          bodyId,
          bodyToken: solid.bodyToken ?? null,
          priority: (solid.pickable?.priority ?? 10) + 1,
          distance: Math.hypot(...sub(best.position, eye)),
          position: best.position,
          pixelDistance: best.distance
        });
      });
    }
  });

  // Work geometry: origin planes and axes (viewport gizmos).
  if (scene?.gizmos?.originVisible !== false && Array.isArray(scene?.gizmos?.originPlanes)) {
    scene.gizmos.originPlanes.forEach((plane) => {
      const positions = plane.positions ?? [];
      const indices = plane.indices ?? [];
      for (let i = 0; i + 2 < indices.length; i += 3) {
        const hit = intersectTriangle(
          ray,
          vertexAt(positions, indices[i]),
          vertexAt(positions, indices[i + 1]),
          vertexAt(positions, indices[i + 2])
        );
        if (!hit) continue;
        candidates.push({
          entityId: plane.id,
          kind: 'workGeometry',
          subKind: 'Origin Plane',
          solidId: plane.id,
          bodyId: null,
          priority: -10,
          distance: hit.distance,
          position: hit.position,
          pixelDistance: 0,
          snapCandidate: null
        });
        break;
      }
    });
  }

  if (Array.isArray(scene?.gizmos?.axes)) {
    scene.gizmos.axes.forEach((axis) => {
      if (scene?.gizmos?.originVisible === false && axis.id.startsWith('axis_')) return;
      const positions = axis.positions ?? [];
      const indices = axis.indices ?? [];
      if (!positions.length || !indices.length) return;
      for (let i = 0; i + 2 < indices.length; i += 3) {
        const hit = intersectTriangle(
          ray,
          vertexAt(positions, indices[i]),
          vertexAt(positions, indices[i + 1]),
          vertexAt(positions, indices[i + 2])
        );
        if (!hit) continue;
        candidates.push({
          entityId: axis.id,
          kind: 'workGeometry',
          subKind: 'Axis',
          solidId: axis.id,
          bodyId: null,
          priority: -10,
          distance: hit.distance,
          position: hit.position,
          pixelDistance: 0,
          snapCandidate: null
        });
        break;
      }
    });
  }

  return candidates;
};

// Promote a body-subshape candidate (face/edge/vertex) to its owning body,
// using the mesh's bodyToken when available.
const asBodyCandidate = (candidate) => {
  const bodyEntityId =
    candidate.bodyToken ??
    (candidate.bodyId != null ? `body:${candidate.bodyId}` : candidate.entityId);
  return { ...candidate, entityId: bodyEntityId, kind: 'body' };
};

const isBodySubshape = (kind) => kind === 'face' || kind === 'edge' || kind === 'vertex';

// Rank candidates for a primary (single) click, honouring the active selection
// priority mode and filters. Returns the winning candidate, or null.
const rankBest = (candidates, { filters, priority, sketchMode } = {}) => {
  if (!candidates.length) return null;

  // Active sketch: sketch entities take absolute precedence over 3D geometry.
  // Sketch pickables are not yet emitted into the scene, so this currently only
  // fires once they exist; 3D solids remain selectable in the meantime.
  if (sketchMode) {
    const sketchHit = candidates
      .filter((c) => c.kind === 'sketch')
      .sort((a, b) => a.distance - b.distance)[0];
    if (sketchHit) return sketchHit;
  }

  // Selection priority forces the click toward one class of geometry, as in
  // Fusion's Select Face/Body/Edge Priority tools.
  if (priority === 'body') {
    const bodyHit = candidates
      .filter((c) => isBodySubshape(c.kind) && filtersAllow(filters, 'body'))
      .sort((a, b) => a.distance - b.distance)[0];
    if (bodyHit) return asBodyCandidate(bodyHit);
  }
  if (priority === 'face' || priority === 'edge') {
    const wanted = candidates
      .filter((c) => c.kind === priority && filtersAllow(filters, priority))
      .sort((a, b) => a.distance - b.distance)[0];
    if (wanted) return wanted;
  }

  const allowed = candidates.filter((c) => filtersAllow(filters, c.kind));
  if (!allowed.length) return null;

  // No priority mode: vertices beat edges beat faces when the cursor is near
  // them, then fall back to the nearest face, then work geometry.
  const vertices = allowed.filter((c) => c.kind === 'vertex').sort((a, b) => a.pixelDistance - b.pixelDistance || a.distance - b.distance);
  if (vertices.length) return vertices[0];
  const edges = allowed.filter((c) => c.kind === 'edge').sort((a, b) => a.pixelDistance - b.pixelDistance || a.distance - b.distance);
  if (edges.length) return edges[0];
  const faces = allowed.filter((c) => c.kind === 'face').sort((a, b) => a.distance - b.distance);
  if (faces.length) return faces[0];
  const rest = allowed.slice().sort((a, b) => b.priority - a.priority || a.distance - b.distance);
  return rest[0] ?? null;
};

// Returns every pickable entity pierced by the cursor ray, sorted front-to-back
// by camera depth. Powers the Select Other depth menu, so it ignores selection
// priority and (by design) selection filters.
export const pickAllViewportEntities = (scene, x, y, width, height) => {
  const startedAt = performance.now();
  const candidates = collectCandidates(scene, x, y, width, height)
    .slice()
    .sort((a, b) => a.distance - b.distance);
  return {
    candidates,
    latencyMs: performance.now() - startedAt
  };
};

// Resolve the single best pick under the cursor. `options` may carry
// `{ filters, priority }`; when omitted the legacy all-on / no-priority
// behaviour is used so existing callers keep selecting the front-most face.
export const pickViewportEntity = (scene, x, y, width, height, options = {}) => {
  const startedAt = performance.now();
  const candidates = collectCandidates(scene, x, y, width, height);
  const best = rankBest(candidates, options);
  return {
    hit: best
      ? {
          entityId: best.entityId,
          solidId: best.solidId,
          bodyId: best.bodyId,
          kind: best.kind,
          priority: best.priority,
          distance: best.distance,
          position: best.position,
          snapCandidate: best.snapCandidate ?? null
        }
      : null,
    latencyMs: performance.now() - startedAt
  };
};
