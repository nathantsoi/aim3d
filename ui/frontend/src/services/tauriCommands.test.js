import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateToolpath,
  invokeCommand,
  postProcess,
  recomputeDocument,
  runSimulation,
  solveSketch2d
} from './tauriCommands';

afterEach(() => {
  delete window.__TAURI__;
  vi.restoreAllMocks();
});

const mockInvoke = (data) => {
  const invoke = vi.fn().mockResolvedValue({
    status: 'success',
    message: 'ok',
    data
  });
  window.__TAURI__ = { invoke };
  return invoke;
};

describe('tauriCommands service', () => {
  it('resolves a mock result without a Tauri runtime', async () => {
    const result = await invokeCommand('generate_toolpath', { operationId: 'op_X' });
    expect(result.status).toBe('mock');
    expect(result.data).toMatchObject({ command: 'generate_toolpath', args: { operationId: 'op_X' } });
  });

  it('invokes the toolpath command with the operation id and parses JSON data', async () => {
    const invoke = mockInvoke('{"points_count": 125}');
    const result = await generateToolpath('op_Pocket_1');

    expect(invoke).toHaveBeenCalledWith('generate_toolpath', { operationId: 'op_Pocket_1' });
    expect(result.data).toEqual({ points_count: 125 });
  });

  it('routes each wrapper to its command with the expected args', async () => {
    const invoke = mockInvoke('{}');

    await solveSketch2d();
    await runSimulation('; gcode');
    await recomputeDocument();
    await postProcess('setup_Main_1');

    expect(invoke).toHaveBeenCalledWith('solve_2d_sketch', { pointsJson: '[]', constraintsJson: '[]' });
    expect(invoke).toHaveBeenCalledWith('run_simulation', { gcode: '; gcode' });
    expect(invoke).toHaveBeenCalledWith('recompute_document', {});
    expect(invoke).toHaveBeenCalledWith('post_process', { setupId: 'setup_Main_1' });
  });
});
