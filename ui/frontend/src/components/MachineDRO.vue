<template>
  <div class="machine-dro">

    <!-- ── Task Mode ── -->
    <div class="dro-section mode-section">
      <div class="mode-toggle">
        <button
          v-for="m in taskModes"
          :key="m.value"
          :class="['mode-btn', { active: store.machineTaskMode === m.value }]"
          :id="`dro-mode-${m.value}`"
          @click="store.setMachineTaskMode(m.value)"
        >{{ m.label }}</button>
      </div>
    </div>

    <!-- ── DRO Position ── -->
    <div class="dro-section pos-section">
      <div class="dro-row" v-for="(axis, i) in axes" :key="axis">
        <span class="axis-label">{{ axis }}</span>
        <span class="axis-value">{{ formatPos(store.simulationToolPosition?.[i]) }}</span>
        <span class="axis-unit">{{ store.units === 'inch' ? 'in' : 'mm' }}</span>
      </div>
    </div>

    <!-- ── Units & Coord Mode ── -->
    <div class="dro-section modal-section">
      <div class="modal-row">
        <span class="modal-label">Units</span>
        <div class="toggle-group">
          <button
            :class="['toggle-btn', { active: store.units === 'mm' }]"
            id="dro-units-mm"
            @click="store.setUnits('mm')"
          >G21 mm</button>
          <button
            :class="['toggle-btn', { active: store.units === 'inch' }]"
            id="dro-units-inch"
            @click="store.setUnits('inch')"
          >G20 in</button>
        </div>
      </div>

      <div class="modal-row">
        <span class="modal-label">Distance</span>
        <div class="toggle-group">
          <button
            :class="['toggle-btn', { active: store.coordMode === 'absolute' }]"
            id="dro-coord-abs"
            @click="store.setCoordMode('absolute')"
          >G90 Abs</button>
          <button
            :class="['toggle-btn', { active: store.coordMode === 'relative' }]"
            id="dro-coord-rel"
            @click="store.setCoordMode('relative')"
          >G91 Rel</button>
        </div>
      </div>

      <div class="modal-row">
        <span class="modal-label">Plane</span>
        <div class="toggle-group">
          <button
            v-for="p in planes"
            :key="p.code"
            :class="['toggle-btn', { active: store.activePlane === p.plane }]"
            :id="`dro-plane-${p.plane}`"
            @click="store.setActivePlane(p.plane)"
          >{{ p.label }}</button>
        </div>
      </div>
    </div>

    <!-- ── Work Coordinate System ── -->
    <div class="dro-section wcs-section">
      <div class="section-label">Work Offset</div>
      <div class="wcs-grid">
        <button
          v-for="wcs in workCoordSystems"
          :key="wcs"
          :class="['wcs-btn', { active: store.activeWorkOffset === wcs }]"
          :id="`dro-wcs-g${wcs}`"
          @click="store.setActiveWorkOffset(wcs)"
        >G{{ wcs }}</button>
      </div>
      <div v-if="activeOffsetValues" class="offset-values">
        <span class="offset-chip">X {{ fmtOffset(activeOffsetValues[0]) }}</span>
        <span class="offset-chip">Y {{ fmtOffset(activeOffsetValues[1]) }}</span>
        <span class="offset-chip">Z {{ fmtOffset(activeOffsetValues[2]) }}</span>
        <button class="edit-offset-btn" @click="store.showG54Dialog()" title="Edit G54 offset">✏</button>
      </div>
    </div>

    <!-- ── Machine State ── -->
    <div class="dro-section state-section">
      <div :class="['state-indicator', stateClass]">
        <span class="state-dot"></span>
        <span class="state-text">{{ stateLabel }}</span>
        <span v-if="store.simulationTotalSteps > 0" class="state-progress">
          {{ store.simulationCurrentStep }}/{{ store.simulationTotalSteps }}
        </span>
      </div>
      <div class="speed-row">
        <span class="speed-label">Speed</span>
        <input
          type="range" min="0.1" max="10" step="0.1"
          class="speed-slider"
          :value="store.playbackSpeedMultiplier"
          @input="store.playbackSpeedMultiplier = Number($event.target.value)"
        />
        <span class="speed-value">{{ store.playbackSpeedMultiplier }}×</span>
      </div>
    </div>

    <!-- ── Active Tool & Spindle ── -->
    <div class="dro-section tool-section">
      <div class="tool-row">
        <div class="stat-chip">
          <span class="stat-key">Tool</span>
          <span class="stat-val">T{{ store.modalActiveTool }}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-key">Spindle</span>
          <span class="stat-val">{{ store.modalSpindleRpm.toFixed(0) }} RPM</span>
        </div>
        <div class="stat-chip">
          <span class="stat-key">Feed</span>
          <span class="stat-val">{{ fmtFeed(store.modalFeedRate) }}</span>
        </div>
        <div class="stat-chip" :class="`coolant-${store.modalCoolantMode}`">
          <span class="stat-key">Coolant</span>
          <span class="stat-val">{{ store.modalCoolantMode.toUpperCase() }}</span>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useCoreStore } from '../store';

const store = useCoreStore();

const taskModes = [
  { value: 'manual', label: 'Manual' },
  { value: 'mdi',    label: 'MDI' },
  { value: 'auto',   label: 'Auto' },
];

const axes = ['X', 'Y', 'Z'];

const planes = [
  { code: 17, plane: 'XY', label: 'G17 XY' },
  { code: 18, plane: 'XZ', label: 'G18 XZ' },
  { code: 19, plane: 'YZ', label: 'G19 YZ' },
];

const workCoordSystems = [54, 55, 56, 57, 58, 59];

const activeOffsetValues = computed(() => {
  return store.workOffsets?.[store.activeWorkOffset] ?? null;
});

const stateLabel = computed(() => {
  const s = store.simulationPlaybackStatus;
  if (s === 'playing') return 'Running';
  if (s === 'paused')  return 'Feed Hold';
  return 'Armed';
});

const stateClass = computed(() => {
  const s = store.simulationPlaybackStatus;
  if (s === 'playing') return 'state-running';
  if (s === 'paused')  return 'state-hold';
  return 'state-armed';
});

function formatPos(v) {
  if (v === undefined || v === null || isNaN(v)) return '----.---';
  return v.toFixed(3).padStart(8, ' ');
}

function fmtOffset(v) {
  if (v === undefined || v === null) return '0.000';
  return Number(v).toFixed(3);
}

function fmtFeed(v) {
  const n = Number(v);
  if (!n) return '0';
  const unit = store.units === 'inch' ? 'in/m' : 'mm/m';
  const display = store.units === 'inch' ? (n / 25.4).toFixed(1) : n.toFixed(0);
  return `${display} ${unit}`;
}
</script>

<style scoped>
.machine-dro {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: hsl(220, 18%, 9%);
  border-bottom: 1px solid hsla(220, 15%, 20%, 0.6);
}

/* ── sections ── */
.dro-section {
  padding: 10px 14px;
  border-bottom: 1px solid hsla(220, 15%, 15%, 0.8);
}

.dro-section:last-child {
  border-bottom: none;
}

/* ── task mode ── */
.mode-toggle {
  display: flex;
  gap: 4px;
}

.mode-btn {
  flex: 1;
  padding: 6px 4px;
  border-radius: 5px;
  border: 1px solid hsla(220, 15%, 30%, 0.5);
  background: hsla(220, 15%, 13%, 0.8);
  color: hsl(220, 10%, 55%);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.03em;
  transition: all 0.15s;
}

.mode-btn.active {
  background: hsla(200, 90%, 45%, 0.18);
  border-color: hsl(200, 90%, 50%);
  color: hsl(200, 90%, 72%);
}

.mode-btn:hover:not(.active) {
  border-color: hsla(220, 15%, 45%, 0.6);
  color: hsl(220, 10%, 75%);
}

/* ── position DRO ── */
.pos-section {
  background: hsl(220, 20%, 8%);
}

.dro-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
}

.axis-label {
  font-size: 0.65rem;
  font-weight: 700;
  color: hsl(220, 10%, 45%);
  width: 12px;
  text-transform: uppercase;
}

.axis-value {
  flex: 1;
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 1.0rem;
  font-weight: 600;
  color: hsl(140, 80%, 68%);
  letter-spacing: 0.04em;
  text-align: right;
  white-space: pre;
}

.axis-unit {
  font-size: 0.62rem;
  color: hsl(220, 10%, 40%);
  width: 18px;
}

/* ── modal toggles ── */
.modal-section {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.section-label {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: hsl(220, 10%, 45%);
  margin-bottom: 5px;
}

.modal-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-label {
  font-size: 0.62rem;
  color: hsl(220, 10%, 45%);
  width: 50px;
  flex-shrink: 0;
}

.toggle-group {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}

.toggle-btn {
  padding: 3px 7px;
  border-radius: 4px;
  border: 1px solid hsla(220, 15%, 28%, 0.6);
  background: hsla(220, 15%, 11%, 0.8);
  color: hsl(220, 10%, 50%);
  font-size: 0.62rem;
  font-weight: 600;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  cursor: pointer;
  transition: all 0.12s;
}

.toggle-btn.active {
  background: hsla(45, 90%, 55%, 0.12);
  border-color: hsl(45, 90%, 55%);
  color: hsl(45, 90%, 72%);
}

.toggle-btn:hover:not(.active) {
  border-color: hsla(220, 15%, 42%, 0.6);
  color: hsl(220, 10%, 70%);
}

/* ── WCS ── */
.wcs-grid {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  margin-bottom: 7px;
}

.wcs-btn {
  flex: 1;
  min-width: 30px;
  padding: 4px 2px;
  border-radius: 4px;
  border: 1px solid hsla(220, 15%, 28%, 0.6);
  background: hsla(220, 15%, 11%, 0.8);
  color: hsl(220, 10%, 50%);
  font-size: 0.62rem;
  font-weight: 600;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  cursor: pointer;
  text-align: center;
  transition: all 0.12s;
}

.wcs-btn.active {
  background: hsla(270, 80%, 65%, 0.12);
  border-color: hsl(270, 80%, 65%);
  color: hsl(270, 80%, 80%);
}

.wcs-btn:hover:not(.active) {
  border-color: hsla(220, 15%, 42%, 0.6);
  color: hsl(220, 10%, 70%);
}

.offset-values {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.offset-chip {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.62rem;
  color: hsl(220, 10%, 55%);
  background: hsla(220, 15%, 13%, 0.8);
  border: 1px solid hsla(220, 15%, 22%, 0.6);
  border-radius: 3px;
  padding: 2px 5px;
}

.edit-offset-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: hsl(220, 10%, 40%);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 2px 4px;
  border-radius: 3px;
  transition: color 0.12s;
}

.edit-offset-btn:hover {
  color: hsl(200, 90%, 65%);
}

/* ── machine state ── */
.state-indicator {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
}

.state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.state-text {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.state-progress {
  margin-left: auto;
  font-size: 0.62rem;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: hsl(220, 10%, 45%);
}

.state-armed .state-dot  { background: hsl(200, 80%, 60%); box-shadow: 0 0 5px hsl(200, 80%, 60%); }
.state-armed .state-text { color: hsl(200, 80%, 68%); }

.state-running .state-dot  { background: hsl(120, 75%, 55%); box-shadow: 0 0 6px hsl(120, 75%, 55%); animation: pulse-dot 1s ease-in-out infinite; }
.state-running .state-text { color: hsl(120, 75%, 65%); }

.state-hold .state-dot  { background: hsl(40, 90%, 60%); box-shadow: 0 0 5px hsl(40, 90%, 60%); }
.state-hold .state-text { color: hsl(40, 90%, 68%); }

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.speed-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.speed-label {
  font-size: 0.62rem;
  color: hsl(220, 10%, 45%);
  width: 32px;
}

.speed-slider {
  flex: 1;
  -webkit-appearance: none;
  background: transparent;
}

.speed-slider::-webkit-slider-runnable-track {
  height: 3px;
  background: hsla(220, 15%, 30%, 0.8);
  border-radius: 2px;
}

.speed-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: hsl(200, 90%, 60%);
  margin-top: -3.5px;
  cursor: pointer;
}

.speed-value {
  font-size: 0.65rem;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: hsl(200, 90%, 65%);
  width: 26px;
  text-align: right;
}

/* ── tool/spindle/feed ── */
.tool-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.stat-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: hsla(220, 15%, 12%, 0.8);
  border: 1px solid hsla(220, 15%, 22%, 0.6);
  border-radius: 5px;
  padding: 5px 8px;
  flex: 1;
  min-width: 56px;
}

.stat-key {
  font-size: 0.56rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: hsl(220, 10%, 42%);
  margin-bottom: 2px;
}

.stat-val {
  font-size: 0.68rem;
  font-weight: 600;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: hsl(220, 10%, 78%);
}

.coolant-mist  { border-color: hsla(200, 80%, 50%, 0.4); }
.coolant-mist  .stat-val { color: hsl(200, 80%, 70%); }
.coolant-flood { border-color: hsla(200, 90%, 45%, 0.5); }
.coolant-flood .stat-val { color: hsl(200, 90%, 65%); }
</style>
