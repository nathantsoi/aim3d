<template>
  <div class="viewport-container">
    <canvas ref="canvas3D" class="graphics-canvas"></canvas>
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

    <div class="nav-cube glass">
      <span>TOP</span>
    </div>
  </div>
</template>

<script>
import { defineComponent, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useCoreStore } from '../store';
import { createWebGpuViewportRenderer } from '../services/webgpuRenderer';

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
      segmentCount: 0
    });
    const store = useCoreStore();
    let renderer = null;
    let animationFrame = null;
    let disposed = false;
    let dragState = null;
    let suppressNextClick = false;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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

    const panCamera = (camera, deltaX, deltaY, rect) => {
      const scale = camera.distance / Math.max(1, Math.min(rect.width, rect.height));
      const yaw = camera.yaw ?? 0;
      const pitch = camera.pitch ?? 0;
      const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
      const up = [
        -Math.sin(pitch) * Math.sin(yaw),
        Math.cos(pitch),
        -Math.sin(pitch) * Math.cos(yaw)
      ];
      camera.target = [
        camera.target[0] - right[0] * deltaX * scale + up[0] * deltaY * scale,
        camera.target[1] - right[1] * deltaX * scale + up[1] * deltaY * scale,
        camera.target[2] - right[2] * deltaX * scale + up[2] * deltaY * scale
      ];
    };

    const applyDiagnostics = (nextDiagnostics) => {
      Object.assign(diagnostics, nextDiagnostics);
      if (store.viewportScene?.diagnostics) {
        Object.assign(store.viewportScene.diagnostics, nextDiagnostics);
      }
    };

    const renderLoop = () => {
      if (disposed || !renderer?.available) return;
      renderer.updateScene(store.viewportScene, store.selectedEntityId);
      renderer.render(store.viewportScene);
      animationFrame = requestAnimationFrame(renderLoop);
    };

    const resize = () => {
      renderer?.resize?.();
    };

    const handleSelectionClick = async (event) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      const canvas = canvas3D.value;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const insideScene = x >= rect.width * 0.2
        && x <= rect.width * 0.8
        && y >= rect.height * 0.18
        && y <= rect.height * 0.82;
      const firstSolidToken = store.viewportScene?.solids?.[0]?.sourceToken ?? null;
      await store.selectEntity(insideScene ? firstSolidToken : null);
    };

    const handlePointerDown = (event) => {
      if (!store.viewportScene?.camera) return;
      const mode = event.button === 1 || event.button === 2 || event.shiftKey ? 'pan' : 'orbit';
      dragState = {
        mode,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false
      };
      canvas3D.value.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };

    const handlePointerMove = (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const camera = ensureCamera();
      const deltaX = event.clientX - dragState.lastX;
      const deltaY = event.clientY - dragState.lastY;
      const totalMove = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
      if (totalMove > 4) {
        dragState.moved = true;
      }

      if (dragState.mode === 'pan') {
        panCamera(camera, deltaX, deltaY, canvas3D.value.getBoundingClientRect());
      } else {
        camera.yaw = (camera.yaw ?? 0) + deltaX * 0.008;
        camera.pitch = clamp((camera.pitch ?? 0) - deltaY * 0.008, -1.45, 1.45);
      }

      dragState.lastX = event.clientX;
      dragState.lastY = event.clientY;
      event.preventDefault();
    };

    const handlePointerUp = (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      suppressNextClick = dragState.moved;
      canvas3D.value.releasePointerCapture?.(event.pointerId);
      dragState = null;
    };

    const handleWheel = (event) => {
      const camera = ensureCamera();
      const zoomFactor = Math.exp(event.deltaY * 0.001);
      camera.distance = clamp((camera.distance ?? 5) * zoomFactor, 0.6, 80);
      event.preventDefault();
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
        renderer?.updateScene?.(store.viewportScene, store.selectedEntityId);
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
      store
    };
  }
});
</script>

<style scoped>
.viewport-container {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: hsl(220, 25%, 7%);
}

.graphics-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
  touch-action: none;
}

.graphics-canvas:active {
  cursor: grabbing;
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

.nav-cube {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 60px;
  height: 60px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.05em;
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
