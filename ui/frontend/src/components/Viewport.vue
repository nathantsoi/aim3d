<template>
  <div class="viewport-container">
    <canvas ref="canvas3D" class="graphics-canvas"></canvas>
    <div
      v-if="selectionRect"
      class="selection-rect"
      data-testid="selection-rect"
      :style="selectionRectStyle"
    ></div>
    <div v-if="fallbackMessage" class="viewport-fallback glass" data-testid="webgpu-fallback">
      {{ fallbackMessage }}
    </div>

    <div class="viewport-overlay glass">
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
  </div>
</template>

<script>
import { computed, defineComponent, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useCoreStore } from '../store';
import { createWebGpuViewportRenderer } from '../services/webgpuRenderer';
import { createCameraRay, pickViewportEntity } from '../services/viewportPicking';
import {
  clamp,
  closestSolidToRay,
  entitiesInRect,
  groundPlanePoint,
  homeCamera,
  normalizeRect,
  orbitAroundPivot,
  panTarget,
  zoomDistance
} from '../services/viewportControls';

const ORBIT_SENSITIVITY = 0.0015;
// Clamp per-event rotation so trackpad momentum can't spin the view.
const MAX_ORBIT_STEP = 0.04;
// A pause longer than this starts a fresh orbit gesture (and a new pivot).
const ORBIT_GESTURE_GAP_MS = 180;

export default defineComponent({
  name: 'Viewport',
  setup() {
    const canvas3D = ref(null);
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

    const gridEnabled = computed(() => Boolean(store.viewportScene?.gizmos?.grid));

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
    let animationFrame = null;
    let disposed = false;
    let dragState = null;
    let suppressNextClick = false;
    let orbitActive = false;
    let orbitPivotPoint = null;
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

    const renderLoop = () => {
      if (disposed || !renderer?.available) return;
      renderer.updateScene(store.viewportScene, store.selectedEntityId, hoverTargetId.value);
      renderer.render(store.viewportScene);
      animationFrame = requestAnimationFrame(renderLoop);
    };

    const resize = () => {
      renderer?.resize?.();
    };

    const pickAtEvent = (event) => {
      const canvas = canvas3D.value;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      return pickViewportEntity(store.viewportScene, x, y, rect.width, rect.height);
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
      renderer?.updateScene?.(store.viewportScene, store.selectedEntityId, hoverId);
    };

    const handleSelectionClick = async (event) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      const pickResult = pickAtEvent(event);
      applyPickDiagnostics(pickResult);
      await store.selectEntity(pickResult.hit?.entityId ?? null);
    };

    // Click-drag draws a rubber-band rectangle that selects whatever it covers.
    const handlePointerDown = (event) => {
      if (event.button !== 0) return;
      const rect = canvas3D.value.getBoundingClientRect();
      const start = localPoint(event, rect);
      dragState = {
        pointerId: event.pointerId,
        startX: start.x,
        startY: start.y,
        moved: false
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
      if (Math.hypot(current.x - dragState.startX, current.y - dragState.startY) > 3) {
        dragState.moved = true;
      }
      if (dragState.moved) {
        selectionRect.value = normalizeRect(dragState.startX, dragState.startY, current.x, current.y);
      }
      event.preventDefault();
    };

    const handlePointerUp = async (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      canvas3D.value.releasePointerCapture?.(event.pointerId);
      const wasDrag = dragState.moved;
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
      const matches = entitiesInRect(store.viewportScene, rect, canvasRect.width, canvasRect.height);
      await store.selectEntity(matches[0] ?? null);
    };

    // Resolve the orbit pivot from the cursor ray. Prefer the exact point on a
    // picked entity, otherwise the centroid of the object closest to the ray,
    // then the ground plane, then the current target.
    const orbitPivot = (camera, x, y, rect) => {
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
        camera.distance = zoomDistance(camera.distance, event.deltaY);
        return;
      }

      if (event.shiftKey) {
        const now = performance.now();
        // On a fresh gesture, lock the pivot to the object under the cursor so
        // the rotation orbits that point for the whole drag (no drift/spin).
        if (!orbitActive || now - lastWheelAt > ORBIT_GESTURE_GAP_MS) {
          const { x, y } = localPoint(event, rect);
          orbitPivotPoint = orbitPivot(camera, x, y, rect);
          orbitActive = true;
        }
        lastWheelAt = now;
        const dYaw = clamp(-event.deltaX * ORBIT_SENSITIVITY, -MAX_ORBIT_STEP, MAX_ORBIT_STEP);
        const dPitch = clamp(-event.deltaY * ORBIT_SENSITIVITY, -MAX_ORBIT_STEP, MAX_ORBIT_STEP);
        Object.assign(camera, orbitAroundPivot(camera, orbitPivotPoint, dYaw, dPitch));
        return;
      }

      orbitActive = false;
      camera.target = panTarget(camera, event.deltaX, event.deltaY, rect.width, rect.height);
    };

    const preventContextMenu = (event) => {
      event.preventDefault();
    };

    onMounted(async () => {
      await nextTick();
      renderer = await createWebGpuViewportRenderer(canvas3D.value, applyDiagnostics);
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
    });

    watch(
      () => [store.viewportScene, store.selectedEntityId],
      () => {
        renderer?.updateScene?.(store.viewportScene, store.selectedEntityId, hoverTargetId.value);
      },
      { deep: true }
    );

    onUnmounted(() => {
      disposed = true;
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
    });

    return {
      canvas3D,
      diagnostics,
      fallbackMessage,
      store,
      settingsOpen,
      gridEnabled,
      navCubeStyle,
      goHome,
      selectionRect,
      selectionRectStyle
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
  min-width: 150px;
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
</style>
