import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { useCoreStore } from '../store';
import TimelineBar from './TimelineBar.vue';

const mountBar = () => {
  const pinia = createPinia();
  const wrapper = mount(TimelineBar, { global: { plugins: [pinia] } });
  return { wrapper, store: useCoreStore() };
};

describe('TimelineBar bottom bar', () => {
  it('shows the parametric timeline outside sketch mode', () => {
    const { wrapper } = mountBar();

    expect(wrapper.find('.track').exists()).toBe(true);
    expect(wrapper.find('[data-testid="constraint-strip"]').exists()).toBe(false);
    expect(wrapper.find('.bar-label').text()).toBe('Timeline');
  });

  it('swaps the timeline for sketch constraints in sketch mode', async () => {
    const { wrapper, store } = mountBar();

    store.enterSketchMode('feat_Sketch_1');
    await nextTick();

    expect(wrapper.find('.track').exists()).toBe(false);
    expect(wrapper.find('[data-testid="constraint-strip"]').exists()).toBe(true);
    expect(wrapper.find('.bar-label').text()).toBe('Constraints');

    const chips = wrapper.findAll('[data-testid="constraint-chip"]');
    expect(chips.length).toBe(store.sketchConstraints.length);
    expect(chips.length).toBeGreaterThan(0);
  });

  it('selects a constraint chip when clicked', async () => {
    const { wrapper, store } = mountBar();
    store.enterSketchMode('feat_Sketch_1');
    await nextTick();

    await wrapper.find('[data-testid="constraint-chip"]').trigger('click');
    await nextTick();
    await Promise.resolve();

    expect(store.selectedEntityId).toBe(store.sketchConstraints[0].id);
  });
});
