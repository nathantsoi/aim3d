import { defineStore } from 'pinia';
import {
  ACTION_TYPES,
  createInitialCoreState,
  createUiAction
} from '../contracts/coreState';
import { dispatchCoreAction } from '../services/coreGateway';

export const useCoreStore = defineStore('core', {
  state: () => ({
    ...createInitialCoreState(),
    isDispatching: false,
    lastDispatchedAction: null,
    actionLog: []
  }),

  getters: {
    hasDirtyFeatures: (state) => state.features.some((feature) => feature.isDirty),
    activeSetup: (state) => state.setups[0] ?? null,
    operationsBySetup: (state) => {
      return state.setups.reduce((groups, setup) => {
        groups[setup.id] = state.operations.filter((operation) => operation.setupId === setup.id);
        return groups;
      }, {});
    }
  },

  actions: {
    snapshotCoreState() {
      const {
        isDispatching,
        lastDispatchedAction,
        actionLog,
        ...coreState
      } = this.$state;
      return coreState;
    },

    applyCoreState(nextState) {
      this.$patch({
        ...nextState,
        isDispatching: false
      });
    },

    async dispatchAction(actionInput) {
      const action = createUiAction({
        documentId: this.activeDocumentId,
        ...actionInput
      });

      this.isDispatching = true;
      this.lastDispatchedAction = action;
      this.actionLog.push(action);

      const nextState = await dispatchCoreAction(action, this.snapshotCoreState());
      this.applyCoreState(nextState);
      return action;
    },

    selectEntity(entityId) {
      return this.dispatchAction({
        type: ACTION_TYPES.SELECT_ENTITY,
        targetId: entityId,
        targetKind: 'selection',
        path: 'selectedEntityId',
        value: entityId
      });
    },

    updateFeatureParameter(featureId, value) {
      return this.dispatchAction({
        type: ACTION_TYPES.UPDATE_FIELD,
        targetId: featureId,
        targetKind: 'feature',
        path: 'value',
        value
      });
    },

    updateSetupField(setupId, path, value) {
      return this.dispatchAction({
        type: ACTION_TYPES.UPDATE_FIELD,
        targetId: setupId,
        targetKind: 'setup',
        path,
        value
      });
    },

    updateOperationField(operationId, path, value) {
      return this.dispatchAction({
        type: ACTION_TYPES.UPDATE_FIELD,
        targetId: operationId,
        targetKind: 'operation',
        path,
        value
      });
    },

    triggerParametricRecompute() {
      return this.dispatchAction({
        type: ACTION_TYPES.RECOMPUTE_DOCUMENT,
        targetId: this.activeDocumentId,
        targetKind: 'document',
        path: 'features',
        value: null
      });
    },

    runCAMGeneration(operationId) {
      return this.dispatchAction({
        type: ACTION_TYPES.GENERATE_TOOLPATH,
        targetId: operationId,
        targetKind: 'operation',
        path: 'status',
        value: 'Ready'
      });
    },

    async executeSimulation() {
      this.isSimulating = true;
      return this.dispatchAction({
        type: ACTION_TYPES.RUN_SIMULATION,
        targetId: this.activeDocumentId,
        targetKind: 'simulation',
        path: 'simulationStats',
        value: this.gcode
      });
    }
  }
});
