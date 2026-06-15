<template>
  <div class="simulation-playback-panel" v-if="isVisible">
    <div class="playback-controls">
      <button @click="stop" class="control-btn" title="Stop">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
      </button>

      <button @click="resetPlayback" class="control-btn" title="Reset">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
      </button>

      <button @click="stepBackward" class="control-btn" title="Step Backward">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
      </button>
      
      <button @click="togglePlay" class="control-btn play-btn" :title="isPlaying ? 'Pause' : 'Play'">
        <svg v-if="isPlaying" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>

      <button @click="stepForward" class="control-btn" title="Step Forward">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
      </button>

      <div class="speed-control">
        <span class="speed-label">{{ store.playbackSpeedMultiplier }}x</span>
        <input 
          type="range" 
          class="speed-slider" 
          min="0.1" 
          max="10" 
          step="0.1" 
          v-model.number="playbackSpeed"
        />
      </div>
    </div>
    
    <div class="scrubber-container">
      <span class="step-label">{{ store.simulationCurrentStep }} / {{ store.simulationTotalSteps }}</span>
      <input 
        type="range" 
        class="scrubber" 
        min="0" 
        :max="store.simulationTotalSteps" 
        v-model.number="currentStep"
        @mousedown="onScrubStart"
        @mouseup="onScrubEnd"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useCoreStore } from '../store';

const store = useCoreStore();

const isVisible = computed(() => store.activeMode === 'machine' && store.machineControlMode === 'simulation');
const isPlaying = computed(() => store.simulationPlaybackStatus === 'playing');

const wasPlayingBeforeScrub = ref(false);

const playbackSpeed = computed({
  get: () => store.playbackSpeedMultiplier,
  set: (val) => { store.playbackSpeedMultiplier = val; }
});

const currentStep = computed({
  get: () => store.simulationCurrentStep,
  set: (val) => { store.seekSimulation(val); }
});

function togglePlay() {
  if (isPlaying.value) {
    store.pauseSimulation();
  } else {
    store.resumeSimulation();
  }
}

function stop() {
  store.stopSimulation();
}

function resetPlayback() {
  store.pauseSimulation();
  store.seekSimulation(0);
}

function onScrubStart() {
  wasPlayingBeforeScrub.value = isPlaying.value;
  if (isPlaying.value) {
    store.pauseSimulation();
  }
}

function onScrubEnd() {
  if (wasPlayingBeforeScrub.value) {
    store.resumeSimulation();
  }
}

function stepForward() {
  store.pauseSimulation();
  currentStep.value = Math.min(store.simulationTotalSteps, currentStep.value + 1);
}

function stepBackward() {
  store.pauseSimulation();
  currentStep.value = Math.max(0, currentStep.value - 1);
}
</script>

<style scoped>
.simulation-playback-panel {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background-color: hsla(220, 20%, 15%, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid hsla(220, 20%, 35%, 0.5);
  border-radius: 8px;
  padding: 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 100;
  width: 400px;
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
}

.control-btn {
  background: transparent;
  border: none;
  color: hsl(220, 10%, 80%);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 4px;
  transition: all 0.2s;
}

.control-btn:hover {
  background-color: hsla(220, 20%, 30%, 0.6);
  color: white;
}

.play-btn {
  color: hsl(200, 90%, 65%);
}

.play-btn:hover {
  color: hsl(200, 90%, 75%);
}

.speed-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 20px;
}

.speed-label {
  font-size: 0.8rem;
  color: hsl(220, 10%, 70%);
  min-width: 32px;
}

.speed-slider {
  width: 60px;
}

.scrubber-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-label {
  font-size: 0.8rem;
  color: hsl(220, 10%, 70%);
  min-width: 60px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.scrubber {
  flex: 1;
}

input[type=range] {
  -webkit-appearance: none;
  background: transparent;
}

input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 12px;
  width: 12px;
  border-radius: 50%;
  background: hsl(200, 90%, 65%);
  cursor: pointer;
  margin-top: -4px;
}

input[type=range]::-webkit-slider-runnable-track {
  width: 100%;
  height: 4px;
  cursor: pointer;
  background: hsla(220, 15%, 35%, 0.8);
  border-radius: 2px;
}
</style>
