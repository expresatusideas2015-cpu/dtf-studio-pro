import { optimizeImage } from './optimizer.js';
import { autoCropTransparentImage, resizeImage } from './imageUtils.js';
import { MAX_FILE_SIZE_MB } from '../config/constants.js';
import { projectManager } from '../core/projectManager.js';

export async function loadFiles(files, lockByDefault = true) {
  const startLoad = performance.now();
  console.log(`📂 [LoadFiles] Procesando ${files.length} archivos...`);

  // Ampliamos los tipos permitidos para mayor compatibilidad
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];

  const promises = Array.from(files).map(async file => {
    // 1. Validaciones iniciales
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error(`Formato no soportado (${file.type}): ${file.name}`);
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new Error(`El archivo excede ${MAX_FILE_SIZE_MB}MB: ${file.name}`);
    }

    // 2. Optimización y lectura
    try {
      const optimized = await optimizeImage(file);
      
      // 3. Auto-recorte de bordes transparentes (NUEVO REQUERIMIENTO)
      // Pasamos la URL optimizada para que detecte el contenido real
      const cropped = await autoCropTransparentImage(optimized.url);

      // Si hubo recorte, la URL cambió. Si no, es la misma.
      // Si cambió, deberíamos revocar la URL de 'optimized' para no fugar memoria.
      if (cropped.url !== optimized.url) {
        URL.revokeObjectURL(optimized.url);
      }
      
      // DETERMINAR BLOB FINAL PARA PERSISTENCIA (Base64)
      // Si cropped.blob existe, usamos ese. Si no, usamos optimized.blob.
      const finalBlob = cropped.blob || optimized.blob;

      // --- GENERACIÓN DE PREVIEWS (Optimización A y C) ---
      // Creamos una imagen temporal para generar miniaturas
      const tempImg = new Image();
      tempImg.src = cropped.url;
      await new Promise((r) => { if (tempImg.complete) r(); else tempImg.onload = r; });

      // Generar Preview (Canvas: ~1024px) y Thumbnail (Cards: ~300px)
      // Ahora retorna Promesas con Blob URLs para eficiencia de memoria
      const previewSrc = await resizeImage(tempImg, 1024, 1024);
      const thumbSrc = await resizeImage(tempImg, 300, 300);

      // Liberar memoria de la imagen temporal
      tempImg.remove();

      // Calculamos dimensiones iniciales en CM usando el tamaño REAL del contenido (cropped)
      // (aprox 300 DPI: 118.11 px/cm)
      const cmWidth = cropped.width / 118.11;
      const cmHeight = cropped.height / 118.11;
      
      const imgId = 'img_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      
      // MEMORY OPTIMIZATION: Offload Original Blob to IndexedDB
      // We don't keep the heavy Blob in RAM (originalSrc = null)
      try {
          await projectManager.saveBlob(imgId, finalBlob);
      } catch (e) {
          console.error("Failed to offload blob to DB", e);
          // Fallback: keep in RAM if DB fails? Or just fail?
          // Let's keep strict for now, but we could set originalSrc as fallback.
      }

      return {
        id: imgId,
        src: previewSrc, // USAR PREVIEW POR DEFECTO PARA CANVAS (Optimización A)
        originalSrc: null, // Liberado de RAM (Stored in IndexedDB via projectManager)
        thumbSrc: thumbSrc, // Guardar miniatura para UI
        previewSrc: previewSrc, // Alias explícito
        originalWidth: cropped.width,
        originalHeight: cropped.height,
        // Limitamos tamaño inicial visual a 30cm máx para comodidad
        width: parseFloat(Math.min(30, cmWidth).toFixed(2)),
        height: parseFloat(Math.min(30, cmHeight).toFixed(2)),
        qty: 1,
        aspectRatio: cropped.width / cropped.height,
        lockProportion: lockByDefault,
        fileName: optimized.fileName,
        fileSize: finalBlob.size, 
        originalSize: optimized.originalSize
      };
    } catch (err) {
      throw new Error(`Error al optimizar ${file.name}: ${err.message}`);
    }
  });

  // Usamos allSettled para que un error no detenga el resto
  const results = await Promise.allSettled(promises);

  const loaded = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  const errors = results
    .filter(r => r.status === 'rejected')
    .map(r => r.reason.message);

  const totalTime = performance.now() - startLoad;
  console.log(`✅ [LoadFiles] Completado en ${totalTime.toFixed(2)}ms. Éxitos: ${loaded.length}, Errores: ${errors.length}`);

  return { loaded, errors };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
