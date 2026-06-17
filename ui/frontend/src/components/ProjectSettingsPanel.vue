<template>
  <div class="settings-tab-container">
    <div class="scroll-content">
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

      <section class="section-container">
        <h3>Homing Parameters</h3>
        <div class="property-card">
          <label class="input-item">
            <span>Home Position X (mm)</span>
            <input type="number" v-model="machineHomeX" step="1" />
          </label>
          <label class="input-item">
            <span>Home Position Y (mm)</span>
            <input type="number" v-model="machineHomeY" step="1" />
          </label>
          <label class="input-item">
            <span>Home Position Z (mm)</span>
            <input type="number" v-model="machineHomeZ" step="1" />
          </label>
        </div>
      </section>

      <section class="section-container">
        <h3>Simulation Parameters</h3>
        <div class="property-card">
          <label class="input-item">
            <span>Simulation Grid Resolution</span>
            <select v-model="simulationResolution">
              <option :value="128">128x128</option>
              <option :value="256">256x256</option>
              <option :value="512">512x512</option>
              <option :value="1024">1024x1024</option>
            </select>
          </label>
        </div>
      </section>

      <section class="section-container">
        <h3>Machine Initialization</h3>
        <div class="property-card">
          <label class="checkbox-item">
            <input type="checkbox" v-model="machineInitEnabled" />
            <span>Run initialization on reset</span>
          </label>
          
          <label class="input-item" style="margin-top: 4px;">
            <span>Initialization G-code</span>
            <textarea
              v-model="machineInitGcode"
              rows="8"
              class="gcode-textarea"
              placeholder="(Machine Initialization G-code)"
              spellcheck="false"
              autocorrect="off"
              autocapitalize="off"
            ></textarea>
          </label>
        </div>
      </section>
    </div>

    <div class="reset-button-container">
      <button class="reset-btn" @click="resetMachine">Machine Reset</button>
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

const machineHomeX = computed({
  get: () => store.machineHomePosition?.[0] ?? 0,
  set: (val) => store.updateMachineProfile({ machineHomePosition: [Number(val), store.machineHomePosition[1], store.machineHomePosition[2]] })
});

const machineHomeY = computed({
  get: () => store.machineHomePosition?.[1] ?? 0,
  set: (val) => store.updateMachineProfile({ machineHomePosition: [store.machineHomePosition[0], Number(val), store.machineHomePosition[2]] })
});

const machineHomeZ = computed({
  get: () => store.machineHomePosition?.[2] ?? 50.8,
  set: (val) => store.updateMachineProfile({ machineHomePosition: [store.machineHomePosition[0], store.machineHomePosition[1], Number(val)] })
});

const simulationResolution = computed({
  get: () => store.simulationResolution,
  set: (val) => store.setSimulationResolution(Number(val))
});

const machineInitGcode = computed({
  get: () => store.machineInitGcode,
  set: (val) => store.setMachineInitGcode(val)
});

const machineInitEnabled = computed({
  get: () => store.machineInitEnabled,
  set: (val) => store.setMachineInitEnabled(val)
});

function resetMachine() {
  store.resetSimulation();
}
</script>

<style scoped>
.settings-tab-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
  justify-content: space-between;
}

.scroll-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  flex: 1;
  padding-right: 4px;
}

/* Custom scrollbar styling for a premium look */
.scroll-content::-webkit-scrollbar {
  width: 6px;
}
.scroll-content::-webkit-scrollbar-track {
  background: transparent;
}
.scroll-content::-webkit-scrollbar-thumb {
  background: hsla(220, 15%, 30%, 0.5);
  border-radius: 3px;
}
.scroll-content::-webkit-scrollbar-thumb:hover {
  background: hsla(220, 15%, 40%, 0.7);
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

select:focus, input[type="number"]:focus {
  outline: none;
  border-color: var(--accent, hsl(200, 100%, 50%));
}

/* Custom Checkbox Styling */
.checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: hsl(220, 10%, 65%);
  cursor: pointer;
  user-select: none;
}

.checkbox-item input[type="checkbox"] {
  appearance: none;
  width: 14px;
  height: 14px;
  border: 1px solid hsla(220, 15%, 30%, 0.8);
  border-radius: 3px;
  background-color: hsl(220, 20%, 9%);
  display: inline-grid;
  place-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.checkbox-item input[type="checkbox"]::before {
  content: "";
  width: 8px;
  height: 8px;
  transform: scale(0);
  transition: 120ms transform ease-in-out;
  box-shadow: inset 1em 1em var(--accent, hsl(200, 100%, 50%));
  border-radius: 2px;
}

.checkbox-item input[type="checkbox"]:checked::before {
  transform: scale(1);
}

.checkbox-item input[type="checkbox"]:focus-visible {
  outline: 2px solid var(--accent, hsl(200, 100%, 50%));
  outline-offset: 2px;
}

/* Custom Textarea Styling */
.gcode-textarea {
  background-color: hsl(220, 20%, 9%);
  border: 1px solid hsla(220, 15%, 30%, 0.8);
  border-radius: 6px;
  color: hsl(220, 10%, 90%);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  padding: 8px;
  resize: vertical;
  min-height: 140px;
  width: 100%;
  box-sizing: border-box;
  line-height: 1.4;
}

.gcode-textarea:focus {
  outline: none;
  border-color: var(--accent, hsl(200, 100%, 50%));
}

/* Reset Button Styling */
.reset-button-container {
  margin-top: 8px;
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
  display: flex;
}

.reset-btn {
  width: 100%;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid hsl(0, 70%, 50%);
  background: hsla(0, 70%, 50%, 0.1);
  color: hsl(0, 80%, 70%);
  cursor: pointer;
  font-weight: 600;
  font-size: 0.8rem;
  transition: all 0.2s ease-in-out;
}

.reset-btn:hover:not(:disabled) {
  background: hsla(0, 70%, 50%, 0.2);
  border-color: hsl(0, 70%, 60%);
  color: hsl(0, 80%, 80%);
}

.reset-btn:active:not(:disabled) {
  background: hsla(0, 70%, 50%, 0.35);
}
</style>
