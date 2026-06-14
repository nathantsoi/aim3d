<template>
  <div class="panel-context">
    <div class="property-grid">
      <div class="panel-header">
        <h2>Simulation Setup</h2>
      </div>

      <section class="section-container">
        <h3>Dimensions</h3>
        <div class="property-card">
          <label class="input-item">
            <span>Kind</span>
            <select v-model="kind">
              <option value="cuboid">Rectangular Cuboid</option>
              <option value="cylinder">Cylinder</option>
            </select>
          </label>
          
          <label class="input-item">
            <span>{{ kind === 'cylinder' ? 'Diameter (X)' : 'Width (X)' }}</span>
            <input type="number" v-model.number="x" step="1" min="1" />
          </label>
          <label class="input-item" v-if="kind === 'cuboid'">
            <span>Depth (Y)</span>
            <input type="number" v-model.number="y" step="1" min="1" />
          </label>
          <label class="input-item">
            <span>Height (Z)</span>
            <input type="number" v-model.number="z" step="1" min="1" />
          </label>
        </div>
      </section>

      <section class="section-container">
        <h3>Tool</h3>
        <div class="property-card">
          <label class="input-item">
            <span>Diameter</span>
            <input type="number" v-model.number="toolDiameter" step="0.1" min="0.1" />
          </label>
          <label class="input-item">
            <span>Length</span>
            <input type="number" v-model.number="toolLength" step="1" min="1" />
          </label>
          <label class="input-item">
            <span>Tip Radius</span>
            <input type="number" v-model.number="toolRadius" step="0.1" min="0" />
          </label>
        </div>
      </section>

      <section class="section-container">
        <h3>Tool Holder</h3>
        <div class="property-card">
          <label class="input-item">
            <span>Diameter</span>
            <input type="number" v-model.number="toolholderDiameter" step="1" min="1" />
          </label>
          <label class="input-item">
            <span>Length</span>
            <input type="number" v-model.number="toolholderLength" step="1" min="1" />
          </label>
        </div>
      </section>

      <section class="section-container">
        <div class="button-group">
          <button class="sim-btn" @click="cancel">Cancel</button>
          <button class="recompute-btn active" @click="confirm">Apply</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useCoreStore } from '../store';

const store = useCoreStore();

const kind = computed({
  get: () => store.pendingStockSetup?.kind ?? 'cuboid',
  set: (val) => store.updateStockSetup({ kind: val })
});
const x = computed({
  get: () => store.pendingStockSetup?.x ?? 100,
  set: (val) => store.updateStockSetup({ x: val })
});
const y = computed({
  get: () => store.pendingStockSetup?.y ?? 100,
  set: (val) => store.updateStockSetup({ y: val })
});
const z = computed({
  get: () => store.pendingStockSetup?.z ?? 25,
  set: (val) => store.updateStockSetup({ z: val })
});
const toolDiameter = computed({
  get: () => store.toolDiameter,
  set: (val) => store.updateToolSetup({ toolDiameter: val })
});
const toolLength = computed({
  get: () => store.toolLength,
  set: (val) => store.updateToolSetup({ toolLength: val })
});
const toolRadius = computed({
  get: () => store.toolRadius,
  set: (val) => store.updateToolSetup({ toolRadius: val })
});
const toolholderDiameter = computed({
  get: () => store.toolholderDiameter,
  set: (val) => store.updateToolSetup({ toolholderDiameter: val })
});
const toolholderLength = computed({
  get: () => store.toolholderLength,
  set: (val) => store.updateToolSetup({ toolholderLength: val })
});

function cancel() {
  store.cancelStockSetup();
}

function confirm() {
  store.confirmStockSetup();
}
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

.input-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.75rem;
}

.input-item span {
  color: hsl(220, 10%, 65%);
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

.button-group {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

button {
  border: 1px solid hsla(220, 15%, 25%, 0.6);
  border-radius: 6px;
  color: hsl(220, 10%, 80%);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 8px 16px;
  background-color: transparent;
}

button.active {
  background-color: hsla(200, 100%, 50%, 0.15);
  color: hsl(200, 100%, 62%);
}
</style>
