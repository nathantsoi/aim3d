<template>
  <div class="property-grid">
    <div class="panel-header">
      <h2>Properties & Operations</h2>
    </div>

    <!-- Active Entity Selection Properties -->
    <div class="section-container">
      <h3>Active Selection</h3>
      <div v-if="store.selectedEntityId" class="property-card">
        <div class="prop-row">
          <span class="label">Token ID:</span>
          <span class="value select-value">{{ store.selectedEntityId }}</span>
        </div>
        <div class="prop-row">
          <span class="label">Type:</span>
          <span class="value">B-rep Exact Face</span>
        </div>
        <div class="prop-row">
          <span class="label">Parent:</span>
          <span class="value">Body1</span>
        </div>
      </div>
      <div v-else class="empty-state">
        No active B-rep face selected. Hover/Click the blue box in viewport to select.
      </div>
    </div>

    <!-- Declarative parameter modification -->
    <div class="section-container">
      <h3>Parametric Variables</h3>
      <div class="property-card">
        <div v-for="feat in store.features" :key="feat.id" class="parameter-row">
          <div class="param-header">
            <span class="param-title">{{ feat.type }} ({{ feat.id }})</span>
            <span v-if="feat.isDirty" class="dirty-tag">Modified</span>
          </div>
          <div class="control-box">
            <input 
              type="range" 
              min="1" 
              max="50" 
              step="0.5"
              :value="feat.value" 
              @input="e => onParamChange(feat.id, parseFloat(e.target.value))"
            />
            <span class="param-value">{{ feat.value }}</span>
          </div>
        </div>
        <button 
          class="recompute-btn"
          :class="{ active: hasDirtyFeatures }"
          @click="store.triggerParametricRecompute"
        >
          Recompute parametric tree
        </button>
      </div>
    </div>

    <!-- CAM Operation controls & G-code simulation -->
    <div class="section-container">
      <h3>CAM & Simulation Controls</h3>
      <div class="property-card">
        <div v-for="op in store.operations" :key="op.id" class="cam-op-row">
          <div class="cam-op-info">
            <span class="op-name">{{ op.id }}</span>
            <span class="op-status" :class="op.status.toLowerCase()">{{ op.status }}</span>
          </div>
          <div class="cam-op-inputs">
            <div class="input-item">
              <label>Tool Dia (mm)</label>
              <input type="number" v-model="op.toolDiameter" step="0.1"/>
            </div>
            <div class="input-item">
              <label>Stepover (mm)</label>
              <input type="number" v-model="op.stepover" step="0.1"/>
            </div>
          </div>
          <div class="button-group">
            <button class="cam-btn" @click="store.runCAMGeneration(op.id)">
              Generate path
            </button>
            <button 
              class="sim-btn" 
              :disabled="op.status !== 'Ready' || store.isSimulating"
              @click="store.executeSimulation"
            >
              {{ store.isSimulating ? 'Simulating...' : 'SDF Simulate' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Volumetric simulation feedback reports -->
    <div v-if="store.simulationStats.materialRemoved > 0" class="section-container animate-fade">
      <h3>Taichi Volume Report</h3>
      <div class="property-card status-success">
        <div class="prop-row">
          <span class="label">Collisions:</span>
          <span class="value text-success">{{ store.simulationStats.collisions }}</span>
        </div>
        <div class="prop-row">
          <span class="label">Material Subtracted:</span>
          <span class="value text-success">{{ store.simulationStats.materialRemoved }} mm³</span>
        </div>
        <div class="prop-row">
          <span class="label">VRAM Usage:</span>
          <span class="value text-success">0.24 MB (Sparse Pointer)</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, computed } from 'vue';
import { useCoreStore } from '../store';

export default defineComponent({
  name: 'PropertyGrid',
  setup() {
    const store = useCoreStore();

    const hasDirtyFeatures = computed(() => {
      return store.features.some(f => f.isDirty);
    });

    const onParamChange = (featId, value) => {
      store.updateFeatureParameter(featId, value);
    };

    return {
      store,
      hasDirtyFeatures,
      onParamChange
    };
  }
});
</script>

<style scoped>
.property-grid {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-header h2 {
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: hsl(220, 10%, 65%);
  margin: 0 0 10px 0;
  font-weight: 700;
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

.prop-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
}

.label {
  color: hsl(220, 10%, 65%);
}

.value {
  color: hsl(220, 10%, 90%);
  font-weight: 500;
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

.parameter-row {
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
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 700;
}

.control-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-box input[type="range"] {
  flex-grow: 1;
}

.param-value {
  font-size: 0.8rem;
  font-weight: 700;
  width: 32px;
  text-align: right;
}

.recompute-btn {
  background-color: transparent;
  color: hsl(220, 10%, 65%);
  border: 1px solid hsla(220, 15%, 25%, 0.6);
  border-radius: 6px;
  padding: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.recompute-btn.active {
  background-color: hsl(200, 100%, 50%);
  color: hsl(220, 20%, 5%);
  border-color: hsl(200, 100%, 50%);
  box-shadow: 0 0 10px hsla(200, 100%, 50%, 0.3);
}

.cam-op-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cam-op-info {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
}

.op-name {
  font-weight: 700;
}

.op-status {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
}

.op-status.stale {
  background-color: hsla(0, 0%, 50%, 0.15);
  color: hsl(0, 0%, 75%);
}

.op-status.ready {
  background-color: hsla(120, 75%, 45%, 0.15);
  color: hsl(120, 75%, 55%);
}

.cam-op-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.input-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-item label {
  font-size: 0.65rem;
  color: hsl(220, 10%, 65%);
}

.input-item input {
  background-color: hsl(220, 20%, 9%);
  border: 1px solid hsla(220, 15%, 25%, 0.6);
  color: white;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 0.75rem;
}

.button-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.cam-btn, .sim-btn {
  background-color: hsla(220, 15%, 25%, 0.6);
  color: white;
  border: 1px solid hsla(220, 15%, 35%, 0.4);
  padding: 6px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.sim-btn:not(:disabled) {
  background-color: hsla(120, 75%, 45%, 0.15);
  color: hsl(120, 75%, 55%);
  border-color: hsla(120, 75%, 45%, 0.3);
}

.sim-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-success {
  background-color: hsla(120, 75%, 45%, 0.05);
  border-color: hsla(120, 75%, 45%, 0.2);
}

.text-success {
  color: hsl(120, 75%, 55%);
}
</style>
