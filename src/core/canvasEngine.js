import {
  PX_CM, CANVAS_WIDTH_PX, MAX_HEIGHT_CM, MAX_HEIGHT_PX,
  DEFAULT_CANVAS_H_CM, MIN_SCALE
} from '../config/constants.js';
import { setCanvas, setCanvasHeight, setZoom } from './state.js';
import { saveSnapshot } from './history.js';
import { computePrice } from './pricing.js';

export function initCanvas(onUpdate) {
  const canvas = new fabric.Canvas('c', {
    width: CANVAS_WIDTH_PX,
    height: DEFAULT_CANVAS_H_CM * PX_CM,
    backgroundColor: 'rgba(128,128,128,0.3)',
    preserveObjectStacking: true,
    renderOnAddRemove: false, // OPTIMIZACIÓN: Renderizado manual por lotes (Fase 1.4)
    enableRetinaScaling: true // Mantener calidad visual
  });

  setCanvas(canvas);

  const constrainedMove = (e) => constrainObjectToCanvas(e.target, canvas);
  canvas.on('object:moving', constrainedMove);
  canvas.on('object:scaling', constrainedMove);
  canvas.on('object:rotating', constrainedMove);

  ['object:added', 'object:removed', 'object:modified', 'sheet:switched'].forEach(ev =>
    canvas.on(ev, () => onUpdate?.(canvas))
  );
  canvas.on('selection:created', () => onUpdate?.(canvas));
  canvas.on('selection:updated', () => onUpdate?.(canvas));
  canvas.on('selection:cleared', () => onUpdate?.(canvas));

  saveSnapshot(canvas);
  return canvas;
}

export function constrainObjectToCanvas(obj, canvas) {
  if (!obj) return;
  obj.setCoords();
  const br = obj.getBoundingRect(true, true);

  const minX = 0, maxX = CANVAS_WIDTH_PX;
  const minY = 0, maxY = MAX_HEIGHT_PX; // Use physical limit

  let dx = 0, dy = 0;
  if (br.left < minX) dx = minX - br.left;
  if (br.left + br.width > maxX) dx = maxX - (br.left + br.width);
  if (br.top < minY) dy = minY - br.top;
  if (br.top + br.height > maxY) dy = maxY - (br.top + br.height);

  if (dx || dy) {
    obj.left += dx; obj.top += dy;
    obj.setCoords();
  }

  if (obj.scaleX < MIN_SCALE) obj.scaleX = MIN_SCALE;
  if (obj.scaleY < MIN_SCALE) obj.scaleY = MIN_SCALE;

  // Auto-expand canvas if object is pushed down
  const finalBr = obj.getBoundingRect(true, true);
  const bottomPx = finalBr.top + finalBr.height;
  
  if (bottomPx > canvas.height) {
    const newHeightPx = Math.min(MAX_HEIGHT_PX, bottomPx + (5 * PX_CM));
    if (newHeightPx > canvas.height) {
      canvas.setHeight(newHeightPx);
      setCanvasHeight(Math.ceil(newHeightPx / PX_CM));
      // No requestRenderAll needed during 'moving' event as fabric handles it,
      // but strictly required if called from other contexts.
      // We'll leave it to the caller or event loop.
    }
  }
}

export function updateMetrics(canvas, setUi) {
  const objs = canvas.getObjects();
  let maxY = 0, totalArea = 0;

  objs.forEach(obj => {
    const br = obj.getBoundingRect(true, true);
    maxY = Math.max(maxY, br.top + br.height);
    totalArea += (br.width / PX_CM) * (br.height / PX_CM);
  });

  const usedHcm = Math.ceil(maxY / PX_CM);
  const neededH = Math.max(DEFAULT_CANVAS_H_CM, Math.min(MAX_HEIGHT_CM, usedHcm + 5));

  if (neededH * PX_CM !== canvas.height) {
    canvas.setHeight(neededH * PX_CM);
    canvas.requestRenderAll();
    setCanvasHeight(neededH);
  }

  const price = computePrice(usedHcm);
  setUi({ usedHcm, totalArea, price, canvasHcm: neededH });
}

export function changeZoom(canvas, delta, setUi) {
  const next = Math.max(0.5, Math.min(3, canvas.getZoom() + delta));
  canvas.setZoom(next);
  canvas.requestRenderAll();
  setZoom(next);
  setUi?.({ zoom: next });
}