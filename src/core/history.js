import { pushHistory, undoState, redoState, withHistorySuppressed, clearHistory as clearStateHistory } from './state.js';

export function clearHistory() {
    clearStateHistory();
}

export function saveSnapshot(canvas, maxHistory) {
  // EXCLUDE 'originalSrc' from history to save RAM and avoid Blob serialization issues
  // History only needs enough info to restore the visual state (previewSrc)
  const json = JSON.stringify(canvas.toJSON(['name', 'id', 'selectable', 'evented', 'lockMovementX', 'lockMovementY', 'lockRotation', 'lockScalingX', 'lockScalingY', 'originalWidth', 'originalHeight', 'imageId']));
  pushHistory(json, maxHistory);
}

export function applyUndo(canvas, onAfterLoad) {
  const json = undoState();
  if (!json) return;
  withHistorySuppressed(() => {
    canvas.loadFromJSON(json, () => {
      canvas.requestRenderAll();
      onAfterLoad?.();
    });
  });
}

export function applyRedo(canvas, onAfterLoad) {
  const json = redoState();
  if (!json) return;
  withHistorySuppressed(() => {
    canvas.loadFromJSON(json, () => {
      canvas.requestRenderAll();
      onAfterLoad?.();
    });
  });
}