<template>
  <div class="mdi-tab-container animate-fade">
    <div class="panel-header">
      <h2>MDI Command</h2>
    </div>
    
    <section class="section-container">
      <div class="input-item">
        <label for="mdi-input">Command</label>
        <input 
          id="mdi-input"
          ref="mdiInput"
          type="text" 
          v-model="mdiCommand" 
          @keyup.enter="executeMdi"
          placeholder="e.g. G0 X10"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </div>
    </section>

    <section class="section-container button-section">
      <div class="button-group">
        <button class="action-btn" @click="executeMdi" :disabled="!mdiCommand">Execute</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useCoreStore } from '../store';

const store = useCoreStore();
const mdiCommand = ref('');
const mdiInput = ref(null);

function executeMdi() {
  if (!mdiCommand.value) return;
  // Send just the current line to the store
  store.setGcodeText(mdiCommand.value);
  // Optional: clear the input after execution?
  // mdiCommand.value = '';
  // mdiInput.value?.focus();
}
</script>

<style scoped>
.mdi-tab-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 12px;
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

.input-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-item label {
  font-size: 0.8rem;
  color: var(--text-color);
}

.input-item input {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  padding: 8px 12px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.9rem;
}

.input-item input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.button-group {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0;
  border-top: 1px solid var(--border-color);
}

.action-btn {
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid var(--primary-color);
  background: hsla(200, 100%, 50%, 0.1);
  color: hsl(200, 100%, 65%);
  cursor: pointer;
  font-weight: bold;
}

.action-btn:hover:not(:disabled) {
  background: hsla(200, 100%, 50%, 0.2);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  border-color: var(--border-color);
  color: var(--text-color);
  background: var(--surface-3);
}
</style>
