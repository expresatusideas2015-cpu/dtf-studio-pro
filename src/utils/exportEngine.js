import { PX_CM } from '../config/constants.js';
import { sheetsManager } from '../core/sheetsManager.js';
import { projectManager } from '../core/projectManager.js';

// --- CONFIGURACIÓN Y CONSTANTES ---

const MAX_SAFE_DIMENSION = 24000; 
const MAX_SAFE_AREA = 150 * 1024 * 1024; 

export const ExportPresets = {
  PRODUCTION: {
    id: 'prod',
    name: 'Producción DTF',
    dpi: 300,
    format: 'png',
    bg: null // transparente
  },
  HIGH_RES: {
    id: 'high',
    name: 'Alta Resolución (600 DPI)',
    dpi: 600,
    format: 'png',
    bg: null
  },
  PREVIEW: {
    id: 'prev',
    name: 'Vista Previa (JPG)',
    dpi: 72,
    format: 'jpg',
    bg: '#ffffff',
    quality: 0.8
  }
};

const HISTORY_KEY = 'dtf_export_history';

// --- HISTORIAL ---
export const ExportHistory = {
  add(entry) {
    const history = this.get();
    history.unshift({
      id: Date.now().toString(36),
      timestamp: Date.now(),
      ...entry
    });
    // Mantener últimos 50 registros
    if (history.length > 50) history.pop();
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      console.warn('No se pudo guardar historial de exportación', e);
    }
  },
  get() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch { return []; }
  }
};

// --- MOTOR PRINCIPAL ---
export const ExportEngine = {
  
  /**
   * Calcula dimensiones seguras (Safe Limits)
   */
  calculateSafeDimensions(widthPx, heightPx, targetDpi) {
    const INCH_CM = 2.54;
    const targetPxCm = targetDpi / INCH_CM;
    const scaleFactor = targetPxCm / PX_CM;

    let finalW = Math.ceil(widthPx * scaleFactor);
    let finalH = Math.ceil(heightPx * scaleFactor);
    let usedDpi = targetDpi;

    // Chequeo de límites
    let ratio = 1;
    const area = finalW * finalH;

    if (finalW > MAX_SAFE_DIMENSION || finalH > MAX_SAFE_DIMENSION || area > MAX_SAFE_AREA) {
      const ratioW = finalW > MAX_SAFE_DIMENSION ? MAX_SAFE_DIMENSION / finalW : 1;
      const ratioH = finalH > MAX_SAFE_DIMENSION ? MAX_SAFE_DIMENSION / finalH : 1;
      const ratioArea = area > MAX_SAFE_AREA ? Math.sqrt(MAX_SAFE_AREA / area) : 1;
      
      ratio = Math.min(ratioW, ratioH, ratioArea);
      
      finalW = Math.floor(finalW * ratio);
      finalH = Math.floor(finalH * ratio);
      usedDpi = Math.floor(targetDpi * ratio);
      
      console.warn(`[ExportEngine] Reduciendo escala por seguridad: ${targetDpi} -> ${usedDpi} DPI`);
    }

    return {
      width: finalW,
      height: finalH,
      scaleFactor: scaleFactor * ratio,
      dpi: usedDpi
    };
  },

  /**
   * Genera un nombre de archivo estandarizado
   */
  generateName(baseName, sheetName, index, extension = 'png') {
    // Sanitizar nombres
    const safeBase = baseName.replace(/[^a-zA-Z0-9\-_]/g, '_');
    const safeSheet = sheetName.replace(/[^a-zA-Z0-9\-_]/g, '_');
    
    // Formato: PROYECTO_Hoja_1.png
    return `${safeBase}_${safeSheet}.${extension}`;
  },

  /**
   * Genera Blob desde un Canvas (Live) o JSON (Background)
   * @param {Object|fabric.Canvas} source - Objeto JSON de la hoja o instancia de fabric.Canvas
   * @param {Object} options - { heightCm, preset, dpiOverride }
   */
  async generateBlob(source, options = {}) {
    const preset = options.preset || ExportPresets.PRODUCTION;
    const reqDpi = options.dpiOverride || preset.dpi;
    const format = preset.format || 'png';
    const isJson = !(source instanceof fabric.Canvas);

    // 1. Determinar dimensiones base y contenido
    let sourceW, sourceH, jsonContent;
    const blobUrls = []; // Track for cleanup

    if (isJson) {
       // Origen: JSON (Background / Batch)
       if (!source) throw new Error('JSON de hoja vacío');
       sourceW = 58 * PX_CM; // ANCHO FIJO: 58cm es el estándar del rollo DTF
       
       // Si source es el objeto JSON completo de fabric, width está dentro? 
       // Normalmente guardamos canvas.toJSON(). El width original se asume constante (58cm).
       // Usamos heightCm pasado en opciones para calcular altura real.
       sourceH = (options.heightCm || 50) * PX_CM; 
       
       // CLONAR JSON para no mutar el original
       // Y asegurar que el background sea transparente si el preset lo pide
       jsonContent = JSON.parse(JSON.stringify(source));

       if (!preset.bg) {
          jsonContent.background = null;
          jsonContent.backgroundImage = null; // Por si acaso
       }

    } else {
       // Origen: Canvas (Live)
       const objs = source.getObjects();
       if (objs.length === 0) throw new Error('Lienzo vacío');
       
       sourceW = source.width;
       // Usar altura definida (si existe) o altura del canvas
       // Esto asegura consistencia con la exportación por lotes (JSON)
       if (options.heightCm) {
           sourceH = options.heightCm * PX_CM;
       } else {
           sourceH = source.height; 
       }
       
       jsonContent = source.toJSON(['name', 'id', 'selectable', 'evented', 'lockMovementX', 'lockMovementY', 'lockRotation', 'lockScalingX', 'lockScalingY', 'originalSrc', 'originalWidth', 'originalHeight', 'imageId']);
       
       // FORZAR REMOCIÓN DE FONDO EN EL JSON GENERADO
       if (!preset.bg) {
           jsonContent.background = null;
           jsonContent.backgroundImage = null;
       }
    }

    // --- SWAP LOGIC: PREVIEW -> ORIGINAL ---
    // Si estamos usando optimización de memoria (previews en canvas),
    // debemos restaurar la imagen original para la exportación.
    if (jsonContent.objects) {
        // Use for...of loop to support await
        for (const obj of jsonContent.objects) {
            if (obj.type === 'image') {
                // Restore originalSrc from cache if missing
                if (!obj.originalSrc && obj.imageId) {
                    obj.originalSrc = sheetsManager.resourceMap.get(obj.imageId);
                    
                    // Fallback: Fetch from DB
                    if (!obj.originalSrc) {
                        try {
                            obj.originalSrc = await projectManager.getBlob(obj.imageId);
                        } catch (e) { /* ignore */ }
                    }
                }

                if (obj.originalSrc && obj.originalWidth && obj.originalHeight) {
                     // 1. Calcular tamaño visual actual (basado en Preview)
                     const visualWidth = obj.width * obj.scaleX;
                     const visualHeight = obj.height * obj.scaleY;

                     // 2. Restaurar Source Original (Blob -> URL)
                     let highResUrl;
                     if (obj.originalSrc instanceof Blob) {
                         highResUrl = URL.createObjectURL(obj.originalSrc);
                         blobUrls.push(highResUrl);
                     } else {
                         highResUrl = obj.originalSrc; // Si fuera string (legacy)
                     }
                     obj.src = highResUrl;
                     
                     // 3. Actualizar dimensiones base a las originales
                     obj.width = obj.originalWidth;
                     obj.height = obj.originalHeight;
                     
                     // 4. Recalcular escala para mantener el mismo tamaño visual en cm/px
                     obj.scaleX = visualWidth / obj.width;
                     obj.scaleY = visualHeight / obj.height;
                }
            }
        }
    }

    // 2. Calcular Dimensiones de Salida
    const { width, height, scaleFactor, dpi } = this.calculateSafeDimensions(sourceW, sourceH, reqDpi);

    // 3. Renderizar en Offscreen Canvas
    const tempEl = document.createElement('canvas');
    tempEl.width = width;
    tempEl.height = height;
    
    // IMPORTANTE: enableRetinaScaling false para que width/height sean píxeles exactos
    const tempCanvas = new fabric.StaticCanvas(tempEl, {
      enableRetinaScaling: false,
      renderOnAddRemove: false,
      backgroundColor: null // Inicializar sin fondo
    });

    return new Promise((resolve, reject) => {
       tempCanvas.loadFromJSON(jsonContent, () => {
          tempCanvas.setZoom(scaleFactor);
          tempCanvas.setWidth(width);
          tempCanvas.setHeight(height);
          
          // Asegurar fondo si el preset lo requiere
          if (preset.bg) {
              tempCanvas.setBackgroundColor(preset.bg, () => tempCanvas.renderAll());
          } else {
              // Forzar limpieza de fondo explícita
              tempCanvas.setBackgroundColor(null, () => {
                  tempCanvas.renderAll();
              });
          }

          // 4. Exportar a Blob
          const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
          const quality = preset.quality || 1.0;

          tempEl.toBlob((blob) => {
             tempCanvas.dispose();
             tempEl.remove();

             // CLEANUP HIGH RES URLS
             if (blobUrls && blobUrls.length > 0) {
                blobUrls.forEach(url => URL.revokeObjectURL(url));
             }

             if (!blob) {
                 reject(new Error('Error generando imagen.'));
             } else {
                 blob.dpi = dpi; // Metadata útil
                 resolve(blob);
             }
          }, mime, quality);
       });
    });
  },

  /**
   * Procesa la exportación por lotes
   */
  async exportBatch(sheets, baseName, options = {}) {
     const results = [];
     const total = sheets.length;
     const preset = options.preset || ExportPresets.PRODUCTION;

     // Callback de progreso
     const updateProgress = options.onProgress || (() => {});

     for (let i = 0; i < total; i++) {
        const sheet = sheets[i];
        const fileName = this.generateName(baseName, sheet.name, i, preset.format);
        
        updateProgress(i + 1, total, sheet.name);

        try {
            // Si la hoja no tiene JSON (nunca se cargó/guardó), puede ser null.
            // sheetsManager inicializa con json=null.
            // Si es null, asumimos vacía o error.
            if (!sheet.json) {
                console.warn(`Hoja "${sheet.name}" está vacía o sin datos. Saltando.`);
                results.push({ name: sheet.name, status: 'skipped', reason: 'Empty' });
                continue;
            }

            const blob = await this.generateBlob(sheet.json, {
                heightCm: sheet.heightCm,
                preset: preset
            });

            this.downloadBlob(blob, fileName);
            results.push({ name: sheet.name, status: 'success', file: fileName, size: blob.size });
            
            // Pequeña pausa para no congelar UI y dar tiempo al navegador
            await new Promise(r => setTimeout(r, 500));

        } catch (err) {
            console.error(`Error exportando ${sheet.name}:`, err);
            results.push({ name: sheet.name, status: 'error', error: err.message });
        }
     }

     // Registrar en historial
     ExportHistory.add({
         type: 'batch',
         baseName,
         totalSheets: total,
         successCount: results.filter(r => r.status === 'success').length,
         preset: preset.name
     });

     return results;
  },

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
};
