import { cameraEye, cameraUp } from './viewportControls';

const mat4Multiply = (a, b) => {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      out[row * 4 + col] =
        a[row * 4 + 0] * b[0 * 4 + col] +
        a[row * 4 + 1] * b[1 * 4 + col] +
        a[row * 4 + 2] * b[2 * 4 + col] +
        a[row * 4 + 3] * b[3 * 4 + col];
    }
  }
  return out;
};

const perspective = (fovy, aspect, near, far) => {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, (2 * far * near) * nf, 0
  ]);
};

const orthographic = (size, aspect, near, far) => {
  const right = Math.max(0.001, size * aspect);
  const top = Math.max(0.001, size);
  return new Float32Array([
    1 / right, 0, 0, 0,
    0, 1 / top, 0, 0,
    0, 0, 1 / (near - far), 0,
    0, 0, near / (near - far), 1
  ]);
};

const normalize = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const lookAt = (eye, center, up) => {
  const z = normalize([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ]);
};

export const createViewProjectionMatrix = (camera, width, height) => {
  const target = camera?.target ?? [0, 0, 0];
  const distance = camera?.distance ?? 5;
  const eye = cameraEye(camera);
  const aspect = Math.max(1, width) / Math.max(1, height);
  const near = camera?.near ?? 0.01;
  const far = camera?.far ?? 100;
  const orthoHalfHeight = camera?.orthoSize ?? distance * 0.5;
  const up = camera?.sketchUp ?? cameraUp(camera);
  const projection =
    camera?.projection === 'orthographic'
      ? orthographic(orthoHalfHeight, aspect, near, far)
      : perspective(Math.PI / 4, aspect, near, far);
  return mat4Multiply(lookAt(eye, target, up), projection);
};

const transformPoint = (matrix, point) => {
  const [x, y, z] = point;
  const clipX =
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const clipY =
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const clipZ =
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
  const clipW =
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  const w = Math.abs(clipW) > 1e-8 ? clipW : 1;
  return [clipX / w, clipY / w, clipZ / w, w];
};

export const clipDepthForCameraPoint = (camera, size, point) => {
  const [width, height] = size;
  const [, , depth] = transformPoint(createViewProjectionMatrix(camera, width, height), point);
  return depth;
};
