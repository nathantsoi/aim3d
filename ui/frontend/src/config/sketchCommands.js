const field = (key, type, label, extra = {}) => ({ key, type, label, ...extra });

export const SKETCH_COMMAND_DEFS = {
  Line: {
    label: 'Line',
    kind: 'Line',
    fields: [
      field('start', 'point', 'Start point'),
      field('end', 'point', 'End point')
    ],
    buildElement(values, resolve) {
      return {
        kind: 'Line',
        points: [values.start, values.end].filter(Boolean),
        radius: 0,
        value: 0,
        construction: false
      };
    }
  },
  Rectangle2Point: {
    label: '2-Point Rectangle',
    kind: 'Rectangle2Point',
    fields: [
      field('cornerA', 'point', 'First corner'),
      field('cornerB', 'point', 'Opposite corner')
    ],
    buildElement(values) {
      return {
        kind: 'Rectangle2Point',
        points: [values.cornerA, values.cornerB].filter(Boolean),
        radius: 0,
        value: 0,
        construction: false
      };
    }
  },
  RectangleCenter: {
    label: 'Center Rectangle',
    kind: 'RectangleCenter',
    fields: [
      field('center', 'point', 'Center point'),
      field('corner', 'point', 'Corner point')
    ],
    buildElement(values) {
      const center = values.center;
      const corner = values.corner;
      if (!center || !corner) {
        return { kind: 'RectangleCenter', points: [], radius: 0, value: 0, construction: false };
      }
      const du = corner[0] - center[0];
      const dv = corner[1] - center[1];
      return {
        kind: 'RectangleCenter',
        points: [
          center,
          [center[0] + du, center[1] + dv],
          [center[0] - du, center[1] - dv],
          [center[0] + du, center[1] - dv]
        ],
        radius: 0,
        value: 0,
        construction: false
      };
    }
  },
  CircleCenterDiameter: {
    label: 'Center Diameter Circle',
    kind: 'CircleCenterDiameter',
    fields: [
      field('center', 'point', 'Center point'),
      field('radius', 'dimension', 'Radius', { default: 10, unit: 'mm', bindRadius: true })
    ],
    buildElement(values, resolve) {
      const radius = resolve(values.radius ?? 10);
      return {
        kind: 'CircleCenterDiameter',
        points: values.center ? [values.center] : [],
        radius,
        value: radius,
        construction: false
      };
    }
  }
};

const RIBBON_TO_KIND = {
  line: 'Line',
  'rectangle-2-point': 'Rectangle2Point',
  'rectangle-center': 'RectangleCenter',
  'circle-center-diameter': 'CircleCenterDiameter'
};

export const sketchKindFromRibbonId = (ribbonId) => RIBBON_TO_KIND[ribbonId] ?? null;

export const getSketchCommandDef = (kind) => SKETCH_COMMAND_DEFS[kind] ?? null;

export const defaultSketchFieldValues = (def) => {
  const values = {};
  def.fields.forEach((item) => {
    if (item.type === 'point') {
      values[item.key] = null;
    } else     if (item.type === 'dimension') {
      values[item.key] = null;
    }
  });
  return values;
};

export const canConfirmSketchElement = (draft, resolveNumeric) => {
  if (!draft?.kind) return false;
  const def = getSketchCommandDef(draft.kind);
  if (!def) return false;
  return def.fields.every((item) => {
    if (item.type === 'point') {
      return Array.isArray(draft.values[item.key]) && draft.values[item.key].length === 2;
    }
    if (item.type === 'dimension') {
      const resolved = resolveNumeric(draft.values[item.key]);
      return Number.isFinite(resolved) && resolved > 0;
    }
    return true;
  });
};

export const buildSketchElementFromDraft = (draft, resolveNumeric) => {
  const def = getSketchCommandDef(draft.kind);
  if (!def) return null;
  return def.buildElement(draft.values, resolveNumeric);
};
