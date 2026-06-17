import { defineStore } from 'pinia';
import {
  ACTION_TYPES,
  applyCoreSnapshot,
  createInitialCoreState,
  createUiAction,
  syncViewportScene
} from '../contracts/coreState';
import { dispatchCoreAction } from '../services/coreGateway';
import { initCoreWasm, parseGcode, getController, resetController, getCoreModule, extractMaterialMesh } from '../services/coreWasm';
import { RIBBON_MODES } from '../config/ribbon';
import {
  buildConstructionParams,
  canConfirmConstructionDraft,
  defaultFieldValues,
  getConstructionCommandDef,
  mapViewportPickToField
} from '../config/constructionCommands';
import { constructionViewportMesh } from '../contracts/constructionGeometry';
import {
  buildSketchElementFromDraft,
  canConfirmSketchElement,
  defaultSketchFieldValues,
  getSketchCommandDef
} from '../config/sketchCommands';
import {
  resolveSketchNumeric,
  sketchElementPreviewMesh,
  sketchEntitiesViewportMesh
} from '../contracts/sketchGeometry';
import {
  intersectRayWithSketchPlane,
  mapViewportPickToSketchPlane,
  planeFrameFromReference,
  planeReferenceFromToken
} from '../contracts/sketchPlane';

// Module-level variables for WASM instances to avoid Vue reactivity proxying

export const useCoreStore = defineStore('core', {
  state: () => ({
    ...createInitialCoreState(),
    isDispatching: false,
    lastDispatchedAction: null,
    actionLog: [],
    pendingConstruction: null,
    pendingSketchCreation: null,
    pendingSketchElement: null,
    pendingStockSetup: null,
    pendingProjectSettings: false,
    isConnected: false,
    messages: [],
    
    // Machine Profile Settings
    machineMaxVelocity: 3000.0,
    machineMaxAccel: 500.0,
    machineSegmentDuration: 0.025,
    machineHomePosition: [0, 0, 50.8],
    simulationResolution: 256,
    
    // Simulation Playback State
    simulationPlaybackStatus: 'stopped', // 'stopped', 'playing', 'paused'
    simulationCurrentStep: 0,
    simulationTotalSteps: 0,
    simulationToolPosition: [0, 0, 2],
    playbackSpeedMultiplier: 1.0,

    // Machine Control State
    machineTaskMode: 'manual', // 'manual', 'mdi', 'auto'
    showStock: true,
    showG54Frame: true,
    showG54Modal: false,
    showToolTableModal: false,
    rightPanelTab: 'properties', // 'properties', 'gcode', 'settings', 'debug'
    workOffsets: {
      54: [0, 0, 0] // G54 offset x, y, z
    },
    toolOffsets: {}, // toolId -> zOffset
    _machineInitialized: false,
    machineInitGcode: localStorage.getItem('aim3d_machineInitGcode') !== null
      ? localStorage.getItem('aim3d_machineInitGcode')
      : '(Machine Initialization)\nG17 (Select XY plane)\nG20 (Select imperial units)\nG40 (Cancel cutter radius compensation)\nG49 (Cancel tool length offset)\nG54 (Select Work Coordinate System 1)\nG80 (Cancel canned cycles)\nG90 (Set absolute distance mode)\nG94 (Set feed rate units per minute)\nM5 (Spindle stop)\nM9 (Coolant off)',
    machineInitEnabled: localStorage.getItem('aim3d_machineInitEnabled') !== 'false'
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
    setConnected(status) {
      this.isConnected = status;
    },

    addMessage(text, type = 'info') {
      this.messages.push({
        id: Date.now() + Math.random(),
        text,
        type,
        timestamp: new Date()
      });
      if (this.messages.length > 1000) {
        this.messages.shift();
      }
    },

    snapshotCoreState() {
      const {
        isDispatching,
        lastDispatchedAction,
        actionLog,
        pendingConstruction,
        pendingSketchCreation,
        pendingSketchElement,
        pendingStockSetup,
        pendingProjectSettings,
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
      this.cancelSketchCreation();
      this.cancelConstructionCommand();
      this.cancelSketchElement();
      this.cancelStockSetup();
      this.cancelProjectSettings();
      this.activeMode = mode;
      this.activeWorkspaceTab = RIBBON_MODES[mode].tabs[0]?.id ?? null;
      
      localStorage.setItem('aim3d_activeMode', mode);

      if (mode !== 'machine') {
        this.showGcodeEditor = false;
      } else {
        if (this.machineTaskMode === 'manual') this.rightPanelTab = 'jog';
        else if (this.machineTaskMode === 'mdi') this.rightPanelTab = 'mdi';
        else if (this.machineTaskMode === 'auto') this.rightPanelTab = 'gcode';
      }
      syncViewportScene(this.$state);
    },

    setMachineTaskMode(mode) {
      if (!['manual', 'mdi', 'auto'].includes(mode)) return;
      this.machineTaskMode = mode;
      
      try {
        const controller = getController();
        if (controller && controller.setTaskMode) {
          const modeMap = {
            'manual': 0, // SpeTaskMode::Manual
            'mdi': 1,    // SpeTaskMode::Mdi
            'auto': 2    // SpeTaskMode::Auto
          };
          controller.setTaskMode(modeMap[mode]);
        }
      } catch (e) {
        // Core wasm might not be loaded yet
      }

      // Update right panel tab explicitly based on mode
      if (mode === 'manual') {
        this.rightPanelTab = 'jog';
      } else if (mode === 'mdi') {
        this.rightPanelTab = 'mdi';
      } else if (mode === 'auto') {
        this.rightPanelTab = 'gcode';
      }
    },

    toggleGcodeEditor() {
      this.showGcodeEditor = !this.showGcodeEditor;
      if (this.showGcodeEditor) {
        this.setMachineTaskMode('auto');
      }
    },

    async setGcodeText(text) {
      this.gcodeText = text;
      if (this.activeMode === 'machine' && this.machineTaskMode === 'mdi') {
        console.log('[MDI] setGcodeText called | isSimulating:', this.isSimulating, '| status:', this.simulationPlaybackStatus);
        try {
          await initCoreWasm();
          const controller = getController();
          
          // Clear any pending segments so double-clicks don't stack motion
          console.log('[MDI] Clearing pending segments before submit. Current queued:', controller.getQueuedSegments());
          controller.clearPendingSegments();
          
          const prefix = this.units === 'inch' ? 'G20\n' : 'G21\n';
          console.log('[MDI] Calling submitMdi with:', JSON.stringify(prefix + text));
          const success = controller.submitMdi(prefix + text);
          if (success) {
            const queued = controller.getQueuedSegments();
            console.log('[MDI] Successfully submitted. Queued segments:', queued, '| status:', this.simulationPlaybackStatus);
            this.isSimulating = true;
            this.simulationTotalSteps = queued;
            this.simulationCurrentStep = 0;
            // Only start a new tick loop if one isn't already running
            if (this.simulationPlaybackStatus !== 'playing') {
              this.startSimulationTick();
            }
            console.log('[MDI] Tick running. Status:', this.simulationPlaybackStatus);
          } else {
            console.error('[MDI] Failed to submit MDI command');
            this.addMessage('Invalid MDI command', 'error');
          }
        } catch (e) {
          console.error('Failed to run MDI:', e);
        }
      }
    },


    beginStockSetup() {
      this.cancelSketchCreation();
      this.cancelConstructionCommand();
      this.cancelProjectSettings();
      this.pendingStockSetup = {
        kind: this.stockSize?.kind || 'cuboid',
        x: this.stockSize.x,
        y: this.stockSize.y,
        z: this.stockSize.z,
        locX: this.stockLocation?.x || 0,
        locY: this.stockLocation?.y || 0,
        locZ: this.stockLocation?.z || 0
      };
      this.rightPanelTab = 'setup';
    },

    updateStockSetup(patch) {
      if (!this.pendingStockSetup) return;
      this.pendingStockSetup = { ...this.pendingStockSetup, ...patch };
      syncViewportScene(this.$state);
    },

    updateToolSetup(patch) {
      if (patch.toolDiameter !== undefined) this.toolDiameter = patch.toolDiameter;
      if (patch.toolLength !== undefined) this.toolLength = patch.toolLength;
      if (patch.toolRadius !== undefined) this.toolRadius = patch.toolRadius;
      if (patch.toolholderDiameter !== undefined) this.toolholderDiameter = patch.toolholderDiameter;
      if (patch.toolholderLength !== undefined) this.toolholderLength = patch.toolholderLength;
      syncViewportScene(this.$state);
    },

    cancelStockSetup() {
      this.pendingStockSetup = null;
    },

    confirmStockSetup() {
      if (!this.pendingStockSetup) return;
      this.stockSize = {
        x: Number(this.pendingStockSetup.x),
        y: Number(this.pendingStockSetup.y),
        z: Number(this.pendingStockSetup.z),
        kind: this.pendingStockSetup.kind
      };
      this.stockLocation = {
        x: Number(this.pendingStockSetup.locX),
        y: Number(this.pendingStockSetup.locY),
        z: Number(this.pendingStockSetup.locZ)
      };
      
      this.dispatchAction({
        type: ACTION_TYPES.CREATE_STOCK,
        targetId: this.activeDocumentId,
        targetKind: 'stock',
        path: null,
        value: {
          kind: this.pendingStockSetup.kind,
          x: this.stockSize.x,
          y: this.stockSize.y,
          z: this.stockSize.z,
          locX: this.stockLocation.x,
          locY: this.stockLocation.y,
          locZ: this.stockLocation.z
        }
      });
      this.pendingStockSetup = null;
      this._machineInitialized = false;
      if (this.activeMode === 'machine') {
        this.startSimulation();
      }
    },

    beginSketchCreation() {
      this.cancelConstructionCommand();
      this.cancelProjectSettings();
      let defaultPlane = 'origin_XY';
      if (this.selectedEntityId) {
        const mapped = mapViewportPickToSketchPlane(this.selectedEntityId, this.browser);
        if (mapped) {
          defaultPlane = mapped;
        }
      }
      this.pendingSketchCreation = {
        label: 'Create Sketch',
        values: { plane: defaultPlane },
        activeFieldKey: 'plane'
      };
      this.syncSketchPlanePreview();
    },

    setSketchPlaneActiveField() {
      if (!this.pendingSketchCreation) return;
      this.pendingSketchCreation.activeFieldKey = 'plane';
    },

    updateSketchCreationDraft(patch) {
      if (!this.pendingSketchCreation) return;
      this.pendingSketchCreation.values = { ...this.pendingSketchCreation.values, ...patch };
      this.syncSketchPlanePreview();
    },

    syncSketchPlanePreview() {
      if (!this.pendingSketchCreation || this.isSketchMode) return;
      if (!this.viewportScene?.gizmos) return;
      this.viewportScene.gizmos.sketchGrid = this.sketchPalette.sketchGrid && this.viewportScene.gizmos.grid;
      const planeRef = planeReferenceFromToken(this.pendingSketchCreation.values.plane);
      this.viewportScene.gizmos.sketchGridFrame = planeFrameFromReference(planeRef, this.browser);
      this.viewportScene.gizmos.showSketchPlaneIndicator = true;
    },

    cancelSketchCreation() {
      this.pendingSketchCreation = null;
      if (this.viewportScene?.gizmos) {
        if (!this.isSketchMode) {
          this.viewportScene.gizmos.sketchGrid = false;
          delete this.viewportScene.gizmos.sketchGridFrame;
        }
        delete this.viewportScene.gizmos.showSketchPlaneIndicator;
      }
    },

    async confirmSketchCreation() {
      if (!this.pendingSketchCreation?.values?.plane) return;
      const plane = planeReferenceFromToken(this.pendingSketchCreation.values.plane);
      this.pendingSketchCreation = null;
      if (this.viewportScene?.gizmos) {
        delete this.viewportScene.gizmos.showSketchPlaneIndicator;
      }
      await this.createSketch(plane);
      const sketchId = this.browser.sketches[this.browser.sketches.length - 1]?.id;
      if (sketchId) {
        this.enterSketchMode(sketchId);
      }
    },

    applyViewportPickToSketch(entityId) {
      if (!this.pendingSketchCreation) return false;
      const mapped = mapViewportPickToSketchPlane(entityId, this.browser);
      if (!mapped) return false;
      this.updateSketchCreationDraft({ plane: mapped });
      return true;
    },

    createSketch(plane) {
      return this.dispatchAction({
        type: ACTION_TYPES.CREATE_SKETCH,
        targetId: this.activeDocumentId,
        targetKind: 'sketch',
        path: null,
        value: { plane },
        meta: { plane }
      });
    },

    setWorkspaceTab(tabId) {
      this.activeWorkspaceTab = tabId;
    },

    activeSketchPlaneRef() {
      const sketch = this.browser.sketches.find((item) => item.id === this.activeSketchId);
      return sketch?.plane ?? { kind: 'Origin', originPlane: 'XY' };
    },

    resolveSketchNumeric(raw) {
      return resolveSketchNumeric(raw, this.sketchParameters ?? []);
    },

    enterSketchMode(sketchId = null) {
      this.cancelSketchElement();
      this.activeMode = 'design';
      this.isSketchMode = true;
      this.activeSketchId = sketchId;
      this.activeWorkspaceTab = 'sketch';

      const planeRef = this.activeSketchPlaneRef();

      if (this.viewportScene?.gizmos) {
        this.viewportScene.gizmos.sketchGrid = this.sketchPalette.sketchGrid && this.viewportScene.gizmos.grid;
        this.viewportScene.gizmos.sketchGridFrame = planeFrameFromReference(planeRef, this.browser);
      }
      this.syncSketchViewportOverlay();
    },

    finishSketch() {
      this.cancelSketchElement();
      this.isSketchMode = false;
      this.activeSketchId = null;
      this.activeWorkspaceTab = RIBBON_MODES.design.tabs[0]?.id ?? null;

      if (this.viewportScene?.gizmos) {
        this.viewportScene.gizmos.sketchGrid = false;
        delete this.viewportScene.gizmos.sketchGridFrame;
      }
      if (this.viewportScene) {
        this.viewportScene.sketchOverlay = null;
      }
    },

    beginSketchElement(kind, label = '') {
      if (!this.isSketchMode || !this.activeSketchId) return;
      this.cancelConstructionCommand();
      const def = getSketchCommandDef(kind);
      if (!def) return;
      this.pendingSketchElement = {
        sketchId: this.activeSketchId,
        kind,
        label: label || def.label,
        values: defaultSketchFieldValues(def),
        activeFieldKey: def.fields[0]?.key ?? null
      };
      this.syncSketchElementPreview();
    },

    setSketchElementActiveField(fieldKey) {
      if (!this.pendingSketchElement) return;
      this.pendingSketchElement.activeFieldKey = fieldKey;
    },

    updateSketchElementDraft(patch) {
      if (!this.pendingSketchElement) return;
      this.pendingSketchElement.values = { ...this.pendingSketchElement.values, ...patch };
      this.syncSketchElementPreview();
    },

    addSketchParameter(name, value = 10) {
      const trimmed = String(name ?? '').trim();
      if (!trimmed) return;
      if (this.sketchParameters.some((item) => item.name === trimmed)) return;
      this.sketchParameters = [...this.sketchParameters, { name: trimmed, value, unit: 'mm' }];
    },

    syncSketchElementPreview() {
      if (!this.viewportScene) return;
      const preview = this.pendingSketchElement
        ? sketchElementPreviewMesh(
            this.pendingSketchElement,
            this.activeSketchPlaneRef(),
            this.browser,
            (raw) => this.resolveSketchNumeric(raw)
          )
        : null;
      const sketch = this.browser.sketches.find((item) => item.id === this.activeSketchId);
      const committed = sketch
        ? sketchEntitiesViewportMesh(sketch.entities, this.activeSketchPlaneRef(), this.browser)
        : null;
      const meshes = [committed, preview].filter(Boolean);
      if (!meshes.length) {
        this.viewportScene.sketchOverlay = null;
        return;
      }
      const points = meshes.flatMap((mesh) => mesh.points);
      this.viewportScene.sketchOverlay = {
        id: 'sketch_overlay',
        color: preview?.color ?? committed?.color,
        points
      };
    },

    syncSketchViewportOverlay() {
      if (!this.isSketchMode) return;
      this.syncSketchElementPreview();
    },

    cancelSketchElement() {
      this.pendingSketchElement = null;
      if (this.isSketchMode) {
        this.syncSketchViewportOverlay();
      } else if (this.viewportScene) {
        this.viewportScene.sketchOverlay = null;
      }
    },

    async confirmSketchElement() {
      if (!canConfirmSketchElement(this.pendingSketchElement, (raw) => this.resolveSketchNumeric(raw))) {
        return;
      }
      const sketchId = this.pendingSketchElement.sketchId;
      const element = buildSketchElementFromDraft(this.pendingSketchElement, (raw) =>
        this.resolveSketchNumeric(raw)
      );
      this.pendingSketchElement = null;
      await this.createSketchEntity(sketchId, element);
      this.syncSketchViewportOverlay();
    },

    createSketchEntity(sketchId, element) {
      return this.dispatchAction({
        type: ACTION_TYPES.CREATE_SKETCH_ENTITY,
        targetId: sketchId,
        targetKind: 'sketch',
        path: null,
        value: element,
        meta: { sketchId, kind: element.kind }
      });
    },

    applyViewportSketchPick(ray) {
      if (!this.pendingSketchElement || !this.isSketchMode) return false;
      const hit = intersectRayWithSketchPlane(ray, this.activeSketchPlaneRef(), this.browser);
      if (!hit) return false;

      const def = getSketchCommandDef(this.pendingSketchElement.kind);
      const field = def?.fields.find((item) => item.key === this.pendingSketchElement.activeFieldKey);
      if (!field) return false;

      if (field.type === 'point') {
        this.updateSketchElementDraft({ [field.key]: hit.uv });
        this.advanceSketchElementField(field.key);
        return true;
      }

      if (field.type === 'dimension' && field.bindRadius) {
        const center = this.pendingSketchElement.values.center;
        if (Array.isArray(center)) {
          const du = hit.uv[0] - center[0];
          const dv = hit.uv[1] - center[1];
          const radius = Math.hypot(du, dv);
          if (radius > 1e-6) {
            this.updateSketchElementDraft({ [field.key]: radius });
            return true;
          }
        }
      }

      return false;
    },

    advanceSketchElementField(completedKey) {
      const def = getSketchCommandDef(this.pendingSketchElement?.kind);
      if (!def) return;
      const next = def.fields.find((item) => {
        if (item.key === completedKey) return false;
        if (item.type === 'point') {
          const value = this.pendingSketchElement.values[item.key];
          return !(Array.isArray(value) && value.length === 2);
        }
        if (item.type === 'dimension') {
          const resolved = this.resolveSketchNumeric(this.pendingSketchElement.values[item.key]);
          return !(Number.isFinite(resolved) && resolved > 0);
        }
        return true;
      });
      if (next) {
        this.pendingSketchElement.activeFieldKey = next.key;
      }
    },

    toggleViewportGrid() {
      if (!this.viewportScene) return;
      if (!this.viewportScene.gizmos) {
        this.viewportScene.gizmos = { grid: false };
      }
      this.viewportScene.gizmos.grid = !this.viewportScene.gizmos.grid;
      // When in sketch mode or sketch creation, keep the sketch grid in sync
      // so disabling "Show grid" also hides the sketch plane grid.
      if ((this.isSketchMode || this.pendingSketchCreation) && this.viewportScene.gizmos) {
        this.viewportScene.gizmos.sketchGrid = this.sketchPalette.sketchGrid && this.viewportScene.gizmos.grid;
      }
    },

    toggleOriginVisibility() {
      if (!this.viewportScene) return;
      if (!this.viewportScene.gizmos) {
        this.viewportScene.gizmos = {};
      }
      if (this.viewportScene.gizmos.originVisible === undefined) {
        this.viewportScene.gizmos.originVisible = true;
      }
      this.viewportScene.gizmos.originVisible = !this.viewportScene.gizmos.originVisible;
      if (!this.browser) {
        this.browser = { origin: { planes: ['origin_XY', 'origin_XZ', 'origin_YZ'], visible: true } };
      }
      if (!this.browser.origin) {
        this.browser.origin = { planes: ['origin_XY', 'origin_XZ', 'origin_YZ'], visible: true };
      }
      this.browser.origin.visible = this.viewportScene.gizmos.originVisible;
    },

    toggleViewportDebugMode() {
      if (!this.viewportScene) return;
      if (!this.viewportScene.gizmos) {
        this.viewportScene.gizmos = {};
      }
      if (!this.viewportScene.gizmos.debug) {
        this.viewportScene.gizmos.debug = {
          enabled: false,
          orbitPivot: null,
          orbitActive: false,
          mainCamera: null
        };
      }
      this.viewportScene.gizmos.debug.enabled = !this.viewportScene.gizmos.debug.enabled;
    },

    setViewportOrbitDebug({ pivot, active }) {
      if (!this.viewportScene?.gizmos) return;
      if (!this.viewportScene.gizmos.debug) {
        this.viewportScene.gizmos.debug = {
          enabled: false,
          orbitPivot: null,
          orbitActive: false,
          mainCamera: null
        };
      }
      const debug = this.viewportScene.gizmos.debug;
      if (pivot !== undefined) {
        debug.orbitPivot = pivot ? [...pivot] : null;
      }
      if (active !== undefined) {
        debug.orbitActive = active;
      }
    },

    toggleSketchOption(key) {
      if (key in this.sketchPalette) {
        this.sketchPalette[key] = !this.sketchPalette[key];
      }
      // Keep the rendered grid in sync with the palette toggle while sketching.
      if (key === 'sketchGrid' && this.isSketchMode && this.viewportScene?.gizmos) {
        this.viewportScene.gizmos.sketchGrid = this.sketchPalette.sketchGrid && this.viewportScene.gizmos.grid;
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

    beginConstructionCommand(kind, label = '') {
      this.cancelSketchCreation();
      this.cancelProjectSettings();
      const def = getConstructionCommandDef(kind);
      if (!def) return;
      this.pendingConstruction = {
        kind,
        label: label || def.label,
        values: defaultFieldValues(def),
        activeFieldKey: def.fields[0]?.key ?? null
      };
      this.syncConstructionPreview();
    },

    setConstructionActiveField(fieldKey) {
      if (!this.pendingConstruction) return;
      this.pendingConstruction.activeFieldKey = fieldKey;
    },

    updateConstructionDraft(patch) {
      if (!this.pendingConstruction) return;
      this.pendingConstruction.values = { ...this.pendingConstruction.values, ...patch };
      this.syncConstructionPreview();
    },

    syncConstructionPreview() {
      if (!this.pendingConstruction) return;
      if (!this.viewportScene) return;
      const { inputs, value } = buildConstructionParams(this.pendingConstruction);
      const previewObject = {
        id: '__preview__',
        kind: this.pendingConstruction.kind,
        value,
        inputs,
        visible: true
      };
      this.viewportScene.previewConstruction = constructionViewportMesh(previewObject, { preview: true });
    },

    cancelConstructionCommand() {
      this.pendingConstruction = null;
      if (this.viewportScene) {
        this.viewportScene.previewConstruction = null;
      }
    },

    async confirmConstructionCommand() {
      if (!canConfirmConstructionDraft(this.pendingConstruction)) return;
      const { inputs, value } = buildConstructionParams(this.pendingConstruction);
      const kind = this.pendingConstruction.kind;
      this.pendingConstruction = null;
      if (this.viewportScene) {
        this.viewportScene.previewConstruction = null;
      }
      await this.createConstruction(kind, value, inputs);
    },

    applyViewportPickToConstruction(entityId) {
      if (!this.pendingConstruction?.activeFieldKey) return false;
      const def = getConstructionCommandDef(this.pendingConstruction.kind);
      const field = def?.fields.find((item) => item.key === this.pendingConstruction.activeFieldKey);
      if (!field) return false;
      const mapped = mapViewportPickToField(entityId, field.type, this.browser);
      if (!mapped) return false;
      this.updateConstructionDraft({ [field.key]: mapped });
      const next = def.fields.find((item) => {
        if (item.key === field.key) return false;
        if (item.type === 'number') {
          return !Number.isFinite(Number(this.pendingConstruction.values[item.key]));
        }
        return !this.pendingConstruction.values[item.key];
      });
      if (next) {
        this.pendingConstruction.activeFieldKey = next.key;
      }
      return true;
    },

    createConstruction(kind, value = 0, inputs = ['origin_XY']) {
      return this.dispatchAction({
        type: ACTION_TYPES.CREATE_CONSTRUCTION,
        targetId: this.activeDocumentId,
        targetKind: 'construction',
        path: null,
        value: { kind, value, inputs },
        meta: { kind, value, inputs }
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

    updateMachineProfile(updates) {
      Object.assign(this, updates);
      this.applyProfileToCore();
    },

    setSimulationResolution(resolution) {
      this.simulationResolution = resolution;
      this._machineInitialized = false;
    },

    async startSimulation() {
      if (this.machineTaskMode === 'manual') {
        this.addMessage("Cannot run program in Manual mode. Switch to Auto or MDI.", "warning");
        return;
      }
      this.isSimulating = true;
      this.simulationPlaybackStatus = 'paused';
      this.lastTickTime = null;
      try {
        await initCoreWasm();
        const controller = getController();
        
        console.log("Submitting G-code to MachineController");
        
        this.syncWithController();
        this.applyProfileToCore();
        
        // Sync GUI setup and settings to WASM core
        for (const [code, offset] of Object.entries(this.workOffsets)) {
          controller.setWorkOffset(Number(code), offset[0], offset[1], offset[2]);
        }
        for (const [toolId, zOffset] of Object.entries(this.toolOffsets)) {
          controller.setToolOffset(Number(toolId), zOffset);
        }

        // Initialize Material Simulator
        const matSim = controller.materialSimulator();
        const scaleToMm = this.units === 'inch' ? 25.4 : 1.0;
        matSim.initialize(
          (this.stockSize?.x ?? 1) * scaleToMm,
          (this.stockSize?.y ?? 1) * scaleToMm,
          (this.stockSize?.z ?? 1) * scaleToMm
        );
        matSim.setLocation(
          (this.stockLocation?.x ?? 0) * scaleToMm,
          (this.stockLocation?.y ?? 0) * scaleToMm,
          (this.stockLocation?.z ?? 0) * scaleToMm
        );

        if (this.machineTaskMode === 'auto') {
          const prefix = this.units === 'inch' ? 'G20\n' : 'G21\n';
          const success = controller.submitMdi(prefix + this.gcodeText);
          if (!success) {
            throw new Error("Invalid G-code program or trajectory planning failed.");
          }
        }
        
        this.simulationTotalSteps = controller.getQueuedSegments();
        this.simulationCurrentStep = 0;
        
        this.addMessage('Simulation ready', 'info');
        
        // Auto-start tick loop so the execution actually runs
        this.startSimulationTick();
      } catch (err) {
        console.error('Failed to start WASM simulation:', err);
        this.addMessage('Simulation failed: ' + err.message, 'error');
        this.simulationPlaybackStatus = 'stopped';
        this.isSimulating = false;
      }
    },

    startSimulationTick() {
      if (this.simulationPlaybackStatus === 'playing') return;
      this.simulationPlaybackStatus = 'playing';
      this.lastTickTime = performance.now();
      requestAnimationFrame(() => this.simulationTick());
    },

    pauseSimulation() {
      this.simulationPlaybackStatus = 'paused';
    },

    resumeSimulation() {
      this.startSimulationTick();
    },

    stopSimulation() {
      this.simulationPlaybackStatus = 'stopped';
      this.isSimulating = false;
      this.simulationCurrentStep = 0;
      
      try {
        const controller = getController();
        controller.setTaskMode(0); // Set back to manual or stop
      } catch (err) {
        // ignore
      }
    },

    resetSimulation() {
      this.simulationPlaybackStatus = 'stopped';
      this.isSimulating = false;
      this.simulationCurrentStep = 0;
      this.simulationTotalSteps = 0;
      try {
        if (resetController) {
          const controller = resetController();
          
          this.applyProfileToCore();

          // Sync work offsets and tool offsets to the new controller instance
          for (const [code, offset] of Object.entries(this.workOffsets)) {
            controller.setWorkOffset(Number(code), offset[0], offset[1], offset[2]);
          }
          for (const [toolId, zOffset] of Object.entries(this.toolOffsets)) {
            controller.setToolOffset(Number(toolId), zOffset);
          }

          // Execute initialization G-code if enabled
          if (this.machineInitEnabled) {
            const initGcode = this.getFormattedInitGcode();
            if (initGcode) {
              console.log("[Machine Reset] Running init G-code:\n" + initGcode);
              const success = controller.submitMdi(initGcode);
              if (success) {
                console.log("[Machine Reset] Init G-code submitted successfully");
              } else {
                console.error("[Machine Reset] Init G-code execution failed");
                this.addMessage("Machine initialization G-code failed to execute", "error");
              }
            }
          }

          // Ensure controller starts in Manual mode (0)
          controller.setTaskMode(0);
          this.machineTaskMode = 'manual';
          this.rightPanelTab = 'jog'; // Default to Jog tab on reset

          // Fetch the actual tool position from the controller, scaled to active UI units
          const pos = Array.from(controller.getToolPosition());
          const scaleToUi = this.units === 'inch' ? 1/25.4 : 1.0;
          this.simulationToolPosition = [pos[0] * scaleToUi, pos[1] * scaleToUi, pos[2] * scaleToUi];
        } else {
          this.simulationToolPosition = this.units === 'inch' ? [0, 0, 2] : [0, 0, 50.8];
        }
      } catch (err) {
        console.warn("Failed to reset controller", err);
        this.simulationToolPosition = this.units === 'inch' ? [0, 0, 2] : [0, 0, 50.8];
      }
      syncViewportScene(this.$state);
    },

    seekSimulation(targetStep) {
      if (targetStep === 0) {
        this.resetSimulation();
      } else {
        this.addMessage("Seek simulation not supported in backend controller mode yet.", "warning");
      }
    },

    simulationTick() {
      if (this.simulationPlaybackStatus !== 'playing') return;
      if (!this.isSimulating) return;

      const controller = getController();
      
      const now = performance.now();
      let dtMs = this.lastTickTime ? (now - this.lastTickTime) : 16;
      if (dtMs > 100) dtMs = 100;
      this.lastTickTime = now;

      const simDtSec = (dtMs / 1000.0) * this.playbackSpeedMultiplier;

      controller.tick(simDtSec);
      
      this.simulationCurrentStep = Math.max(0, this.simulationTotalSteps - controller.getQueuedSegments());

      const pos = Array.from(controller.getToolPosition());
      const scaleToUi = this.units === 'inch' ? 1/25.4 : 1.0;
      const newPos = [pos[0]*scaleToUi, pos[1]*scaleToUi, pos[2]*scaleToUi];
      
      if (!this.simulationToolPosition || 
          Math.abs(this.simulationToolPosition[0] - newPos[0]) > 0.001 ||
          Math.abs(this.simulationToolPosition[1] - newPos[1]) > 0.001 ||
          Math.abs(this.simulationToolPosition[2] - newPos[2]) > 0.001) {
        console.log(`[Core Debug] Tool Pos: ${newPos[0].toFixed(3)}, ${newPos[1].toFixed(3)}, ${newPos[2].toFixed(3)} | Queued: ${controller.getQueuedSegments()}`);
      }
      this.simulationToolPosition = newPos;

      const mesh = extractMaterialMesh();
      if (mesh) {
        let posArray = Array.from(mesh.positions);
        if (scaleToUi !== 1.0) {
          posArray = posArray.map(v => v * scaleToUi);
        }
        this.simulatedStockMesh = {
          positions: posArray,
          normals: Array.from(mesh.normals),
          indices: Array.from(mesh.indices)
        };
      }

      syncViewportScene(this.$state);

      if (controller.getQueuedSegments() === 0 && controller.getState() !== 2 /* Running */) {
        this.simulationPlaybackStatus = 'stopped';
        this.addMessage('Simulation finished', 'success');
        this._lastTickMs = null;
        return;
      }

      requestAnimationFrame(() => this.simulationTick());
    },



    beginProjectSettings() {
      this.cancelSketchCreation();
      this.cancelConstructionCommand();
      this.cancelStockSetup();
      this.pendingProjectSettings = true;
      this.rightPanelTab = 'settings';
    },

    cancelProjectSettings() {
      this.pendingProjectSettings = false;
      this.rightPanelTab = 'properties';
    },

    setRightPanelTab(tab) {
      this.rightPanelTab = tab;
      this.showGcodeEditor = (tab === 'gcode');
      this.pendingProjectSettings = (tab === 'settings');
    },

    setUnits(mode) {
      if (this.units === mode) return;
      this.units = mode;
      if (mode === 'inch') {
        this.stockSize = { x: 1, y: 1, z: 1, kind: this.stockSize?.kind || 'cuboid' };
        this.toolDiameter = 0.25;
        this.toolLength = 1;
        this.toolRadius = 0;
        this.toolholderDiameter = 2;
        this.toolholderLength = 1;

        // Dynamically replace G21 with G20 and its comment in machineInitGcode
        if (this.machineInitGcode) {
          this.machineInitGcode = this.machineInitGcode.replace(/\bG21\s*(\(Select metric units\))?/gi, 'G20 (Select imperial units)');
          localStorage.setItem('aim3d_machineInitGcode', this.machineInitGcode);
        }
      } else {
        this.stockSize = { x: 25, y: 25, z: 25, kind: this.stockSize?.kind || 'cuboid' };
        this.toolDiameter = 6;
        this.toolLength = 20;
        this.toolRadius = 0;
        this.toolholderDiameter = 50;
        this.toolholderLength = 25;

        // Dynamically replace G20 with G21 and its comment in machineInitGcode
        if (this.machineInitGcode) {
          this.machineInitGcode = this.machineInitGcode.replace(/\bG20\s*(\(Select imperial units\))?/gi, 'G21 (Select metric units)');
          localStorage.setItem('aim3d_machineInitGcode', this.machineInitGcode);
        }
      }
      this._machineInitialized = false;
      syncViewportScene(this.$state);
    },

    setMachineInitGcode(gcode) {
      this.machineInitGcode = gcode;
      localStorage.setItem('aim3d_machineInitGcode', gcode);
    },

    setMachineInitEnabled(enabled) {
      this.machineInitEnabled = enabled;
      localStorage.setItem('aim3d_machineInitEnabled', enabled ? 'true' : 'false');
    },

    getFormattedInitGcode() {
      let gcode = this.machineInitGcode || '';
      if (this.units === 'inch') {
        gcode = gcode.replace(/\bG21\s*(\(Select metric units\))?/gi, 'G20 (Select imperial units)');
        if (!/\bG20\b/i.test(gcode)) {
          gcode = 'G20 (Select imperial units)\n' + gcode;
        }
      } else {
        gcode = gcode.replace(/\bG20\s*(\(Select imperial units\))?/gi, 'G21 (Select metric units)');
        if (!/\bG21\b/i.test(gcode)) {
          gcode = 'G21 (Select metric units)\n' + gcode;
        }
      }
      return gcode;
    },

    syncWithController() {
      const controller = getController();
      if (!controller) return;

      const profile = controller.getProfile();
      if (!profile) return;

      this.machineMaxVelocity = profile.axes ? profile.axes.maxVelocityMmPerMin : 3000.0;
      this.machineMaxAccel = profile.axes ? profile.axes.maxAccelerationMmPerSec2 : 500.0;
      this.machineSegmentDuration = profile.maxSegmentDurationSec;
      // Convert core UnitMode (0 = Millimeters, 1 = Inches) to store config if needed
      // Currently core state uses 'mm' vs 'inch' 
      this.units = profile.nativeUnits?.value === 1 ? 'inch' : 'mm';
    },

    applyProfileToCore() {
      try {
        const controller = getController();
        if (!controller) return;
        const profile = controller.getProfile();
        if (!profile) return;
        
        for (let i = 0; i < 3; i++) {
          const axis = profile.getAxis(i);
          axis.maxVelocityMmPerMin = this.machineMaxVelocity;
          axis.maxAccelerationMmPerSec2 = this.machineMaxAccel;
          profile.setAxis(i, axis);
          
          if (this.machineHomePosition && this.machineHomePosition.length === 3) {
             profile.setHomePosition(i, Number(this.machineHomePosition[i]));
          }
        }
      } catch(e) {
        // Ignored if core not initialized
      }
    },

    showG54Dialog() {
      this.showG54Modal = true;
    },

    showToolTable() {
      this.showToolTableModal = true;
    },

    async setG54Origin(x, y, z) {
      try {
        await initCoreWasm();
        const controller = getController();
        controller.setWorkOffset(54, Number(x), Number(y), Number(z));
        this.workOffsets[54] = [Number(x), Number(y), Number(z)];
        this.addMessage(`G54 Origin set to X:${x} Y:${y} Z:${z} in WASM core`, 'success');
      } catch (err) {
        console.error('Failed to set G54 Offset in WASM:', err);
        this.addMessage('Failed to dispatch G54 offset: ' + err.message, 'error');
      }
      this.showG54Modal = false;
    },

    async setToolOffset(toolId, zOffset) {
      try {
        await initCoreWasm();
        const controller = getController();
        controller.setToolOffset(Number(toolId), Number(zOffset));
        this.toolOffsets[toolId] = Number(zOffset);
        this.addMessage(`Tool ${toolId} Z offset set to ${zOffset} in WASM core`, 'success');
      } catch (err) {
        console.error('Failed to set Tool Offset in WASM:', err);
        this.addMessage('Failed to dispatch tool offset: ' + err.message, 'error');
      }
    },

    jogSimulation(x, y, z) {
      if (this.machineTaskMode !== 'manual') {
        this.addMessage("Cannot jog outside of Manual mode.", "warning");
        return;
      }
      
      try {
        const controller = getController();
        if (controller && controller.jog) {
          controller.jog(x, y, z);
          // Sync it back from controller to ensure exact value
          const pos = controller.getToolPosition();
          this.simulationToolPosition = [pos[0], pos[1], pos[2]];
        }
      } catch (err) {
        // Fallback for tests
        this.simulationToolPosition = [
          this.simulationToolPosition[0] + x,
          this.simulationToolPosition[1] + y,
          this.simulationToolPosition[2] + z
        ];
      }

      syncViewportScene(this.$state);
    },

    toggleStockVisibility() {
      this.showStock = !this.showStock;
      syncViewportScene(this.$state);
    },

    toggleG54FrameVisibility() {
      this.showG54Frame = !this.showG54Frame;
      syncViewportScene(this.$state);
    },

    toggleOriginVisibility() {
      if (this.browser?.origin) {
        this.browser.origin.visible = !this.browser.origin.visible;
        syncViewportScene(this.$state);
      }
    }
  }
});
