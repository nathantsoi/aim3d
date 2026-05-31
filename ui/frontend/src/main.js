import { createApp, defineComponent, h } from 'vue';
import { createPinia } from 'pinia';
import Timeline from './components/Timeline.vue';
import Viewport from './components/Viewport.vue';
import PropertyGrid from './components/PropertyGrid.vue';
import RibbonToolbar from './components/RibbonToolbar.vue';
import TimelineBar from './components/TimelineBar.vue';

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

// Single shared Pinia instance so the ribbon app and the main shell app
// read and write the same store state (e.g. activeMode).
const pinia = createPinia();

const ribbonApp = createApp(RibbonToolbar);
ribbonApp.use(pinia);
ribbonApp.mount('#ribbon-mount');

const app = createApp(AppShell);
app.use(pinia);
app.mount('#app');

const timelineBarApp = createApp(TimelineBar);
timelineBarApp.use(pinia);
timelineBarApp.mount('#timeline-bar');

console.log('[aim3d Frontend] Vue container initialized successfully.');
