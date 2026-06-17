<template>
  <div class="gcode-tab-container">
    <section class="section-container">
      <textarea
        v-model="gcode"
        class="gcode-textarea"
        spellcheck="false"
        placeholder="Enter G-Code here..."
      ></textarea>
    </section>

    <!-- Planning Status -->
    <section v-if="planningStatus" class="planning-status-section" :class="planningStatus.kind">
      <div class="status-header">
        <span class="status-icon">{{ statusIcon }}</span>
        <span class="status-title">{{ planningStatus.title }}</span>
      </div>
      <ul v-if="planningStatus.errors && planningStatus.errors.length" class="status-errors">
        <li v-for="(err, i) in planningStatus.errors" :key="i" class="status-error-item">
          <span v-if="err.line" class="err-line">L{{ err.line }}</span>
          <span class="err-msg">{{ err.message }}</span>
        </li>
      </ul>
      <div v-if="planningStatus.segments !== undefined" class="status-detail">
        {{ planningStatus.segments }} segments planned
      </div>
    </section>

    <section class="section-container button-section">
      <div class="button-group">
        <button
          class="action-btn"
          @click="save"
          :disabled="isLoading"
          data-testid="gcode-save"
        >
          <span v-if="isLoading" class="btn-spinner">⏳</span>
          {{ isLoading ? 'Planning…' : 'Save & Plan' }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useCoreStore } from '../store';

const store = useCoreStore();
const gcode = ref(store.gcodeText ?? '');
const isLoading = ref(false);
const planningStatus = ref(null);

// Sync from store if it changes externally
watch(() => store.gcodeText, (newVal) => {
  if (gcode.value !== newVal) {
    gcode.value = newVal ?? '';
  }
});

const statusIcon = computed(() => {
  if (!planningStatus.value) return '';
  switch (planningStatus.value.kind) {
    case 'success': return '✓';
    case 'error':   return '✗';
    case 'warning': return '⚠';
    default:        return 'ℹ';
  }
});

async function save() {
  if (isLoading.value) return;

  // Always persist the text
  store.gcodeText = gcode.value;
  planningStatus.value = null;

  if (store.activeMode === 'machine' && store.machineTaskMode === 'auto') {
    isLoading.value = true;
    try {
      console.log('[GCodeEditor] Saving program and starting auto simulation…');
      await store.startSimulation();
      // After startSimulation resolves, read back diagnostics from store
      const diags = store.lastPlanningDiagnostics ?? [];
      const errors = diags.filter(d => d.severity === 'error' || d.severity === 'fatal');
      const warnings = diags.filter(d => d.severity === 'warning');
      const segments = store.simulationTotalSteps;

      if (errors.length > 0) {
        planningStatus.value = {
          kind: 'error',
          title: `Planning failed — ${errors.length} error(s)`,
          errors: errors.map(d => ({ line: d.line, message: d.message })),
        };
      } else if (segments === 0) {
        planningStatus.value = {
          kind: 'warning',
          title: 'Program produced no motion segments',
          errors: warnings.map(d => ({ line: d.line, message: d.message })),
        };
      } else {
        planningStatus.value = {
          kind: 'success',
          title: 'Program planned successfully',
          errors: warnings.map(d => ({ line: d.line, message: d.message })),
          segments,
        };
      }
    } catch (err) {
      planningStatus.value = {
        kind: 'error',
        title: 'Simulation error: ' + err.message,
        errors: [],
      };
    } finally {
      isLoading.value = false;
    }
  }
}
</script>

<style scoped>
.gcode-tab-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 8px;
}

.section-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.button-section {
  flex: 0 0 auto;
}

.gcode-textarea {
  flex: 1;
  min-height: 300px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  background: hsl(220, 20%, 9%);
  color: hsl(220, 10%, 90%);
  border: 1px solid hsla(220, 15%, 30%, 0.8);
  border-radius: 6px;
  padding: 8px;
  line-height: 1.4;
}

.gcode-textarea:focus {
  outline: none;
  border-color: hsl(200, 100%, 60%);
}

/* ── Planning Status ─────────────────────────────────── */
.planning-status-section {
  flex: 0 0 auto;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 0.78rem;
  border: 1px solid transparent;
}

.planning-status-section.success {
  background: hsla(140, 60%, 15%, 0.6);
  border-color: hsla(140, 60%, 35%, 0.5);
  color: hsl(140, 60%, 75%);
}

.planning-status-section.error {
  background: hsla(0, 60%, 15%, 0.6);
  border-color: hsla(0, 60%, 35%, 0.5);
  color: hsl(0, 60%, 75%);
}

.planning-status-section.warning {
  background: hsla(40, 70%, 15%, 0.6);
  border-color: hsla(40, 70%, 35%, 0.5);
  color: hsl(40, 70%, 75%);
}

.status-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  margin-bottom: 4px;
}

.status-icon {
  font-size: 0.9rem;
}

.status-errors {
  margin: 4px 0 0;
  padding-left: 16px;
  list-style: disc;
  max-height: 80px;
  overflow-y: auto;
}

.status-error-item {
  display: flex;
  gap: 6px;
  margin-bottom: 2px;
}

.err-line {
  font-weight: 600;
  opacity: 0.7;
  min-width: 28px;
  font-variant-numeric: tabular-nums;
}

.status-detail {
  margin-top: 2px;
  opacity: 0.8;
}

/* ── Buttons ─────────────────────────────────────────── */
.button-group {
  display: flex;
  justify-content: flex-end;
}

.action-btn {
  border: 1px solid hsla(200, 80%, 40%, 0.6);
  border-radius: 6px;
  color: hsl(200, 80%, 75%);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 7px 16px;
  background: hsla(200, 80%, 20%, 0.3);
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: hsla(200, 100%, 30%, 0.4);
  color: hsl(200, 100%, 85%);
  border-color: hsla(200, 100%, 55%, 0.8);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-spinner {
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
</style>
