import { REMOVE_BG_ENDPOINT, PHOTOROOM_API_KEY, USE_DIRECT_API } from '../config/constants.js';
import { autoCropTransparentImage } from './imageUtils.js';

export async function removeBackground(input) {
  // 1. Obtener Blob de la imagen original
  let blob;
  if (input instanceof Blob) {
      blob = input;
  } else {
      const res = await fetch(input);
      blob = await res.blob();
  }

  const formData = new FormData();
  // La API de Photoroom requiere 'image_file'
  formData.append('image_file', blob, 'image.png');
  // Nuestro backend PHP espera 'image'
  formData.append('image', blob, 'image.png'); 

  let response;

  if (USE_DIRECT_API) {
    // LLAMADA DIRECTA (CLIENT-SIDE)
    // Útil para localhost donde no hay PHP o CORS falla en el remoto
    response = await fetch('https://sdk.photoroom.com/v1/segment', {
      method: 'POST',
      headers: {
        'x-api-key': PHOTOROOM_API_KEY
      },
      body: formData
    });
  } else {
    // LLAMADA VIA PROXY PHP
    // Recomendado para producción
    response = await fetch(REMOVE_BG_ENDPOINT, { method: 'POST', body: formData });
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Fallo en eliminación de fondo (${response.status}): ${errText}`);
  }

  const resultBlob = await response.blob();
  
  // 2. Procesar la imagen devuelta para recortar bordes transparentes (Auto-Crop)
  // Usamos la nueva función reutilizable
  
  try {
    const cropped = await autoCropTransparentImage(resultBlob);
    
    // Retornamos estructura completa para que el consumidor pueda ajustar medidas
    return {
      url: cropped.url,
      width: cropped.width,
      height: cropped.height,
      cropRatioX: cropped.cropRatioX,
      cropRatioY: cropped.cropRatioY,
      revoke: () => URL.revokeObjectURL(cropped.url)
    };
  } catch (err) {
    throw new Error('Error al procesar el recorte automático: ' + err.message);
  }
}