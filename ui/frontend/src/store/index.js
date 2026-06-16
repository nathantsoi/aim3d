import { defineStore } from 'pinia';
import {
  ACTION_TYPES,
  applyCoreSnapshot,
  createInitialCoreState,
  createUiAction,
  syncViewportScene
} from '../contracts/coreState';
import { dispatchCoreAction } from '../services/coreGateway';
import { initCoreWasm, parseGcode, getSimulator, getCoreModule } from '../services/coreWasm';
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
let activeSimulationSegments = null;
let activeSimulationMachineProfile = null;

export const useCoreStore = defineStore('core', {
  state: () => ({
    ...createInitialCoreState(),
    isDispatching: false,
    lastDispatchedAction: null,
    actionLog: [],
    pendingConstruction: null,
    pendingSketchCreation: null,
    pendingSketchElement: null,
    pendingStockSetup: {
      kind: 'cuboid',
      x: 100,
      y: 100,
      z: 25
    },
    pendingProjectSettings: false,
    isConnected: false,
    messages: [],
    
    // Machine Profile Settings
    machineMaxVelocity: 3000.0,
    machineMaxAccel: 500.0,
    machineSegmentDuration: 0.025,
    simulationResolution: 256,
    
    // Simulation Playback State
    simulationPlaybackStatus: 'stopped', // 'stopped', 'playing', 'paused'
    simulationCurrentStep: 0,
    simulationTotalSteps: 0,
    simulationToolPosition: [0, 0, 0],
    playbackSpeedMultiplier: 1.0,

    // Machine Control State
    machineControlMode: 'simulation', // 'simulation' or 'physical'
    showStock: true,
    showG54Frame: true,
    showG54Modal: false,
    showToolTableModal: false,
    rightPanelTab: 'properties', // 'properties', 'gcode', 'settings', 'debug'
    workOffsets: {
      54: [0, 0, 0] // G54 offset x, y, z
    },
    toolOffsets: {}, // toolId -> zOffset
    _machineInitialized: false
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
      if (mode !== 'machine') {
        this.showGcodeEditor = false;
      }
      syncViewportScene(this.$state);
    },

    toggleGcodeEditor() {
      this.showGcodeEditor = !this.showGcodeEditor;
      this.rightPanelTab = this.showGcodeEditor ? 'gcode' : 'properties';
    },

    async setGcodeText(text) {
      this.gcode = text;
      if (this.pendingStockSetup) {
        this.confirmStockSetup();
      } else if (this.activeMode === 'machine') {
        await this.startSimulation();
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
      this.pendingStockSetup = {
        kind: this.stockSize?.kind || 'cuboid',
        x: this.stockSize.x,
        y: this.stockSize.y,
        z: this.stockSize.z,
        locX: this.stockLocation?.x || 0,
        locY: this.stockLocation?.y || 0,
        locZ: this.stockLocation?.z || 0
      };
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
    },

    setSimulationResolution(resolution) {
      this.simulationResolution = resolution;
      this._machineInitialized = false;
    },

    async startSimulation() {
      this.isSimulating = true;
      this.simulationPlaybackStatus = 'paused';
      this.lastTickTime = null;
      try {
        await initCoreWasm();
        const coreModule = getCoreModule();
        const sim = getSimulator();
        
        console.log("WASM Simulation started for G-code length:", this.gcode.length);
        
        // Parse G-code
        const program = parseGcode(this.gcode);
        if (!program.valid()) {
          throw new Error("Invalid G-code program");
        }

        // Setup Machine Profile and Trajectory Planner
        if (activeSimulationMachineProfile) activeSimulationMachineProfile.delete();
        activeSimulationMachineProfile = coreModule.createMachineProfile(
          this.machineMaxVelocity,
          this.machineMaxAccel,
          this.machineSegmentDuration
        );

        const planner = new coreModule.TrajectoryPlanner(activeSimulationMachineProfile);
        if (activeSimulationSegments) activeSimulationSegments.delete();
        activeSimulationSegments = planner.plan(program);
        this.simulationTotalSteps = activeSimulationSegments.size();
        this.simulationCurrentStep = 0;
        
        console.log(`Trajectory planned: ${this.simulationTotalSteps} segments`);
        if (this.simulationTotalSteps > 0) {
          const firstSeg = activeSimulationSegments.get(0);
          console.log(`First segment deltaSteps: X=${firstSeg.getDeltaX()}, Y=${firstSeg.getDeltaY()}, Z=${firstSeg.getDeltaZ()}`);
        }
        
        planner.delete();
        
        // Sync GUI setup and settings to WASM core
        for (const [code, offset] of Object.entries(this.workOffsets)) {
          sim.setWorkOffset(Number(code), offset[0], offset[1], offset[2]);
        }
        for (const [toolId, zOffset] of Object.entries(this.toolOffsets)) {
          sim.setToolOffset(Number(toolId), zOffset);
        }

        // Initialize simulation volume based on stock, only if not yet initialized
        if (!this._machineInitialized) {
          sim.setStockLocation(this.stockLocation.x || 0, this.stockLocation.y || 0, this.stockLocation.z || 0);
          sim.initialize(this.stockSize.x, this.stockSize.y, this.stockSize.z, this.simulationResolution, this.simulationResolution);
          sim.reset();
          this._machineInitialized = true;
        }
        
        this.extractSimulationMesh();
        
        this.addMessage('Simulation ready', 'info');
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
      this.extractSimulationMesh(); // Update one last time
      
      if (activeSimulationSegments) {
        activeSimulationSegments.delete();
        activeSimulationSegments = null;
      }
      if (activeSimulationMachineProfile) {
        activeSimulationMachineProfile.delete();
        activeSimulationMachineProfile = null;
      }
    },

    seekSimulation(targetStep) {
      if (!this.isSimulating || !activeSimulationSegments) return;
      const sim = getSimulator();
      targetStep = Math.max(0, Math.min(targetStep, this.simulationTotalSteps));
      
      sim.simulateToStep(activeSimulationSegments, activeSimulationMachineProfile, targetStep);
      this.simulationCurrentStep = sim.getCurrentStep();
      
      const pos = sim.getToolPosition();
      this.simulationToolPosition = [pos[0], pos[1], pos[2]];
      
      this.extractSimulationMesh();
    },

    simulationTick() {
      if (this.simulationPlaybackStatus !== 'playing') return;
      if (!this.isSimulating || !activeSimulationSegments) return;

      const sim = getSimulator();
      
      // Calculate how many steps to execute this frame based on playback speed multiplier
      const now = performance.now();
      let dtMs = this.lastTickTime ? (now - this.lastTickTime) : 16;
      if (dtMs > 100) dtMs = 100; // Cap delta-time to avoid huge frame skips
      this.lastTickTime = now;

      // Desired simulation time elapsed
      const simDtSec = (dtMs / 1000.0) * this.playbackSpeedMultiplier;
      const stepsToRun = Math.max(1, Math.floor(simDtSec / this.machineSegmentDuration));

      const t0 = performance.now();
      let stepsRun = 0;
      while (stepsRun < stepsToRun && this.simulationCurrentStep < this.simulationTotalSteps) {
        const seg = activeSimulationSegments.get(this.simulationCurrentStep);
        sim.simulateStep(seg, activeSimulationMachineProfile);
        this.simulationCurrentStep = sim.getCurrentStep();
        stepsRun++;
      }
      const t1 = performance.now();

      this.simulationToolPosition = Array.from(sim.getToolPosition());
      this.extractSimulationMesh();
      const t2 = performance.now();
      if (t2 - t0 > 15) {
        console.log(`simulationTick total: ${(t2 - t0).toFixed(2)}ms (simulate ${stepsRun} steps: ${(t1 - t0).toFixed(2)}ms)`);
      }

      if (this.simulationCurrentStep >= this.simulationTotalSteps) {
        this.simulationPlaybackStatus = 'stopped';
        this.addMessage('Simulation finished', 'success');
        this._lastTickMs = null;
        return;
      }

      requestAnimationFrame(() => this.simulationTick());
    },

    extractSimulationMesh() {
      const t0 = performance.now();
      const sim = getSimulator();
      sim.updateMesh();
      const t1 = performance.now();
      
      const positionsView = sim.getPositions();
      if (!positionsView) {
        syncViewportScene(this.$state);
        return;
      }
      
      const normalsView = sim.getNormals();
      const indicesView = sim.getIndices();
      
      const positions = new Float32Array(positionsView);
      const normals = new Float32Array(normalsView);
      const indices = new Uint32Array(indicesView);
      
      const t2 = performance.now();
      
      const colors = [];
      const vertexCount = Math.floor(positions.length / 3);
      for (let i = 0; i < vertexCount; i++) {
        colors.push(0.7, 0.7, 0.7, 1.0);
      }

      this.simulationVertexCount = vertexCount;

      const simulatedSolid = {
        id: 'solid_simulated_stock',
        bodyId: 9999,
        sourceToken: 'simulated_stock',
        positions,
        normals,
        indices,
        colors,
        _revision: Date.now(),
        transform: [
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          this.stockLocation.x || 0, this.stockLocation.y || 0, this.stockLocation.z || 0, 1
        ],
        pickable: {
          entityId: 'simulated_stock',
          kind: 'Machined Stock',
          priority: 5,
          snapPoints: []
        }
      };

      // toolhead visual indicator removed: we use the CAD-styled dynamic toolhead from coreState.js instead.
      
      this.viewportScene = {
        ...this.viewportScene,
        solids: [
          ...this.viewportScene.solids.filter(s => s.id !== 'solid_simulated_stock'),
          simulatedSolid
        ],
        toolpaths: this.viewportScene.toolpaths,
        gizmos: this.viewportScene.gizmos,
        camera: this.viewportScene.camera
      };
      
      syncViewportScene(this.$state);
      const t3 = performance.now();
      if (t3 - t0 > 10) {
        console.log(`extractSimulationMesh took ${(t3 - t0).toFixed(2)}ms (updateMesh: ${(t1 - t0).toFixed(2)}ms, readWASMMemory: ${(t2 - t1).toFixed(2)}ms, vueStoreUpdate: ${(t3 - t2).toFixed(2)}ms)`);
      }
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
      } else {
        this.stockSize = { x: 25, y: 25, z: 25, kind: this.stockSize?.kind || 'cuboid' };
        this.toolDiameter = 6;
        this.toolLength = 20;
        this.toolRadius = 0;
        this.toolholderDiameter = 50;
        this.toolholderLength = 25;
      }
      this._machineInitialized = false;
      syncViewportScene(this.$state);
    },

    async togglePhysicalMode() {
      if (this.machineControlMode === 'simulation') {
        const connected = await this.connectToPhysicalMachine();
        if (connected) {
          this.machineControlMode = 'physical';
          this.addMessage(`Switched machine control mode to physical`, 'info');
        } else {
          this.addMessage(`Failed to switch to physical mode`, 'error');
        }
      } else {
        await this.disconnectFromPhysicalMachine();
        this.machineControlMode = 'simulation';
        this.addMessage(`Switched machine control mode to simulation`, 'info');
      }
    },

    async connectToPhysicalMachine() {
      this.addMessage('Connecting to physical machine over serial...', 'info');
      try {
        if (!navigator.serial) {
          throw new Error('Web Serial API not supported in this browser.');
        }
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        this.activeSerialPort = port;
        this.setConnected(true);
        this.addMessage('Connected to serial port successfully', 'success');
        return true;
      } catch (err) {
        this.addMessage('Failed to connect: ' + err.message, 'error');
        this.setConnected(false);
        return false;
      }
    },

    async disconnectFromPhysicalMachine() {
      if (this.activeSerialPort) {
        try {
          await this.activeSerialPort.close();
        } catch (err) {
          console.error('Failed to close serial port:', err);
        }
        this.activeSerialPort = null;
      }
      this.setConnected(false);
      this.addMessage('Disconnected from physical machine', 'info');
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
        const sim = getSimulator();
        sim.setWorkOffset(54, Number(x), Number(y), Number(z));
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
        const sim = getSimulator();
        sim.setToolOffset(Number(toolId), Number(zOffset));
        this.toolOffsets[toolId] = Number(zOffset);
        this.addMessage(`Tool ${toolId} Z offset set to ${zOffset} in WASM core`, 'success');
      } catch (err) {
        console.error('Failed to set Tool Offset in WASM:', err);
        this.addMessage('Failed to dispatch tool offset: ' + err.message, 'error');
      }
    },

    jogSimulation(x, y, z) {
      this.simulationToolPosition = [
        this.simulationToolPosition[0] + x,
        this.simulationToolPosition[1] + y,
        this.simulationToolPosition[2] + z
      ];
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
