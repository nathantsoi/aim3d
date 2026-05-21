import { createApp, defineComponent, h } from 'vue';
import { createPinia } from 'pinia';
import Timeline from './components/Timeline.vue';
import Viewport from './components/Viewport.vue';
import PropertyGrid from './components/PropertyGrid.vue';

// Define top-level layout coordinator
const AppShell = defineComponent({
  name: 'AppShell',
  render() {
    // Coordinate main page elements into the parent grid slots
    return h('div', { style: 'display: contents;' }, [
      h(Timeline, { class: 'app-panel' }),
      h(Viewport),
      h(PropertyGrid, { class: 'app-panel right' })
    ]);
  }
});

const app = createApp(AppShell);
app.use(createPinia());
app.mount('#app');

console.log('[aim3d Frontend] Vue container initialized successfully.');
