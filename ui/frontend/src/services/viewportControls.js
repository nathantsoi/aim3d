// Shared camera math for the 3D viewport.
//
// Coordinate system: right-handed, Z up (blue), -Y forward (green).
// The orbit camera is parameterised by a target, a distance, an azimuth `yaw`
// (rotation about the world +Z axis) and an elevation `pitch` (angle above the
// XY ground plane). At yaw = 0, pitch = 0 the eye sits on +Y looking toward -Y,
// so -Y is the forward (into-screen) direction.

export const WORLD_UP = Object.freeze([0, 0, 1]);
export const MAX_PITCH = 1.45;
const TAN_HALF_FOV = Math.tan(Math.PI / 8);

// Default "home" orientation: a comfortable isometric framing.
export const DEFAULT_HOME_VIEW = Object.freeze({ yaw: 0.72, pitch: 0.62, distance: 5.2 });

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const length = (v) => Math.hypot(v[0], v[1], v[2]);

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Roll-free orthonormal view basis derived directly from yaw/pitch. Unlike a
// cross-with-world-up basis this stays well defined through the poles and lets
// pitch wind past vertical (the up vector flips, i.e. the view goes upside
// down) so the camera can orbit completely around.
const forwardVec = (yaw, pitch) => {
  const cp = Math.cos(pitch);
  return [-cp * Math.sin(yaw), -cp * Math.cos(yaw), -Math.sin(pitch)];
};
const upVec = (yaw, pitch) => {
  const sp = Math.sin(pitch);
  return [-sp * Math.sin(yaw), -sp * Math.cos(yaw), Math.cos(pitch)];
};
const rightVec = (yaw) => [-Math.cos(yaw), Math.sin(yaw), 0];

export const cameraFrame = (yaw = 0, pitch = 0) => ({
  forward: forwardVec(yaw, pitch),
  up: upVec(yaw, pitch),
  right: rightVec(yaw)
});

// World-space eye position for an orbit camera (Z up).
export const cameraEye = (camera) => {
  const target = camera?.target ?? [0, 0, 0];
  const distance = camera?.distance ?? 5;
  const forward = forwardVec(camera?.yaw ?? 0, camera?.pitch ?? 0);
  return [
    target[0] - forward[0] * distance,
    target[1] - forward[1] * distance,
    target[2] - forward[2] * distance
  ];
};

// View up vector for the current camera (continuous through the poles).
export const cameraUp = (camera) => upVec(camera?.yaw ?? 0, camera?.pitch ?? 0);

// Orthonormal view basis (eye, forward, right, up) for the current camera.
export const cameraBasis = (camera) => {
  const yaw = camera?.yaw ?? 0;
  const pitch = camera?.pitch ?? 0;
  return {
    eye: cameraEye(camera),
    forward: forwardVec(yaw, pitch),
    right: rightVec(yaw),
    up: upVec(yaw, pitch)
  };
};

// Orbit the camera around an arbitrary pivot by rotating the eye (and the look
// point) around it, while advancing yaw/pitch by the given deltas. With zero
// deltas this is the identity, so starting an orbit never makes the view jump.
export const orbitAroundPivot = (camera, pivot, deltaYaw, deltaPitch) => {
  const yaw = camera?.yaw ?? 0;
  const pitch = camera?.pitch ?? 0;
  const distance = camera?.distance ?? 5;
  const eye = cameraEye(camera);

  const before = cameraFrame(yaw, pitch);
  const yaw2 = yaw + deltaYaw;
  const pitch2 = pitch + deltaPitch;
  const after = cameraFrame(yaw2, pitch2);

  // Express the eye offset in the old frame, then reconstruct it in the new
  // frame: this rotates the eye around the pivot in lockstep with the look
  // direction (R2 · R1ᵀ · offset).
  const rel = sub(eye, pivot);
  const local = [dot(before.right, rel), dot(before.up, rel), dot(before.forward, rel)];
  const eye2 = add(
    pivot,
    add(add(scale(after.right, local[0]), scale(after.up, local[1])), scale(after.forward, local[2]))
  );
  const target2 = add(eye2, scale(after.forward, distance));

  return { yaw: yaw2, pitch: pitch2, distance, target: target2 };
};

// Pan by a screen-space delta. The camera moves so that the part travels in the
// commanded direction (grab-and-drag), i.e. the target shifts opposite to the
// camera's screen-right/up so geometry follows the gesture.
export const panTarget = (camera, deltaX, deltaY, width, height) => {
  const { right, up } = cameraBasis(camera);
  const distance = camera?.distance ?? 5;
  const target = camera?.target ?? [0, 0, 0];
  const factor = distance / Math.max(1, Math.min(width || 1, height || 1));
  return [
    target[0] + right[0] * deltaX * factor - up[0] * deltaY * factor,
    target[1] + right[1] * deltaX * factor - up[1] * deltaY * factor,
    target[2] + right[2] * deltaX * factor - up[2] * deltaY * factor
  ];
};

// Exponential zoom keeps the same perceptual step regardless of distance.
export const zoomDistance = (distance, deltaY, { sensitivity = 0.01, min = 0.4, max = 120 } = {}) =>
  clamp((distance ?? 5) * Math.exp(deltaY * sensitivity), min, max);

// Perpendicular distance from a point to an (infinite) camera ray. Assumes
// ray.direction is normalized.
const rayPointDistance = (ray, point) => {
  const v = sub(point, ray.origin);
  const t = dot(v, ray.direction);
  const projected = add(ray.origin, scale(ray.direction, t));
  return length(sub(point, projected));
};

// Average of a solid's vertex positions.
export const solidCentroid = (solid) => {
  const positions = solid?.positions ?? [];
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let count = 0;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    sx += positions[i];
    sy += positions[i + 1];
    sz += positions[i + 2];
    count += 1;
  }
  if (!count) return null;
  return [sx / count, sy / count, sz / count];
};

// Centroid of the solid whose center lies closest to the ray, or null when the
// scene has no geometry. Used to choose an orbit pivot near the cursor even
// when the cursor isn't directly over an object.
export const closestSolidToRay = (scene, ray) => {
  let best = null;
  (scene?.solids ?? []).forEach((solid) => {
    const centroid = solidCentroid(solid);
    if (!centroid) return;
    const distance = rayPointDistance(ray, centroid);
    if (!best || distance < best.distance) {
      best = { distance, centroid };
    }
  });
  return best?.centroid ?? null;
};

// Intersect a ray with the world ground plane (z = 0).
export const groundPlanePoint = (ray) => {
  if (!ray) return null;
  const { origin, direction } = ray;
  if (Math.abs(direction[2]) < 1e-6) return null;
  const t = -origin[2] / direction[2];
  if (t <= 0) return null;
  return add(origin, scale(direction, t));
};

// Project a world point to canvas pixel coordinates. Mirrors the unprojection
// performed by createCameraRay so picking and projection stay consistent.
export const projectToScreen = (camera, point, width, height) => {
  const { eye, forward, right, up } = cameraBasis(camera);
  const rel = sub(point, eye);
  const depth = dot(rel, forward);
  if (depth <= 1e-6) return { x: 0, y: 0, visible: false };
  const aspect = Math.max(1, width) / Math.max(1, height);
  const ndcX = dot(rel, right) / depth / (aspect * TAN_HALF_FOV);
  const ndcY = dot(rel, up) / depth / TAN_HALF_FOV;
  return {
    x: ((ndcX + 1) / 2) * width,
    y: ((1 - ndcY) / 2) * height,
    visible: true
  };
};

const rectContains = (rect, x, y) =>
  x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;

// Returns the entities whose geometry projects inside the selection rectangle,
// ordered nearest-first. `rect` is in canvas pixel coordinates.
export const entitiesInRect = (scene, rect, width, height) => {
  const camera = scene?.camera;
  const found = new Map();

  (scene?.solids ?? []).forEach((solid) => {
    const positions = solid.positions ?? [];
    const entityId = solid.pickable?.entityId ?? solid.sourceToken ?? solid.id ?? null;
    if (!entityId || positions.length < 3) return;

    for (let i = 0; i + 2 < positions.length; i += 3) {
      const projected = projectToScreen(
        camera,
        [positions[i], positions[i + 1], positions[i + 2]],
        width,
        height
      );
      if (!projected.visible || !rectContains(rect, projected.x, projected.y)) continue;
      const eye = cameraEye(camera);
      const depth = length(sub([positions[i], positions[i + 1], positions[i + 2]], eye));
      const existing = found.get(entityId);
      if (!existing || depth < existing) {
        found.set(entityId, depth);
      }
    }
  });

  return [...found.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([entityId]) => entityId);
};

// Axis-aligned bounds of all solid geometry in the scene. Returns the center
// and a bounding-sphere radius, or null when there is no geometry.
export const solidsBounds = (solids = []) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let found = false;

  solids.forEach((solid) => {
    const positions = solid.positions ?? [];
    for (let i = 0; i + 2 < positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const value = positions[i + axis];
        if (value < min[axis]) min[axis] = value;
        if (value > max[axis]) max[axis] = value;
      }
      found = true;
    }
  });

  if (!found) return null;
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = 0.5 * Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  return { center, radius };
};

// Camera parameters that re-center the view on the scene geometry (or the
// origin when the scene is empty) at the default home orientation.
export const homeCamera = (scene) => {
  const bounds = solidsBounds(scene?.solids ?? []);
  const view = {
    yaw: DEFAULT_HOME_VIEW.yaw,
    pitch: DEFAULT_HOME_VIEW.pitch,
    projection: 'perspective'
  };

  if (!bounds || bounds.radius < 1e-6) {
    return { ...view, target: [0, 0, 0], distance: DEFAULT_HOME_VIEW.distance };
  }

  // Frame the bounding sphere within the vertical field of view, with padding.
  const distance = clamp((bounds.radius / TAN_HALF_FOV) * 1.2, 0.6, 120);
  return { ...view, target: [...bounds.center], distance };
};

export const normalizeRect = (startX, startY, endX, endY) => ({
  minX: Math.min(startX, endX),
  minY: Math.min(startY, endY),
  maxX: Math.max(startX, endX),
  maxY: Math.max(startY, endY)
});
