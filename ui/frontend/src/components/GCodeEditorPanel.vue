<template>
  <div class="panel-context">
    <div class="property-grid">
      <div class="panel-header">
        <h2>G-Code Editor</h2>
        <button class="close-btn" @click="close" title="Close">×</button>
      </div>
      
      <section class="section-container">
        <div class="property-card">
          <textarea
            v-model="gcode"
            class="gcode-textarea"
            spellcheck="false"
            placeholder="Enter G-Code here..."
          ></textarea>
        </div>
      </section>
      
      <section class="section-container">
        <div class="button-group">
          <button class="sim-btn" @click="save">Apply Changes</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useCoreStore } from '../store';

const store = useCoreStore();
const gcode = ref(store.gcode);

watch(() => store.gcode, (newVal) => {
  gcode.value = newVal;
});

function close() {
  store.toggleGcodeEditor();
}

function save() {
  store.setGcodeText(gcode.value);
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

.close-btn {
  background: transparent;
  border: none;
  color: hsl(220, 10%, 65%);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0 4px;
}

.close-btn:hover {
  color: white;
}

.section-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.property-card {
  background-color: hsl(220, 15%, 13%);
  border: 1px solid hsla(220, 15%, 25%, 0.4);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-grow: 1;
}

.gcode-textarea {
  flex: 1;
  min-height: 400px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
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

.button-group {
  display: flex;
  justify-content: flex-end;
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
  background-color: hsla(200, 100%, 50%, 0.15);
  color: hsl(200, 100%, 62%);
}
</style>
