<template>
  <div class="toast-container">
    <transition-group name="toast">
      <div v-for="toast in visibleToasts" :key="toast.id" :class="['toast', toast.type]">
        {{ toast.text }}
      </div>
    </transition-group>
  </div>
</template>

<script>
import { defineComponent, ref, watch } from 'vue';
import { useCoreStore } from '../store';

export default defineComponent({
  name: 'ToastContainer',
  setup() {
    const store = useCoreStore();
    const visibleToasts = ref([]);

    watch(() => store.messages, (newMessages) => {
      if (newMessages.length > 0) {
        const lastMsg = newMessages[newMessages.length - 1];
        if (!visibleToasts.value.find(t => t.id === lastMsg.id)) {
          visibleToasts.value.push(lastMsg);
          setTimeout(() => {
            visibleToasts.value = visibleToasts.value.filter(t => t.id !== lastMsg.id);
          }, 3000);
        }
      }
    }, { deep: true });

    return { visibleToasts };
  }
});
</script>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999;
  pointer-events: none;
}
.toast {
  padding: 10px 16px;
  border-radius: 6px;
  background-color: hsla(220, 15%, 16%, 0.95);
  color: hsl(220, 10%, 90%);
  font-size: 0.85rem;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  backdrop-filter: blur(8px);
  pointer-events: auto;
  border-left: 4px solid transparent;
}
.toast.info { border-left-color: hsl(200, 100%, 60%); }
.toast.success { border-left-color: hsl(145, 70%, 50%); }
.toast.error { border-left-color: hsl(0, 70%, 60%); }

.toast-enter-active, .toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
