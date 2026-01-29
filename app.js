import { PX_CM, MAX_HEIGHT_CM, MAX_HISTORY, MAX_OBJS_PER_SHEET, MAX_SHEETS } from './src/config/constants.js';
import { loadFiles } from './src/services/loader.js';
import { initCanvas, updateMetrics, changeZoom, constrainObjectToCanvas } from './src/core/canvasEngine.js';
import { autoPack } from './src/core/packing.js';
import { saveSnapshot, applyUndo, applyRedo } from './src/core/history.js';
import { getState, setUploadedImages, updateImage, removeImage, setCanvasHeight } from './src/core/state.js';
import { renderCards } from './src/ui/cards.js';
import { projectManager } from './src/core/projectManager.js';
import { sheetsManager } from './src/core/sheetsManager.js';
import { layersPanel } from './src/ui/layersPanel.js';
import { productionMode } from './src/core/productionMode.js';
import { ExportEngine, ExportPresets } from './src/utils/exportEngine.js';

let debouncedUpdate = null;
function debounce(fn, ms = 80) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function onCanvasUpdate(canvas) {
  debouncedUpdate ??= debounce((c) => {
    updateMetrics(c, ({ usedHcm, totalArea, price, canvasHcm }) => {
      document.getElementById('cur-h').textContent = canvasHcm;
      document.getElementById('used-h').textContent = usedHcm;
      document.getElementById('cur-area').textContent = totalArea.toFixed(2);
      document.getElementById('cur-price').textContent = '$' + Math.round(price).toLocaleString('es-CO');
    });
    saveSnapshot(canvas, MAX_HISTORY);
  }, 80);
  debouncedUpdate(canvas);
}

function bindUpload() {
  const input = document.getElementById('upload-image');
  const label = document.querySelector('.upload-label');
  
  input.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    
    // VALIDACIÓN DE CANTIDAD
    if (files.length > 50) {
        if (!confirm(`⚠️ Estás intentando subir ${files.length} imágenes.\nEsto puede tardar unos segundos. ¿Continuar?`)) {
            e.target.value = '';
            return;
        }
    }
    
    // UI Feedback: Loading state
    const originalText = label.firstChild.textContent;
    label.firstChild.textContent = '⏳ Optimizando...';
    input.disabled = true;
    label.style.opacity = '0.7';

    // BLOCK UI
    if (sheetsManager && sheetsManager.toggleOverlay) {
        sheetsManager.toggleOverlay(true, `Procesando ${files.length} imágenes...`);
    }

    try {
      // Yield to UI
      await new Promise(r => setTimeout(r, 50));

      const lockDefault = document.getElementById('global-lock').checked;
      const startLoad = performance.now();
      const { loaded, errors } = await loadFiles(files, lockDefault);
      const endLoad = performance.now();
      console.log(`⏱️ [LoadFiles] Processed ${files.length} images in ${(endLoad - startLoad).toFixed(2)}ms`);


      if (errors.length > 0) {
        alert(`Algunos archivos no se pudieron cargar:\n- ${errors.join('\n- ')}`);
      }

      if (loaded.length > 0) {
        // High Load Optimization: Update state efficiently
        const { uploadedImages } = getState();
        const nextImages = [...uploadedImages, ...loaded];
        
        // LIMIT CHECK
        if (nextImages.length > 500) {
            alert('⚠️ Advertencia: Más de 500 imágenes pueden ralentizar el sistema.');
        }

        setUploadedImages(nextImages);
        
        // Render Cards efficiently
        // If huge number, we might want to paginate, but for now just render.
        renderCards('images-cards-container', addImageFromCard);
        
        // Calcular estadísticas de optimización
        const totalOriginal = loaded.reduce((acc, img) => acc + (img.originalSize || 0), 0);
        const totalNew = loaded.reduce((acc, img) => acc + (img.fileSize || 0), 0);
        const savings = totalOriginal > 0 ? ((totalOriginal - totalNew) / totalOriginal * 100).toFixed(1) : 0;
        const mbNew = (totalNew / (1024 * 1024)).toFixed(2);
        
        // Feedback de éxito con datos
        setTimeout(() => {
          // Use toast instead of alert for better UX if possible, but alert is safe.
          // alert(`✅ ${loaded.length} imágenes procesadas correctamente.\n💾 Tamaño optimizado: ${mbNew} MB\n📉 Reducción de peso: ${savings}%`);
          console.log(`[Upload] Processed ${loaded.length} images. Saved ${savings}%.`);
        }, 100);
      }
    } catch (err) {
      console.error('Error procesando archivos:', err);
      alert('Ocurrió un error inesperado al procesar las imágenes.');
    } finally {
      e.target.value = '';
      label.firstChild.textContent = originalText;
      input.disabled = false;
      label.style.opacity = '1';
      
      if (sheetsManager && sheetsManager.toggleOverlay) {
        sheetsManager.toggleOverlay(false);
      }
    }
  });
}

function addImageFromCard(id, left = null, top = null, angle = 0) {
  const { uploadedImages, canvas } = getState();
  const imgData = uploadedImages.find(i => i.id === id);
  if (!imgData) return;

  const qty = imgData.qty || 1;
  
  // LIMIT PROTECTION
  if (canvas.getObjects().length + qty > MAX_OBJS_PER_SHEET) {
      alert(`⚠️ Límite de seguridad alcanzado (${MAX_OBJS_PER_SHEET} objetos por hoja).\nPor favor, crea una nueva hoja para agregar más imágenes.`);
      return;
  }

  let addedCount = 0;
  // ...

  // HIGH LOAD OPTIMIZATION
  const shouldOptimize = qty > 5;
  if (shouldOptimize) {
      canvas.renderOnAddRemove = false;
  }

  for (let i = 0; i < qty; i++) {
    const offsetX = left !== null ? left + (i * 15) : 20 + (i * 15);
    const offsetY = top !== null ? top + (i * 15) : 20 + (i * 15);

    fabric.Image.fromURL(imgData.src, (fImg) => {
      const targetW = imgData.width * PX_CM;
      const targetH = imgData.height * PX_CM;
      const sx = targetW / fImg.width;
      const sy = targetH / fImg.height;

      fImg.set({
        left: offsetX,
        top: offsetY,
        angle,
        scaleX: sx,
        scaleY: sy,
        originX: 'left',
        originY: 'top',
        cornerColor: '#00ccff',
        cornerSize: 8,
        transparentCorners: false,
        selectable: true,
        objectCaching: true,
        // METADATA CRÍTICA PARA MEMORIA Y EXPORTACIÓN
        imageId: imgData.id,
        originalSrc: imgData.originalSrc || null, // Blob original (puede ser null si está en DB)
        originalWidth: imgData.originalWidth,
        originalHeight: imgData.originalHeight
      });

      canvas.add(fImg);
      fImg.setCoords();
      constrainObjectToCanvas(fImg, canvas);

      addedCount++;
      if (addedCount === qty) {
        if (shouldOptimize) {
            canvas.renderOnAddRemove = true;
        }
        canvas.setActiveObject(fImg);
        canvas.requestRenderAll();
        onCanvasUpdate(canvas);
      }
    }, { crossOrigin: 'anonymous', enableRetinaScaling: true });
  }
}

function duplicateObj() {
  const { canvas } = getState();
  const active = canvas.getActiveObject();
  if (!active) return;

  // Validación de Límites
  let countToAdd = 1;
  if (active.type === 'activeSelection') {
      countToAdd = active.getObjects().length;
  }
  
  if (canvas.getObjects().length + countToAdd > MAX_OBJS_PER_SHEET) {
       return alert(`⚠️ Límite de seguridad alcanzado. No se puede duplicar.`);
  }

  active.clone((cloned) => {
    canvas.discardActiveObject();
    cloned.set({
      left: active.left + 20,
      top: active.top + 20,
      evented: true
    });
    if (cloned.type === 'activeSelection') {
      cloned.canvas = canvas;
      cloned.forEachObject((obj) => {
        canvas.add(obj);
      });
      cloned.setCoords();
    } else {
      canvas.add(cloned);
    }
    canvas.setActiveObject(cloned);
    canvas.requestRenderAll();
    onCanvasUpdate(canvas);
  });
}

function deleteObj() {
  const { canvas } = getState();
  const active = canvas.getActiveObjects();
  if (!active.length) return;
  
  canvas.discardActiveObject();
  active.forEach(obj => canvas.remove(obj));
  canvas.requestRenderAll();
  onCanvasUpdate(canvas);
}

function undo() {
  const { canvas } = getState();
  const json = applyUndo(canvas);
  if (json) {
    // Si hubo undo, actualizamos métricas
    // (applyUndo ya carga el json, pero necesitamos recalcular metrics)
    // El callback en initCanvas se disparará, pero forzamos update
    onCanvasUpdate(canvas);
  }
}

function redo() {
  const { canvas } = getState();
  applyRedo(canvas, () => onCanvasUpdate(canvas));
}

function updateSize() {
  const { canvas } = getState();
  const active = canvas.getActiveObject();
  if (!active) return alert('Selecciona un objeto primero');

  const newW = parseFloat(document.getElementById('in-w').value);
  const newH = parseFloat(document.getElementById('in-h').value);
  if (isNaN(newW) || isNaN(newH) || newW <= 0 || newH <= 0) return alert('Ingresa dimensiones válidas');

  const targetW = newW * PX_CM;
  const targetH = newH * PX_CM;
  active.scaleToWidth(targetW);
  active.scaleToHeight(targetH);
  active.setCoords();
  constrainObjectToCanvas(active, canvas);
  canvas.requestRenderAll();
  onCanvasUpdate(canvas);
}

function changeZoomUI(delta) {
  const { canvas } = getState();
  changeZoom(canvas, delta, ({ zoom }) => {
    document.getElementById('zoom-val').textContent = Math.round(zoom * 100) + '%';
  });
}

async function autoPackUI() {
  const { canvas, uploadedImages } = getState();
  if (!uploadedImages.length) return alert('No hay imágenes en las tarjetas para optimizar');

  const result = await autoPack({ canvas, images: uploadedImages });
  onCanvasUpdate(canvas);
  
  const { placed, skipped, usedHeightCm, skippedItemsList } = result;
  
  if (skipped > 0) {
    // 1. Acción CRÍTICA: Iniciar distribución multi-hoja INMEDIATAMENTE
    // No bloqueamos con alertas antes de asegurar la creación de hojas.
    await sheetsManager.addSheet(skippedItemsList);
    
    // 2. Feedback Informativo (solo después de haber procesado)
    const msg = `✅ ${placed} imágenes optimizadas en esta hoja.\n⚠️ ${skipped} imágenes no cupieron y se han distribuido automáticamente en nuevas hojas.`;
    alert(msg);
    
  } else {
    alert(`✅ ${placed} imagen(es) optimizadas\n📏 Altura usada: ${usedHeightCm} cm de ${MAX_HEIGHT_CM} cm`);
  }
}

function clearAll() {
  const { canvas } = getState();
  
  if (!canvas.getObjects().length) return;
  
  if (confirm('¿Limpiar todo el contenido de la HOJA ACTUAL?')) {
      canvas.clear();
      // Restore background for visibility
      canvas.setBackgroundColor('rgba(128,128,128,0.3)');
      
      // Notify systems
      canvas.fire('canvas:cleared');
      onCanvasUpdate(canvas);
      
      // Update Sheets State to empty
      sheetsManager.saveCurrentSheetState();
  }
}

function startCrop() {
  const { canvas } = getState();
  const active = canvas.getActiveObject();
  
  // Validación
  if (!active || active.type !== 'image') return alert('Selecciona una imagen única para recortar');
  
  // 1. Crear rectángulo de crop
  const cropRect = new fabric.Rect({
      left: active.left,
      top: active.top,
      width: active.getScaledWidth(),
      height: active.getScaledHeight(),
      fill: 'rgba(0,0,0,0.3)',
      stroke: '#fff',
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      hasRotatingPoint: false,
      cornerColor: 'white',
      cornerSize: 10,
      transparentCorners: false,
      lockRotation: true
  });
  
  canvas.add(cropRect);
  canvas.setActiveObject(cropRect);
  canvas.requestRenderAll();

  // 2. Crear UI Flotante para confirmar
  const controls = document.createElement('div');
  controls.id = 'crop-controls-overlay';
  controls.style.position = 'absolute';
  controls.style.top = '50%';
  controls.style.left = '50%';
  controls.style.transform = 'translate(-50%, -50%)';
  controls.style.zIndex = '9999';
  controls.style.background = 'white';
  controls.style.padding = '10px';
  controls.style.borderRadius = '8px';
  controls.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
  controls.style.display = 'flex';
  controls.style.gap = '10px';

  const btnConfirm = document.createElement('button');
  btnConfirm.textContent = '✅ Recortar';
  btnConfirm.className = 'btn-action';
  btnConfirm.style.background = '#2ecc71';
  btnConfirm.onclick = () => applyCrop(canvas, active, cropRect, controls);

  const btnCancel = document.createElement('button');
  btnCancel.textContent = '❌ Cancelar';
  btnCancel.className = 'btn-action';
  btnCancel.style.background = '#e74c3c';
  btnCancel.onclick = () => {
      canvas.remove(cropRect);
      canvas.requestRenderAll();
      controls.remove();
  };

  controls.appendChild(btnConfirm);
  controls.appendChild(btnCancel);
  document.body.appendChild(controls);
}

function applyCrop(canvas, originalImage, cropRect, controls) {
   // Obtener coordenadas relativas
   const rLeft = cropRect.left;
   const rTop = cropRect.top;
   const rWidth = cropRect.getScaledWidth();
   const rHeight = cropRect.getScaledHeight();

   // Ocultar controles y rect
   canvas.remove(cropRect);
   controls.remove();

   // Aislamiento para snapshot
   const originalVisibility = [];
   canvas.getObjects().forEach(o => {
       if(o !== originalImage) {
           originalVisibility.push({obj: o, visible: o.visible});
           o.visible = false;
       }
   });
   
   // Snapshot de la zona seleccionada
   // Nota: Multiplier 1 asegura resolución de pantalla, pero para impresión idealmente usamos más.
   // Sin embargo, toDataURL con crop options funciona bien para WYSIWYG.
   const dataUrl = canvas.toDataURL({
       left: rLeft,
       top: rTop,
       width: rWidth,
       height: rHeight,
       format: 'png',
       multiplier: 2 // Mejor calidad
   });
   
   // Restaurar visibilidad
   originalVisibility.forEach(i => i.obj.visible = i.visible);
   
   // Reemplazar imagen
   fabric.Image.fromURL(dataUrl, (newImg) => {
       newImg.set({
           left: rLeft,
           top: rTop,
           angle: 0
       });
       
       canvas.remove(originalImage);
       canvas.add(newImg);
       canvas.setActiveObject(newImg);
       canvas.requestRenderAll();
       onCanvasUpdate(canvas);
   });
}

async function exportPNG() {
  const { canvas } = getState();
  const objs = canvas.getObjects();

  // 1. Validar Modo Producción
  if (!productionMode.canExport()) return;
  
  if (objs.length === 0) return alert('El lienzo está vacío');

  // 2. Asegurar estado actualizado
  sheetsManager.saveCurrentSheetState();

  const currentProj = projectManager.getCurrentProject();
  const defaultName = currentProj ? currentProj.name : 'DTF_Project';

  // 3. UI Flujo de Exportación
  // Detectar si es Batch o Single
  let isBatch = false;
  if (sheetsManager.sheets.length > 1) {
      if (confirm(`¿Deseas exportar TODAS las ${sheetsManager.sheets.length} hojas?\n\n[Aceptar] = Sí, exportar LOTE completo.\n[Cancelar] = No, solo la HOJA ACTUAL.`)) {
          isBatch = true;
      }
  }

  // 4. Prompt Nombre
  const baseName = prompt('Nombre base para los archivos:', defaultName);
  if (!baseName) return;

  const btn = document.querySelector('button[onclick="exportPNG()"]');
  const originalText = btn ? btn.textContent : 'Exportar PNG';
  if (btn) {
    btn.textContent = isBatch ? '⏳ Iniciando lote...' : '⏳ Procesando...';
    btn.disabled = true;
  }

  try {
    if (isBatch) {
        // --- BATCH MODE ---
        // 1. Guardar estado actual antes de empezar
        sheetsManager.saveCurrentSheetState();
        
        // 2. Preparar hojas actualizadas
        // Es CRÍTICO pasar los objetos sheet actualizados, no referencias viejas.
        const sheetsToExport = sheetsManager.sheets;

        const results = await ExportEngine.exportBatch(
            sheetsToExport, 
            baseName, 
            {
                preset: ExportPresets.PRODUCTION,
                onProgress: (i, total, name) => {
                    if (btn) btn.textContent = `⏳ ${i}/${total}: ${name}`;
                }
            }
        );
        
        const success = results.filter(r => r.status === 'success').length;
        const errors = results.filter(r => r.status === 'error');
        
        let msg = `✅ Exportación completada: ${success}/${results.length} hojas.`;
        if (errors.length > 0) {
            msg += `\n⚠️ Fallos: ${errors.map(e => e.name).join(', ')}`;
        }
        alert(msg);

    } else {
        // --- SINGLE MODE ---
        // 1. Asegurar estado actual guardado
        sheetsManager.saveCurrentSheetState();

        const currentSheet = sheetsManager.sheets[sheetsManager.currentSheetIndex];
        const sheetName = currentSheet.name;
        const fileName = ExportEngine.generateName(baseName, sheetName, 0);

        // Usamos generateBlob con el canvas actual para máxima fidelidad
        const blob = await ExportEngine.generateBlob(canvas, {
            preset: ExportPresets.PRODUCTION,
            heightCm: currentSheet.heightCm
        });

        ExportEngine.downloadBlob(blob, fileName);
        
        // Registro en Historial (Defensivo)
        if (typeof ExportHistory !== 'undefined') {
            ExportHistory.add({
                 type: 'single',
                 baseName,
                 sheetName: sheetName,
                 status: 'success',
                 preset: ExportPresets.PRODUCTION.name
            });
        }
        
        // Notificar dpi si hubo reducción (ya lo hace el engine en consola, pero alertamos si es crítico)
        if (blob.dpi < 300) {
             alert(`⚠️ Nota: La resolución se ajustó a ${blob.dpi} DPI para evitar errores de memoria.`);
        }
    }

  } catch (err) {
    console.error('Export Error:', err);
    alert('Error crítico al exportar: ' + err.message);
  } finally {
    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
}

// Helpers de eventos de canvas
function handleMouseDown(opt) {
  // Lógica extra si se requiere
}
function handleMouseMove(opt) {
  // Mostrar coordenadas si se desea
}
function handleMouseUp(opt) {
  // Finalizar acciones
}

function onSelection(opt) {
  const { canvas } = getState();
  const active = canvas.getActiveObject();
  const inW = document.getElementById('in-w');
  const inH = document.getElementById('in-h');
  
  if (active) {
    const w = (active.getScaledWidth() / PX_CM).toFixed(2);
    const h = (active.getScaledHeight() / PX_CM).toFixed(2);
    inW.value = w;
    inH.value = h;
  } else {
    inW.value = '';
    inH.value = '';
  }
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Evitar borrar si estamos en un input
      if (e.target.tagName === 'INPUT') return;
      deleteObj();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
    }
  });
}

export function init() {
  const canvas = initCanvas(onCanvasUpdate);
  canvas.on('mouse:down', handleMouseDown);
  canvas.on('mouse:move', handleMouseMove);
  canvas.on('mouse:up', handleMouseUp);
  canvas.on('selection:created', onSelection);
  canvas.on('selection:updated', onSelection);
  canvas.on('selection:cleared', onSelection);

  renderCards('images-cards-container', addImageFromCard);
  bindUpload();
  bindKeyboard();

  // Exponer API global para botones existentes
  window.addImageFromCard = addImageFromCard;
  window.duplicateObj = duplicateObj;
  window.deleteObj = deleteObj;
  window.undo = undo;
  window.redo = redo;
  window.exportPNG = exportPNG;
  window.startCrop = startCrop;
  window.updateSize = updateSize;
  window.changeZoom = changeZoomUI;
  window.autoPack = autoPackUI;
  window.clearAll = clearAll;

  // Project System Init
  projectManager.init().then(async () => {
    bindProjectSystem();
    
    // Init Modules
    layersPanel.init(canvas);
    sheetsManager.init(canvas);
    productionMode.init(canvas);

    // Check for last project
    const lastId = localStorage.getItem('dtf_last_project_id');
    if (lastId) {
       const projects = await projectManager.listProjects();
       const lastProj = projects.find(p => p.id === lastId);
       if (lastProj) {
          // Restore automatically on reload (Standard Behavior)
          // Or ask user? User requested "Restaurarse automáticamente"
          // Let's restore silently if possible, or show a toast.
          try {
             await loadProjectUI(lastId);
             console.log('Sesión restaurada automáticamente:', lastProj.name);
          } catch(e) {
             console.error('Fallo al restaurar sesión:', e);
          }
       }
    }

    projectManager.initAutoSave(getProjectData);
  });
}

async function loadProjectUI(id) {
    try {
        await projectManager.loadProject(id, {
            onLoad: async (data) => {
                const { canvas } = getState();
                // Destructure new fields: sheets, currentSheetIndex
                let { canvas: canvasData, uploadedImages, config, sheets, currentSheetIndex } = data;
                
                // 0. HYDRATE BLOBS (Persistencia Optimizada)
                 // Restaurar URLs de Blobs almacenados en IndexedDB
                 if (uploadedImages) {
                     uploadedImages = uploadedImages.map(img => {
                         if (img.src instanceof Blob) {
                             img.src = URL.createObjectURL(img.src);
                         }
                         if (img.thumbSrc instanceof Blob) {
                             img.thumbSrc = URL.createObjectURL(img.thumbSrc);
                         }
                         return img;
                     });
                 }
                
                if (sheets) {
                    sheets.forEach(sheet => {
                        if (sheet.json && sheet.json.objects) {
                            sheet.json.objects.forEach(obj => {
                                // Restore Preview URL
                                if (obj.src instanceof Blob) {
                                    obj.src = URL.createObjectURL(obj.src);
                                }
                                // Restore Original to ResourceMap
                                if (obj.originalSrc instanceof Blob && obj.imageId) {
                                    if (!sheetsManager.resourceMap.has(obj.imageId)) {
                                        sheetsManager.resourceMap.set(obj.imageId, obj.originalSrc);
                                    }
                                    delete obj.originalSrc; // Remove from JSON to keep it light
                                }
                            });
                        }
                    });
                }

                // 1. Restore Global State
                setUploadedImages(uploadedImages || []);
                renderCards('images-cards-container', addImageFromCard);

                // 2. Restore Sheets System
                if (sheets && Array.isArray(sheets)) {
                   sheetsManager.sheets = sheets;
                   
                   // Validar índice
                   let targetIndex = 0;
                   if (typeof currentSheetIndex === 'number' && currentSheetIndex >= 0 && currentSheetIndex < sheets.length) {
                       targetIndex = currentSheetIndex;
                   }

                   // Hack: Settear a -1 para forzar que switchToSheet ejecute toda la lógica de carga
                   sheetsManager.currentSheetIndex = -1;
                   
                   // Restaurar UI y Estado usando el gestor central
                   await sheetsManager.switchToSheet(targetIndex);
                   
                   console.log(`[loadProjectUI] Sistema restaurado. Hojas: ${sheets.length}, Activa: ${targetIndex}`);
                } else {
                   // Legacy Fallback for old projects without sheets
                   sheetsManager.sheets = [{
                      id: Date.now(),
                      name: 'Hoja 1',
                      json: canvasData,
                      heightCm: config?.canvasHcm || 50
                   }];
                   sheetsManager.currentSheetIndex = 0;
                   sheetsManager.updateBar();
                }

                return new Promise(resolve => {
                    canvas.loadFromJSON(canvasData, () => {
                        if (config?.canvasHcm) {
                            const hPx = config.canvasHcm * PX_CM;
                            canvas.setHeight(hPx);
                            setCanvasHeight(config.canvasHcm);
                        }
                        canvas.requestRenderAll();
                        onCanvasUpdate(canvas);
                        canvas.fire('canvas:content-loaded'); // Force Layers Update
                        resolve();
                    });
                });
            }
        });
        localStorage.setItem('dtf_last_project_id', id);
    } catch (e) {
        console.error('Error restoring project:', e);
        alert('No se pudo cargar el proyecto.');
    }
}


// --- PROJECT SYSTEM INTEGRATION ---

async function handleNewProject() {
  const name = prompt('Nombre del proyecto:', 'Nuevo Proyecto');
  if(!name) return;

  if(confirm('¿Crear nuevo proyecto? Se limpiará el lienzo actual.')) {
    const newProj = await projectManager.createProject(name);
    localStorage.setItem('dtf_last_project_id', newProj.id);
    
    const { canvas } = getState();
    canvas.clear();
    canvas.setBackgroundColor('rgba(128,128,128,0.3)');
    canvas.setHeight(50 * PX_CM);
    setCanvasHeight(50);
    setUploadedImages([]);
    renderCards('images-cards-container', addImageFromCard);
    renderProjectList();
    
    // Update UI name
    const nameDisplay = document.getElementById('project-name-display');
    if(nameDisplay) nameDisplay.textContent = name;
  }
}

async function handleSaveProject() {
  const saved = await projectManager.saveProject(getProjectData);
  localStorage.setItem('dtf_last_project_id', saved.id);
  
  // Update UI name
  const nameDisplay = document.getElementById('project-name-display');
  if(nameDisplay) nameDisplay.textContent = saved.name;
  
  renderProjectList();
}

function bindProjectSystem() {
  // 1. Add "Projects" button to metrics bar (optional now that we have sidebar)
  const metricsBar = document.querySelector('.metrics-bar');
  // Check if button already exists to avoid duplicates
  if (!document.getElementById('btn-metrics-proj')) {
      const projectBtn = document.createElement('button');
      projectBtn.id = 'btn-metrics-proj';
      projectBtn.className = 'btn btn-blue';
      projectBtn.textContent = '📂 Proyectos';
      projectBtn.style.marginRight = '10px';
      projectBtn.onclick = showProjectModal;
      metricsBar.insertBefore(projectBtn, metricsBar.firstChild);
  }

  // 2. Add Status Indicator
  let statusEl = document.getElementById('project-status');
  if (!statusEl) {
      statusEl = document.createElement('span');
      statusEl.id = 'project-status';
      statusEl.style.fontSize = '0.8rem';
      statusEl.style.marginLeft = '10px';
      statusEl.style.color = '#666';
      metricsBar.appendChild(statusEl);
  }

  projectManager.setCallbacks({
    onStatus: ({ message, type }) => {
      statusEl.textContent = message;
      statusEl.style.color = type === 'error' ? 'red' : (type === 'saved' ? 'green' : '#666');
      if (type === 'saved' || type === 'success') {
          setTimeout(() => statusEl.textContent = '', 3000);
      }
    }
  });

  // 3. Bind Sidebar Buttons
  const btnNew = document.getElementById('btn-new-proj');
  const btnSave = document.getElementById('btn-save-proj');
  const btnLoad = document.getElementById('btn-load-proj');

  if (btnNew) btnNew.onclick = handleNewProject;
  if (btnSave) btnSave.onclick = handleSaveProject;
  if (btnLoad) btnLoad.onclick = showProjectModal;
}

// --- HELPER PARA PERSISTENCIA (Blob URL -> Blob) ---
async function blobUrlToBlob(url) {
  try {
    const response = await fetch(url);
    return await response.blob();
  } catch (e) {
    console.warn('Error fetching blob for persistence:', url, e);
    return null; 
  }
}

async function serializeSheets(sheets) {
  return Promise.all(sheets.map(async (sheet) => {
    // Si no hay json, devolvemos tal cual
    if (!sheet.json) return sheet;
    
    // Clonamos para no mutar estado en memoria
    // NOTE: JSON.stringify loses Blobs, but here we haven't injected them yet.
    // resourceMap blobs are injected AFTER this clone.
    const sheetClone = JSON.parse(JSON.stringify(sheet));
    
    // Función recursiva para buscar imágenes en objetos Fabric
    const processObjects = async (objects) => {
      for (const obj of objects) {
        // 1. Restaurar OriginalSrc desde ResourceMap (RAM Optimization Reversal for Persistence)
        if (obj.type === 'image' && obj.imageId && !obj.originalSrc) {
             if (sheetsManager.resourceMap && sheetsManager.resourceMap.has(obj.imageId)) {
                 // DIRECT BLOB INJECTION (IndexedDB supports Blobs)
                 obj.originalSrc = sheetsManager.resourceMap.get(obj.imageId);
             }
        }

        // 2. Convertir Blob URL a Blob Object (para que IndexedDB lo guarde)
        if (obj.type === 'image' && obj.src && typeof obj.src === 'string' && obj.src.startsWith('blob:')) {
          obj.src = await blobUrlToBlob(obj.src);
        }
        
        if (obj.objects) { // Grupos
          await processObjects(obj.objects);
        }
      }
    };
    
    if (sheetClone.json && sheetClone.json.objects) {
      await processObjects(sheetClone.json.objects);
    }
    
    return sheetClone;
  }));
}

async function getProjectData() {
  const { uploadedImages, canvas } = getState();
  // Ensure current sheet is saved before exporting project data
  sheetsManager.saveCurrentSheetState();
  
  // 1. Serializar Imágenes (Cards) -> Store Blobs directly
  const serializedImages = await Promise.all(uploadedImages.map(async (img) => {
      let src = img.src;
      let thumbSrc = img.thumbSrc;

      if (src && typeof src === 'string' && src.startsWith('blob:')) {
          src = await blobUrlToBlob(src);
      }
      if (thumbSrc && typeof thumbSrc === 'string' && thumbSrc.startsWith('blob:')) {
          thumbSrc = await blobUrlToBlob(thumbSrc);
      }
      return { ...img, src, thumbSrc };
  }));

  // 2. Serializar Hojas (Canvas JSONs)
  const serializedSheets = await serializeSheets(sheetsManager.sheets);

  return {
    canvas: canvas.toJSON(['name', 'id', 'selectable', 'evented', 'lockMovementX', 'lockMovementY', 'lockRotation', 'lockScalingX', 'lockScalingY']), // Legacy fallback
    uploadedImages: serializedImages,
    sheets: serializedSheets,
    currentSheetIndex: sheetsManager.currentSheetIndex,
    config: {
      canvasHcm: Math.round(canvas.getHeight() / PX_CM)
    }
  };
}

async function showProjectModal() {
  let modal = document.getElementById('project-modal');
  // Modal should exist in HTML now
  if (modal) {
    modal.style.display = 'flex';
    renderProjectList();
  } else {
    alert('Error: Modal de proyectos no encontrado en HTML');
  }
}

async function renderProjectList() {
  const list = document.getElementById('project-list');
  list.innerHTML = 'Cargando...';
  const projects = await projectManager.listProjects();
  const current = projectManager.getCurrentProject();
  
  list.innerHTML = '';
  if (projects.length === 0) {
      list.innerHTML = '<li>No hay proyectos guardados.</li>';
      return;
  }

  projects.forEach(p => {
    const li = document.createElement('li');
    // Styling handled by CSS (.modal-content li)
    
    const dateStr = new Date(p.updatedAt).toLocaleString();
    const isCurrent = current && current.id === p.id;
    
    li.innerHTML = `
      <div>
        <strong>${p.name}</strong> ${isCurrent ? '(Actual)' : ''}<br>
        <small>${dateStr}</small>
      </div>
      <div style="display:flex; gap:5px;">
        <button class="btn-load btn btn-blue" style="padding: 5px 10px; font-size: 0.8rem;">Cargar</button>
        <button class="btn-dup btn btn-blue" style="padding: 5px 10px; font-size: 0.8rem;">📄</button>
        <button class="btn-del btn btn-red" style="padding: 5px 10px; font-size: 0.8rem;">🗑️</button>
      </div>
    `;
    
    li.querySelector('.btn-load').onclick = async () => {
       if (confirm(`¿Cargar "${p.name}"? Se perderán los cambios no guardados.`)) {
         await loadProjectUI(p.id);
         document.getElementById('project-modal').style.display = 'none';
       }
    };
    
    li.querySelector('.btn-dup').onclick = async () => {
        await projectManager.duplicateProject(p.id);
        renderProjectList();
    };

    li.querySelector('.btn-del').onclick = async () => {
       if (confirm(`¿Eliminar "${p.name}"?`)) {
         await projectManager.deleteProject(p.id);
         renderProjectList();
       }
    };

    list.appendChild(li);
  });
}

// // window.addEventListener('load', init);
// Ahora controlado por Platform Guardian (Fase 2.4)
// Ahora controlado por Platform Guardian (Fase 2.4)
