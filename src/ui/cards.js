import { getState, updateImage, removeImage } from '../core/state.js';
import { removeBackground } from '../services/removeBgService.js';
import { sheetsManager } from '../core/sheetsManager.js';
import { projectManager } from '../core/projectManager.js';

export function renderCards(containerId, onAddToCanvas) {
  const container = document.getElementById(containerId);
  const { uploadedImages } = getState();
  container.innerHTML = '';

  uploadedImages.forEach(img => {
    const card = document.createElement('div');
    card.className = 'file-card';

    const thumb = document.createElement('img');
    thumb.className = 'thumb';
    thumb.src = img.thumbSrc || img.src;
    card.appendChild(thumb);

    const controls = document.createElement('div');
    controls.className = 'card-controls';

    // Crear inputs primero
    const widthObj = createInput(img.width, 0.1, 0.1, 'Ancho (cm)');
    const heightObj = createInput(img.height, 0.1, 0.1, 'Alto (cm)');
    const qtyObj = createInput(img.qty, 1, 1, 'Cant.');

    // Checkbox de bloqueo (definido aquí para ser usado en los handlers)
    const lockCb = document.createElement('input');
    lockCb.type = 'checkbox';
    lockCb.checked = !!img.lockProportion;

    // Handlers con actualización directa del DOM (sin re-render completo)
    widthObj.input.onchange = () => {
      const val = parseFloat(widthObj.input.value) || 0.1;
      const next = { width: val };
      
      if (lockCb.checked && img.aspectRatio) {
        const newH = parseFloat((val / img.aspectRatio).toFixed(2));
        next.height = newH;
        heightObj.input.value = newH;
      }
      updateImage(img.id, () => next);
    };

    heightObj.input.onchange = () => {
      const val = parseFloat(heightObj.input.value) || 0.1;
      const next = { height: val };
      
      if (lockCb.checked && img.aspectRatio) {
        const newW = parseFloat((val * img.aspectRatio).toFixed(2));
        next.width = newW;
        widthObj.input.value = newW;
      }
      updateImage(img.id, () => next);
    };

    qtyObj.input.onchange = () => {
      const val = Math.max(1, Math.round(parseFloat(qtyObj.input.value) || 1));
      qtyObj.input.value = val;
      updateImage(img.id, () => ({ qty: val }));
    };

    controls.append(widthObj.label, heightObj.label, qtyObj.label);
    card.appendChild(controls);

    const lockRow = document.createElement('div');
    lockRow.className = 'lock-row';
    lockCb.onchange = () => {
      updateImage(img.id, () => ({ lockProportion: lockCb.checked }));
    };
    lockRow.append(lockCb, textDiv('Bloquear proporción'));
    card.appendChild(lockRow);

    const btnRemoveBg = actionBtn('🤖 Quitar fondo (IA)', '#9333ea', async (btn) => {
              btn.disabled = true; btn.textContent = '⏳ Procesando...';
              try {
                // 1. Llamar al servicio mejorado (Backend + Auto-Crop Frontend)
                // Usar originalSrc para máxima calidad, fallback a src
                const result = await removeBackground(img.originalSrc || img.src);
                
                // 2. Calcular nuevas dimensiones físicas basadas en el recorte
                // Si se recortó el 20% de ancho, reducimos el ancho físico un 20% para mantener escala real.
                const newWidthCm = parseFloat((img.width * result.cropRatioX).toFixed(2));
                const newHeightCm = parseFloat((img.height * result.cropRatioY).toFixed(2));

                updateImage(img.id, () => ({
                  src: result.url,
                  originalSrc: result.url,
                  thumbSrc: null, // Invalidar miniaturas anteriores
                  previewSrc: null, 
                  originalWidth: result.width,
                  originalHeight: result.height,
                  aspectRatio: result.width / result.height,
                  width: newWidthCm,
                  height: newHeightCm,
                  // Si cambió drásticamente, quizás queramos desbloquear o mantener locked. 
                  // Mantendremos el estado de lock del usuario, pero con las nuevas dimensiones ya ajustadas.
                }));

                // 3. Re-renderizar
                renderCards(containerId, onAddToCanvas);

                // Liberar memoria de la imagen anterior si era un blob local (opcional, difícil de rastrear aquí sin gestión extra)
                // Pero registramos el revoke del nuevo para el futuro si fuera necesario.
                // Por ahora, el Garbage Collector se encargará eventualmente si no hay referencias.
                
              } catch (err) {
                alert('Error al procesar imagen: ' + err.message);
                console.error(err);
              } finally {
                // Si el botón sigue existiendo (re-render no ocurrió por error), restaurar estado
                if (document.body.contains(btn)) {
                  btn.disabled = false; 
                  btn.textContent = '🤖 Quitar fondo (IA)';
                }
              }
            });
    card.appendChild(btnRemoveBg);

    const btnAdd = actionBtn('Agregar al lienzo', '#00ccff', () => onAddToCanvas(img.id));
    const btnDelete = actionBtn('Eliminar tarjeta', '#cc0000', () => {
      if (!confirm('¿Eliminar imagen? Si está en uso en alguna hoja, permanecerá allí, pero desaparecerá de este panel.')) return;
      
      // Limpieza explícita de URLs para liberar memoria
      if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
      if (img.thumbSrc && img.thumbSrc.startsWith('blob:')) URL.revokeObjectURL(img.thumbSrc);
      if (img.previewSrc && img.previewSrc.startsWith('blob:') && img.previewSrc !== img.src) URL.revokeObjectURL(img.previewSrc);

      // Notificar al SheetsManager para liberar recursos si ya no se usan
      // (Opcional: SheetsManager podría tener un GC, pero por ahora liberamos lo que es obvio)
      // Nota: Si la imagen está en el canvas, SheetsManager.resourceMap la mantendrá viva.
      if (sheetsManager && sheetsManager.releaseImageResources) {
          sheetsManager.releaseImageResources(img.id);
      }

      // Liberar Blob de IndexedDB (Persistencia)
      if (projectManager && projectManager.deleteBlob) {
          projectManager.deleteBlob(img.id).catch(err => console.warn('Error deleting blob from DB:', err));
      }
      
      removeImage(img.id);
      renderCards(containerId, onAddToCanvas);
    });
    card.append(btnAdd, btnDelete);

    container.appendChild(card);
  });
}

function createInput(value, min, step, labelText) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = min;
  input.step = step;
  input.value = value;
  label.appendChild(input);
  return { label, input };
}

function textDiv(text) {
  const div = document.createElement('div');
  div.style.fontWeight = '800';
  div.style.color = 'var(--muted)';
  div.textContent = text;
  return div;
}

function actionBtn(text, bg, handler) {
  const btn = document.createElement('button');
  btn.className = 'btn-action';
  btn.style.backgroundColor = bg;
  btn.textContent = text;
  btn.onclick = () => handler(btn);
  return btn;
}
