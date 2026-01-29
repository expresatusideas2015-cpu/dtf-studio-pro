import { getState } from '../core/state.js';

let canvasRef = null;
let container = null;

export const layersPanel = {
  init(canvas) {
    canvasRef = canvas;
    container = document.getElementById('layers-container');
    
    // Force visibility styles
    if (container) {
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '4px';
      container.style.flex = '1';
      container.style.overflowY = 'auto';
      container.style.minHeight = '150px';
      container.style.backgroundColor = '#0a0a0a'; // Contrast background
    }

    this.render();

    // Bind events
    canvas.on('object:added', () => this.render());
    canvas.on('object:removed', () => this.render());
    canvas.on('object:modified', () => this.render());
    canvas.on('selection:created', () => this.updateSelection());
    canvas.on('selection:updated', () => this.updateSelection());
    canvas.on('selection:cleared', () => this.updateSelection());
    // Handle full clear
    canvas.on('canvas:cleared', () => this.render());
    // Handle bulk load (restore)
    canvas.on('canvas:content-loaded', () => this.render());

    
    // Custom event for reordering
    canvas.on('layer:reordered', () => this.render());
  },

  render() {
    if (!container || !canvasRef) return;
    
    container.innerHTML = '';
    // Get objects and reverse to show top layer first
    const objects = [...canvasRef.getObjects()].reverse();

    if (objects.length === 0) {
      container.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">Lienzo vacío</div>';
      return;
    }

    objects.forEach((obj, index) => {
      // Index in original array is (length - 1 - index)
      const originalIndex = objects.length - 1 - index;
      
      const el = document.createElement('div');
      el.className = 'layer-item';
      if (canvasRef.getActiveObjects().includes(obj)) {
        el.classList.add('active');
      }
      
      el.onclick = (e) => {
        if (e.target.closest('.layer-btn')) return; // Ignore button clicks
        canvasRef.discardActiveObject();
        canvasRef.setActiveObject(obj);
        canvasRef.requestRenderAll();
      };

      // Thumbnail
      const thumb = document.createElement('img');
      thumb.className = 'layer-thumb';
      // Use a placeholder or the object's source if it's an image
      thumb.src = obj.type === 'image' && obj.getSrc ? obj.getSrc() : ''; 
      if (!thumb.src) thumb.style.display = 'none';

      // Name
      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = obj.type === 'image' ? `Img ${originalIndex + 1}` : `Objeto ${originalIndex + 1}`;
      name.ondblclick = () => {
         const newName = prompt('Renombrar capa:', name.textContent);
         if (newName) {
             obj.name = newName; // Store custom name in fabric object
             name.textContent = newName;
         }
      };
      if (obj.name) name.textContent = obj.name;

      // Actions
      const actions = document.createElement('div');
      actions.className = 'layer-actions';

      // Visible Toggle
      const visBtn = document.createElement('button');
      visBtn.className = `layer-btn ${obj.visible ? 'active' : ''}`;
      visBtn.innerHTML = obj.visible ? '👁️' : '🚫';
      visBtn.title = obj.visible ? 'Ocultar' : 'Mostrar';
      visBtn.onclick = () => {
        obj.visible = !obj.visible;
        if (!obj.visible) canvasRef.discardActiveObject(obj);
        canvasRef.requestRenderAll();
        this.render();
      };

      // Lock Toggle
      const lockBtn = document.createElement('button');
      const isLocked = obj.lockMovementX; // Simple check
      lockBtn.className = `layer-btn ${isLocked ? 'active' : ''}`;
      lockBtn.innerHTML = isLocked ? '🔒' : '🔓';
      lockBtn.title = isLocked ? 'Desbloquear' : 'Bloquear';
      lockBtn.onclick = () => {
        const val = !isLocked;
        obj.set({
            lockMovementX: val,
            lockMovementY: val,
            lockRotation: val,
            lockScalingX: val,
            lockScalingY: val,
            selectable: !val,
            evented: !val // Fully ignore if locked? Or just non-editable?
            // If evented=false, we can't select it on canvas, only from layers panel.
            // Let's keep selectable=false so we can select from panel but not drag.
        });
        obj.hoverCursor = val ? 'default' : 'move';
        canvasRef.requestRenderAll();
        this.render();
      };

      // Up/Down
      const upBtn = document.createElement('button');
      upBtn.className = 'layer-btn';
      upBtn.innerHTML = '⬆️';
      upBtn.title = 'Subir capa';
      upBtn.onclick = (e) => {
         e.stopPropagation();
         obj.bringForward();
         canvasRef.fire('layer:reordered');
         canvasRef.requestRenderAll();
      };

      const downBtn = document.createElement('button');
      downBtn.className = 'layer-btn';
      downBtn.innerHTML = '⬇️';
      downBtn.title = 'Bajar capa';
      downBtn.onclick = (e) => {
         e.stopPropagation();
         obj.sendBackwards();
         canvasRef.fire('layer:reordered');
         canvasRef.requestRenderAll();
      };

      actions.append(visBtn, lockBtn, upBtn, downBtn);
      el.append(thumb, name, actions);
      container.appendChild(el);
    });
  },

  updateSelection() {
    // Just re-render to update 'active' class
    // Optimization: toggle class directly instead of full re-render
    if (!container || !canvasRef) return;
    const items = container.querySelectorAll('.layer-item');
    const objects = [...canvasRef.getObjects()].reverse();
    const activeObjects = canvasRef.getActiveObjects();

    items.forEach((item, index) => {
      const obj = objects[index];
      if (activeObjects.includes(obj)) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }
};
