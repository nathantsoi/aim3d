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

describe('Timeline model browser (schema v2)', () => {
  it('renders the model browser containing origin folder even on blank initial document (schema v1)', async () => {
    const { wrapper, store } = mountPanel();

    expect(store.schemaVersion).toBe(1);
    expect(store.browser.construction).toHaveLength(0);
    expect(store.browser.sketches).toHaveLength(0);
    expect(store.browser.bodies).toHaveLength(0);

    await flush();

    expect(wrapper.find('[data-testid="model-browser"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="origin-plane"]')).toHaveLength(3);
  });

  it('renders the origin, construction, sketch entities, and bodies tree', async () => {
    const { wrapper, store } = mountPanel();

    store.loadCoreSnapshot({
      schemaVersion: 2,
      activeDocumentId: 'doc_5005',
      documentPath: 'Untitled.a3d',
      features: [
        { id: 'feat_Sketch_1', type: 'Sketch', label: 'feat_Sketch_1', value: 0, unit: 'mm', isDirty: false, selectionToken: 'feat_Sketch_1_face_0' }
      ],
      browser: {
        origin: { planes: ['origin_XY', 'origin_XZ', 'origin_YZ'], visible: true },
        construction: [{ id: 'con_Plane_1', kind: 'OffsetPlane', category: 'plane', label: 'Plane1', value: 5, visible: true, inputs: [] }],
        sketches: [{ id: 'feat_Sketch_1', plane: { kind: 'Origin', originPlane: 'XY' }, visible: true, entities: [{ id: 'sk_ent_1', kind: 'Rectangle2Point', points: [[0, 0], [2, 1]], construction: false }] }],
        bodies: [{ id: 'body_1', name: 'Body1', sourceFeature: 'feat_Extrude_1' }]
      },
      viewportScene: { solids: [], toolpaths: [] }
    });
    await flush();

    expect(wrapper.find('[data-testid="model-browser"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="origin-plane"]')).toHaveLength(3);
    expect(wrapper.find('[data-testid="construction-node"]').text()).toContain('Plane1');
    expect(wrapper.find('[data-testid="sketch-entity"]').text()).toContain('Rectangle2Point');
    expect(wrapper.find('[data-testid="body-node"]').text()).toContain('Body1');
  });

  it('collapses and expands a sketch to hide its entities', async () => {
    const { wrapper, store } = mountPanel();

    store.loadCoreSnapshot({
      schemaVersion: 2,
      activeDocumentId: 'doc_5006',
      documentPath: 'Untitled.a3d',
      features: [],
      browser: {
        origin: { planes: ['origin_XY', 'origin_XZ', 'origin_YZ'], visible: true },
        construction: [],
        sketches: [{ id: 'feat_Sketch_1', plane: { kind: 'Origin', originPlane: 'XY' }, visible: true, entities: [{ id: 'sk_ent_1', kind: 'Rectangle2Point', points: [], construction: false }] }],
        bodies: []
      },
      viewportScene: { solids: [], toolpaths: [] }
    });
    await flush();

    expect(wrapper.find('[data-testid="sketch-entity"]').exists()).toBe(true);

    await wrapper.find('.sketch-toggle').trigger('click');
    await flush();

    expect(wrapper.find('[data-testid="sketch-entity"]').exists()).toBe(false);
  });

  it('toggles origin visibility when clicking the eye toggle', async () => {
    const { wrapper, store } = mountPanel();
    
    const toggle = wrapper.find('[data-testid="origin-visibility-toggle"]');
    expect(toggle.exists()).toBe(true);
    expect(toggle.classes()).not.toContain('dimmed');
    expect(store.viewportScene.gizmos.originVisible).toBe(true);

    await toggle.trigger('click');
    await flush();

    expect(store.viewportScene.gizmos.originVisible).toBe(false);
    expect(toggle.classes()).toContain('dimmed');

    await toggle.trigger('click');
    await flush();

    expect(store.viewportScene.gizmos.originVisible).toBe(true);
    expect(toggle.classes()).not.toContain('dimmed');
  });
});
