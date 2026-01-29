export const PX_CM = 10;
export const CANVAS_WIDTH_CM = 58;
export const CANVAS_WIDTH_PX = CANVAS_WIDTH_CM * PX_CM;
export const MAX_HEIGHT_CM = 200;
export const MAX_HEIGHT_PX = MAX_HEIGHT_CM * PX_CM;
export const DEFAULT_CANVAS_H_CM = 50;
export const MARGIN_PX = 5;
export const MAX_HISTORY = 50;
export const MIN_SCALE = 0.05;
export const SNAP_TOLERANCE = 8; // px
export const GUIDE_COLOR = '#ff00ff';


// Configuración de optimización de imágenes
export const MAX_IMAGE_WIDTH = 3000; // px
export const MAX_IMAGE_HEIGHT = 3000; // px
export const COMPRESSION_QUALITY = 0.85; // 0.0 - 1.0
export const OUTPUT_FORMAT = 'image/webp';
export const MAX_FILE_SIZE_MB = 50;

// Límites Seguros de Producto (Fase 1.4)
export const MAX_SHEETS = 20; // Límite razonable para navegador
export const MAX_OBJS_PER_SHEET = 100; // Evitar crash de renderizado
export const WARN_OBJS_PER_SHEET = 80; // Advertencia previa
export const MAX_TOTAL_OBJS = 500; // Protección global (opcional)

// Ajusta este endpoint a tu dominio si corresponde
// NOTA: Para desarrollo local sin servidor PHP, usaremos la API directa.
// En producción, usa tu endpoint PHP para proteger la API Key.
export const REMOVE_BG_ENDPOINT = 'https://expresatusideas.com/remove-background.php';
export const PHOTOROOM_API_KEY = 'sk_pr_expresatusideas_7e9f14aa7128eca2ca5e592f8790fde26ac7f74d';
export const USE_DIRECT_API = true; // Set to false to use PHP backend
