import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useCoreStore } from '../store';
import RibbonToolbar from './RibbonToolbar.vue';

afterEach(() => {
  activeWrapper?.unmount();
  activeWrapper = null;
  delete window.__TAURI__;
  vi.restoreAllMocks();
});

let activeWrapper = null;

const mountRibbon = () => {
  const pinia = createPinia();
  const wrapper = mount(RibbonToolbar, {
    global: { plugins: [pinia] },
    attachTo: document.body
  });
  activeWrapper = wrapper;
  return { wrapper, store: useCoreStore() };
};

const openGroup = async (wrapper, label) => {
  const group = wrapper
    .findAll('[data-testid="command-group"]')
    .find((node) => node.find('.group-label').text() === label);
  await group.find('.group-button').trigger('click');
  await nextTick();
  await flushPromises();
  return group;
};

const groupDropdown = () => document.querySelector('[data-testid="group-dropdown"]');

const clickCommand = async (group, label) => {
  const root = groupDropdown() ?? group.element;
  const command = [...root.querySelectorAll('[data-testid="command-item"]')].find(
    (node) => node.querySelector('.command-label')?.textContent === label
  );
  expect(command).toBeTruthy();
  await command.click();
};

describe('RibbonToolbar command wiring', () => {
  it('invokes generate_toolpath with the mapped operation id for 2D Pocket', async () => {
    const invoke = vi.fn().mockResolvedValue({ status: 'success', message: 'done', data: '{}' });
    window.__TAURI__ = { invoke };

    const { wrapper, store } = mountRibbon();
    store.setMode('manufacture');
    await nextTick();

    const group = await openGroup(wrapper, '2D');
    await clickCommand(group, '2D Pocket');
    await Promise.resolve();
    await Promise.resolve();

    expect(invoke).toHaveBeenCalledWith('generate_toolpath', { operationId: 'op_Pocket_1' });
  });

  it('shows the contextual SKETCH tab and finish button in sketch mode', async () => {
    const invoke = vi.fn().mockResolvedValue({ status: 'success', message: 'done', data: '{}' });
    window.__TAURI__ = { invoke };

    const { wrapper, store } = mountRibbon();

    expect(wrapper.find('[data-testid="ribbon-finish-sketch"]').exists()).toBe(false);
    let tabLabels = wrapper.findAll('[data-testid="workspace-tab"]').map((node) => node.text());
    expect(tabLabels).not.toContain('SKETCH');

    store.enterSketchMode('feat_Sketch_1');
    await nextTick();

    tabLabels = wrapper.findAll('[data-testid="workspace-tab"]').map((node) => node.text());
    expect(tabLabels).toContain('SKETCH');
    expect(wrapper.find('[data-testid="ribbon-finish-sketch"]').exists()).toBe(true);

    await wrapper.find('[data-testid="ribbon-finish-sketch"]').trigger('click');
    await Promise.resolve();
    await Promise.resolve();

    expect(invoke).toHaveBeenCalledWith('solve_2d_sketch', { pointsJson: '[]', constraintsJson: '[]' });
    expect(store.isSketchMode).toBe(false);
  });

  it('expands a sketch tool submenu inline when its parent is clicked', async () => {
    const { wrapper, store } = mountRibbon();
    store.enterSketchMode('feat_Sketch_1');
    await nextTick();

    const group = await openGroup(wrapper, 'CREATE');
    await nextTick();

    expect(group.findAll('[data-testid="submenu-item"]').length).toBe(0);
    expect(document.querySelectorAll('[data-testid="submenu-item"]').length).toBe(0);

    await clickCommand(group, 'Rectangle');
    await nextTick();

    const subLabels = [...groupDropdown().querySelectorAll('[data-testid="submenu-item"]')].map(
      (node) => node.querySelector('.command-label')?.textContent
    );
    expect(subLabels).toEqual(['2-Point Rectangle', '3-Point Rectangle', 'Center Rectangle']);
  });

  it('does not invoke any command for a visual-only button', async () => {
    const invoke = vi.fn().mockResolvedValue({ status: 'success', message: 'done', data: '{}' });
    window.__TAURI__ = { invoke };

    const { wrapper } = mountRibbon();
    await nextTick();

    const group = await openGroup(wrapper, 'CREATE');
    await clickCommand(group, 'Extrude');
    await Promise.resolve();

    expect(invoke).not.toHaveBeenCalled();
  });

  it('creates an offset plane from the CONSTRUCT submenu', async () => {
    const { wrapper, store } = mountRibbon();
    await nextTick();

    const group = await openGroup(wrapper, 'CONSTRUCT');
    await clickCommand(group, 'Planes');
    await nextTick();

    const offsetPlane = [...groupDropdown().querySelectorAll('[data-testid="submenu-item"]')].find(
      (node) => node.querySelector('.command-label')?.textContent === 'Offset Plane'
    );
    expect(offsetPlane).toBeTruthy();
    await offsetPlane.click();
    await Promise.resolve();

    expect(store.pendingConstruction?.kind).toBe('OffsetPlane');
    expect(store.browser.construction).toHaveLength(0);
    expect(store.viewportScene.previewConstruction).toBeTruthy();

    await store.confirmConstructionCommand();
    await Promise.resolve();

    expect(store.pendingConstruction).toBeNull();
    expect(store.browser.construction.some((item) => item.kind === 'OffsetPlane')).toBe(true);
    const planeMesh = store.viewportScene.construction[0];
    expect(planeMesh.renderMode).toBe('planeFill');
    expect(planeMesh.positions?.length).toBe(12);
  });
});
