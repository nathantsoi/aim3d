<template>
  <div class="panel-context">
    <SketchCreatePanel v-if="store.pendingSketchCreation" />
    <ConstructionCommandPanel v-else-if="store.pendingConstruction" />
    <SketchElementCommandPanel v-else-if="store.pendingSketchElement" />
    <SketchPalette v-else-if="store.isSketchMode" />
    <div v-else class="property-grid">
      <div class="panel-tabs">
        <button :class="['tab-btn', { active: activeTab === 'properties' }]" @click="activeTab = 'properties'">Properties</button>
        <button :class="['tab-btn', { active: activeTab === 'setup' }]" @click="activeTab = 'setup'">Setup</button>
        <button :class="['tab-btn', { active: activeTab === 'gcode' }]" @click="activeTab = 'gcode'">G-Code</button>
        <button :class="['tab-btn', { active: activeTab === 'settings' }]" @click="activeTab = 'settings'">Settings</button>
        <button :class="['tab-btn', { active: activeTab === 'debug' }]" @click="activeTab = 'debug'">Debug</button>
      </div>

      <div v-if="activeTab === 'properties'" class="tab-content">
        <div class="panel-header">
          <h2>Properties & Operations</h2>
          <span class="dispatch-state">{{ store.isDispatching ? 'Dispatching' : 'Idle' }}</span>
        </div>

        <section class="section-container">
      <h3>Active Selection</h3>
      <div v-if="store.selectedEntity" class="property-card">
        <div class="prop-row">
          <span class="label">Token ID</span>
          <span class="value select-value">{{ store.selectedEntity.id }}</span>
        </div>
        <div class="prop-row">
          <span class="label">Type</span>
          <span class="value">{{ store.selectedEntity.type }}</span>
        </div>
        <div class="prop-row">
          <span class="label">Parent</span>
          <span class="value">{{ store.selectedEntity.parentLabel }}</span>
        </div>
      </div>
      <div v-else class="empty-state">No entity selected</div>
    </section>

    <section v-if="store.activeMode === 'design'" class="section-container">
      <h3>Parametric Variables</h3>
      <div class="property-card">
        <div v-for="feature in store.features" :key="feature.id" class="parameter-row">
          <div class="param-header">
            <span class="param-title">{{ feature.label }}</span>
            <span v-if="feature.isDirty" class="dirty-tag">Modified</span>
          </div>
          <div class="control-box">
            <input
              :aria-label="`${feature.label} value`"
              data-testid="feature-value"
              type="range"
              min="0"
              max="50"
              step="0.5"
              :value="feature.value"
              @input="onFeatureInput(feature.id, $event)"
            />
            <span class="param-value">{{ feature.value }} {{ feature.unit }}</span>
          </div>
        </div>
        <button
          class="recompute-btn"
          :class="{ active: store.hasDirtyFeatures }"
          data-testid="recompute-button"
          @click="store.triggerParametricRecompute"
        >
          Recompute parametric tree
        </button>
      </div>
    </section>


    <section v-if="store.activeMode === 'manufacture'" class="section-container">
      <h3>CAM Operations</h3>
      <div class="property-card">
        <div v-for="operation in store.operations" :key="operation.id" class="cam-op-row">
          <div class="cam-op-info">
            <div>
              <span class="op-name">{{ operation.name }}</span>
              <span class="op-type">{{ operation.type }}</span>
            </div>
            <span class="op-status" :class="operation.status.toLowerCase()">{{ operation.status }}</span>
          </div>
          <div class="cam-op-inputs">
            <label class="input-item">
              <span>Tool Dia</span>
              <input
                data-testid="operation-tool-diameter"
                type="number"
                step="0.1"
                :value="operation.toolDiameter"
                @change="onOperationField(operation.id, 'toolDiameter', parseNumber($event.target.value))"
              />
            </label>
            <label class="input-item">
              <span>Stepover</span>
              <input
                data-testid="operation-stepover"
                type="number"
                step="0.1"
                :value="operation.stepover"
                @change="onOperationField(operation.id, 'stepover', parseNumber($event.target.value))"
              />
            </label>
            <label class="input-item">
              <span>Feed</span>
              <input
                data-testid="operation-feed-rate"
                type="number"
                step="10"
                :value="operation.feedRate"
                @change="onOperationField(operation.id, 'feedRate', parseNumber($event.target.value))"
              />
            </label>
          </div>
          <div class="button-group">
            <button class="cam-btn" data-testid="generate-toolpath" @click="store.runCAMGeneration(operation.id)">
              Generate path
            </button>
            <button
              class="sim-btn"
              :disabled="operation.status !== 'Ready' || store.isSimulating"
              @click="store.startSimulation"
            >
              {{ store.isSimulating ? 'Simulating...' : 'SDF Simulate' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <section
      v-if="store.activeMode === 'manufacture' && store.simulationStats.materialRemoved > 0"
      class="section-container animate-fade"
    >
      <h3>Taichi Volume Report</h3>
      <div class="property-card status-success">
        <div class="prop-row">
          <span class="label">Collisions</span>
          <span class="value text-success">{{ store.simulationStats.collisions }}</span>
        </div>
        <div class="prop-row">
          <span class="label">Material Subtracted</span>
          <span class="value text-success">{{ store.simulationStats.materialRemoved }} mm3</span>
        </div>
      </div>
    </section>

    <JogPanel v-if="store.activeMode === 'machine'" />
    </div>

    <div v-else-if="activeTab === 'setup'" class="tab-content">
      <section
        v-for="setup in store.setups"
        :key="setup.id"
        class="section-container"
      >
        <h3>CAM Setup Sheet</h3>
        <div class="property-card">
          <label class="input-item">
            <span>Name</span>
            <input
              data-testid="setup-name"
              type="text"
              :value="setup.name"
              @change="onSetupField(setup.id, 'name', $event.target.value)"
            />
          </label>
          <label class="input-item">
            <span>Work Offset</span>
            <select
              data-testid="setup-work-offset"
              :value="setup.workOffset"
              @change="onSetupField(setup.id, 'workOffset', $event.target.value)"
            >
              <option>G54</option>
              <option>G55</option>
              <option>G56</option>
            </select>
          </label>
          <label class="input-item">
            <span>Stock Allowance</span>
            <input
              data-testid="setup-stock-allowance"
              type="number"
              min="0"
              step="0.1"
              :value="setup.stockAllowance"
              @change="onSetupField(setup.id, 'stockAllowance', parseNumber($event.target.value))"
            />
          </label>
        </div>
      </section>

      <StockSetupPanel />
    </div>

    <div v-else-if="activeTab === 'gcode'" class="tab-content">
      <GCodeEditorPanel />
    </div>

    <div v-else-if="activeTab === 'settings'" class="tab-content">
      <ProjectSettingsPanel />
    </div>

    <div v-else-if="activeTab === 'debug'" class="tab-content debug-content">
      <InteractiveTerminal />
    </div>
</div>

<!-- G54 Origin Setup Modal -->
<div v-if="store.showG54Modal" class="modal-overlay">
  <div class="modal-card">
    <h3>Set G54 Work Origin Offsets</h3>
    <p class="modal-desc">Set the translation offset from the physical machine's home coordinates to the G54 workspace origin.</p>
    <div class="modal-fields">
      <label class="input-item">
        <span>X Offset (mm)</span>
        <input type="number" step="0.001" v-model="g54X" />
      </label>
      <label class="input-item">
        <span>Y Offset (mm)</span>
        <input type="number" step="0.001" v-model="g54Y" />
      </label>
      <label class="input-item">
        <span>Z Offset (mm)</span>
        <input type="number" step="0.001" v-model="g54Z" />
      </label>
    </div>
    <div class="modal-actions">
      <button class="cancel-btn" @click="store.showG54Modal = false">Cancel</button>
      <button class="confirm-btn" @click="store.setG54Origin(g54X, g54Y, g54Z)">Set Origin</button>
    </div>
  </div>
</div>

<!-- Tool Table Modal -->
<div v-if="store.showToolTableModal" class="modal-overlay">
  <div class="modal-card tool-table-card">
    <h3>Tool Offset Table</h3>
    <p class="modal-desc">Configure tool length Z offsets. These are applied in the WASM core upon tool change commands (e.g. T1 M6).</p>
    
    <table class="offsets-table">
      <thead>
        <tr>
          <th>Tool ID</th>
          <th>Radius (mm)</th>
          <th>Type</th>
          <th>Z Offset (mm)</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in toolsList" :key="t.id">
          <td>T{{ t.id }}</td>
          <td>{{ t.radius }}</td>
          <td>{{ t.type }}</td>
          <td>
            <input 
              type="number" 
              step="0.01" 
              :value="store.toolOffsets[t.id] || 0.0" 
              @input="onToolOffsetInput(t.id, $event)" 
              class="table-input"
            />
          </td>
        </tr>
      </tbody>
    </table>
    
    <div class="modal-actions">
      <button class="confirm-btn" @click="store.showToolTableModal = false">Close</button>
    </div>
  </div>
</div>

</div>
</template>

<script>
import { defineComponent, ref, computed } from 'vue';
import { useCoreStore } from '../store';
import InteractiveTerminal from './InteractiveTerminal.vue';
import SketchPalette from './SketchPalette.vue';
import ConstructionCommandPanel from './ConstructionCommandPanel.vue';
import SketchCreatePanel from './SketchCreatePanel.vue';
import SketchElementCommandPanel from './SketchElementCommandPanel.vue';
import StockSetupPanel from './StockSetupPanel.vue';
import ProjectSettingsPanel from './ProjectSettingsPanel.vue';
import GCodeEditorPanel from './GCodeEditorPanel.vue';
import JogPanel from './JogPanel.vue';

export default defineComponent({
  name: 'PropertyGrid',
  components: { SketchPalette, ConstructionCommandPanel, SketchCreatePanel, SketchElementCommandPanel, StockSetupPanel, ProjectSettingsPanel, GCodeEditorPanel, InteractiveTerminal, JogPanel },
  setup() {
    const store = useCoreStore();
    const activeTab = computed({
      get: () => store.rightPanelTab || 'properties',
      set: (val) => store.setRightPanelTab(val)
    });
    const parseNumber = (value) => Number.parseFloat(value);

    // Modal data refs
    const g54X = ref(0.0);
    const g54Y = ref(0.0);
    const g54Z = ref(0.0);

    const toolsList = ref([
      { id: 1, radius: 3.0, type: 'Flat Endmill' },
      { id: 2, radius: 1.5, type: 'Ball Endmill' },
      { id: 3, radius: 5.0, type: 'Face Mill' },
      { id: 4, radius: 2.0, type: 'Drill Bit' }
    ]);

    const onFeatureInput = (featureId, event) => {
      store.updateFeatureParameter(featureId, parseNumber(event.target.value));
    };

    const onSetupField = (setupId, path, value) => {
      store.updateSetupField(setupId, path, value);
    };

    const onOperationField = (operationId, path, value) => {
      store.updateOperationField(operationId, path, value);
    };

    const onToolOffsetInput = (toolId, event) => {
      store.setToolOffset(toolId, parseNumber(event.target.value) || 0.0);
    };

    return {
      store,
      activeTab,
      parseNumber,
      g54X,
      g54Y,
      g54Z,
      toolsList,
      onFeatureInput,
      onSetupField,
      onOperationField,
      onToolOffsetInput
    };
  }
});
</script>

<style scoped>
.panel-context {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.property-grid {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
}

.panel-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid hsla(220, 15%, 25%, 0.4);
  padding-bottom: 8px;
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: none;
}
.panel-tabs::-webkit-scrollbar {
  display: none;
}

.tab-btn {
  background: none;
  border: none;
  color: hsl(220, 10%, 60%);
  font-size: 0.85rem;
  flex-shrink: 0;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.tab-btn:hover {
  background-color: hsla(220, 15%, 25%, 0.4);
  color: hsl(220, 10%, 80%);
}

.tab-btn.active {
  background-color: hsla(200, 100%, 50%, 0.15);
  color: hsl(200, 100%, 65%);
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

.debug-content {
  height: 100%;
}


.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h2 {
  font-size: 1rem;
  text-transform: uppercase;
  color: hsl(220, 10%, 65%);
  margin: 0;
  font-weight: 700;
}

.dispatch-state,
.dirty-tag,
.op-status {
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
}

.dispatch-state {
  background-color: hsla(200, 100%, 50%, 0.12);
  color: hsl(200, 100%, 60%);
}

.section-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-container h3 {
  font-size: 0.85rem;
  font-weight: 600;
  color: hsl(220, 10%, 80%);
  margin: 0;
}

.property-card {
  background-color: hsl(220, 15%, 13%);
  border: 1px solid hsla(220, 15%, 25%, 0.4);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prop-row,
.cam-op-info {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.prop-row {
  font-size: 0.8rem;
}

.label,
.input-item span,
.op-type {
  color: hsl(220, 10%, 65%);
}

.value,
.op-name {
  color: hsl(220, 10%, 90%);
  font-weight: 600;
}

.select-value {
  color: hsl(45, 100%, 55%);
  font-family: monospace;
}

.empty-state {
  font-size: 0.75rem;
  color: hsl(220, 10%, 50%);
  text-align: center;
  padding: 16px;
  border: 1px dashed hsla(220, 15%, 25%, 0.4);
  border-radius: 8px;
}

.parameter-row,
.cam-op-row,
.input-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
}

.param-title {
  font-weight: 600;
}

.dirty-tag {
  background-color: hsla(45, 100%, 50%, 0.15);
  color: hsl(45, 100%, 55%);
}

.control-box,
.button-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-box input[type='range'] {
  flex-grow: 1;
}

.param-value {
  font-size: 0.8rem;
  font-weight: 700;
  min-width: 64px;
  text-align: right;
}

.input-item {
  font-size: 0.75rem;
}

input,
select {
  background-color: hsl(220, 20%, 9%);
  border: 1px solid hsla(220, 15%, 30%, 0.8);
  border-radius: 6px;
  color: hsl(220, 10%, 90%);
  font: inherit;
  padding: 7px 8px;
}

.cam-op-inputs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.op-type {
  display: block;
  font-size: 0.7rem;
  margin-top: 2px;
}

.op-status.ready {
  background-color: hsla(145, 70%, 42%, 0.14);
  color: hsl(145, 70%, 58%);
}

.op-status.stale {
  background-color: hsla(45, 100%, 50%, 0.15);
  color: hsl(45, 100%, 55%);
}

button {
  border: 1px solid hsla(220, 15%, 25%, 0.6);
  border-radius: 6px;
  color: hsl(220, 10%, 80%);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 8px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.recompute-btn,
.sim-btn {
  background-color: transparent;
}

.recompute-btn.active,
.cam-btn {
  background-color: hsla(200, 100%, 50%, 0.15);
  color: hsl(200, 100%, 62%);
}

.status-success {
  border-color: hsla(145, 70%, 42%, 0.4);
}

.text-success {
  color: hsl(145, 70%, 58%);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(10, 10, 14, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-card {
  background-color: hsl(220, 15%, 13%);
  border: 1px solid hsla(220, 15%, 25%, 0.8);
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 450px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: modalFadeIn 0.2s ease-out;
}

.tool-table-card {
  max-width: 600px;
}

.modal-card h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: hsl(200, 100%, 65%);
}

.modal-desc {
  margin: 0;
  font-size: 0.8rem;
  color: hsl(220, 10%, 65%);
  line-height: 1.4;
}

.modal-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.cancel-btn {
  background-color: transparent;
  border-color: hsla(220, 15%, 35%, 0.6);
}

.cancel-btn:hover {
  background-color: hsla(220, 15%, 35%, 0.15);
}

.confirm-btn {
  background-color: hsla(200, 100%, 50%, 0.18);
  border-color: hsl(200, 100%, 50%);
  color: hsl(200, 100%, 70%);
}

.confirm-btn:hover {
  background-color: hsla(200, 100%, 50%, 0.3);
}

.offsets-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  margin: 8px 0;
}

.offsets-table th, 
.offsets-table td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid hsla(220, 15%, 25%, 0.4);
}

.offsets-table th {
  color: hsl(220, 10%, 60%);
  font-weight: 700;
}

.offsets-table td {
  color: hsl(220, 10%, 85%);
}

.table-input {
  width: 80px;
  padding: 4px 6px;
  font-size: 0.8rem;
  background-color: hsl(220, 20%, 9%);
  border: 1px solid hsla(220, 15%, 25%, 0.8);
  border-radius: 4px;
  color: hsl(220, 10%, 90%);
}

@keyframes modalFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
