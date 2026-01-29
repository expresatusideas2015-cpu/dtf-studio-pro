
/**
 * Wrapper reutilizable que acepta Blob o URL.
 * Cumple con el requerimiento de "autoCropTransparentImage(imageBlob | imageUrl)"
 * @param {Blob|string} input - Blob de imagen o URL
 * @returns {Promise<Object>} Resultado del recorte
 */
export async function autoCropTransparentImage(input) {
  let tempUrl = null;
  let src = input;

  // Si es Blob, crear URL temporal
  if (input instanceof Blob) {
    tempUrl = URL.createObjectURL(input);
    src = tempUrl;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    
    img.onload = async () => {
      try {
        const result = await autoCropImage(img);
        
        // Si se generó una nueva URL (recorte exitoso) y teníamos una temporal de entrada,
        // la temporal ya no se necesita para la imagen final, pero...
        // Si NO hubo recorte, result.url es igual a src (tempUrl).
        // El caller es responsable de gestionar el ciclo de vida, 
        // pero aquí podemos limpiar si creamos una intermedia que no se usó.
        
        // Estrategia: Devolver siempre una estructura limpia.
        // Si hubo recorte: result.url es nueva. tempUrl se puede revocar.
        // Si NO hubo recorte: result.url es tempUrl. NO revocar.
        
        if (tempUrl && result.url !== tempUrl) {
          URL.revokeObjectURL(tempUrl);
        }

        resolve(result);
      } catch (err) {
        if (tempUrl) URL.revokeObjectURL(tempUrl);
        reject(err);
      }
    };

    img.onerror = (err) => {
      if (tempUrl) URL.revokeObjectURL(tempUrl);
      reject(new Error('Error al cargar imagen para auto-crop'));
    };

    img.src = src;
  });
}

/**
 * Analiza una imagen y recorta los bordes transparentes sobrantes.
 * @param {HTMLImageElement} imgElement - La imagen cargada.
 * @returns {Object} { blob, url, width, height, cropRatioX, cropRatioY }
 * cropRatioX: Nuevo ancho / Ancho original (para ajustar cm)
 * cropRatioY: Nuevo alto / Alto original (para ajustar cm)
 */
export function autoCropImage(imgElement) {
  const canvas = document.createElement('canvas');
  const w = imgElement.naturalWidth;
  const h = imgElement.naturalHeight;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imgElement, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let top = null, bottom = null, left = null, right = null;

  // Escanear píxeles para encontrar límites
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 10) { // Umbral de transparencia (0-255)
        if (top === null) top = y;
        bottom = y;
        if (left === null || x < left) left = x;
        if (right === null || x > right) right = x;
      }
    }
  }

  // Si la imagen es totalmente transparente o vacía
  if (top === null) {
    return {
      blob: null,
      url: imgElement.src, // Retorna original
      width: w,
      height: h,
      cropRatioX: 1,
      cropRatioY: 1,
      isEmpty: true
    };
  }

  // Ajustar canvas al contenido real
  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  
  const cropCtx = cropCanvas.getContext('2d');
  cropCtx.drawImage(imgElement, left, top, cropW, cropH, 0, 0, cropW, cropH);

  return new Promise(resolve => {
    cropCanvas.toBlob(blob => {
       const url = URL.createObjectURL(blob);
       resolve({
         blob,
         url,
         width: cropW,
         height: cropH,
         cropRatioX: cropW / w,
         cropRatioY: cropH / h,
         isEmpty: false
       });
    }, 'image/png');
  });
}

/**
 * Redimensiona una imagen manteniendo aspecto.
 * @param {HTMLImageElement} imgElement 
 * @param {number} maxWidth 
 * @param {number} maxHeight 
 * @returns {Promise<string>} Blob URL de la imagen redimensionada (WebP 0.8)
 */
export function resizeImage(imgElement, maxWidth, maxHeight) {
  return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      let { width, height } = imgElement;
      
      if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgElement, 0, 0, width, height);
      
      // Async Blob generation for memory efficiency
      canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          resolve(url);
      }, 'image/webp', 0.8);
  });
}
