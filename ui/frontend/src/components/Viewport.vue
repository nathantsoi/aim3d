<template>
  <div class="viewport-container">
    <canvas ref="canvas3D" class="graphics-canvas"></canvas>
    <div v-if="debugModeEnabled" class="debug-overview glass" data-testid="viewport-debug-overview">
      <canvas ref="debugCanvas" class="debug-overview-canvas"></canvas>
      <span class="debug-overview-label">Scene overview</span>
    </div>
    <div
      v-if="selectionRect"
      class="selection-rect"
      :class="{ crossing: selectionRectMode === 'crossing' }"
      data-testid="selection-rect"
      :style="selectionRectStyle"
    ></div>

    <div
      v-if="selectOther"
      class="select-other glass"
      data-testid="select-other-menu"
      :style="{ left: `${selectOther.x}px`, top: `${selectOther.y}px` }"
      @pointerleave="previewSelectOther(null)"
    >
      <div class="select-other-title">Select Other</div>
      <button
        v-for="(candidate, index) in selectOther.candidates"
        :key="`${candidate.entityId}_${index}`"
        class="select-other-row"
        data-testid="select-other-row"
        @pointerenter="previewSelectOther(candidate.entityId)"
        @click.stop="commitSelectOther(candidate.entityId, $event)"
      >
        <span class="select-other-kind">{{ candidate.kind }}</span>
        <span class="select-other-id">{{ candidate.entityId }}</span>
      </button>
    </div>
    <div v-if="fallbackMessage" class="viewport-fallback glass" data-testid="webgpu-fallback">
      {{ fallbackMessage }}
    </div>

    <div v-if="debugOverlayVisible" class="viewport-overlay glass" data-testid="viewport-debug-overlay">
      <div class="stat-row">
        <span class="label">Graphics Context:</span>
        <span class="value accent-text">{{ diagnostics.webgpuAvailable ? 'WebGPU' : 'Unavailable' }}</span>
      </div>
      <div class="stat-row">
        <span class="label">Render Latency:</span>
        <span class="value">{{ diagnostics.frameTimeMs.toFixed(1) }} ms ({{ Math.round(diagnostics.fps) }} FPS)</span>
      </div>
      <div class="stat-row">
        <span class="label">Scene:</span>
        <span class="value">{{ diagnostics.triangleCount }} tris / {{ diagnostics.segmentCount }} lines</span>
      </div>
      <div class="stat-row">
        <span class="label">Selected Entity:</span>
        <span class="value highlight-text">{{ store.selectedEntityId || 'None' }}</span>
      </div>
      <div class="stat-row">
        <span class="label">Hovered Entity:</span>
        <span class="value highlight-text">{{ diagnostics.hoverTargetId || 'None' }}</span>
      </div>
      <div v-if="debugModeEnabled" class="stat-row">
        <span class="label">Orbit pivot:</span>
        <span class="value">{{ orbitPivotLabel }}</span>
      </div>
      <div v-if="debugModeEnabled" class="stat-row">
        <span class="label">Look-at axis:</span>
        <span class="value">eye → target (not pick ray)</span>
      </div>
    </div>

    <div class="viewport-toolbar">
      <div class="viewport-settings">
        <button
          class="tool-btn glass"
          title="View settings"
          data-testid="viewport-settings-toggle"
          @click="settingsOpen = !settingsOpen"
        >
          &#9881;
        </button>
        <div v-if="settingsOpen" class="settings-menu glass" data-testid="viewport-settings-menu">
          <label class="settings-row">
            <span>Show grid</span>
            <input
              type="checkbox"
              data-testid="viewport-grid-toggle"
              :checked="gridEnabled"
              @change="store.toggleViewportGrid()"
            />
          </label>
          <label class="settings-row">
            <span>Show debug info</span>
            <input
              type="checkbox"
              data-testid="viewport-debug-overlay-toggle"
              :checked="debugOverlayVisible"
              @change="debugOverlayVisible = !debugOverlayVisible"
            />
          </label>
          <label class="settings-row">
            <span>Debug mode (3D overview)</span>
            <input
              type="checkbox"
              data-testid="viewport-debug-mode-toggle"
              :checked="debugModeEnabled"
              @change="store.toggleViewportDebugMode()"
            />
          </label>
        </div>
      </div>

      <div class="viewport-settings">
        <button
          class="tool-btn glass"
          title="Show/hide planes, edges, points & stock"
          data-testid="view-visibility-toggle"
          @click="viewMenuOpen = !viewMenuOpen"
        >
          &#128065;
        </button>
        <div v-if="viewMenuOpen" class="settings-menu glass" data-testid="view-visibility-menu">
          <div class="settings-group-label">View</div>
          <label
            v-for="item in viewVisibilityItems"
            :key="item.id"
            class="settings-row"
          >
            <span>{{ item.label }}</span>
            <input
              type="checkbox"
              :data-testid="`view-visibility-${item.id}`"
              :checked="viewVisibility[item.id]"
              @change="store.toggleViewportElementVisibility(item.id)"
            />
          </label>
          <label class="settings-row">
            <span>Stock</span>
            <input
              type="checkbox"
              data-testid="view-visibility-stock"
              :checked="store.showStock !== false"
              @change="store.toggleStockVisibility()"
            />
          </label>
        </div>
      </div>

      <div class="viewport-settings">
        <button
          class="tool-btn glass"
          :class="{ active: store.selectionPriority }"
          title="Selection priority & filters"
          data-testid="selection-menu-toggle"
          @click="selectMenuOpen = !selectMenuOpen"
        >
          &#9737;
        </button>
        <div v-if="selectMenuOpen" class="settings-menu glass" data-testid="selection-menu">
          <div class="settings-group-label">Selection Priority</div>
          <label
            v-for="mode in selectionPriorityModes"
            :key="mode.id"
            class="settings-row"
          >
            <span>{{ mode.label }}</span>
            <input
              type="radio"
              :data-testid="`selection-priority-${mode.id}`"
              :checked="store.selectionPriority === mode.id"
              @click="store.setSelectionPriority(mode.id)"
            />
          </label>
          <div class="settings-group-label">Selection Filters</div>
          <label
            v-for="filter in selectionFilterList"
            :key="filter.id"
            class="settings-row"
          >
            <span>{{ filter.label }}</span>
            <input
              type="checkbox"
              :data-testid="`selection-filter-${filter.id}`"
              :checked="store.selectionFilters[filter.id] !== false"
              @change="store.toggleSelectionFilter(filter.id)"
            />
          </label>
        </div>
      </div>

      <button
        class="tool-btn glass"
        title="Home: re-center the view"
        data-testid="viewport-home"
        @click="goHome"
      >
        &#8962;
      </button>

      <div class="nav-cube glass" data-testid="nav-cube">
        <div class="nav-cube-scene">
          <div class="nav-cube-body" :style="navCubeStyle">
            <span class="cube-face front">FRONT</span>
            <span class="cube-face back">BACK</span>
            <span class="cube-face right">RIGHT</span>
            <span class="cube-face left">LEFT</span>
            <span class="cube-face top">TOP</span>
            <span class="cube-face bottom">BOT</span>
          </div>
        </div>
      </div>
    </div>

    <SimulationPlaybackPanel />
  </div>
</template>

<script>
import { computed, defineComponent, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useCoreStore } from '../store';
import SimulationPlaybackPanel from './SimulationPlaybackPanel.vue';
import { createWebGpuViewportRenderer } from '../services/webgpuRenderer';
import { popPendingCuts } from '../services/coreWasm';
import { createCameraRay, pickAllViewportEntities, pickViewportEntity } from '../services/viewportPicking';
import { overviewCamera } from '../services/viewportDebugGizmos';
import {
  clamp,
  closestSolidToRay,
  entitiesInRect,
  groundPlanePoint,
  homeCamera,
  normalizeRect,
  orbitAroundPivot,
  panTarget,
  sceneHasSolidGeometry,
  zoomDistance
} from '../services/viewportControls';

const ORBIT_SENSITIVITY = 0.0015;
// Clamp per-event rotation so trackpad momentum can't spin the view.
const MAX_ORBIT_STEP = 0.04;
// A pause longer than this starts a fresh orbit gesture (and a new pivot).
const ORBIT_GESTURE_GAP_MS = 180;

export default defineComponent({
  name: 'Viewport',
  components: {
    SimulationPlaybackPanel
  },
  setup() {
    const canvas3D = ref(null);
    const debugCanvas = ref(null);
    const fallbackMessage = ref('');
    const diagnostics = reactive({
      webgpuAvailable: false,
      frameTimeMs: 0,
      fps: 0,
      drawCount: 0,
      triangleCount: 0,
      segmentCount: 0,
      lastPickLatencyMs: 0,
      hoverTargetId: null,
      snapCandidateId: null
    });
    const store = useCoreStore();
    const hoverTargetId = ref(null);
    const settingsOpen = ref(false);
    const selectMenuOpen = ref(false);
    const viewMenuOpen = ref(false);
    const debugOverlayVisible = ref(true);

    // View visibility flyout: shows/hides origin planes, body edges and
    // vertices (points) in the 3D view. Hidden elements are also excluded
    // from hover/pick (see viewportPicking.js and viewportSceneAdapter.js).
    const viewVisibilityItems = [
      { id: 'planes', label: 'Planes' },
      { id: 'edges', label: 'Edges' },
      { id: 'points', label: 'Points' }
    ];
    const viewVisibility = computed(() => ({
      planes: store.viewportScene?.gizmos?.originVisible !== false,
      edges: store.viewportScene?.gizmos?.edgesVisible !== false,
      points: store.viewportScene?.gizmos?.pointsVisible !== false
    }));

    // Fusion Selection Priority tools and Selection Filters checklist.
    const selectionPriorityModes = [
      { id: 'face', label: 'Select Face Priority' },
      { id: 'body', label: 'Select Body Priority' },
      { id: 'edge', label: 'Select Edge Priority' }
    ];
    const selectionFilterList = [
      { id: 'bodies', label: 'Bodies' },
      { id: 'bodyFaces', label: 'Body Faces' },
      { id: 'bodyEdges', label: 'Body Edges' },
      { id: 'bodyVertices', label: 'Body Vertices' },
      { id: 'workGeometry', label: 'Work Geometry' },
      { id: 'selectThrough', label: 'Select Through' }
    ];

    const gridEnabled = computed(() => Boolean(store.viewportScene?.gizmos?.grid));
    const debugModeEnabled = computed(() => Boolean(store.viewportScene?.gizmos?.debug?.enabled));
    const orbitPivotLabel = computed(() => {
      const pivot = store.viewportScene?.gizmos?.debug?.orbitPivot;
      if (!pivot) return 'None';
      return pivot.map((value) => value.toFixed(2)).join(', ');
    });

    // Mirror the orbit camera onto the CSS nav cube. yaw spins the cube about the
    // vertical (world +Z), pitch tilts it forward so the top face appears as the
    // camera looks down.
    const navCubeStyle = computed(() => {
      const camera = store.viewportScene?.camera ?? {};
      const yawDeg = ((camera.yaw ?? 0) * 180) / Math.PI;
      const pitchDeg = ((camera.pitch ?? 0) * 180) / Math.PI;
      return { transform: `rotateX(${-pitchDeg}deg) rotateY(${yawDeg}deg)` };
    });

    const selectionRect = ref(null);
    const selectionRectMode = ref('window');
    const selectOther = ref(null);
    const selectionRectStyle = computed(() => {
      const rect = selectionRect.value;
      if (!rect) return {};
      return {
        left: `${rect.minX}px`,
        top: `${rect.minY}px`,
        width: `${rect.maxX - rect.minX}px`,
        height: `${rect.maxY - rect.minY}px`
      };
    });

    let renderer = null;
    let debugRenderer = null;
    let animationFrame = null;
    let disposed = false;
    let dragState = null;
    let suppressNextClick = false;
    let orbitActive = false;
    let lastWheelAt = 0;

    const ensureCamera = () => {
      if (!store.viewportScene.camera) {
        store.viewportScene.camera = {
          target: [0, 0, 0],
          distance: 5,
          yaw: 0.7,
          pitch: 0.6,
          near: 0.01,
          far: 100
        };
      }
      return store.viewportScene.camera;
    };

    const localPoint = (event, rect) => ({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    });

    // Re-center the view on the scene geometry (or the origin when empty).
    const goHome = () => {
      const camera = ensureCamera();
      Object.assign(camera, homeCamera(store.viewportScene));
    };

    const applyDiagnostics = (nextDiagnostics) => {
      Object.assign(diagnostics, nextDiagnostics);
      if (store.viewportScene?.diagnostics) {
        Object.assign(store.viewportScene.diagnostics, nextDiagnostics);
      }
    };

    const buildOverviewScene = () => {
      const scene = store.viewportScene;
      const overviewCam = overviewCamera(scene);
      return {
        ...scene,
        camera: overviewCam,
        gizmos: {
          ...scene.gizmos,
          debug: {
            ...scene.gizmos.debug,
            mainCamera: { ...scene.camera }
          }
        }
      };
    };

    const ensureDebugRenderer = async () => {
      if (!debugModeEnabled.value || !renderer?.available) return;
      if (debugRenderer?.available) return;
      await nextTick();
      if (!debugCanvas.value) return;
      debugRenderer = await createWebGpuViewportRenderer(debugCanvas.value);
    };

    const destroyDebugRenderer = () => {
      debugRenderer?.destroy?.();
      debugRenderer = null;
    };

    let voxelizerUpdating = false;
    let lastVoxelizerUpdate = 0;

    const renderLoop = () => {
      if (disposed || !renderer?.available) return;

      if (renderer.voxelizer) {
        const cuts = popPendingCuts();
        if (cuts.length > 0) {
          renderer.voxelizer.applyCuts(cuts);
          renderer.voxelizer.isDirty = true;
        }
        
        const isPaused = store.simulationPlaybackStatus !== 'playing';
        const now = performance.now();
        // If we applied cuts or we are paused (meaning we want a high fidelity mesh)
        if ((renderer.voxelizer.isDirty || isPaused) && !voxelizerUpdating && (isPaused || now - lastVoxelizerUpdate > 33)) {
          voxelizerUpdating = true;
          renderer.voxelizer.isDirty = false;
          renderer.voxelizer.extractMesh().finally(() => {
            voxelizerUpdating = false;
            lastVoxelizerUpdate = performance.now();
          });
        }
      }

      const stockVisible = store.showStock !== false;
      const inMachineContext = store.isSimulating || store.activeMode === 'machine';
      // The pickable/highlightable stock preview (solid_stock) is shown in
      // Design/Manufacture; the voxelizer's live cut mesh (not pickable) takes
      // over once actually machining/simulating. Never draw both at once.
      const hideStock = inMachineContext && renderer?.voxelizer?.vertexCount > 0;
      const showVoxelizerStock = stockVisible && inMachineContext;
      renderer.updateScene(store.viewportScene, store.selectedEntityIds, hoverTargetId.value, { hideStock });
      renderer.render(store.viewportScene, { showStock: showVoxelizerStock });
      if (debugModeEnabled.value && debugRenderer?.available) {
        const overviewScene = buildOverviewScene();
        debugRenderer.updateScene(overviewScene, store.selectedEntityIds, hoverTargetId.value);
        debugRenderer.render(overviewScene, { camera: overviewScene.camera, showStock: showVoxelizerStock });
      }
      animationFrame = requestAnimationFrame(renderLoop);
    };

    const resize = () => {
      renderer?.resize?.();
      debugRenderer?.resize?.();
    };

    // Active Fusion-style selection options (filters + priority) applied to
    // every hover/click pick so the toolbar state drives what is selectable.
    const selectionOptions = () => ({
      filters: store.selectionFilters,
      priority: store.selectionPriority,
      // In sketch mode, sketch entities take absolute precedence (Fusion). The
      // picker honours this hook today; 3D solids stay pickable until sketch
      // pickables are emitted into the scene.
      sketchMode: store.isSketchMode
    });

    const pickAtEvent = (event) => {
      const canvas = canvas3D.value;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      return pickViewportEntity(store.viewportScene, x, y, rect.width, rect.height, selectionOptions());
    };

    const applyPickDiagnostics = (pickResult) => {
      const hoverId = pickResult.hit?.entityId ?? null;
      const snapId = pickResult.hit?.snapCandidate?.id ?? null;
      hoverTargetId.value = hoverId;
      applyDiagnostics({
        ...store.viewportScene.diagnostics,
        lastPickLatencyMs: pickResult.latencyMs,
        hoverTargetId: hoverId,
        snapCandidateId: snapId
      });
      const hideStock = (store.isSimulating || store.activeMode === 'machine') && renderer?.voxelizer?.vertexCount > 0;
      renderer?.updateScene?.(store.viewportScene, store.selectedEntityIds, hoverId, { hideStock });
    };

    const closeSelectOther = () => {
      selectOther.value = null;
    };

    // Long-press over overlapping geometry opens the Fusion "Select Other" depth
    // menu, listing every entity pierced by the cursor ray front-to-back.
    const openSelectOther = (event) => {
      const canvas = canvas3D.value;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const { candidates } = pickAllViewportEntities(store.viewportScene, x, y, rect.width, rect.height);
      if (candidates.length < 2) return;
      selectOther.value = { x, y, candidates };
      suppressNextClick = true;
    };

    const previewSelectOther = (entityId) => {
      hoverTargetId.value = entityId;
    };

    const commitSelectOther = async (entityId, event) => {
      closeSelectOther();
      const additive = Boolean(event?.metaKey || event?.ctrlKey);
      if (additive) {
        await store.toggleSelection(entityId);
      } else {
        await store.setSelection([entityId]);
      }
    };

    const handleSelectionClick = async (event) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      const pickResult = pickAtEvent(event);
      applyPickDiagnostics(pickResult);
      if (store.pendingSketchElement && store.isSketchMode) {
        const canvas = canvas3D.value;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const ray = createCameraRay(store.viewportScene.camera, x, y, rect.width, rect.height);
        if (store.applyViewportSketchPick(ray)) {
          return;
        }
      }
      if (store.pendingSketchCreation && pickResult.hit?.entityId) {
        if (store.applyViewportPickToSketch(pickResult.hit.entityId)) {
          return;
        }
      }
      if (store.pendingConstruction && pickResult.hit?.entityId) {
        if (store.applyViewportPickToConstruction(pickResult.hit.entityId)) {
          return;
        }
      }

      const entityId = pickResult.hit?.entityId ?? null;
      const additive = event.metaKey || event.ctrlKey;
      if (additive) {
        // Ctrl/Cmd click adds or removes a single entity from the set.
        if (entityId) await store.toggleSelection(entityId);
        return;
      }
      if (entityId) {
        await store.selectEntity(entityId);
      } else {
        await store.clearSelection();
      }
    };

    // Click-drag draws a rubber-band rectangle that selects whatever it covers.
    const handlePointerDown = (event) => {
      if (event.button !== 0) return;
      closeSelectOther();
      const rect = canvas3D.value.getBoundingClientRect();
      const start = localPoint(event, rect);
      dragState = {
        pointerId: event.pointerId,
        startX: start.x,
        startY: start.y,
        lastX: start.x,
        moved: false,
        additive: event.metaKey || event.ctrlKey,
        longPress: setTimeout(() => {
          if (dragState && !dragState.moved) openSelectOther(event);
        }, 500)
      };
      canvas3D.value.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };

    const handlePointerMove = (event) => {
      if (!dragState) {
        applyPickDiagnostics(pickAtEvent(event));
        return;
      }
      if (dragState.pointerId !== event.pointerId) return;
      const rect = canvas3D.value.getBoundingClientRect();
      const current = localPoint(event, rect);
      dragState.lastX = current.x;
      if (Math.hypot(current.x - dragState.startX, current.y - dragState.startY) > 3) {
        dragState.moved = true;
        if (dragState.longPress) {
          clearTimeout(dragState.longPress);
          dragState.longPress = null;
        }
      }
      if (dragState.moved) {
        // Left-to-right is a window (fully enclosed); right-to-left is a
        // crossing (touched), mirroring Fusion's solid vs dashed marquee.
        selectionRectMode.value = current.x >= dragState.startX ? 'window' : 'crossing';
        selectionRect.value = normalizeRect(dragState.startX, dragState.startY, current.x, current.y);
      }
      event.preventDefault();
    };

    const handlePointerUp = async (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      canvas3D.value.releasePointerCapture?.(event.pointerId);
      if (dragState.longPress) clearTimeout(dragState.longPress);
      const wasDrag = dragState.moved;
      const additive = dragState.additive;
      const mode = event.clientX - canvas3D.value.getBoundingClientRect().left >= dragState.startX
        ? 'window'
        : 'crossing';
      const rect = selectionRect.value;
      dragState = null;
      selectionRect.value = null;

      if (!wasDrag || !rect) {
        // A plain click falls through to the click handler for point selection.
        suppressNextClick = false;
        return;
      }

      suppressNextClick = true;
      const canvasRect = canvas3D.value.getBoundingClientRect();
      const matches = entitiesInRect(store.viewportScene, rect, canvasRect.width, canvasRect.height, {
        mode,
        filters: store.selectionFilters
      });
      if (additive) {
        const union = [...new Set([...(store.selectedEntityIds ?? []), ...matches])];
        await store.setSelection(union);
      } else {
        await store.setSelection(matches);
      }
    };

    // Resolve the orbit pivot from the cursor ray. Prefer the exact point on a
    // picked entity, otherwise the centroid of the object closest to the ray,
    // then the ground plane, then the current target.
    const orbitPivot = (camera, x, y, rect) => {
      if (!sceneHasSolidGeometry(store.viewportScene)) {
        return [0, 0, 0];
      }
      const pick = pickViewportEntity(store.viewportScene, x, y, rect.width, rect.height);
      if (pick.hit?.position) return pick.hit.position;
      const ray = createCameraRay(camera, x, y, rect.width, rect.height);
      return (
        closestSolidToRay(store.viewportScene, ray) ??
        groundPlanePoint(ray) ??
        camera.target ??
        [0, 0, 0]
      );
    };

    // Trackpad gestures arrive as wheel events:
    //   ctrl + wheel  -> pinch-to-zoom
    //   shift + wheel -> orbit around the object under the cursor
    //   wheel         -> two-finger pan
    const handleWheel = (event) => {
      event.preventDefault();
      const camera = ensureCamera();
      const rect = canvas3D.value.getBoundingClientRect();

      if (event.ctrlKey) {
        orbitActive = false;
        store.setViewportOrbitDebug({ active: false });
        camera.distance = zoomDistance(camera.distance, event.deltaY);
        return;
      }

      if (event.shiftKey) {
        const now = performance.now();
        // On a fresh gesture, lock the pivot to the object under the cursor so
        // the rotation orbits that point for the whole drag (no drift/spin).
        if (!orbitActive || now - lastWheelAt > ORBIT_GESTURE_GAP_MS) {
          const { x, y } = localPoint(event, rect);
          store.setViewportOrbitDebug({ pivot: orbitPivot(camera, x, y, rect), active: true });
          orbitActive = true;
        }
        lastWheelAt = now;
        const pivot = store.viewportScene.gizmos?.debug?.orbitPivot ?? [0, 0, 0];
        const dYaw = clamp(-event.deltaX * ORBIT_SENSITIVITY, -MAX_ORBIT_STEP, MAX_ORBIT_STEP);
        const dPitch = clamp(-event.deltaY * ORBIT_SENSITIVITY, -MAX_ORBIT_STEP, MAX_ORBIT_STEP);
        Object.assign(camera, orbitAroundPivot(camera, pivot, dYaw, dPitch));
        store.setViewportOrbitDebug({ active: true });
        return;
      }

      orbitActive = false;
      store.setViewportOrbitDebug({ active: false });
      camera.target = panTarget(camera, event.deltaX, event.deltaY, rect.width, rect.height);
    };

    const preventContextMenu = (event) => {
      event.preventDefault();
    };

    onMounted(async () => {
      await nextTick();
      // Dev-only: the Playwright e2e suite loads the app with ?e2e=1 and query
      // params to pin a small, deterministic stock/resolution/tool config before
      // the WebGPU voxelizer is constructed (it is built once at mount).
      if (import.meta.env && import.meta.env.DEV) {
        const params = new URLSearchParams(window.location.search);
        if (params.get('e2e') === '1') {
          store.units = 'mm';
          store.stockSize = {
            x: Number(params.get('sx') ?? 20),
            y: Number(params.get('sy') ?? 20),
            z: Number(params.get('sz') ?? 20),
            kind: 'cuboid'
          };
          store.stockLocation = {
            x: Number(params.get('lx') ?? 0),
            y: Number(params.get('ly') ?? 0),
            z: Number(params.get('lz') ?? 0)
          };
          store.simulationResolution = Number(params.get('res') ?? 32);
          store.toolDiameter = Number(params.get('td') ?? 4);
        }
      }
      const scaleToMm = store.units === 'inch' ? 25.4 : 1.0;
      const stockSize = [
        (store.stockSize?.x ?? 25) * scaleToMm,
        (store.stockSize?.y ?? 25) * scaleToMm,
        (store.stockSize?.z ?? 25) * scaleToMm
      ];
      const stockLocation = [
        (store.stockLocation?.x ?? 0) * scaleToMm,
        (store.stockLocation?.y ?? 0) * scaleToMm,
        (store.stockLocation?.z ?? 0) * scaleToMm
      ];
      const gridResolution = store.simulationResolution ?? 128;
      renderer = await createWebGpuViewportRenderer(canvas3D.value, applyDiagnostics, { stockSize, stockLocation, gridResolution, uiScale: 1.0 / scaleToMm });
      if (!renderer.available) {
        fallbackMessage.value = renderer.reason;
        applyDiagnostics({
          ...store.viewportScene.diagnostics,
          webgpuAvailable: false
        });
        return;
      }

      fallbackMessage.value = '';
      canvas3D.value.addEventListener('click', handleSelectionClick);
      canvas3D.value.addEventListener('pointerdown', handlePointerDown);
      canvas3D.value.addEventListener('pointermove', handlePointerMove);
      canvas3D.value.addEventListener('pointerup', handlePointerUp);
      canvas3D.value.addEventListener('pointercancel', handlePointerUp);
      canvas3D.value.addEventListener('wheel', handleWheel, { passive: false });
      canvas3D.value.addEventListener('contextmenu', preventContextMenu);
      window.addEventListener('resize', resize);
      renderLoop();

      // Dev-only: let the Playwright e2e test read the live voxelizer so it can
      // assert that the gcode -> motion -> cutting pipeline actually removed
      // material (vertexCount > 0, removed voxels, cut depth).
      if (import.meta.env && import.meta.env.DEV && window.__aim3d) {
        window.__aim3d.getVoxelizer = () => renderer?.voxelizer ?? null;
      }
    });

    watch(debugModeEnabled, async (enabled) => {
      if (enabled) {
        await ensureDebugRenderer();
      } else {
        destroyDebugRenderer();
      }
    });

    watch(
      () => [store.viewportScene, store.selectedEntityIds],
      () => {
        const hideStock = (store.isSimulating || store.activeMode === 'machine') && renderer?.voxelizer?.vertexCount > 0;
        renderer?.updateScene?.(store.viewportScene, store.selectedEntityIds, hoverTargetId.value, { hideStock });
      }
    );

    onUnmounted(() => {
      disposed = true;
      if (dragState?.longPress) clearTimeout(dragState.longPress);
      if (animationFrame) cancelAnimationFrame(animationFrame);
      canvas3D.value?.removeEventListener('click', handleSelectionClick);
      canvas3D.value?.removeEventListener('pointerdown', handlePointerDown);
      canvas3D.value?.removeEventListener('pointermove', handlePointerMove);
      canvas3D.value?.removeEventListener('pointerup', handlePointerUp);
      canvas3D.value?.removeEventListener('pointercancel', handlePointerUp);
      canvas3D.value?.removeEventListener('wheel', handleWheel);
      canvas3D.value?.removeEventListener('contextmenu', preventContextMenu);
      window.removeEventListener('resize', resize);
      renderer?.destroy?.();
      destroyDebugRenderer();
    });

    return {
      canvas3D,
      debugCanvas,
      diagnostics,
      fallbackMessage,
      store,
      settingsOpen,
      selectMenuOpen,
      viewMenuOpen,
      viewVisibilityItems,
      viewVisibility,
      selectionPriorityModes,
      selectionFilterList,
      debugOverlayVisible,
      debugModeEnabled,
      orbitPivotLabel,
      gridEnabled,
      navCubeStyle,
      goHome,
      selectionRect,
      selectionRectMode,
      selectionRectStyle,
      selectOther,
      previewSelectOther,
      commitSelectOther,
      closeSelectOther
    };
  }
});
</script>

<style scoped>
.viewport-container {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: hsl(220, 6%, 46%);
}

.graphics-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  touch-action: none;
}

.graphics-canvas:active {
  cursor: crosshair;
}

.selection-rect {
  position: absolute;
  border: 1px solid hsl(200, 100%, 65%);
  background: hsla(200, 100%, 60%, 0.15);
  pointer-events: none;
  z-index: 6;
}

/* Crossing (right-to-left) marquee: dashed outline, green wash, like Fusion. */
.selection-rect.crossing {
  border: 1px dashed hsl(140, 70%, 60%);
  background: hsla(140, 70%, 50%, 0.12);
}

.select-other {
  position: absolute;
  z-index: 8;
  min-width: 220px;
  max-height: 260px;
  overflow-y: auto;
  border-radius: 8px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.select-other-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: hsl(220, 10%, 65%);
  padding: 4px 8px;
}

.select-other-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 5px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  color: hsl(220, 10%, 90%);
}

.select-other-row:hover {
  background: hsla(200, 100%, 55%, 0.22);
}

.select-other-kind {
  font-size: 0.72rem;
  font-weight: 700;
  color: hsl(200, 100%, 70%);
  text-transform: capitalize;
  min-width: 46px;
}

.select-other-id {
  font-size: 0.72rem;
  color: hsl(220, 10%, 78%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewport-fallback {
  position: absolute;
  inset: auto 24px 24px 24px;
  padding: 12px 16px;
  color: hsl(25, 95%, 72%);
  font-size: 0.85rem;
  text-align: center;
}

.viewport-overlay {
  position: absolute;
  top: 16px;
  left: 16px;
  padding: 14px 18px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.8rem;
  min-width: 220px;
}

.viewport-toolbar {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.viewport-settings {
  position: relative;
}

.tool-btn {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: hsl(220, 10%, 88%);
  cursor: pointer;
  padding: 0;
}

.tool-btn:hover {
  color: hsl(200, 100%, 70%);
}

.settings-menu {
  position: absolute;
  top: 44px;
  right: 0;
  border-radius: 8px;
  padding: 10px 12px;
  min-width: 210px;
  z-index: 7;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.8rem;
  color: hsl(220, 10%, 88%);
  cursor: pointer;
}

.settings-group-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: hsl(220, 10%, 60%);
  margin: 8px 0 4px;
}

.settings-group-label:first-child {
  margin-top: 0;
}

.tool-btn.active {
  color: hsl(45, 100%, 60%);
}

.settings-row input {
  width: 16px;
  height: 16px;
  accent-color: hsl(200, 100%, 50%);
  cursor: pointer;
}

.nav-cube {
  width: 60px;
  height: 60px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 240px;
  cursor: pointer;
}

.nav-cube-scene {
  width: 36px;
  height: 36px;
  perspective: 240px;
}

.nav-cube-body {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.05s linear;
}

.cube-face {
  position: absolute;
  top: 0;
  left: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: hsl(220, 10%, 92%);
  background: hsla(200, 60%, 40%, 0.55);
  border: 1px solid hsla(200, 100%, 70%, 0.6);
  box-sizing: border-box;
}

.cube-face.front {
  transform: translateZ(18px);
}
.cube-face.back {
  transform: rotateY(180deg) translateZ(18px);
}
.cube-face.right {
  transform: rotateY(90deg) translateZ(18px);
}
.cube-face.left {
  transform: rotateY(-90deg) translateZ(18px);
}
.cube-face.top {
  transform: rotateX(90deg) translateZ(18px);
  background: hsla(45, 80%, 50%, 0.55);
}
.cube-face.bottom {
  transform: rotateX(-90deg) translateZ(18px);
}

/* Glassmorphism utility */
.glass {
  background: hsla(220, 15%, 15%, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid hsla(220, 15%, 25%, 0.4);
}

.stat-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.label {
  color: hsl(220, 10%, 65%);
}

.value {
  color: hsl(220, 10%, 90%);
  font-weight: 600;
}

.accent-text {
  color: hsl(200, 100%, 50%);
}

.highlight-text {
  color: hsl(45, 100%, 55%);
}

.debug-overview {
  position: absolute;
  left: 16px;
  bottom: 16px;
  width: 300px;
  height: 220px;
  border-radius: 8px;
  overflow: hidden;
  pointer-events: none;
  z-index: 5;
  display: flex;
  flex-direction: column;
}

.debug-overview-canvas {
  display: block;
  width: 100%;
  height: 100%;
  flex: 1;
}

.debug-overview-label {
  position: absolute;
  left: 8px;
  bottom: 6px;
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: hsl(220, 10%, 75%);
  pointer-events: none;
}
</style>
