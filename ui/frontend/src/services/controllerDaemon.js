const DEFAULT_CONTROLLER_URL = 'http://127.0.0.1:8765';

const controllerUrl = () =>
  (typeof window !== 'undefined' && window.__AIM3D_CONTROLLER_URL__) || DEFAULT_CONTROLLER_URL;

export const makeControllerRequest = (method, path, payload = {}, baseUrl = controllerUrl()) => ({
  method,
  url: `${baseUrl.replace(/\/$/, '')}${path}`,
  payload
});

export const sendControllerRequest = async (method, path, payload = {}) => {
  const request = makeControllerRequest(method, path, payload);
  const response = await fetch(request.url, {
    method,
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Controller daemon request failed: ${response.status}`);
  }
  return response.json();
};

export const controllerStatus = () => sendControllerRequest('GET', '/status');
export const loadControllerGcode = (gcode) => sendControllerRequest('POST', '/program/gcode', { gcode });
export const loadControllerVisualIr = (program) =>
  sendControllerRequest('POST', '/program/visual-ir', { program });
export const validateControllerProgram = () => sendControllerRequest('POST', '/command/validate');
export const simulateControllerProgram = (payload = {}) => sendControllerRequest('POST', '/command/simulate', payload);
export const armController = () => sendControllerRequest('POST', '/command/arm');
export const startController = () => sendControllerRequest('POST', '/command/start');
export const pauseController = () => sendControllerRequest('POST', '/command/pause');
export const stopController = () => sendControllerRequest('POST', '/command/stop');
export const jogController = (x = 0, y = 0, z = 0) =>
  sendControllerRequest('POST', '/command/jog', { x, y, z });
export const homeController = () => sendControllerRequest('POST', '/command/home');
