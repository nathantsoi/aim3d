<template>
  <div class="panel-context">
    <div class="property-grid">
      <div class="panel-header">
        <h2>Document Settings</h2>
      </div>

      <section class="section-container">
        <h3>General</h3>
        <div class="property-card">
          <label class="input-item">
            <span>Active Units</span>
            <select v-model="units">
              <option value="mm">Millimeters (mm)</option>
              <option value="inch">Inches (in)</option>
            </select>
          </label>
        </div>
      </section>

      <section class="section-container">
        <div class="button-group">
          <button class="sim-btn" @click="cancel">Close</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useCoreStore } from '../store';

const store = useCoreStore();

const units = computed({
  get: () => store.units || 'mm',
  set: (val) => store.setUnits(val)
});

function cancel() {
  store.cancelProjectSettings();
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

button:hover {
  background-color: hsla(220, 15%, 20%, 0.6);
}
</style>
