<template>
  <section class="section-container animate-fade">
    <h3>Jog Controller</h3>
    <div class="property-card jog-panel">
      <div class="input-item" style="margin-bottom: 12px;">
        <span>Step Distance ({{ distanceUnit }})</span>
        <input type="number" step="0.1" min="0.001" v-model="jogDistance" />
      </div>
      <div class="input-item" style="margin-bottom: 16px;">
        <span>Speed ({{ speedUnit }})</span>
        <input type="number" step="10" min="1" v-model="jogSpeed" />
      </div>
      
      <div class="jog-grid">
        <button class="jog-btn" @click="jog(-1, 1, 0)" title="X- Y+">↖</button>
        <button class="jog-btn" @click="jog(0, 1, 0)" title="Y+">↑</button>
        <button class="jog-btn" @click="jog(1, 1, 0)" title="X+ Y+">↗</button>
        
        <button class="jog-btn" @click="jog(-1, 0, 0)" title="X-">←</button>
        <button class="jog-btn" @click="homeAll" title="Home All">H</button>
        <button class="jog-btn" @click="jog(1, 0, 0)" title="X+">→</button>
        
        <button class="jog-btn" @click="jog(-1, -1, 0)" title="X- Y-">↙</button>
        <button class="jog-btn" @click="jog(0, -1, 0)" title="Y-">↓</button>
        <button class="jog-btn" @click="jog(1, -1, 0)" title="X+ Y-">↘</button>
      </div>

      <div class="jog-z-grid">
        <button class="jog-btn" @click="jog(0, 0, 1)" title="Z+">Z+</button>
        <button class="jog-btn" @click="jog(0, 0, -1)" title="Z-">Z-</button>
      </div>
    </div>
  </section>
</template>

<script>
import { ref, computed, watch } from 'vue';
import { useCoreStore } from '../store';
import { jogController, homeController } from '../services/controllerDaemon';
import { getSimulator } from '../services/coreWasm';

export default {
  name: 'JogPanel',
  setup() {
    const store = useCoreStore();
    const jogDistance = ref(10.0);
    const jogSpeed = ref(1000);

    // Watch for unit changes to update defaults sensibly
    watch(() => store.units, (newUnits) => {
      if (newUnits === 'inch') {
        jogDistance.value = 0.1;
        jogSpeed.value = 40;
      } else {
        jogDistance.value = 10.0;
        jogSpeed.value = 1000;
      }
    }, { immediate: true });

    const distanceUnit = computed(() => store.units === 'inch' ? 'in' : 'mm');
    const speedUnit = computed(() => store.units === 'inch' ? 'in/min' : 'mm/min');

    const jog = async (dx, dy, dz) => {
      const step = parseFloat(jogDistance.value) || 1.0;
      const x = dx * step;
      const y = dy * step;
      const z = dz * step;

      // In real scenarios, speed could be passed if the API supported it
      // For now, jogController just takes x, y, z steps.
      if (store.machineControlMode === 'physical') {
        try {
          await jogController(x, y, z);
          store.addMessage(`Jogged by X:${x} Y:${y} Z:${z}`, 'info');
        } catch (e) {
          store.addMessage(`Jog failed: ${e.message}`, 'error');
        }
      } else {
        // Sim Mode: Update UI Simulator state directly
        store.jogSimulation(x, y, z);
      }
    };

    const homeAll = async () => {
      if (store.machineControlMode === 'physical') {
        try {
          await homeController();
          store.addMessage('Home sequence initiated', 'success');
        } catch (e) {
          store.addMessage(`Home failed: ${e.message}`, 'error');
        }
      } else {
        store.addMessage('Simulation Home initiated', 'success');
      }
    };

    return { jogDistance, jogSpeed, jog, homeAll, distanceUnit, speedUnit, store };
  }
}
</script>

<style scoped>
.jog-panel {
  display: flex;
  flex-direction: column;
}
.jog-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  margin-bottom: 12px;
}
.jog-z-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.jog-btn {
  background: var(--surface-3);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  padding: 12px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1.1em;
  font-weight: bold;
  text-align: center;
  transition: background 0.1s;
}
.jog-btn:hover {
  background: var(--primary-color);
  color: white;
}
.jog-btn:active {
  transform: scale(0.95);
}
</style>
