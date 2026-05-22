import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useCoreStore } from '../store';
import Viewport from './Viewport.vue';

vi.mock('../services/webgpuRenderer', () => ({
  createWebGpuViewportRenderer: vi.fn(async () => ({
    available: true,
    updateScene: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    destroy: vi.fn()
  }))
}));

const flush = async () => {
  await nextTick();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const dispatchPointer = (element, type, options) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...options });
  Object.defineProperty(event, 'pointerId', { value: options.pointerId ?? 1 });
  element.dispatchEvent(event);
};

describe('Viewport camera controls', () => {
  beforeEach(() => {
    globalThis.requestAnimationFrame = vi.fn(() => 1);
    globalThis.cancelAnimationFrame = vi.fn();
  });

  it('orbits and zooms the viewport camera from pointer and wheel input', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(Viewport, {
      global: {
        plugins: [pinia]
      }
    });
    await flush();

    const store = useCoreStore();
    const canvas = wrapper.find('canvas').element;
    const startYaw = store.viewportScene.camera.yaw;
    const startPitch = store.viewportScene.camera.pitch;
    const startDistance = store.viewportScene.camera.distance;

    dispatchPointer(canvas, 'pointerdown', { button: 0, clientX: 120, clientY: 120 });
    dispatchPointer(canvas, 'pointermove', { button: 0, clientX: 160, clientY: 90 });
    dispatchPointer(canvas, 'pointerup', { button: 0, clientX: 160, clientY: 90 });
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 }));

    expect(store.viewportScene.camera.yaw).toBeGreaterThan(startYaw);
    expect(store.viewportScene.camera.pitch).toBeGreaterThan(startPitch);
    expect(store.viewportScene.camera.distance).toBeLessThan(startDistance);
  });

  it('updates hover diagnostics from local picking without dispatching selection', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(Viewport, {
      global: {
        plugins: [pinia]
      }
    });
    await flush();

    const store = useCoreStore();
    const canvas = wrapper.find('canvas').element;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 })
    });

    dispatchPointer(canvas, 'pointermove', { button: 0, clientX: 400, clientY: 300 });
    await flush();

    expect(store.viewportScene.diagnostics.hoverTargetId).toBe('feat_Extrude_1_face_0');
    expect(store.viewportScene.diagnostics.lastPickLatencyMs).toBeLessThan(16);
    expect(store.actionLog).toHaveLength(0);
  });

  it('commits exactly one selection action when clicking a picked entity', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(Viewport, {
      global: {
        plugins: [pinia]
      }
    });
    await flush();

    const store = useCoreStore();
    const canvas = wrapper.find('canvas').element;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 })
    });

    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 400, clientY: 300 }));
    await flush();

    expect(store.selectedEntityId).toBe('feat_Extrude_1_face_0');
    expect(store.actionLog).toHaveLength(1);
    expect(store.actionLog[0]).toMatchObject({
      type: 'ui.selectEntity',
      value: 'feat_Extrude_1_face_0'
    });
  });
});
