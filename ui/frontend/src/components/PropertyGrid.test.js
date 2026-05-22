import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { ACTION_TYPES } from '../contracts/coreState';
import { useCoreStore } from '../store';
import PropertyGrid from './PropertyGrid.vue';

const flush = async () => {
  await nextTick();
  await Promise.resolve();
};

const mountPanel = () => {
  const pinia = createPinia();
  const wrapper = mount(PropertyGrid, {
    global: {
      plugins: [pinia]
    }
  });
  return { wrapper, store: useCoreStore() };
};

describe('PropertyGrid', () => {
  it('dispatches property grid feature changes as JSON actions', async () => {
    const { wrapper, store } = mountPanel();

    await wrapper.find('[data-testid="feature-value"]').setValue(12.5);
    await flush();

    expect(store.lastDispatchedAction).toMatchObject({
      type: ACTION_TYPES.UPDATE_FIELD,
      targetId: 'feat_Sketch_1',
      targetKind: 'feature',
      path: 'value',
      value: 12.5,
      documentId: 'doc_1001'
    });
  });

  it('dispatches setup sheet changes through the action gateway', async () => {
    const { wrapper, store } = mountPanel();
    const input = wrapper.find('[data-testid="setup-stock-allowance"]');

    input.element.value = '4.2';
    await input.trigger('change');
    await flush();

    expect(store.lastDispatchedAction).toMatchObject({
      type: ACTION_TYPES.UPDATE_FIELD,
      targetId: 'setup_Main_1',
      targetKind: 'setup',
      path: 'stockAllowance',
      value: 4.2
    });
  });

  it('dispatches operation sheet changes through the action gateway', async () => {
    const { wrapper, store } = mountPanel();
    const input = wrapper.find('[data-testid="operation-tool-diameter"]');

    input.element.value = '7.5';
    await input.trigger('change');
    await flush();

    expect(store.lastDispatchedAction).toMatchObject({
      type: ACTION_TYPES.UPDATE_FIELD,
      targetId: 'op_Pocket_1',
      targetKind: 'operation',
      path: 'toolDiameter',
      value: 7.5
    });
  });
});
