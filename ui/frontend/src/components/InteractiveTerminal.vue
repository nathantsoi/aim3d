<template>
  <div class="terminal">
    <div class="terminal-output" ref="outputRef">
      <div v-for="(line, index) in history" :key="index" :class="line.type">
        {{ line.text }}
      </div>
    </div>
    <div class="terminal-input-container">
      <span class="prompt">&gt;</span>
      <input
        v-model="inputVal"
        @keyup.enter="submit"
        class="terminal-input"
        spellcheck="false"
        autocomplete="off"
        placeholder="Type a daemon command (e.g., status, start, simulate)..."
      />
    </div>
  </div>
</template>

<script>
import { ref, watch, onMounted, nextTick } from 'vue';
import { useCoreStore } from '../store';
import { sendControllerRequest } from '../services/controllerDaemon';

export default {
  name: 'InteractiveTerminal',
  setup() {
    const store = useCoreStore();
    const inputVal = ref('');
    const history = ref([]);
    const outputRef = ref(null);

    // Initialize history with current store messages
    onMounted(() => {
      history.value = store.messages.map(m => ({ text: m.text, type: m.type }));
      scrollToBottom();
    });

    // Listen to store messages
    watch(() => store.messages, (newMessages) => {
      if (newMessages.length > history.value.length) {
        const diff = newMessages.slice(history.value.length);
        diff.forEach(m => history.value.push({ text: m.text, type: m.type }));
        scrollToBottom();
      } else if (newMessages.length < history.value.length) {
         history.value = store.messages.map(m => ({ text: m.text, type: m.type }));
         scrollToBottom();
      }
    }, { deep: true });

    const scrollToBottom = async () => {
      await nextTick();
      if (outputRef.value) {
        outputRef.value.scrollTop = outputRef.value.scrollHeight;
      }
    };

    const append = (text, type = 'info') => {
      // It pushes to the store, which triggers the watch, so we don't push locally twice
      store.addMessage(text, type); 
    };

    const submit = async () => {
      const cmd = inputVal.value.trim();
      if (!cmd) return;
      inputVal.value = '';
      
      append(`> ${cmd}`, 'user');

      const args = cmd.split(' ');
      const baseCmd = args[0].toLowerCase();
      
      try {
        let res;
        if (baseCmd === 'status') {
          res = await sendControllerRequest('GET', '/status');
        } else if (['start', 'stop', 'pause', 'resume', 'home', 'arm', 'validate'].includes(baseCmd)) {
          res = await sendControllerRequest('POST', `/command/${baseCmd}`);
        } else if (baseCmd === 'simulate') {
          res = await sendControllerRequest('POST', '/command/simulate');
        } else {
          append(`Unknown command: ${baseCmd}`, 'error');
          return;
        }
        append(JSON.stringify(res, null, 2), 'success');
      } catch (err) {
        append(`Error: ${err.message}`, 'error');
      }
    };

    return { inputVal, history, outputRef, submit };
  }
};
</script>

<style scoped>
.terminal {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #111;
  color: #0f0;
  font-family: monospace;
  font-size: 0.8rem;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #333;
}
.terminal-output {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-all;
}
.terminal-output .user {
  color: #fff;
  margin-top: 6px;
}
.terminal-output .error {
  color: #f55;
}
.terminal-output .success {
  color: #0f0;
}
.terminal-output .info {
  color: #aaa;
}
.terminal-input-container {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background-color: #222;
  border-top: 1px solid #444;
}
.prompt {
  color: #0f0;
  margin-right: 8px;
}
.terminal-input {
  flex: 1;
  background: transparent;
  border: none;
  color: #0f0;
  font-family: monospace;
  outline: none;
}
</style>
