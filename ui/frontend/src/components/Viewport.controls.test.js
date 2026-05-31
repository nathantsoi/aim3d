import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useCoreStore } from '../store';
import { cameraEye } from '../services/viewportControls';
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

const dispatchWheel = (element, options) => {
  element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ...options }));
};

const mountViewport = async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(Viewport, { global: { plugins: [pinia] } });
  await flush();
  const canvas = wrapper.find('canvas').element;
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    configurable: true
  });
  return { wrapper, canvas, store: useCoreStore() };
};

describe('Viewport camera controls', () => {
  beforeEach(() => {
    globalThis.requestAnimationFrame = vi.fn(() => 1);
    globalThis.cancelAnimationFrame = vi.fn();
  });

  it('pans the camera target on a two-finger scroll', async () => {
    const { canvas, store } = await mountViewport();
    const startTarget = [...store.viewportScene.camera.target];

    dispatchWheel(canvas, { deltaX: 40, deltaY: 20 });

    const moved = store.viewportScene.camera.target;
    const delta = Math.hypot(
      moved[0] - startTarget[0],
      moved[1] - startTarget[1],
      moved[2] - startTarget[2]
    );
    expect(delta).toBeGreaterThan(0);
  });

  it('zooms in on a pinch (ctrl + wheel)', async () => {
    const { canvas, store } = await mountViewport();
    const startDistance = store.viewportScene.camera.distance;

    dispatchWheel(canvas, { deltaY: -120, ctrlKey: true });

    expect(store.viewportScene.camera.distance).toBeLessThan(startDistance);
  });

  it('orbits the camera on a shift + two-finger drag', async () => {
    const { canvas, store } = await mountViewport();
    const before = cameraEye(store.viewportScene.camera);

    dispatchWheel(canvas, { deltaX: 80, deltaY: 30, shiftKey: true, clientX: 400, clientY: 300 });

    const after = cameraEye(store.viewportScene.camera);
    const delta = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
    expect(delta).toBeGreaterThan(1e-3);
  });

  it('re-centers the view on the scene from the home button', async () => {
    const { wrapper, store } = await mountViewport();
    store.viewportScene.camera.target = [9, 9, 9];
    store.viewportScene.camera.distance = 42;

    await wrapper.find('[data-testid="viewport-home"]').trigger('click');

    expect(store.viewportScene.camera.target).not.toEqual([9, 9, 9]);
    expect(store.viewportScene.camera.distance).toBeLessThan(42);
  });

  it('selects entities with a click-drag rubber-band rectangle', async () => {
    const { canvas, store } = await mountViewport();

    dispatchPointer(canvas, 'pointerdown', { button: 0, clientX: 40, clientY: 40 });
    dispatchPointer(canvas, 'pointermove', { button: 0, clientX: 760, clientY: 560 });
    dispatchPointer(canvas, 'pointerup', { button: 0, clientX: 760, clientY: 560 });
    await flush();

    expect(store.selectedEntityId).toBe('feat_Extrude_1_face_0');
  });

  it('shows a selection rectangle overlay while dragging', async () => {
    const { wrapper, canvas } = await mountViewport();

    dispatchPointer(canvas, 'pointerdown', { button: 0, clientX: 100, clientY: 100 });
    dispatchPointer(canvas, 'pointermove', { button: 0, clientX: 300, clientY: 250 });
    await flush();

    const rect = wrapper.find('[data-testid="selection-rect"]');
    expect(rect.exists()).toBe(true);

    dispatchPointer(canvas, 'pointerup', { button: 0, clientX: 300, clientY: 250 });
    await flush();
    expect(wrapper.find('[data-testid="selection-rect"]').exists()).toBe(false);
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
