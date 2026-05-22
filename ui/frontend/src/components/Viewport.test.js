import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import Viewport from './Viewport.vue';

const flush = async () => {
  await nextTick();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('Viewport', () => {
  it('renders a deterministic unsupported-WebGPU fallback', async () => {
    const wrapper = mount(Viewport, {
      global: {
        plugins: [createPinia()]
      }
    });

    await flush();

    expect(wrapper.find('[data-testid="webgpu-fallback"]').text()).toContain('WebGPU is unavailable');
  });
});
