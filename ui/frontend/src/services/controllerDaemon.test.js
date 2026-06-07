import { describe, expect, it } from 'vitest';
import { makeControllerRequest } from './controllerDaemon.js';

describe('controller daemon service', () => {
  it('routes GUI commands through daemon-compatible request shapes', () => {
    expect(makeControllerRequest('POST', '/command/jog', { x: 1 }, 'http://cnc.local/')).toEqual({
      method: 'POST',
      url: 'http://cnc.local/command/jog',
      payload: { x: 1 }
    });
  });
});
