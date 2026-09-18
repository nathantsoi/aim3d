import { describe, expect, it } from 'vitest';
import { createDefaultViewportScene } from '../contracts/coreState';
import { createTopologyBoxSolid } from '../contracts/topologyBoxSolid';
import {
  cameraEye,
  cameraUp,
  closestSolidToRay,
  entitiesInRect,
  groundPlanePoint,
  homeCamera,
  orbitAroundPivot,
  panTarget,
  projectToScreen,
  solidsBounds,
  solidCentroid,
  sceneHasSolidGeometry,
  zoomDistance
} from './viewportControls';

const distance3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// The default viewport scene is empty (no solids) by design; several tests
// need a scene that actually contains pickable solid geometry, so build one.
const sceneWithSolid = () => {
  const scene = createDefaultViewportScene();
  scene.solids = [
    createTopologyBoxSolid({
      min: [-1.8, -1.2, -0.35],
      max: [1.8, 1.2, 0.35],
      id: 'solid_MainPocket_1',
      bodyId: 2,
      sourceToken: 'feat_Extrude_1_face_0'
    })
  ];
  return scene;
};

describe('viewport controls (Z-up, -Y forward)', () => {
  it('places the eye on +Y looking forward at yaw 0 / pitch 0', () => {
    const eye = cameraEye({ target: [0, 0, 0], distance: 5, yaw: 0, pitch: 0 });
    expect(eye[0]).toBeCloseTo(0, 6);
    expect(eye[1]).toBeCloseTo(5, 6);
    expect(eye[2]).toBeCloseTo(0, 6);
  });

  it('raises the eye along +Z as pitch approaches vertical', () => {
    const eye = cameraEye({ target: [0, 0, 0], distance: 5, yaw: 0, pitch: Math.PI / 2 });
    expect(eye[2]).toBeCloseTo(5, 6);
  });

  it('zooms exponentially and clamps to bounds', () => {
    expect(zoomDistance(10, -120)).toBeLessThan(10);
    expect(zoomDistance(10, 120)).toBeGreaterThan(10);
    expect(zoomDistance(1, -10000)).toBeGreaterThanOrEqual(0.4);
    expect(zoomDistance(1, 10000)).toBeLessThanOrEqual(120);
  });

  it('pans the target across the view plane', () => {
    const camera = { target: [0, 0, 0], distance: 5, yaw: 0.5, pitch: 0.4 };
    const moved = panTarget(camera, 40, 20, 800, 600);
    expect(distance3(moved, camera.target)).toBeGreaterThan(0);
  });

  it('does not move the view when an orbit starts (zero delta is identity)', () => {
    const camera = { target: [0, 0, 0], distance: 5, yaw: 0.5, pitch: 0.4 };
    const before = cameraEye(camera);
    const orbited = { ...camera, ...orbitAroundPivot(camera, [1, 0.5, 0], 0, 0) };

    expect(distance3(cameraEye(orbited), before)).toBeLessThan(1e-9);
  });

  it('orbits the eye around an off-center pivot at a constant radius', () => {
    const camera = { target: [0, 0, 0], distance: 5, yaw: 0.5, pitch: 0.4 };
    const pivot = [2, 1, 0];
    const radiusBefore = distance3(cameraEye(camera), pivot);
    const orbited = { ...camera, ...orbitAroundPivot(camera, pivot, 0.3, 0.1) };

    expect(distance3(cameraEye(orbited), pivot)).toBeCloseTo(radiusBefore, 6);
  });

  it('allows orbiting past the vertical pole, flipping the up vector', () => {
    const camera = { target: [0, 0, 0], distance: 5, yaw: 0, pitch: 1.4 };
    const orbited = { ...camera, ...orbitAroundPivot(camera, [0, 0, 0], 0, 0.4) };

    expect(orbited.pitch).toBeGreaterThan(Math.PI / 2);
    expect(cameraUp(orbited)[2]).toBeLessThan(0);
  });

  it('intersects the ground plane only for rays pointing toward z = 0', () => {
    expect(groundPlanePoint({ origin: [0, 0, 5], direction: [0, 0, -1] })).toEqual([0, 0, 0]);
    expect(groundPlanePoint({ origin: [0, 0, 5], direction: [0, 0, 1] })).toBeNull();
    expect(groundPlanePoint({ origin: [0, 0, 5], direction: [1, 0, 0] })).toBeNull();
  });

  it('selects entities whose projection falls inside the rubber-band rectangle', () => {
    const scene = sceneWithSolid();
    const width = 800;
    const height = 600;

    const fullScreen = { minX: 0, minY: 0, maxX: width, maxY: height };
    const hits = entitiesInRect(scene, fullScreen, width, height);
    expect(hits.some((id) => /^body:2\//.test(id))).toBe(true);

    const cornerSpeck = { minX: 0, minY: 0, maxX: 2, maxY: 2 };
    expect(entitiesInRect(scene, cornerSpeck, width, height)).toHaveLength(0);
  });

  it('distinguishes window (enclosed) from crossing (touched) selection', () => {
    const scene = sceneWithSolid();
    const width = 800;
    const height = 600;

    // A rectangle that covers only part of the solid: crossing selects
    // touched faces while a tight corner speck selects nothing in window mode.
    const partial = { minX: 0, minY: 0, maxX: width / 2, maxY: height / 2 };
    expect(entitiesInRect(scene, partial, width, height, {
      mode: 'crossing',
      filters: { bodyFaces: true, bodyEdges: false, bodyVertices: false }
    }).some((id) => /^body:2\/face:/.test(id))).toBe(true);

    const cornerSpeck = { minX: 0, minY: 0, maxX: 8, maxY: 8 };
    expect(entitiesInRect(scene, cornerSpeck, width, height, {
      mode: 'window',
      filters: { bodyFaces: true, bodyEdges: true, bodyVertices: true }
    })).toHaveLength(0);

    // A full-canvas rectangle encloses the solid, so window selects it too.
    const full = { minX: 0, minY: 0, maxX: width, maxY: height };
    expect(entitiesInRect(scene, full, width, height, { mode: 'window' })
      .some((id) => /^body:2\//.test(id))).toBe(true);
  });

  it('honours selection filters when marquee-selecting', () => {
    const scene = sceneWithSolid();
    const full = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    expect(
      entitiesInRect(scene, full, 800, 600, {
        mode: 'window',
        filters: { bodyFaces: false, bodyEdges: false, bodyVertices: false }
      })
    ).toHaveLength(0);
  });

  it('computes the bounds center and radius of solid geometry', () => {
    const bounds = solidsBounds([
      { positions: [-2, -1, 0, 2, 1, 4] }
    ]);
    expect(bounds.center).toEqual([0, 0, 2]);
    expect(bounds.radius).toBeCloseTo(0.5 * Math.hypot(4, 2, 4), 6);
  });

  it('frames the scene geometry from the home view', () => {
    const scene = sceneWithSolid();
    const home = homeCamera(scene);
    const bounds = solidsBounds(scene.solids);

    expect(home.target).toEqual(bounds.center);
    expect(home.projection).toBe('perspective');
    expect(home.distance).toBeGreaterThan(0);
  });

  it('falls back to the origin when the scene has no geometry', () => {
    const home = homeCamera({ solids: [] });
    expect(home.target).toEqual([0, 0, 0]);
    expect(home.distance).toBeGreaterThan(0);
  });

  it('finds the centroid of the solid closest to the orbit ray', () => {
    const scene = {
      solids: [
        { positions: [9, 9, 9, 11, 11, 11] },
        { positions: [-1, -1, 0, 1, 1, 0] }
      ]
    };
    const ray = { origin: [0, 0, 10], direction: [0, 0, -1] };

    expect(solidCentroid(scene.solids[1])).toEqual([0, 0, 0]);
    expect(closestSolidToRay(scene, ray)).toEqual([0, 0, 0]);
  });

  it('returns no orbit pivot when the scene has no geometry', () => {
    expect(closestSolidToRay({ solids: [] }, { origin: [0, 0, 5], direction: [0, 0, -1] })).toBeNull();
  });

  it('detects whether the scene contains solid geometry', () => {
    expect(sceneHasSolidGeometry({ solids: [] })).toBe(false);
    expect(sceneHasSolidGeometry(createDefaultViewportScene())).toBe(false);
    expect(sceneHasSolidGeometry(sceneWithSolid())).toBe(true);
  });

  it('projects points in front of the camera onto the canvas', () => {
    const scene = createDefaultViewportScene();
    const projected = projectToScreen(scene.camera, [0, 0, 0], 800, 600);
    expect(projected.visible).toBe(true);
    expect(projected.x).toBeGreaterThan(0);
    expect(projected.x).toBeLessThan(800);
    expect(projected.y).toBeGreaterThan(0);
    expect(projected.y).toBeLessThan(600);
  });
});
