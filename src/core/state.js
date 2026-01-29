const state = {
  canvas: null,
  canvasHcm: 50,
  zoom: 1,
  uploadedImages: [],
  history: [],
  redoStack: [],
  suppressHistory: false
};

const subscribers = new Set();
export function subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
function notify() { subscribers.forEach(fn => fn(state)); }

export function getState() { return state; }
export function setCanvas(c) { state.canvas = c; }
export function setCanvasHeight(cm) { state.canvasHcm = cm; notify(); }
export function setZoom(z) { state.zoom = z; notify(); }
export function setUploadedImages(arr) { state.uploadedImages = arr; notify(); }
export function updateImage(id, updater) {
  state.uploadedImages = state.uploadedImages.map(img => img.id === id ? { ...img, ...updater(img) } : img);
  notify();
}
export function removeImage(id) {
  state.uploadedImages = state.uploadedImages.filter(img => img.id !== id);
  notify();
}

export function clearHistory() {
  state.history = [];
  state.redoStack = [];
}
export function pushHistory(json, max = 50) {
  if (state.suppressHistory) return;
  if (state.history.length === 0 || state.history[state.history.length - 1] !== json) {
    state.history.push(json);
    if (state.history.length > max) state.history.shift();
    state.redoStack = [];
  }
}
export function undoState() {
  if (state.history.length <= 1) return null;
  state.redoStack.push(state.history.pop());
  return state.history[state.history.length - 1];
}
export function redoState() {
  if (!state.redoStack.length) return null;
  const next = state.redoStack.pop();
  state.history.push(next);
  return next;
}
export function withHistorySuppressed(fn) {
  state.suppressHistory = true;
  try { fn(); } finally { state.suppressHistory = false; }
}