import { MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT, COMPRESSION_QUALITY, OUTPUT_FORMAT } from '../config/constants.js';

/**
 * Optimiza una imagen redimensionándola y comprimiéndola.
 * @param {File} file - El archivo de imagen original.
 * @returns {Promise<{blob: Blob, url: string, width: number, height: number, originalSize: number, newSize: number}>}
 */
export async function optimizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let { width, height } = img;
      
      // Calcular nuevas dimensiones manteniendo aspecto
      if (width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
        const ratio = Math.min(MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      // Mejora de calidad de escalado
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convertir a blob comprimido (preferiblemente WebP)
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Error al comprimir la imagen'));
          return;
        }
        
        const optimizedUrl = URL.createObjectURL(blob);
        resolve({
          blob,
          url: optimizedUrl,
          width,
          height,
          originalSize: file.size,
          newSize: blob.size,
          fileName: file.name.replace(/\.[^/.]+$/, "") + ".webp" // Cambiar extensión
        });
      }, OUTPUT_FORMAT, COMPRESSION_QUALITY);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo cargar la imagen para optimizar'));
    };
    
    img.src = url;
  });
}
