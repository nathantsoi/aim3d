import { defineStore } from 'pinia';
import {
  ACTION_TYPES,
  applyCoreSnapshot,
  createInitialCoreState,
  createUiAction
} from '../contracts/coreState';
import { dispatchCoreAction } from '../services/coreGateway';
import { RIBBON_MODES } from '../config/ribbon';

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

    // Project a flat core-state snapshot (emitted by the native core when a
    // script creates a document / sketch / rectangle / extrude) onto the store.
    // This is the read side of the unidirectional flow: core is source of truth.
    loadCoreSnapshot(snapshot) {
      const nextState = applyCoreSnapshot(this.snapshotCoreState(), snapshot);
      this.applyCoreState(nextState);
      return nextState;
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

    setMode(mode) {
      if (!RIBBON_MODES[mode]) return;
      if (this.isSketchMode) {
        this.finishSketch();
      }
      this.activeMode = mode;
      this.activeWorkspaceTab = RIBBON_MODES[mode].tabs[0]?.id ?? null;
    },

    setWorkspaceTab(tabId) {
      this.activeWorkspaceTab = tabId;
    },

    enterSketchMode(sketchId = null) {
      this.activeMode = 'design';
      this.isSketchMode = true;
      this.activeSketchId = sketchId;
      this.activeWorkspaceTab = 'sketch';

      const camera = this.viewportScene?.camera;
      if (camera) {
        // Remember the current view, then snap to an orthographic view looking
        // straight down the sketch-plane normal (XY plane, +Z eye).
        this.preSketchCamera = { ...camera };
        camera.yaw = 0;
        camera.pitch = 0;
        camera.projection = 'orthographic';
      }

      // Reveal the construction grid on the sketch plane (respecting the palette toggle).
      if (this.viewportScene?.gizmos) {
        this.viewportScene.gizmos.sketchGrid = this.sketchPalette.sketchGrid;
      }
    },

    finishSketch() {
      this.isSketchMode = false;
      this.activeSketchId = null;
      this.activeWorkspaceTab = RIBBON_MODES.design.tabs[0]?.id ?? null;

      const camera = this.viewportScene?.camera;
      if (this.preSketchCamera && camera) {
        Object.assign(camera, this.preSketchCamera);
        if (!('projection' in this.preSketchCamera)) {
          camera.projection = 'perspective';
        }
      }
      this.preSketchCamera = null;

      if (this.viewportScene?.gizmos) {
        this.viewportScene.gizmos.sketchGrid = false;
      }
    },

    toggleViewportGrid() {
      if (!this.viewportScene) return;
      if (!this.viewportScene.gizmos) {
        this.viewportScene.gizmos = { grid: false };
      }
      this.viewportScene.gizmos.grid = !this.viewportScene.gizmos.grid;
    },

    toggleSketchOption(key) {
      if (key in this.sketchPalette) {
        this.sketchPalette[key] = !this.sketchPalette[key];
      }
      // Keep the rendered grid in sync with the palette toggle while sketching.
      if (key === 'sketchGrid' && this.isSketchMode && this.viewportScene?.gizmos) {
        this.viewportScene.gizmos.sketchGrid = this.sketchPalette.sketchGrid;
      }
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

    deleteEntity(entityId, targetKind) {
      return this.dispatchAction({
        type: ACTION_TYPES.DELETE_ENTITY,
        targetId: entityId,
        targetKind,
        path: null,
        value: null
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
