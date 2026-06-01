import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { useCoreStore } from '../store';
import ConstructionCommandPanel from './ConstructionCommandPanel.vue';

describe('ConstructionCommandPanel', () => {
  it('walks through plane-at-angle inputs before committing', async () => {
    const pinia = createPinia();
    const store = useCoreStore(pinia);
    store.beginConstructionCommand('PlaneAtAngle', 'Plane at Angle');

    const wrapper = mount(ConstructionCommandPanel, { global: { plugins: [pinia] } });

    expect(wrapper.find('[data-testid="construction-command-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Plane at Angle');

    await wrapper.find('[data-testid="construction-field-plane"]').setValue('origin_XY');
    await wrapper.find('[data-testid="construction-field-axis"]').setValue('axis_x');
    await wrapper.find('[data-testid="construction-field-angle"]').setValue('30');

    expect(store.browser.construction).toHaveLength(0);
    await wrapper.find('[data-testid="construction-confirm"]').trigger('click');
    expect(wrapper.find('[data-testid="construction-command-panel"]').exists()).toBe(false);

    expect(store.pendingConstruction).toBeNull();
    expect(store.browser.construction).toHaveLength(1);
    expect(store.browser.construction[0].kind).toBe('PlaneAtAngle');
    expect(store.browser.construction[0].value).toBe(30);
    expect(store.browser.construction[0].inputs).toEqual(['origin_XY', 'axis_x']);
  });
});
