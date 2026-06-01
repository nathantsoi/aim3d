<template>
  <div class="panel-context">
    <SketchCreatePanel v-if="store.pendingSketchCreation" />
    <ConstructionCommandPanel v-else-if="store.pendingConstruction" />
    <SketchPalette v-else-if="store.isSketchMode" />
    <div v-else class="property-grid">
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

    <section
      v-for="setup in (store.activeMode === 'manufacture' ? store.setups : [])"
      :key="setup.id"
      class="section-container"
    >
      <h3>Setup Sheet</h3>
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
              @click="store.executeSimulation"
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
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue';
import { useCoreStore } from '../store';
import SketchPalette from './SketchPalette.vue';
import ConstructionCommandPanel from './ConstructionCommandPanel.vue';
import SketchCreatePanel from './SketchCreatePanel.vue';

export default defineComponent({
  name: 'PropertyGrid',
  components: { SketchPalette, ConstructionCommandPanel, SketchCreatePanel },
  setup() {
    const store = useCoreStore();
    const parseNumber = (value) => Number.parseFloat(value);

    const onFeatureInput = (featureId, event) => {
      store.updateFeatureParameter(featureId, parseNumber(event.target.value));
    };

    const onSetupField = (setupId, path, value) => {
      store.updateSetupField(setupId, path, value);
    };

    const onOperationField = (operationId, path, value) => {
      store.updateOperationField(operationId, path, value);
    };

    return {
      store,
      parseNumber,
      onFeatureInput,
      onSetupField,
      onOperationField
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
</style>
