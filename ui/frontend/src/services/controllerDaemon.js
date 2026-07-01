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
