import {
  cameraBasis,
  cameraEye,
  clamp,
  DEFAULT_HOME_VIEW,
  solidsBounds
} from './viewportControls';

const TAN_HALF_FOV = Math.tan(Math.PI / 8);

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];

const PIVOT_ACTIVE_COLOR = [1, 0.2, 0.85, 1];
const PIVOT_IDLE_COLOR = [0.65, 0.15, 0.55, 0.75];
const CAMERA_AXIS_COLOR = [0.2, 0.95, 1, 1];
const CAMERA_FRUSTUM_COLOR = [1, 0.55, 0.15, 0.9];

// Each entry: { color, points: [x0,y0,z0, x1,y1,z1, ...] }.
const pushSegment = (lines, color, a, b) => {
  lines.push({
    color,
    points: [a[0], a[1], a[2], b[0], b[1], b[2]]
  });
};

export const buildOrbitPivotLines = (pivot, { active = false } = {}) => {
  if (!pivot) return [];
  const color = active ? PIVOT_ACTIVE_COLOR : PIVOT_IDLE_COLOR;
  const size = active ? 0.18 : 0.14;
  const lines = [];
  pushSegment(lines, color, add(pivot, [-size, 0, 0]), add(pivot, [size, 0, 0]));
  pushSegment(lines, color, add(pivot, [0, -size, 0]), add(pivot, [0, size, 0]));
  pushSegment(lines, color, add(pivot, [0, 0, -size]), add(pivot, [0, 0, size]));
  return lines;
};

/** Line from camera eye to its look-at target (the view axis, not a screen-center pick ray). */
export const buildCameraLookAxisLine = (camera) => {
  if (!camera) return [];
  const eye = cameraEye(camera);
  const target = camera?.target ?? [0, 0, 0];
  const lines = [{ color: CAMERA_AXIS_COLOR, points: [eye[0], eye[1], eye[2], target[0], target[1], target[2]] }];
  if (camera?.projection === 'orthographic') {
    const { right, up } = cameraBasis(camera);
    const half = Math.max(0.04, (camera?.orthoSize ?? 1) * 0.02);
    pushSegment(lines, CAMERA_AXIS_COLOR, add(target, scale(right, -half)), add(target, scale(right, half)));
    pushSegment(lines, CAMERA_AXIS_COLOR, add(target, scale(up, -half)), add(target, scale(up, half)));
  }
  return lines;
};

const orthographicFrustumLines = (camera, aspect) => {
  const { eye, forward, right, up } = cameraBasis(camera);
  const target = camera?.target ?? [0, 0, 0];
  const halfHeight = camera?.orthoSize ?? (camera?.distance ?? 5) * 0.5;
  const halfWidth = halfHeight * aspect;
  const slabDepth = Math.min(camera?.distance ?? 5, 12) * 0.35;
  const nearCenter = add(target, scale(forward, -slabDepth * 0.5));
  const farCenter = add(target, scale(forward, slabDepth * 0.5));
  const corner = (center, sx, sy) =>
    add(add(center, scale(right, sx * halfWidth)), scale(up, sy * halfHeight));
  const near = [
    corner(nearCenter, -1, -1),
    corner(nearCenter, 1, -1),
    corner(nearCenter, 1, 1),
    corner(nearCenter, -1, 1)
  ];
  const far = [
    corner(farCenter, -1, -1),
    corner(farCenter, 1, -1),
    corner(farCenter, 1, 1),
    corner(farCenter, -1, 1)
  ];
  const lines = [];
  pushSegment(lines, CAMERA_AXIS_COLOR, eye, target);
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    pushSegment(lines, CAMERA_FRUSTUM_COLOR, near[i], near[next]);
    pushSegment(lines, CAMERA_FRUSTUM_COLOR, far[i], far[next]);
    pushSegment(lines, CAMERA_FRUSTUM_COLOR, near[i], far[i]);
  }
  return lines;
};

const perspectiveFrustumLines = (camera, aspect) => {
  const { eye, forward, right, up } = cameraBasis(camera);
  const target = camera?.target ?? [0, 0, 0];
  const near = camera?.near ?? 0.01;
  const distance = camera?.distance ?? 5;
  const halfHeight = near * TAN_HALF_FOV;
  const halfWidth = halfHeight * aspect;
  const center = add(eye, scale(forward, near));
  const corners = [
    add(add(center, scale(right, halfWidth)), scale(up, halfHeight)),
    add(add(center, scale(right, -halfWidth)), scale(up, halfHeight)),
    add(add(center, scale(right, -halfWidth)), scale(up, -halfHeight)),
    add(add(center, scale(right, halfWidth)), scale(up, -halfHeight))
  ];
  const lines = [];
  pushSegment(lines, CAMERA_AXIS_COLOR, eye, target);
  for (let i = 0; i < 4; i++) {
    const next = corners[(i + 1) % 4];
    pushSegment(lines, CAMERA_FRUSTUM_COLOR, corners[i], next);
    pushSegment(lines, CAMERA_FRUSTUM_COLOR, eye, corners[i]);
  }
  const mid = add(eye, scale(forward, distance * 0.5));
  pushSegment(lines, [CAMERA_FRUSTUM_COLOR[0], CAMERA_FRUSTUM_COLOR[1], CAMERA_FRUSTUM_COLOR[2], 0.45], mid, target);
  return lines;
};

export const buildCameraGizmoLines = (camera, { aspect = 4 / 3 } = {}) => {
  if (!camera) return [];
  if (camera?.projection === 'orthographic') {
    return orthographicFrustumLines(camera, aspect);
  }
  return perspectiveFrustumLines(camera, aspect);
};

export const overviewCamera = (scene) => {
  const bounds = solidsBounds(scene?.solids ?? []);
  const view = {
    yaw: DEFAULT_HOME_VIEW.yaw,
    pitch: DEFAULT_HOME_VIEW.pitch,
    projection: 'perspective',
    near: 0.01,
    far: 200
  };

  if (!bounds || bounds.radius < 1e-6) {
    return { ...view, target: [0, 0, 0], distance: DEFAULT_HOME_VIEW.distance * 2.5 };
  }

  const distance = clamp((bounds.radius / TAN_HALF_FOV) * 2.4, 2, 200);
  return { ...view, target: [...bounds.center], distance };
};
