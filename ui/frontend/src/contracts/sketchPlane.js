const ORIGIN_PLANE_OPTIONS = [
  { id: 'origin_XY', label: 'Origin XY' },
  { id: 'origin_XZ', label: 'Origin XZ' },
  { id: 'origin_YZ', label: 'Origin YZ' }
];

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
