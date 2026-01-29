import { PX_CM, CANVAS_WIDTH_PX } from '../config/constants.js';
import { guidesManager } from './guidesManager.js';

let isProduction = false;
let canvasRef = null;

export const productionMode = {
  init(canvas) {
    canvasRef = canvas;
    guidesManager.init(canvas); // Init guides system
    
    const toggle = document.getElementById('prod-mode-toggle');
    if (toggle) {
        toggle.addEventListener('change', (e) => {
            this.setMode(e.target.checked);
        });
    }

    // Bind validation on object move
    canvas.on('object:modified', () => {
        if (isProduction) this.validateObject(canvas.getActiveObject());
    });
  },

  setMode(enabled) {
    isProduction = enabled;
    document.body.classList.toggle('prod-mode-active', enabled);
    
    if (enabled) {
        // Enable strict snapping & smart guides
        guidesManager.enable();
        
        // Initial validation
        this.validateAll();
        alert('MODO PRODUCCIÓN ACTIVADO:\n- Guías Inteligentes (Smart Guides).\n- Snap Magnético a bordes y objetos.\n- Bloqueo total de salida del lienzo.');
    } else {
        guidesManager.disable();
    }
  },

  isProduction() {
    return isProduction;
  },

  validateAll() {
    if (!canvasRef) return true;
    let hasErrors = false;
    canvasRef.getObjects().forEach(obj => {
        if (!this.validateObject(obj)) hasErrors = true;
    });
    return !hasErrors;
  },

  validateObject(obj) {
    if (!obj) return true;
    obj.setCoords();
    const br = obj.getBoundingRect(true, true);
    
    // Check if fully inside canvas
    // Allow small margin of error (1px)
    const margin = 1;
    const isOut = (
        br.left < -margin || 
        br.top < -margin || 
        (br.left + br.width) > (canvasRef.width + margin) ||
        (br.top + br.height) > (canvasRef.height + margin)
    );

    if (isOut) {
        // Visual error indication
        obj.set('stroke', 'red');
        obj.set('strokeWidth', 5);
        obj.set('strokeDashArray', [5, 5]);
    } else {
        // Clear error
        obj.set('stroke', null);
        obj.set('strokeWidth', 0);
        obj.set('strokeDashArray', null);
    }
    
    canvasRef.requestRenderAll();
    return !isOut;
  },

  // Hook for export validation
  canExport() {
      if (isProduction) {
          if (!this.validateAll()) {
              alert('ERROR DE PRODUCCIÓN:\nHay objetos fuera del área de impresión.\nCorrígelos (bordes rojos) antes de exportar.');
              return false;
          }
      }
      return true;
  }
};
