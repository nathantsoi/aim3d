const SELECTED_SOLID_COLOR = [1, 0.82, 0.24, 1];
const STALE_TOOLPATH_COLOR = [0.92, 0.42, 0.22, 1];

const fnv1a = (value) => {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const colorForToolpath = (toolpath, selectedEntityId) => {
  if (toolpath.operationId === selectedEntityId || toolpath.id === selectedEntityId) {
    return SELECTED_SOLID_COLOR;
  }
  if (toolpath.status === 'Stale') {
    return STALE_TOOLPATH_COLOR;
  }
  return toolpath.color ?? [1, 0.74, 0.18, 1];
};

const pushLineSegments = (vertices, points, color) => {
  for (let i = 0; i + 5 < points.length; i += 3) {
    vertices.push(
      points[i], points[i + 1], points[i + 2], color[0], color[1], color[2], color[3],
      points[i + 3], points[i + 4], points[i + 5], color[0], color[1], color[2], color[3]
    );
  }
};

export const createSceneBufferKey = (scene, selectedEntityId = null) => fnv1a({
  solids: scene?.solids ?? [],
  toolpaths: scene?.toolpaths ?? [],
  gizmos: scene?.gizmos ?? {},
  selectedEntityId
});

export const adaptViewportScene = (scene, selectedEntityId = null) => {
  const solids = scene?.solids ?? [];
  const toolpaths = scene?.toolpaths ?? [];
  const axes = scene?.gizmos?.axes ?? [];

  const solidVertices = [];
  const solidIndices = [];
  let vertexOffset = 0;

  solids.forEach((solid) => {
    const positions = solid.positions ?? [];
    const normals = solid.normals ?? [];
    const colors = solid.colors ?? [];
    const selected = solid.sourceToken === selectedEntityId || solid.id === selectedEntityId;

    for (let i = 0; i + 2 < positions.length; i += 3) {
      const colorIndex = Math.floor(i / 3) * 4;
      const normal = normals.length ? normals.slice(i, i + 3) : [0, 0, 1];
      const color = selected
        ? SELECTED_SOLID_COLOR
        : colors.length
          ? colors.slice(colorIndex, colorIndex + 4)
          : [0.2, 0.72, 1, 1];
      solidVertices.push(
        positions[i], positions[i + 1], positions[i + 2],
        normal[0] ?? 0, normal[1] ?? 0, normal[2] ?? 1,
        color[0] ?? 1, color[1] ?? 1, color[2] ?? 1, color[3] ?? 1
      );
    }

    (solid.indices ?? []).forEach((index) => {
      solidIndices.push(index + vertexOffset);
    });
    vertexOffset += Math.floor(positions.length / 3);
  });

  const lineVertices = [];
  toolpaths.forEach((toolpath) => {
    pushLineSegments(lineVertices, toolpath.points ?? [], colorForToolpath(toolpath, selectedEntityId));
  });
  axes.forEach((axis) => {
    pushLineSegments(lineVertices, axis.points ?? [], axis.color ?? [1, 1, 1, 1]);
  });

  return {
    key: createSceneBufferKey(scene, selectedEntityId),
    solidVertices: new Float32Array(solidVertices),
    solidIndices: new Uint32Array(solidIndices),
    lineVertices: new Float32Array(lineVertices),
    triangleCount: Math.floor(solidIndices.length / 3),
    segmentCount: Math.floor(lineVertices.length / 14),
    drawCount: (solidIndices.length ? 1 : 0) + (lineVertices.length ? 1 : 0)
  };
};
