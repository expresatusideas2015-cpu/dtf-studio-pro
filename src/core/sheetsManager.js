import { PX_CM, MAX_SHEETS } from '../config/constants.js';
import { setCanvasHeight, getState } from './state.js';
import { autoPack } from './packing.js';
import { updateMetrics } from './canvasEngine.js';
import { clearHistory } from './history.js';

export const sheetsManager = {
  sheets: [],
  currentSheetIndex: 0,
  canvasRef: null,
  barContainer: null,
  resourceMap: new Map(), // Cache for deduplicated image data (Blobs)

  releaseImageResources(imageId) {
    if (this.resourceMap.has(imageId)) {
      this.resourceMap.delete(imageId);
      console.log(`[SheetsManager] Released resources for Image ID: ${imageId}`);
    }
  },

  init(canvas) {
    this.canvasRef = canvas;
    this.resourceMap = new Map();
    this.sheets = [{
      id: Date.now(),
      name: 'Hoja 1',
      json: null, // Stores canvas state
      heightCm: 50,
      price: 0
    }];
    this.currentSheetIndex = 0;
    
    this.createUI();
    this.updateBar();
  },

  createUI() {
    const mainContent = document.querySelector('.main-content');
    const canvasWrapper = document.querySelector('.canvas-wrapper');
    
    if (!mainContent || !canvasWrapper) return;

    const bar = document.createElement('div');
    bar.id = 'sheets-bar';
    bar.className = 'sheets-bar';
    // Ensure visibility with inline styles as fallback
    bar.style.display = 'flex';
    bar.style.gap = '5px';
    bar.style.overflowX = 'auto';
    bar.style.padding = '5px 0';
    bar.style.borderBottom = '1px solid #333';
    bar.style.marginBottom = '10px';
    bar.style.minHeight = '40px';
    
    mainContent.insertBefore(bar, canvasWrapper);
    this.barContainer = bar;
  },

  updateBar() {
    if (!this.barContainer) return;
    
    // AUDITORÍA DE ESTADO UI
    console.log("[updateBar] Rendering from source. Sheets count:", this.sheets.length);
    
    this.barContainer.innerHTML = '';

    this.sheets.forEach((sheet, index) => {
      const container = document.createElement('div');
      container.style.display = 'inline-flex';
      container.style.alignItems = 'center';
      container.className = index === this.currentSheetIndex ? 'sheet-tab active' : 'sheet-tab';
      // Basic styling for the container if class doesn't exist yet
      if (!container.className.includes('active')) {
          container.style.opacity = '0.7';
      } else {
          container.style.opacity = '1';
          container.style.fontWeight = 'bold';
      }

      const btn = document.createElement('button');
      btn.textContent = sheet.name;
      const isActive = index === this.currentSheetIndex;
      
      // Keep existing class logic but ensure we don't rely only on CSS if it's missing
      btn.className = `sheet-btn ${isActive ? 'active' : ''}`;
      btn.style.padding = '5px 10px';
      btn.style.cursor = 'pointer';
      
      btn.onclick = () => this.switchToSheet(index);
      container.appendChild(btn);

      // Add delete button if more than 1 sheet
      if (this.sheets.length > 1) {
          const delBtn = document.createElement('span');
          delBtn.textContent = '×';
          delBtn.style.marginLeft = '8px';
          delBtn.style.marginRight = '5px';
          delBtn.style.cursor = 'pointer';
          delBtn.style.color = '#ff4444';
          delBtn.style.fontWeight = 'bold';
          delBtn.style.fontSize = '1.2em';
          delBtn.title = 'Eliminar hoja';
          delBtn.onclick = (e) => {
              e.stopPropagation(); // Prevent switching when clicking delete
              this.deleteSheet(index);
          };
          container.appendChild(delBtn);
      }

      this.barContainer.appendChild(container);
    });

    // Scroll to active button if possible
    // (Deprecated logic replaced by scrollIntoView below)
    
    // Add "+" button
    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.className = 'sheet-add-btn';
    addBtn.style.padding = '5px 15px';
    addBtn.style.marginLeft = '10px';
    addBtn.style.cursor = 'pointer';
    addBtn.onclick = () => this.addSheet();
    this.barContainer.appendChild(addBtn);
    
    // Auto-scroll to active
    setTimeout(() => {
        const activeEl = this.barContainer.querySelector('.sheet-tab.active');
        if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 10);

    // VALIDACIÓN FINAL DE SINCRONIZACIÓN UI
    const renderedTabs = this.barContainer.querySelectorAll('.sheet-tab').length;
    if (renderedTabs !== this.sheets.length) {
        console.error(`[updateBar] UI OUT OF SYNC! Expected ${this.sheets.length} tabs, found ${renderedTabs}`);
        // Forzar re-render de emergencia si hay mismatch
        // setTimeout(() => this.updateBar(), 100); 
    } else {
        console.log(`[updateBar] UI Synced. Tabs: ${renderedTabs}`);
    }
  },

  saveCurrentSheetState() {
    if (!this.canvasRef || !this.sheets[this.currentSheetIndex]) return;
    
    // Limpiar selección antes de guardar para evitar artefactos
    this.canvasRef.discardActiveObject();
    
    // Save full JSON state
    // We include originalSrc to capture it, but then we strip it out to resourceMap
    const json = this.canvasRef.toJSON(['name', 'id', 'selectable', 'evented', 'lockMovementX', 'lockMovementY', 'lockRotation', 'lockScalingX', 'lockScalingY', 'originalSrc', 'originalWidth', 'originalHeight', 'imageId']);
    
    // RAM OPTIMIZATION: Deduplicate originalSrc (Blob)
    // Move Blobs from JSON structure to resourceMap to save memory and avoid duplication
    if (json.objects) {
        json.objects.forEach(obj => {
            if (obj.type === 'image' && obj.imageId && obj.originalSrc) {
                // If it's a Blob or heavy string, move to cache
                if (!this.resourceMap.has(obj.imageId)) {
                    this.resourceMap.set(obj.imageId, obj.originalSrc);
                }
                // Remove from JSON to keep sheet state lightweight
                delete obj.originalSrc;
            }
        });
    }

    this.sheets[this.currentSheetIndex].json = json;
    
    // Save current height setting
    const hPx = this.canvasRef.getHeight();
    this.sheets[this.currentSheetIndex].heightCm = Math.round(hPx / PX_CM);

    // SNAPSHOT FOR INSTANT SWITCH (Optimization D)
    // Generamos una captura de baja calidad para mostrar mientras carga la hoja real
    if (this.canvasRef.getObjects().length > 0) {
        // Multiplier bajo para velocidad, JPEG para tamaño
        this.sheets[this.currentSheetIndex].snapshot = this.canvasRef.toDataURL({ 
            format: 'jpeg', 
            quality: 0.3, 
            multiplier: 0.2 
        });
    } else {
        this.sheets[this.currentSheetIndex].snapshot = null;
    }
  },
  
  preloadNextSheet(currentIndex) {
    const nextIndex = (currentIndex + 1) % this.sheets.length;
    if (nextIndex === currentIndex) return;
    
    const nextSheet = this.sheets[nextIndex];
    if (nextSheet && nextSheet.json && nextSheet.json.objects) {
        // Usar requestIdleCallback para no bloquear el hilo principal
        const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
        
        idleCallback(() => {
            nextSheet.json.objects.forEach(obj => {
                if (obj.type === 'image' && obj.src) {
                    const img = new Image();
                    img.src = obj.src; // Browser Cache Hit
                }
            });
        }, { timeout: 2000 });
    }
  },

  showSnapshotOverlay(src) {
      let overlay = document.getElementById('sheet-snapshot-overlay');
      const wrapper = document.querySelector('.canvas-wrapper');
      
      if (!wrapper) return;

      if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'sheet-snapshot-overlay';
          overlay.style.position = 'absolute';
          overlay.style.top = '0';
          overlay.style.left = '0';
          overlay.style.width = '100%';
          overlay.style.height = '100%';
          overlay.style.zIndex = '50'; // Debajo del loader principal si lo hubiera
          overlay.style.background = '#e5e7eb'; // Gris claro dtf
          overlay.style.display = 'flex';
          overlay.style.alignItems = 'center';
          overlay.style.justifyContent = 'center';
          overlay.style.pointerEvents = 'none'; // Permitir clicks passthrough si fuera necesario, pero mejor bloquear visualmente
          
          const img = document.createElement('img');
          img.id = 'sheet-snapshot-img';
          img.style.maxWidth = '100%';
          img.style.maxHeight = '100%';
          img.style.opacity = '0.5';
          img.style.filter = 'blur(2px)'; // Efecto elegante
          overlay.appendChild(img);
          
          wrapper.style.position = 'relative'; // Asegurar contexto
          wrapper.appendChild(overlay);
      }
      
      const img = overlay.querySelector('img');
      if (img) img.src = src;
      overlay.style.display = 'flex';
  },

  hideSnapshotOverlay() {
      const overlay = document.getElementById('sheet-snapshot-overlay');
      if (overlay) overlay.style.display = 'none';
  },

  _loadSheetState(target) {
    return new Promise((resolve) => {
      this.canvasRef.clear();
      this.canvasRef.setBackgroundColor('rgba(128,128,128,0.3)', async () => {
          
          const finishLoad = () => {
               this.canvasRef.setHeight(target.heightCm * PX_CM);
               setCanvasHeight(target.heightCm);
               this.canvasRef.requestRenderAll();
               this.canvasRef.fire('canvas:content-loaded');
               this.canvasRef.fire('sheet:switched');
               resolve();
          };

          if (target.json && target.json.objects && target.json.objects.length > 0) {
              // OPTIMIZED LOADING: Chunked Enliven to prevent freeze
              const objectsData = target.json.objects;
              const BATCH_SIZE = 10; // Load 10 objects at a time
              
              // Restore canvas properties first (excluding objects)
              delete target.json.objects;
              this.canvasRef.loadFromJSON(target.json, () => {}, (o, object) => {}); // Load props only
              
              // Chunk Processing
              for (let i = 0; i < objectsData.length; i += BATCH_SIZE) {
                  const chunk = objectsData.slice(i, i + BATCH_SIZE);
                  
                  await new Promise((chunkResolve) => {
                      fabric.util.enlivenObjects(chunk, (enlivenedObjects) => {
                          enlivenedObjects.forEach((obj) => {
                              // RESTORE METADATA from Cache
                              if (obj.type === 'image' && obj.imageId) {
                                  const original = this.resourceMap.get(obj.imageId);
                                  if (original) {
                                      obj.originalSrc = original;
                                  }
                              }
                              this.canvasRef.add(obj);
                          });
                          chunkResolve();
                      }, '');
                  });

                  // Micro-yield to keep UI responsive
                  if (i + BATCH_SIZE < objectsData.length) {
                      await new Promise(r => setTimeout(r, 0));
                  }
              }
              
              // Restore objects array to JSON for future saves (integrity)
              target.json.objects = objectsData;
              finishLoad();
          } else if (target.json) {
              // Fallback for empty or simple sheets
              this.canvasRef.loadFromJSON(target.json, finishLoad);
          } else {
              finishLoad();
          }
      });
    });
  },

  async switchToSheet(index) {
    if (index === this.currentSheetIndex) return;
    
    const startSwitch = performance.now();
    console.log(`📑 [SwitchToSheet] Iniciando cambio a Hoja ${index + 1}...`);

    // Ensure we have the latest global canvas reference
    const globalState = getState();
    if (globalState.canvas && globalState.canvas !== this.canvasRef) {
        this.canvasRef = globalState.canvas;
    }

    // 1. Save current
    this.saveCurrentSheetState();

    // 2. Switch index
    this.currentSheetIndex = index;
    const target = this.sheets[index];
    
    // BLOCK UI & OPTIMIZE
    // Optimization D: Show snapshot if available
    if (target.snapshot) {
        this.showSnapshotOverlay(target.snapshot);
    } else {
        this.toggleOverlay(true, `Cargando ${target.name}...`);
    }

    await new Promise(r => setTimeout(r, 50)); // Force paint

    try {
        if (this.canvasRef) {
            this.canvasRef.discardActiveObject(); // Drop selection
            this.canvasRef.renderOnAddRemove = false;
            
            // MEMORY SAFETY: Explicit cleanup
            // 1. Dispose objects to free Fabric cache
            const objects = this.canvasRef.getObjects();
            objects.forEach(obj => {
                // Remove events
                obj.off();
                // Dispose specific resources if any
                if (obj.dispose) obj.dispose();
            });

            // 2. Remove from canvas
            if (objects.length > 0) {
                this.canvasRef.remove(...objects);
            }
            
            // 3. Hard Clear
            this.canvasRef.clear();
            
            // 4. Reset History to avoid holding references to previous sheet objects
            clearHistory();
        }

        // 3. Load target using helper (awaiting promise)
        await this._loadSheetState(target);

        // 4. Force Update UI
        this.updateBar();
    } catch (e) {
        console.error("Error switching sheet:", e);
    } finally {
        if (this.canvasRef) {
            this.canvasRef.renderOnAddRemove = true;
            this.canvasRef.requestRenderAll();
        }
        this.toggleOverlay(false);
        this.hideSnapshotOverlay();

        const totalTime = performance.now() - startSwitch;
        console.log(`✅ [SwitchToSheet] COMPLETADO en ${totalTime.toFixed(2)}ms`);

        // Optimization B: Preload Next Sheet
        this.preloadNextSheet(index);
    }
  },

  deleteSheet(index) {
    if (this.sheets.length <= 1) {
      alert('No se puede eliminar la única hoja existente.');
      return;
    }

    const sheetName = this.sheets[index].name;
    if (!confirm(`¿Estás seguro de ELIMINAR la ${sheetName}?\nSe perderán todos los diseños en ella.`)) return;

    // 1. Eliminar de la lista
    this.sheets.splice(index, 1);

    // 2. Ajustar índice
    let shouldReload = false;
    if (index === this.currentSheetIndex) {
      // Si borramos la activa, vamos a la anterior (o la primera)
      this.currentSheetIndex = Math.max(0, index - 1);
      shouldReload = true;
    } else if (index < this.currentSheetIndex) {
      // Si borramos una anterior, decrementamos índice
      this.currentSheetIndex--;
    }

    // 3. Reindexar nombres
    this.sheets.forEach((s, i) => s.name = `Hoja ${i + 1}`);

    // 4. Actualizar UI
    this.updateBar();
    
    if (shouldReload) {
      this._loadSheetState(this.sheets[this.currentSheetIndex]);
    }
  },

  // --- UI HELPERS ---
  toggleOverlay(show, msg = 'Procesando...') {
    let overlay = document.getElementById('sheet-loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sheet-loading-overlay';
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.background = 'rgba(0,0,0,0.5)';
      overlay.style.zIndex = '10000';
      overlay.style.display = 'flex';
      overlay.style.justifyContent = 'center';
      overlay.style.alignItems = 'center';
      overlay.style.color = 'white';
      overlay.style.fontSize = '24px';
      overlay.style.fontFamily = 'sans-serif';
      overlay.style.flexDirection = 'column';
      overlay.innerHTML = '<div class="spinner"></div><div id="overlay-msg" style="margin-top:15px"></div>';
      
      // Add simple spinner style
      const style = document.createElement('style');
      style.innerHTML = `
        .spinner {
          border: 4px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          border-top: 4px solid #fff;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `;
      document.head.appendChild(style);
      document.body.appendChild(overlay);
    }
    
    const msgEl = overlay.querySelector('#overlay-msg');
    if (msgEl) msgEl.textContent = msg;
    
    overlay.style.display = show ? 'flex' : 'none';
  },

  async addSheet(itemsToPopulate = null) {
    try {
        // alert("ADD SHEET NUEVA VERSION ACTIVA " + Date.now()); // Removed production alert
        console.log("[addSheet] START. Sheets before:", this.sheets.length);
        
        // 1. HIGH LOAD MODE: Disable Rendering
        if (this.canvasRef) {
            this.canvasRef.renderOnAddRemove = false;
        }
        
        const initialLength = this.sheets.length;

        if (this.sheets.length >= MAX_SHEETS) {
          return alert(`⚠️ Has alcanzado el límite máximo seguro de ${MAX_SHEETS} hojas.`);
        }

        // Sync global canvas reference before starting
        const globalState = getState();
        if (globalState.canvas) {
            this.canvasRef = globalState.canvas;
        }

        this.saveCurrentSheetState();

        const newId = this.sheets.length + 1;
        console.log(`[addSheet] Creating new sheet: Hoja ${newId}`);
        
        this.sheets.push({
          id: Date.now(),
          name: `Hoja ${newId}`,
          json: null,
          heightCm: 50
        });
        
        console.log("[addSheet] Sheets after push:", this.sheets.length);

        // Verificación dura de creación
        if (this.sheets.length === initialLength) {
            throw new Error("addSheet CRITICAL FAIL: Sheet was not added to array.");
        }

        await this.switchToSheet(this.sheets.length - 1);
        
        // YIELD: Allow UI update
        await new Promise(resolve => setTimeout(resolve, 50));
        
        console.log("[addSheet] Switched to new sheet index:", this.currentSheetIndex);

        if (itemsToPopulate && itemsToPopulate.length > 0) {
          let pendingItems = [...itemsToPopulate];
          let iterationSafety = 0;
          
          // Bucle iterativo basado EXCLUSIVAMENTE en overflow
          while (pendingItems.length > 0) {
              iterationSafety++;
              
              // YIELD: Critical for High Load
              if (iterationSafety % 2 === 0) {
                 await new Promise(r => setTimeout(r, 0));
              }

              // RE-SYNC: Ensure we are using the correct canvas instance
              const globalState = getState();
              if (globalState.canvas && globalState.canvas !== this.canvasRef) {
                  this.canvasRef = globalState.canvas;
              }

              // 1. Ejecutar autoPack en la hoja actual
              const result = await autoPack({ 
                canvas: this.canvasRef, 
                images: [], 
                customItems: pendingItems 
              });

              // 2. Ajustar altura según contenido
              if (result.usedHeightCm > 0) {
                 let newH = result.usedHeightCm + 2; // +2cm margin
                 if (newH < 50) newH = 50; 
                 if (newH > 200) newH = 200; 
                 
                 this.canvasRef.setHeight(newH * PX_CM);
                 setCanvasHeight(newH);
                 // No requestRenderAll here, we do it at the end or if needed
                 // But wait, autoPack calls render? autoPack modifies canvas.
              }

              // 3. Obtener el NUEVO overflow real desde el resultado del packing
              const newOverflow = result.skippedItemsList || [];

              // CONDICIÓN DE CORTE ÚNICA: Si no hay overflow, terminamos.
              if (newOverflow.length === 0) {
                  break;
              }

              // 4. Preparar siguiente iteración con el overflow real
              pendingItems = newOverflow;
              
              // Guardar estado actual antes de crear nueva hoja
              this.saveCurrentSheetState();

              // Verificar límite antes de crear otra hoja
              if (this.sheets.length >= MAX_SHEETS) {
                 alert(`⚠️ Límite de ${MAX_SHEETS} hojas alcanzado. Quedan ${pendingItems.length} imágenes sin colocar.`);
                 break;
              }

              // 5. Crear nueva hoja y cambiar a ella
              const nextId = this.sheets.length + 1;
              console.log(`[addSheet] Creating overflow sheet: Hoja ${nextId}`);
              
              this.sheets.push({
                id: Date.now() + iterationSafety, // Unique ID
                name: `Hoja ${nextId}`,
                json: null,
                heightCm: 50
              });
              
              // Cambiar contexto (limpia canvas y prepara para siguiente loop)
              await this.switchToSheet(this.sheets.length - 1);
              await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        return this.sheets.length - 1;

    } catch(err) {
        console.error("Error in addSheet:", err);
        throw err;
    } finally {
        // RESTORE RENDERING
        if (this.canvasRef) {
            this.canvasRef.renderOnAddRemove = true;
            this.canvasRef.requestRenderAll();
        }
    }
  },
};
