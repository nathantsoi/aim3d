// Builds an axis-aligned box solid with Fusion-style topology pickables:
// per-face unique vertices (so face highlight does not bleed across edges),
// faceRanges, edge polylines, vertex points, and a bodyToken.

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const subshapeToken = (bodyId, kind, ordinal) =>
  `body:${bodyId == null || bodyId === 0 ? 1 : bodyId}/${kind}:${ordinal}`;

const bodyPickToken = (bodyId) =>
  `body:${bodyId == null || bodyId === 0 ? 1 : bodyId}`;

/**
 * @param {object} options
 * @param {[number, number, number]} options.min
 * @param {[number, number, number]} options.max
 * @param {string} [options.id]
 * @param {number|string} [options.bodyId]
 * @param {string} [options.sourceToken]
 * @param {string} [options.kind] pickable kind label
 * @param {number} [options.priority]
 * @param {number[]} [options.color] rgba base color
 */
export const createTopologyBoxSolid = ({
  min = [-1, -1, -1],
  max = [1, 1, 1],
  id,
  bodyId = 1,
  sourceToken,
  kind = 'B-rep Exact Face',
  priority = 10,
  color = [0.2, 0.72, 1, 1]
} = {}) => {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;
  const cz = (z0 + z1) * 0.5;
  const solidId = id ?? `solid_${bodyId}`;
  const token = sourceToken ?? subshapeToken(bodyId, 'face', 0);

  const faces = [
    { corners: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], normal: [0, 0, -1] },
    { corners: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], normal: [0, 0, 1] },
    { corners: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], normal: [0, -1, 0] },
    { corners: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], normal: [0, 1, 0] },
    { corners: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], normal: [-1, 0, 0] },
    { corners: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], normal: [1, 0, 0] }
  ];

  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const faceRanges = [];

  faces.forEach((face, faceOrdinal) => {
    const base = positions.length / 3;
    const triangleStart = indices.length / 3;
    face.corners.forEach((corner) => {
      positions.push(corner[0], corner[1], corner[2]);
      normals.push(face.normal[0], face.normal[1], face.normal[2]);
      colors.push(color[0], color[1], color[2], color[3] ?? 1);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    faceRanges.push({
      token: subshapeToken(bodyId, 'face', faceOrdinal),
      kind: 'face',
      triangleStart,
      triangleCount: 2
    });
  });

  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
  ];
  const edgePairs = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];

  return {
    id: solidId,
    bodyId,
    sourceToken: token,
    bodyToken: bodyPickToken(bodyId),
    pickable: {
      entityId: token,
      kind,
      priority,
      snapPoints: [{ id: `${solidId}_center`, kind: 'center', position: [cx, cy, cz] }]
    },
    faceRanges,
    edgePickables: edgePairs.map(([a, b], i) => ({
      token: subshapeToken(bodyId, 'edge', i),
      kind: 'edge',
      points: [...corners[a], ...corners[b]]
    })),
    vertexPickables: corners.map((position, i) => ({
      token: subshapeToken(bodyId, 'vertex', i),
      kind: 'vertex',
      position
    })),
    positions,
    normals,
    colors,
    indices,
    transform: [...IDENTITY]
  };
};

/**
 * If a solid is missing topology pickables but its vertices look like an
 * axis-aligned box (all corners of an AABB), replace the mesh with a
 * topology-complete box so face/edge/body pick and highlight work. Solids that
 * already have faceRanges are returned unchanged.
 */
export const ensureSolidTopology = (solid) => {
  if (!solid || (solid.faceRanges?.length > 0 && solid.bodyToken)) {
    return solid;
  }
  const positions = solid.positions ?? [];
  if (positions.length < 9) return solid;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxX = Math.max(maxX, positions[i]);
    maxY = Math.max(maxY, positions[i + 1]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) return solid;
  if (maxX - minX < 1e-9 || maxY - minY < 1e-9 || maxZ - minZ < 1e-9) return solid;

  // Require every vertex to sit near an AABB corner (box-like solids only).
  const corners = [
    [minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ], [minX, maxY, minZ],
    [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]
  ];
  const tol = 1e-4 * Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const p = [positions[i], positions[i + 1], positions[i + 2]];
    const nearCorner = corners.some(
      (c) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) <= tol
    );
    if (!nearCorner) return solid;
  }

  const rebuilt = createTopologyBoxSolid({
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    id: solid.id,
    bodyId: solid.bodyId ?? 1,
    sourceToken: solid.sourceToken ?? solid.pickable?.entityId,
    kind: solid.pickable?.kind ?? 'B-rep Exact Face',
    priority: solid.pickable?.priority ?? 10,
    color: solid.colors?.length >= 4
      ? solid.colors.slice(0, 4)
      : [0.2, 0.72, 1, 1]
  });
  return {
    ...rebuilt,
    transform: solid.transform ?? rebuilt.transform
  };
};

export const ensureSceneSolidTopology = (scene) => {
  if (!scene || !Array.isArray(scene.solids)) return scene;
  return {
    ...scene,
    solids: scene.solids.map(ensureSolidTopology)
  };
};
