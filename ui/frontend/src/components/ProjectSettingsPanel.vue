<template>
  <div class="settings-tab-container">
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
      <h3>Machine Limits</h3>
      <div class="property-card">
        <label class="input-item">
          <span>Max Velocity (mm/min)</span>
          <input type="number" v-model="machineMaxVelocity" step="100" />
        </label>
        <label class="input-item">
          <span>Max Acceleration (mm/sec²)</span>
          <input type="number" v-model="machineMaxAccel" step="50" />
        </label>
        <label class="input-item">
          <span>Segment Duration (sec)</span>
          <input type="number" v-model="machineSegmentDuration" step="0.005" />
        </label>
      </div>
    </section>
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

const machineMaxVelocity = computed({
  get: () => store.machineMaxVelocity,
  set: (val) => store.updateMachineProfile({ machineMaxVelocity: Number(val) })
});

const machineMaxAccel = computed({
  get: () => store.machineMaxAccel,
  set: (val) => store.updateMachineProfile({ machineMaxAccel: Number(val) })
});

const machineSegmentDuration = computed({
  get: () => store.machineSegmentDuration,
  set: (val) => store.updateMachineProfile({ machineSegmentDuration: Number(val) })
});
</script>

<style scoped>
.settings-tab-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

select, input[type="number"] {
  background-color: hsl(220, 20%, 9%);
  border: 1px solid hsla(220, 15%, 30%, 0.8);
  border-radius: 6px;
  color: hsl(220, 10%, 90%);
  font: inherit;
  padding: 7px 8px;
}
</style>
