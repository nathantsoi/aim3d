import { applyMockCoreAction } from '../contracts/coreState';

const tauriInvoke = () => {
  if (typeof window === 'undefined') return null;
  return window.__TAURI__?.tauri?.invoke || window.__TAURI__?.invoke || null;
};

export const dispatchCoreAction = async (action, currentState) => {
  const mockActions = [
    'core.createConstruction',
    'sim.createStock',
    'sim.createTool'
  ];

  if (mockActions.includes(action.type)) {
    await Promise.resolve();
    return applyMockCoreAction(currentState, action);
  }

  const invoke = tauriInvoke();

  if (invoke) {
    const response = await invoke('dispatch_core_action', {
      actionJson: JSON.stringify(action),
      stateJson: JSON.stringify(currentState)
    });
    return JSON.parse(response.data);
  }

  await Promise.resolve();
  return applyMockCoreAction(currentState, action);
};
