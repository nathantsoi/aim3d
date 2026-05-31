<template>
  <div class="timeline-panel">
    <div class="panel-header">
      <h2>{{ store.activeMode === 'manufacture' ? 'Manufacture Browser' : 'Model Tree' }}</h2>
    </div>

    <section v-if="store.activeMode === 'design'" class="tree-container">
      <div class="tree-title">{{ store.documentPath }}</div>
      <div class="tree-list">
        <div
          v-for="feature in store.features"
          :key="feature.id"
          class="tree-node-row"
        >
          <button
            class="tree-node"
            :class="{
              dirty: feature.isDirty,
              selected: store.selectedEntityId === feature.selectionToken
            }"
            data-testid="feature-tree-node"
            @click="onNodeClick(feature.selectionToken)"
          >
            <span class="node-indicator"></span>
            <span class="node-content">
              <span class="node-type">{{ feature.label }}</span>
              <span class="node-id">{{ feature.id }}</span>
            </span>
            <span class="node-param">{{ feature.value }}</span>
          </button>
          <button
            v-if="feature.type === 'Sketch'"
            class="open-btn"
            :title="`Open ${feature.label}`"
            data-testid="sketch-open"
            @click="onOpenSketch(feature.id)"
          >
            &#9998;
          </button>
          <button
            class="delete-btn"
            :title="`Delete ${feature.label}`"
            data-testid="feature-delete"
            @click="onDelete(feature.id, 'feature')"
          >
            &times;
          </button>
        </div>
      </div>
    </section>

    <section v-if="store.activeMode === 'manufacture'" class="tree-container">
      <div class="tree-title">Setups</div>
      <div v-for="setup in store.setups" :key="setup.id" class="setup-group">
        <div class="tree-node-row">
          <button
            class="tree-node setup-node"
            :class="{ dirty: setup.isDirty, selected: store.selectedEntityId === setup.id }"
            data-testid="setup-tree-node"
            @click="onNodeClick(setup.id)"
          >
            <span class="node-indicator"></span>
            <span class="node-content">
              <span class="node-type">{{ setup.name }}</span>
              <span class="node-id">{{ setup.workOffset }} / {{ setup.units }}</span>
            </span>
          </button>
          <button
            class="delete-btn"
            :title="`Delete ${setup.name}`"
            data-testid="setup-delete"
            @click="onDelete(setup.id, 'setup')"
          >
            &times;
          </button>
        </div>

        <div class="operation-list">
          <div
            v-for="operation in store.operationsBySetup[setup.id]"
            :key="operation.id"
            class="tree-node-row"
          >
            <button
              class="tree-node operation-node"
              :class="{
                dirty: operation.isDirty || operation.status === 'Stale',
                selected: store.selectedEntityId === operation.id
              }"
              data-testid="operation-tree-node"
              @click="onNodeClick(operation.id)"
            >
              <span class="node-indicator"></span>
              <span class="node-content">
                <span class="node-type">{{ operation.name }}</span>
                <span class="node-id">{{ operation.type }}</span>
              </span>
              <span class="node-param">{{ operation.status }}</span>
            </button>
            <button
              class="delete-btn"
              :title="`Delete ${operation.name}`"
              data-testid="operation-delete"
              @click="onDelete(operation.id, 'operation')"
            >
              &times;
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { defineComponent } from 'vue';
import { useCoreStore } from '../store';

export default defineComponent({
  name: 'Timeline',
  setup() {
    const store = useCoreStore();

    const onNodeClick = (entityId) => {
      store.selectEntity(store.selectedEntityId === entityId ? null : entityId);
    };

    const onDelete = (entityId, kind) => {
      store.deleteEntity(entityId, kind);
    };

    const onOpenSketch = (sketchId) => {
      store.enterSketchMode(sketchId);
    };

    return {
      store,
      onNodeClick,
      onDelete,
      onOpenSketch
    };
  }
});
</script>

<style scoped>
.timeline-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-header h2 {
  font-size: 1rem;
  text-transform: uppercase;
  color: hsl(220, 10%, 65%);
  margin: 0 0 10px 0;
  font-weight: 700;
}

.tree-container,
.setup-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tree-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: hsl(220, 10%, 80%);
}

.tree-list,
.operation-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 8px;
  border-left: 1px solid hsla(220, 15%, 25%, 0.4);
}

.operation-list {
  margin-left: 16px;
}

.tree-node-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tree-node {
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  flex-grow: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background-color: hsl(220, 15%, 11%);
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 0.75rem;
}

.tree-node:hover {
  background-color: hsl(220, 15%, 15%);
}

.tree-node.selected {
  border-color: hsl(45, 100%, 55%);
  background-color: hsla(45, 100%, 55%, 0.05);
}

.tree-node.dirty {
  border-color: hsl(45, 100%, 55%);
  background-color: hsla(45, 100%, 55%, 0.08);
}

.node-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: hsl(220, 10%, 40%);
}

.selected .node-indicator,
.dirty .node-indicator {
  background-color: hsl(45, 100%, 55%);
}

.node-content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
}

.node-type {
  color: hsl(220, 10%, 90%);
  font-weight: 700;
}

.node-id {
  color: hsl(220, 10%, 50%);
  font-size: 0.65rem;
}

.node-param {
  color: hsl(200, 100%, 50%);
  font-family: monospace;
  font-weight: 700;
}

.delete-btn,
.open-btn {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: hsl(220, 10%, 45%);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease;
}

.open-btn {
  opacity: 1;
  color: hsl(200, 100%, 60%);
}

.tree-node-row:hover .delete-btn {
  opacity: 1;
}

.open-btn:hover {
  color: hsl(200, 100%, 70%);
  border-color: hsla(200, 100%, 50%, 0.4);
  background-color: hsla(200, 100%, 50%, 0.12);
}

.delete-btn:hover {
  color: hsl(0, 85%, 68%);
  border-color: hsla(0, 85%, 65%, 0.4);
  background-color: hsla(0, 85%, 65%, 0.12);
}
</style>
