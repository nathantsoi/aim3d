import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { ACTION_TYPES } from '../contracts/coreState';
import { useCoreStore } from './index';

describe('core store action gateway', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('dispatches feature edits as stable JSON actions', async () => {
    const store = useCoreStore();

    await store.updateFeatureParameter('feat_Extrude_1', 14.5);

    expect(store.lastDispatchedAction).toMatchObject({
      type: ACTION_TYPES.UPDATE_FIELD,
      documentId: 'doc_1001',
      targetId: 'feat_Extrude_1',
      targetKind: 'feature',
      path: 'value',
      value: 14.5
    });
    expect(store.features.find((feature) => feature.id === 'feat_Extrude_1').isDirty).toBe(true);
  });

  it('routes setup and operation sheet edits through the same gateway', async () => {
    const store = useCoreStore();

    await store.updateSetupField('setup_Main_1', 'workOffset', 'G55');
    expect(store.lastDispatchedAction).toMatchObject({
      type: ACTION_TYPES.UPDATE_FIELD,
      targetId: 'setup_Main_1',
      targetKind: 'setup',
      path: 'workOffset',
      value: 'G55'
    });

    await store.updateOperationField('op_Pocket_1', 'toolDiameter', 8);
    expect(store.lastDispatchedAction).toMatchObject({
      type: ACTION_TYPES.UPDATE_FIELD,
      targetId: 'op_Pocket_1',
      targetKind: 'operation',
      path: 'toolDiameter',
      value: 8
    });
  });

  it('applies returned snapshots for recompute and CAM generation', async () => {
    const store = useCoreStore();

    await store.updateFeatureParameter('feat_Fillet_1', 4);
    await store.updateSetupField('setup_Main_1', 'stockAllowance', 3);
    await store.updateOperationField('op_Pocket_1', 'stepover', 1.5);
    await store.triggerParametricRecompute();

    expect(store.features.every((feature) => !feature.isDirty)).toBe(true);
    expect(store.setups.every((setup) => !setup.isDirty)).toBe(true);
    expect(store.operations.every((operation) => !operation.isDirty)).toBe(true);

    await store.runCAMGeneration('op_Pocket_1');
    expect(store.operations.find((operation) => operation.id === 'op_Pocket_1').status).toBe('Ready');
    expect(store.gcode).toContain('op_Pocket_1');
  });
});
