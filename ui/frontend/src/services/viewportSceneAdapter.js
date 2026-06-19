import { CONSTRUCTION_PLANE_FILL_COLOR } from '../contracts/constructionGeometry.js';
import { buildCameraGizmoLines, buildCameraLookAxisLine, buildOrbitPivotLines } from './viewportDebugGizmos.js';

const SELECTED_SOLID_COLOR = [1, 0.82, 0.24, 1];
const HOVERED_SOLID_COLOR = [0.5, 0.95, 1, 1];
const STALE_TOOLPATH_COLOR = [0.92, 0.42, 0.22, 1];

const fnv1a = (value) => {
  const text = JSON.stringify(value, (k, v) => {
    if (k === 'positions' || k === 'normals' || k === 'indices' || k === 'colors' || k === 'points') {
      return `[Array ${v?.length}]`;
    }
    return v;
  });
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

// Toolpaths are continuous polylines: each xyz connects to the next.
const pushPolylineSegments = (vertices, points, color) => {
  for (let i = 0; i + 5 < points.length; i += 3) {
    vertices.push(
      points[i], points[i + 1], points[i + 2], color[0], color[1], color[2], color[3],
      points[i + 3], points[i + 4], points[i + 5], color[0], color[1], color[2], color[3]
    );
  }
};

// Construction axes/points and grid gizmos store independent segments:
// [x0,y0,z0, x1,y1,z1, ...].
const pushSegmentPairs = (vertices, points, color) => {
  for (let i = 0; i + 5 < points.length; i += 6) {
    vertices.push(
      points[i], points[i + 1], points[i + 2], color[0], color[1], color[2], color[3],
      points[i + 3], points[i + 4], points[i + 5], color[0], color[1], color[2], color[3]
    );
  }
};

const pushPlaneFill = (vertices, indices, item, vertexOffset) => {
  const positions = item.positions ?? [];
  const normals = item.normals ?? [];
  const color = item.color ?? CONSTRUCTION_PLANE_FILL_COLOR;
  const base = vertexOffset;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const normal = normals.length ? normals.slice(i, i + 3) : [0, 0, 1];
    vertices.push(
      positions[i], positions[i + 1], positions[i + 2],
      normal[0], normal[1], normal[2],
      color[0], color[1], color[2], color[3]
    );
  }
  (item.indices ?? []).forEach((index) => indices.push(index + base));
  return Math.floor(positions.length / 3);
};

const isPlaneFillItem = (item) =>
  item.renderMode === 'planeFill' || item.category === 'plane' || item.category === 'ucs';

const GRID_LINE_COLOR = [0.32, 0.36, 0.46, 0.85];
const GRID_AXIS_COLOR = [0.5, 0.56, 0.7, 1];

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];

const worldPointOnPlane = (frame, u, v) => {
  const { origin, axisU, axisV } = frame;
  return add(add(origin, scale(axisU, u)), scale(axisV, v));
};

const buildSketchGridLines = (frame, extent = 5, step = 0.5) => {
  const lines = [];
  const divisions = Math.round(extent / step);
  const planeFrame = frame ?? {
    origin: [0, 0, 0],
    axisU: [1, 0, 0],
    axisV: [0, 1, 0]
  };
  for (let i = -divisions; i <= divisions; i++) {
    const offset = i * step;
    const color = i === 0 ? GRID_AXIS_COLOR : GRID_LINE_COLOR;
    const a = worldPointOnPlane(planeFrame, -extent, offset);
    const b = worldPointOnPlane(planeFrame, extent, offset);
    const c = worldPointOnPlane(planeFrame, offset, -extent);
    const d = worldPointOnPlane(planeFrame, offset, extent);
    lines.push({ color, points: [a[0], a[1], a[2], b[0], b[1], b[2]] });
    lines.push({ color, points: [c[0], c[1], c[2], d[0], d[1], d[2]] });
  }
  return lines;
};

const buildGroundGridLines = (extent = 5, step = 0.5) => {
  const lines = [];
  const divisions = Math.round(extent / step);
  for (let i = -divisions; i <= divisions; i++) {
    const offset = i * step;
    const color = i === 0 ? GRID_AXIS_COLOR : GRID_LINE_COLOR;
    lines.push({ color, points: [-extent, offset, 0, extent, offset, 0] });
    lines.push({ color, points: [offset, -extent, 0, offset, extent, 0] });
  }
  return lines;
};

export const createSceneBufferKey = (scene, selectedEntityId = null, hoverEntityId = null) => fnv1a({
  solids: scene?.solids ?? [],
  toolpaths: scene?.toolpaths ?? [],
  construction: scene?.construction ?? [],
  previewConstruction: scene?.previewConstruction ?? null,
  sketchOverlay: scene?.sketchOverlay ?? null,
  gizmos: scene?.gizmos ?? {},
  selectedEntityId,
  hoverEntityId
});

const pickableForSolid = (solid, solidIndex, vertexOffset) => {
  const pickable = solid.pickable ?? {};
  return {
    solidId: solid.id ?? `solid_${solidIndex}`,
    bodyId: solid.bodyId ?? null,
    entityId: pickable.entityId ?? solid.sourceToken ?? solid.id ?? null,
    kind: pickable.kind ?? 'B-rep Entity',
    priority: pickable.priority ?? 0,
    snapPoints: pickable.snapPoints ?? [],
    vertexOffset,
    indexStart: 0,
    indexCount: solid.indices?.length ?? 0
  };
};

export const adaptViewportScene = (scene, selectedEntityId = null, hoverEntityId = null, hideStock = false) => {
  const solids = scene?.solids ?? [];
  const toolpaths = scene?.toolpaths ?? [];
  const construction = [
    ...(scene?.construction ?? []),
    ...(scene?.previewConstruction ? [scene.previewConstruction] : [])
  ];
  const axes = scene?.gizmos?.axes ?? [];

  let totalSolidVertices = 0;
  let totalSolidIndices = 0;
  solids.forEach(solid => {
    if (hideStock && solid.id === 'solid_stock') return;
    totalSolidVertices += ((solid.positions?.length ?? 0) / 3) * 10;
    totalSolidIndices += solid.indices?.length ?? 0;
  });

  const solidVertices = new Float32Array(totalSolidVertices);
  const solidIndices = new Uint32Array(totalSolidIndices);
  
  const constructionVertices = [];
  const constructionIndices = [];
  const pickables = [];
  
  let vIndex = 0;
  let iIndex = 0;
  let vertexOffset = 0;
  let constructionVertexOffset = 0;

  solids.forEach((solid, solidIndex) => {
    if (hideStock && solid.id === 'solid_stock') return;
    const positions = solid.positions ?? [];
    const normals = solid.normals ?? [];
    const colors = solid.colors ?? [];
    const entityId = solid.pickable?.entityId ?? solid.sourceToken ?? solid.id;
    const selected = entityId === selectedEntityId || solid.id === selectedEntityId;
    const hovered = !selected && (entityId === hoverEntityId || solid.id === hoverEntityId);
    const pickable = pickableForSolid(solid, solidIndex, vertexOffset);
    pickable.indexStart = solidIndices.length;

    for (let i = 0; i + 2 < positions.length; i += 3) {
      const colorIndex = Math.floor(i / 3) * 4;
      const normal = normals.length ? normals.slice(i, i + 3) : [0, 0, 1];
      const color = selected
        ? SELECTED_SOLID_COLOR
        : hovered
          ? HOVERED_SOLID_COLOR
          : colors.length
            ? colors.slice(colorIndex, colorIndex + 4)
            : [0.2, 0.72, 1, 1];
      solidVertices[vIndex++] = positions[i];
      solidVertices[vIndex++] = positions[i + 1];
      solidVertices[vIndex++] = positions[i + 2];
      solidVertices[vIndex++] = normal[0] ?? 0;
      solidVertices[vIndex++] = normal[1] ?? 0;
      solidVertices[vIndex++] = normal[2] ?? 1;
      solidVertices[vIndex++] = color[0] ?? 1;
      solidVertices[vIndex++] = color[1] ?? 1;
      solidVertices[vIndex++] = color[2] ?? 1;
      solidVertices[vIndex++] = color[3] ?? 1;
    }

    const indices = solid.indices ?? [];
    for (let j = 0; j < indices.length; j++) {
      solidIndices[iIndex++] = indices[j] + vertexOffset;
    }
    pickable.indexCount = iIndex - pickable.indexStart;
    pickables.push(pickable);
    vertexOffset += Math.floor(positions.length / 3);
  });

  if (scene?.gizmos?.originVisible !== false && Array.isArray(scene?.gizmos?.originPlanes)) {
    scene.gizmos.originPlanes.forEach((plane) => {
      const selected = plane.id === selectedEntityId;
      const hovered = !selected && plane.id === hoverEntityId;
      const color = selected
        ? [SELECTED_SOLID_COLOR[0], SELECTED_SOLID_COLOR[1], SELECTED_SOLID_COLOR[2], 0.45]
        : hovered
          ? [HOVERED_SOLID_COLOR[0], HOVERED_SOLID_COLOR[1], HOVERED_SOLID_COLOR[2], 0.45]
          : plane.color;

      const planeItem = {
        ...plane,
        color,
        renderMode: 'planeFill'
      };

      constructionVertexOffset += pushPlaneFill(
        constructionVertices,
        constructionIndices,
        planeItem,
        constructionVertexOffset
      );

      pickables.push({
        solidId: plane.id,
        bodyId: null,
        entityId: plane.id,
        kind: 'Origin Plane',
        priority: -10,
        snapPoints: [],
        vertexOffset: 0,
        indexStart: 0,
        indexCount: 6
      });
    });
  }

  axes.forEach((axis) => {
    if (scene?.gizmos?.originVisible === false && axis.id.startsWith('axis_')) return;
      if (axis.positions && axis.indices) {
        const selected = axis.id === selectedEntityId;
        const hovered = !selected && axis.id === hoverEntityId;
        const color = selected
          ? SELECTED_SOLID_COLOR
          : hovered
            ? HOVERED_SOLID_COLOR
            : axis.color;

        const axisItem = { ...axis, color, renderMode: 'planeFill' };
        constructionVertexOffset += pushPlaneFill(
          constructionVertices,
          constructionIndices,
          axisItem,
          constructionVertexOffset
        );

        pickables.push({
          solidId: axis.id,
          bodyId: null,
          entityId: axis.id,
          kind: 'Axis',
          priority: 10,
          snapPoints: [],
          vertexOffset: 0,
          indexStart: 0,
          indexCount: axis.indices.length
        });
      }
    });
  if (scene?.gizmos?.showSketchPlaneIndicator && scene?.gizmos?.sketchGridFrame) {
    const frame = scene.gizmos.sketchGridFrame;
    const { origin, axisU, axisV, normal, extent = 5 } = frame;
    const [ox, oy, oz] = origin;
    const [ux, uy, uz] = axisU;
    const [vx, vy, vz] = axisV;
    const [nx, ny, nz] = normal ?? [0, 0, 1];

    const corners = [
      [ox - ux * extent - vx * extent, oy - uy * extent - vy * extent, oz - uz * extent - vz * extent],
      [ox + ux * extent - vx * extent, oy + uy * extent - vy * extent, oz + uz * extent - vz * extent],
      [ox + ux * extent + vx * extent, oy + uy * extent + vy * extent, oz + uz * extent + vz * extent],
      [ox - ux * extent + vx * extent, oy - uy * extent + vy * extent, oz - uz * extent + vz * extent]
    ];

    const planeItem = {
      positions: corners.flat(),
      normals: [nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz],
      color: [1, 0.55, 0.15, 0.35],
      indices: [0, 1, 2, 0, 2, 3]
    };

    constructionVertexOffset += pushPlaneFill(
      constructionVertices,
      constructionIndices,
      planeItem,
      constructionVertexOffset
    );
  }

  construction.forEach((item) => {
    if (item.visible === false) return;
    if (isPlaneFillItem(item)) {
      constructionVertexOffset += pushPlaneFill(
        constructionVertices,
        constructionIndices,
        item,
        constructionVertexOffset
      );
      return;
    }
  });

  const lineVertices = [];
  const overlayLineVertices = [];
  if (scene?.gizmos?.sketchGrid) {
    const gridFrame = scene.gizmos.sketchGridFrame;
    const gridExtent = gridFrame?.extent ?? 5;
    buildSketchGridLines(gridFrame, gridExtent).forEach((line) => {
      pushSegmentPairs(overlayLineVertices, line.points, line.color);
    });
  }
  if (scene?.sketchOverlay?.points?.length) {
    pushSegmentPairs(
      overlayLineVertices,
      scene.sketchOverlay.points,
      scene.sketchOverlay.color ?? [0.35, 0.9, 1, 0.85]
    );
  }
  if (scene?.gizmos?.grid) {
    buildGroundGridLines().forEach((line) => {
      pushSegmentPairs(lineVertices, line.points, line.color);
    });
  }
  toolpaths.forEach((toolpath) => {
    pushPolylineSegments(lineVertices, toolpath.points ?? [], colorForToolpath(toolpath, selectedEntityId));
  });
  construction.forEach((item) => {
    if (item.visible === false || isPlaneFillItem(item)) return;
    pushSegmentPairs(lineVertices, item.points ?? [], item.color ?? [0.95, 0.85, 0.25, 1]);
  });
  axes.forEach((axis) => {
    if (scene?.gizmos?.originVisible === false && axis.id.startsWith('axis_')) return;
    if (!axis.positions || !axis.indices) {
      pushSegmentPairs(lineVertices, axis.points ?? [], axis.color ?? [1, 1, 1, 1]);
    }
  });

  const debug = scene?.gizmos?.debug;
  if (debug?.enabled) {
    buildOrbitPivotLines(debug.orbitPivot, { active: debug.orbitActive }).forEach((line) => {
      pushSegmentPairs(lineVertices, line.points, line.color);
    });
    if (debug.mainCamera) {
      buildCameraGizmoLines(debug.mainCamera).forEach((line) => {
        pushSegmentPairs(lineVertices, line.points, line.color);
      });
    } else {
      buildCameraLookAxisLine(scene?.camera).forEach((line) => {
        pushSegmentPairs(lineVertices, line.points, line.color);
      });
    }
  }

  const constructionTriangleCount = Math.floor(constructionIndices.length / 3);

  return {
    key: createSceneBufferKey(scene, selectedEntityId, hoverEntityId),
    solidVertices: solidVertices,
    solidIndices: solidIndices,
    constructionVertices: new Float32Array(constructionVertices),
    constructionIndices: new Uint32Array(constructionIndices),
    lineVertices: new Float32Array(lineVertices),
    overlayLineVertices: new Float32Array(overlayLineVertices),
    pickables,
    triangleCount: Math.floor(solidIndices.length / 3) + constructionTriangleCount,
    segmentCount:
      Math.floor(lineVertices.length / 14) + Math.floor(overlayLineVertices.length / 14),
    drawCount:
      (solidIndices.length ? 1 : 0) +
      (constructionIndices.length ? 1 : 0) +
      (lineVertices.length ? 1 : 0) +
      (overlayLineVertices.length ? 1 : 0)
  };
};
