<template>
  <div class="ribbon" @click="closeMenus">
    <!-- Mode selector -->
    <div class="mode-selector" @click.stop>
      <button class="mode-button" data-testid="mode-button" @click="toggleModeMenu">
        <span class="mode-label">{{ activeModeLabel }}</span>
        <span class="caret">&#9662;</span>
      </button>
      <div v-if="modeMenuOpen" class="dropdown mode-dropdown" data-testid="mode-dropdown">
        <button
          v-for="modeId in modeOrder"
          :key="modeId"
          class="dropdown-item"
          :class="{ active: modeId === store.activeMode }"
          data-testid="mode-option"
          @click="onSelectMode(modeId)"
        >
          {{ modes[modeId].label }}
        </button>
      </div>
    </div>

    <div class="ribbon-body">
      <!-- Workspace tabs -->
      <div class="tab-strip">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab"
          :class="{ active: tab.id === store.activeWorkspaceTab }"
          data-testid="workspace-tab"
          @click.stop="store.setWorkspaceTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Command groups for the active tab -->
      <div class="group-bar">
        <div
          v-for="group in groups"
          :key="group.id"
          class="group"
          data-testid="command-group"
          @click.stop
        >
          <button
            :ref="(el) => setGroupButtonRef(group.id, el)"
            class="group-button"
            @click="toggleGroup(group.id)"
          >
            <span class="group-label">{{ group.label }}</span>
            <span class="caret">&#9662;</span>
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="openGroupId && openGroup"
        class="dropdown group-dropdown group-dropdown--fixed"
        :style="groupDropdownStyle"
        data-testid="group-dropdown"
        @click.stop
      >
        <template v-if="openGroup.commands.length">
          <template v-for="command in openGroup.commands" :key="command.id">
            <button
              class="dropdown-item command-item"
              :class="{ preview: !command.action && !command.submenu && !command.hasSubmenu }"
              data-testid="command-item"
              @click="onCommand(openGroup, command)"
            >
              <span class="command-label">{{ command.label }}</span>
              <span v-if="command.hotkey" class="command-hotkey">{{ command.hotkey }}</span>
              <span
                v-else-if="command.submenu || command.hasSubmenu"
                class="command-submenu"
                :class="{ open: openSubmenuId === command.id }"
                >&#9656;</span
              >
              <span v-else-if="!command.action" class="command-preview-tag">preview</span>
            </button>
            <button
              v-for="sub in openSubmenuId === command.id ? command.submenu : []"
              :key="sub.id"
              class="dropdown-item command-item submenu-item preview"
              data-testid="submenu-item"
              @click="onSubCommand(openGroup, command, sub)"
            >
              <span class="command-label">{{ sub.label }}</span>
              <span v-if="sub.hotkey" class="command-hotkey">{{ sub.hotkey }}</span>
            </button>
          </template>
        </template>
        <div v-else class="dropdown-empty" data-testid="group-placeholder">Coming soon</div>
      </div>
    </Teleport>

    <button
      v-if="store.isSketchMode"
      class="finish-sketch-btn"
      data-testid="ribbon-finish-sketch"
      @click.stop="onFinishSketch"
    >
      <span class="finish-check">&#10003;</span>
      <span>FINISH SKETCH</span>
    </button>

    <button
      v-if="store.isSketchMode"
      class="export-dxf-btn"
      data-testid="ribbon-export-dxf"
      @click.stop="onExportDxf"
    >
      <span>EXPORT DXF</span>
    </button>

    <div v-if="lastResult" class="ribbon-status" data-testid="ribbon-status">
      {{ lastResult }}
    </div>
  </div>
</template>

<script>
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useCoreStore } from '../store';
import { RIBBON_MODES, RIBBON_MODE_ORDER, SKETCH_TAB } from '../config/ribbon';
import {
  generateToolpath,
  postProcess,
  recomputeDocument,
  runSimulation,
  solveSketch2d
} from '../services/tauriCommands';

const tauriInvoke = () => {
  if (typeof window === 'undefined') return null;
  return window.__TAURI__?.tauri?.invoke || window.__TAURI__?.invoke || null;
};

export default defineComponent({
  name: 'RibbonToolbar',
  setup() {
    const store = useCoreStore();
    const modeMenuOpen = ref(false);
    const openGroupId = ref(null);
    const openSubmenuId = ref(null);
    const lastResult = ref('');
    const groupButtonRefs = ref({});
    const groupDropdownStyle = ref({});

    const activeMode = computed(() => RIBBON_MODES[store.activeMode] ?? RIBBON_MODES.design);
    const activeModeLabel = computed(() => activeMode.value.label);
    const tabs = computed(() => {
      const baseTabs = activeMode.value.tabs;
      // Append the contextual SKETCH tab while editing a sketch in design mode.
      if (store.isSketchMode && store.activeMode === 'design') {
        return [...baseTabs, SKETCH_TAB];
      }
      return baseTabs;
    });
    const activeTab = computed(
      () => tabs.value.find((tab) => tab.id === store.activeWorkspaceTab) ?? tabs.value[0]
    );
    const groups = computed(() => activeTab.value?.groups ?? []);
    const openGroup = computed(() => groups.value.find((group) => group.id === openGroupId.value) ?? null);

    const setGroupButtonRef = (groupId, el) => {
      if (el) {
        groupButtonRefs.value[groupId] = el;
      } else {
        delete groupButtonRefs.value[groupId];
      }
    };

    const updateGroupDropdownPosition = () => {
      const groupId = openGroupId.value;
      if (!groupId) {
        groupDropdownStyle.value = {};
        return;
      }
      const button = groupButtonRefs.value[groupId];
      if (!button) {
        return;
      }
      const rect = button.getBoundingClientRect();
      groupDropdownStyle.value = {
        top: `${rect.bottom + 6}px`,
        left: `${rect.left}px`,
        minWidth: `${Math.max(rect.width, 220)}px`
      };
    };

    const closeMenus = () => {
      modeMenuOpen.value = false;
      openGroupId.value = null;
      openSubmenuId.value = null;
    };

    const toggleModeMenu = () => {
      openGroupId.value = null;
      openSubmenuId.value = null;
      modeMenuOpen.value = !modeMenuOpen.value;
    };

    const toggleGroup = (groupId) => {
      modeMenuOpen.value = false;
      openSubmenuId.value = null;
      openGroupId.value = openGroupId.value === groupId ? null : groupId;
      if (openGroupId.value) {
        nextTick(updateGroupDropdownPosition);
      } else {
        groupDropdownStyle.value = {};
      }
    };

    onMounted(() => {
      window.addEventListener('resize', updateGroupDropdownPosition);
      window.addEventListener('scroll', closeMenus, true);
    });

    onBeforeUnmount(() => {
      window.removeEventListener('resize', updateGroupDropdownPosition);
      window.removeEventListener('scroll', closeMenus, true);
    });

    const onSelectMode = (modeId) => {
      store.setMode(modeId);
      closeMenus();
    };

    const runCommandAction = (command) => {
      switch (command.action) {
        case 'beginSketch':
          store.beginSketchCreation();
          lastResult.value = 'Select sketch plane';
          return null;
        case 'beginSketchElement':
          store.beginSketchElement(command.sketchKind, command.label);
          lastResult.value = `Define ${command.label}`;
          return null;
        case 'solveSketch':
          return solveSketch2d();
        case 'generateToolpath':
          return generateToolpath(command.operationId ?? `op_${command.id}`);
        case 'runSimulation':
          return runSimulation(store.gcode);
        case 'postProcess':
          return postProcess(store.activeSetup?.id ?? 'setup_Main_1');
        case 'recompute':
          return recomputeDocument();
        default:
          return null;
      }
    };

    const onFinishSketch = async () => {
      closeMenus();
      try {
        await solveSketch2d();
      } finally {
        store.finishSketch();
      }
    };

    const onExportDxf = async () => {
      const sketchId = store.activeSketchId;
      if (!sketchId) {
        lastResult.value = 'No active sketch to export';
        return;
      }
      const invoke = tauriInvoke();
      if (!invoke) {
        lastResult.value = 'DXF export requires Tauri runtime';
        return;
      }
      try {
        const filePath = `/tmp/${sketchId}.dxf`;
        const response = await invoke('export_sketch_dxf', {
          sketchToken: sketchId,
          filePath
        });
        lastResult.value = response?.message || `Exported to ${filePath}`;
      } catch (error) {
        lastResult.value = `DXF export failed: ${error?.message ?? error}`;
      }
    };

    const onSubCommand = async (group, command, sub) => {
      closeMenus();

      if (sub.action === 'beginConstruction') {
        store.beginConstructionCommand(sub.constructKind, sub.label);
        lastResult.value = `Define ${sub.label}`;
        return;
      }

      if (sub.action === 'beginSketchElement') {
        store.beginSketchElement(sub.sketchKind, sub.label);
        lastResult.value = `Define ${sub.label}`;
        return;
      }

      // Sub-tools without actions are visual-only for now.
      console.debug(`[ribbon] ${store.activeMode}/${group.id}/${command.id}/${sub.id}`);
    };

    const onCommand = async (group, command) => {
      // A command with sub-tools expands inline instead of dispatching.
      if (command.submenu) {
        openSubmenuId.value = openSubmenuId.value === command.id ? null : command.id;
        return;
      }

      closeMenus();

      if (!command.action) {
        // Visual-only command: surface intent for debugging only.
        console.debug(`[ribbon] ${store.activeMode}/${group.id}/${command.id}`);
        return;
      }

      const pending = runCommandAction(command);
      if (!pending) return;

      try {
        const result = await pending;
        lastResult.value = result?.message || `${command.label} complete`;
      } catch (error) {
        lastResult.value = `${command.label} failed: ${error?.message ?? error}`;
      }
    };

    return {
      store,
      modes: RIBBON_MODES,
      modeOrder: RIBBON_MODE_ORDER,
      modeMenuOpen,
      openGroupId,
      openSubmenuId,
      openGroup,
      groupDropdownStyle,
      setGroupButtonRef,
      lastResult,
      activeModeLabel,
      tabs,
      groups,
      closeMenus,
      toggleModeMenu,
      toggleGroup,
      onSelectMode,
      onCommand,
      onSubCommand,
      onFinishSketch,
      onExportDxf
    };
  }
});
</script>

<style scoped>
.ribbon {
  display: flex;
  align-items: stretch;
  gap: 16px;
  padding: 8px 16px;
  background-color: hsla(220, 15%, 18%, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid hsla(220, 15%, 25%, 0.4);
  position: relative;
  z-index: 9;
}

.mode-selector {
  position: relative;
  display: flex;
  align-items: center;
}

.mode-button {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 150px;
  padding: 10px 14px;
  background-color: hsl(220, 15%, 13%);
  border: 1px solid hsla(220, 15%, 30%, 0.8);
  border-radius: 6px;
  color: hsl(220, 10%, 90%);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.mode-button:hover {
  border-color: hsl(200, 100%, 50%);
}

.mode-label {
  flex-grow: 1;
  text-align: left;
}

.ribbon-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-grow: 1;
  min-width: 0;
}

.tab-strip {
  display: flex;
  gap: 18px;
  border-bottom: 1px solid hsla(220, 15%, 25%, 0.4);
}

.tab {
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  color: hsl(220, 10%, 55%);
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 4px 2px 6px;
}

.tab:hover {
  color: hsl(220, 10%, 85%);
}

.tab.active {
  color: hsl(200, 100%, 60%);
  border-bottom-color: hsl(200, 100%, 55%);
}

.group-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

/* Dropdowns are teleported to <body> with position:fixed so they are not
   clipped by overflow-x:auto on .group-bar (which forces overflow-y:auto). */
.group-dropdown--fixed {
  position: fixed;
  z-index: 1000;
}

.group {
  position: relative;
  flex-shrink: 0;
}

.group-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background-color: hsl(220, 15%, 13%);
  border: 1px solid hsla(220, 15%, 25%, 0.6);
  border-radius: 6px;
  color: hsl(220, 10%, 80%);
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.group-button:hover {
  background-color: hsl(220, 15%, 16%);
  border-color: hsla(220, 15%, 35%, 0.8);
}

.caret {
  font-size: 0.6rem;
  color: hsl(220, 10%, 55%);
}

.dropdown {
  min-width: 220px;
  background-color: hsla(220, 15%, 16%, 0.98);
  backdrop-filter: blur(16px);
  border: 1px solid hsla(220, 15%, 30%, 0.6);
  border-radius: 8px;
  box-shadow: 0 12px 32px hsla(220, 30%, 4%, 0.55);
  padding: 6px;
  max-height: 60vh;
  overflow-y: auto;
}

.mode-selector .dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
}

.mode-dropdown {
  min-width: 150px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  background: none;
  border: 0;
  border-radius: 5px;
  color: hsl(220, 10%, 85%);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  text-align: left;
}

.dropdown-item:hover {
  background-color: hsla(200, 100%, 50%, 0.15);
  color: hsl(200, 100%, 70%);
}

.dropdown-item.active {
  color: hsl(200, 100%, 65%);
  font-weight: 700;
}

.command-hotkey {
  color: hsl(220, 10%, 55%);
  font-size: 0.7rem;
  font-family: monospace;
}

.command-item.preview {
  opacity: 0.55;
}

.command-preview-tag {
  color: hsl(220, 10%, 45%);
  font-size: 0.6rem;
  font-style: italic;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ribbon-status {
  position: absolute;
  bottom: 4px;
  right: 16px;
  font-size: 0.7rem;
  color: hsl(145, 70%, 62%);
  font-weight: 600;
  pointer-events: none;
}

.finish-sketch-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex-shrink: 0;
  min-width: 96px;
  padding: 8px 14px;
  background-color: hsla(145, 70%, 42%, 0.16);
  border: 1px solid hsl(145, 70%, 42%);
  border-radius: 6px;
  color: hsl(145, 70%, 62%);
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.finish-sketch-btn:hover {
  background-color: hsla(145, 70%, 42%, 0.28);
}

.export-dxf-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex-shrink: 0;
  min-width: 96px;
  padding: 8px 14px;
  background-color: hsla(200, 70%, 42%, 0.16);
  border: 1px solid hsl(200, 70%, 42%);
  border-radius: 6px;
  color: hsl(200, 70%, 62%);
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.export-dxf-btn:hover {
  background-color: hsla(200, 70%, 42%, 0.28);
}

.finish-check {
  font-size: 1.1rem;
  line-height: 1;
}

.command-submenu {
  color: hsl(220, 10%, 55%);
  font-size: 0.7rem;
  transition: transform 0.12s ease;
}

.command-submenu.open {
  transform: rotate(90deg);
  color: hsl(200, 100%, 65%);
}

.submenu-item {
  padding-left: 26px;
  font-size: 0.74rem;
  background-color: hsla(220, 15%, 11%, 0.6);
}

.submenu-item .command-label {
  position: relative;
}

.submenu-item .command-label::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 50%;
  width: 6px;
  height: 1px;
  background-color: hsla(220, 10%, 45%, 0.8);
}

.dropdown-empty {
  padding: 12px 10px;
  color: hsl(220, 10%, 50%);
  font-size: 0.75rem;
  font-style: italic;
  text-align: center;
}
</style>
