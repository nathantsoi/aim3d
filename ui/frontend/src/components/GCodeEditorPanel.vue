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
    
    <section class="section-container button-section">
      <div class="button-group">
        <button class="apply-btn" @click="save">Apply Changes</button>
      </div>
    </section>
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

function save() {
  store.setGcodeText(gcode.value);
}
</script>

<style scoped>
.gcode-tab-container {
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

.gcode-textarea {
  flex: 1;
  min-height: 350px;
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

.apply-btn {
  border: 1px solid hsla(220, 15%, 25%, 0.6);
  border-radius: 6px;
  color: hsl(220, 10%, 80%);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 8px 16px;
  background-color: transparent;
}

.apply-btn:hover {
  background-color: hsla(200, 100%, 50%, 0.15);
  color: hsl(200, 100%, 62%);
}
</style>
