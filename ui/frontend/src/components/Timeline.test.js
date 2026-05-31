import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { ACTION_TYPES } from '../contracts/coreState';
import { useCoreStore } from '../store';
import Timeline from './Timeline.vue';

const flush = async () => {
  await nextTick();
  await Promise.resolve();
};

const mountPanel = () => {
  const pinia = createPinia();
  const wrapper = mount(Timeline, { global: { plugins: [pinia] } });
  return { wrapper, store: useCoreStore() };
};

describe('Timeline tree deletion', () => {
  it('dispatches a delete action and removes the feature in design mode', async () => {
    const { wrapper, store } = mountPanel();
    const before = store.features.length;

    await wrapper.find('[data-testid="feature-delete"]').trigger('click');
    await flush();

    expect(store.lastDispatchedAction).toMatchObject({
      type: ACTION_TYPES.DELETE_ENTITY,
      targetKind: 'feature'
    });
    expect(store.features.length).toBe(before - 1);
  });

  it('deletes an operation node in manufacture mode', async () => {
    const { wrapper, store } = mountPanel();
    store.setMode('manufacture');
    await flush();

    await wrapper.find('[data-testid="operation-delete"]').trigger('click');
    await flush();

    expect(store.lastDispatchedAction).toMatchObject({
      type: ACTION_TYPES.DELETE_ENTITY,
      targetKind: 'operation'
    });
  });
});
