import { CANVAS_WIDTH_PX, MAX_HEIGHT_PX, MARGIN_PX, PX_CM, MAX_OBJS_PER_SHEET } from '../config/constants.js';
import { constrainObjectToCanvas } from './canvasEngine.js';

export async function autoPack({ canvas, images, customItems = [] }) {
  const startTotal = performance.now();
  canvas.clear();
  canvas.backgroundColor = 'rgba(128,128,128,0.3)';

  // 1. Preparar Datos (Ligero - Sin Fabric)
  const toPlace = [];

  // Prioridad 1: Items rebotados (customItems) - Ya vienen en PX
  if (customItems && customItems.length > 0) {
    customItems.forEach(item => {
      toPlace.push({ src: item.src, w: item.w, h: item.h });
    });
  } 
  // Prioridad 2: Nuevas imágenes (images) - Vienen en CM
  else if (images && images.length > 0) {
    images.forEach(img => {
      for (let i = 0; i < img.qty; i++) {
        toPlace.push({ 
            src: img.src, 
            w: img.width * PX_CM, 
            h: img.height * PX_CM 
        });
      }
    });
  }

  // Ordenar (First Fit Decreasing)
  toPlace.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

  const shelves = [];
  const placements = []; // { item, x, y, rotated, drawW, drawH }
  const skippedItemsList = [];
  
  let currentY = MARGIN_PX;
  let maxUsedY = 0;
  const CANVAS_SAFE_WIDTH = CANVAS_WIDTH_PX - (2 * MARGIN_PX);

  // 2. Packing Virtual (Lógica pura, 0 memoria de texturas)
  for (const item of toPlace) {
    // STABILITY CHECK: Límite duro de objetos
    if (placements.length >= MAX_OBJS_PER_SHEET) {
        skippedItemsList.push(item);
        continue;
    }

    let placed = false;
    const { w, h } = item;

    // Intentar en estantes existentes
    for (const shelf of shelves) {
      // Normal
      if (w <= shelf.freeWidth && h <= shelf.height) {
        if (shelf.y + h <= MAX_HEIGHT_PX) {
            placements.push({ item, x: shelf.currentX, y: shelf.y, rotated: false, drawW: w, drawH: h });
            shelf.currentX += w + MARGIN_PX;
            shelf.freeWidth -= (w + MARGIN_PX);
            placed = true;
            break;
        }
      }
      // Rotado
      if (!placed && h <= shelf.freeWidth && w <= shelf.height) {
        if (shelf.y + w <= MAX_HEIGHT_PX) {
            // Al rotar 90deg, el ancho visual es h, altura visual es w
            placements.push({ item, x: shelf.currentX, y: shelf.y, rotated: true, drawW: h, drawH: w });
            shelf.currentX += h + MARGIN_PX;
            shelf.freeWidth -= (h + MARGIN_PX);
            placed = true;
            break;
        }
      }
    }

    if (placed) continue;

    // Crear nuevo estante
    // Normal
    if (w <= CANVAS_SAFE_WIDTH && currentY + h + MARGIN_PX <= MAX_HEIGHT_PX) {
        const shelf = { y: currentY, height: h, freeWidth: CANVAS_SAFE_WIDTH, currentX: MARGIN_PX };
        shelves.push(shelf);
        placements.push({ item, x: shelf.currentX, y: shelf.y, rotated: false, drawW: w, drawH: h });
        shelf.currentX += w + MARGIN_PX;
        shelf.freeWidth -= (w + MARGIN_PX);
        currentY += h + MARGIN_PX;
        placed = true;
    }
    // Rotado
    else if (h <= CANVAS_SAFE_WIDTH && currentY + w + MARGIN_PX <= MAX_HEIGHT_PX) {
        const shelf = { y: currentY, height: w, freeWidth: CANVAS_SAFE_WIDTH, currentX: MARGIN_PX };
        shelves.push(shelf);
        placements.push({ item, x: shelf.currentX, y: shelf.y, rotated: true, drawW: h, drawH: w });
        shelf.currentX += h + MARGIN_PX;
        shelf.freeWidth -= (h + MARGIN_PX);
        currentY += w + MARGIN_PX;
        placed = true;
    }

    if (!placed) {
        skippedItemsList.push(item);
    }
  }

  // 3. Fase de Renderizado Controlado (Fragmentación de procesos)
  // Desactivamos renderizado automático para evitar paints innecesarios
  const previousRenderState = canvas.renderOnAddRemove;
  canvas.renderOnAddRemove = false;

  const BATCH_SIZE = 10;
  
  // Procesamos la cola de renderizado en lotes paralelos (Promise.all)
  for (let i = 0; i < placements.length; i += BATCH_SIZE) {
      const batch = placements.slice(i, i + BATCH_SIZE);
      
      // Load batch in parallel
      await Promise.all(batch.map(p => new Promise((resolve) => {
          fabric.Image.fromURL(p.item.src, (img) => {
              if (!img) { resolve(); return; }

              const { rotated, drawW, drawH, x, y } = p;
              const { w, h } = p.item;
              
              const sx = w / img.width;
              const sy = h / img.height;

              img.set({
                  left: x + (rotated ? drawW / 2 : 0),
                  top: y + (rotated ? drawH / 2 : 0),
                  originX: rotated ? 'center' : 'left',
                  originY: rotated ? 'center' : 'top',
                  angle: rotated ? 90 : 0,
                  scaleX: sx,
                  scaleY: sy,
                  cornerColor: '#00ccff',
                  cornerSize: 8,
                  transparentCorners: false,
                  selectable: true,
                  objectCaching: true,
                  // Metadata para exportación de alta calidad
                  originalSrc: p.item.originalSrc || p.item.src,
                  originalWidth: p.item.originalWidth,
                  originalHeight: p.item.originalHeight,
                  imageId: p.item.id
              });

              img.setCoords();
              canvas.add(img);
              constrainObjectToCanvas(img, canvas);
              resolve();
          }, { crossOrigin: 'anonymous', enableRetinaScaling: true });
      })));

      // Micro-yield entre lotes
      if (i + BATCH_SIZE < placements.length) {
          await new Promise(r => setTimeout(r, 0));
      }
  }

  // Restaurar estado de render
  canvas.renderOnAddRemove = previousRenderState;
  canvas.requestRenderAll();

  // Calcular altura usada real
  shelves.forEach(s => maxUsedY = Math.max(maxUsedY, s.y + s.height));

  const endTotal = performance.now();
  console.log(`📦 [AutoPack] Total Time: ${(endTotal - startTotal).toFixed(2)}ms`);

  return {
    placed: placements.length,
    skipped: skippedItemsList.length,
    usedHeightCm: Math.ceil(maxUsedY / PX_CM),
    skippedItemsList
  };
}
