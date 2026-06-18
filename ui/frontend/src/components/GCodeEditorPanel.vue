<template>
  <div class="gcode-tab-container">
    <section class="section-container">
      <div class="editor-wrapper">
        <div class="line-numbers" ref="lineNumbersRef">
          <div v-for="n in totalLines" :key="n" class="line-number" :class="{ active: n === store.activeGcodeLine }">{{ n }}</div>
        </div>
        <textarea
          v-model="gcode"
          ref="textareaRef"
          class="gcode-textarea"
          spellcheck="false"
          placeholder="Enter G-Code here..."
          @scroll="syncScroll"
        ></textarea>
      </div>
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
        <input
          type="file"
          ref="fileInputRef"
          style="display: none"
          accept=".nc,.gcode,.txt"
          @change="handleFileUpload"
        />
        <button
          class="action-btn secondary-btn"
          @click="triggerFileSelect"
          :disabled="isLoading"
          title="Load G-code File"
        >
          📂 Load File
        </button>
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

const textareaRef = ref(null);
const lineNumbersRef = ref(null);
const fileInputRef = ref(null);

function triggerFileSelect() {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
}

function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target?.result;
    if (typeof content === 'string') {
      gcode.value = content;
      store.gcodeText = content;
      store.addMessage(`Loaded program from ${file.name}`, 'info');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// Auto-scroll G-code editor to active line during simulation/stepping
watch(() => store.activeGcodeLine, (newLine) => {
  if (newLine > 0 && textareaRef.value) {
    const lineHeight = 16.8; // 12px * 1.4
    const targetScrollTop = (newLine - 1) * lineHeight - textareaRef.value.clientHeight / 2 + lineHeight / 2;
    textareaRef.value.scrollTop = Math.max(0, targetScrollTop);
    syncScroll();
  }
});

const totalLines = computed(() => {
  const text = gcode.value || '';
  return Math.max(1, text.split('\n').length);
});

function syncScroll() {
  if (lineNumbersRef.value && textareaRef.value) {
    lineNumbersRef.value.scrollTop = textareaRef.value.scrollTop;
  }
}

watch(gcode, () => {
  setTimeout(syncScroll, 0);
});

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

.editor-wrapper {
  display: flex;
  position: relative;
  flex: 1;
  min-height: 300px;
  border-radius: 6px;
  border: 1px solid hsla(220, 15%, 30%, 0.8);
  background: hsl(220, 20%, 9%);
  overflow: hidden;
}

.editor-wrapper:focus-within {
  border-color: hsl(200, 100%, 60%);
}

.line-numbers {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 8px 0;
  width: 40px;
  color: hsl(220, 10%, 40%);
  background: hsl(220, 20%, 7%);
  border-right: 1px solid hsla(220, 15%, 30%, 0.3);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.4;
  user-select: none;
  overflow: hidden;
}

.line-number {
  padding-right: 8px;
  height: 16.8px; /* 12px * 1.4 = 16.8px */
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.gcode-textarea {
  flex: 1;
  height: 100%;
  resize: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  background: transparent;
  color: hsl(220, 10%, 90%);
  border: none;
  padding: 8px;
  line-height: 1.4;
  outline: none;
  margin: 0;
  white-space: pre;
  overflow: auto;
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
  gap: 12px;
}

.secondary-btn {
  border: 1px solid hsla(220, 15%, 40%, 0.6);
  color: hsl(220, 10%, 80%);
  background: hsla(220, 15%, 20%, 0.3);
}

.secondary-btn:hover:not(:disabled) {
  background: hsla(220, 20%, 30%, 0.4);
  color: white;
  border-color: hsla(220, 20%, 55%, 0.8);
}

.line-number.active {
  color: hsl(200, 100%, 60%);
  background: hsla(200, 100%, 50%, 0.15);
  font-weight: 700;
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
