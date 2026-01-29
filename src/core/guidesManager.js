import { SNAP_TOLERANCE, GUIDE_COLOR, CANVAS_WIDTH_PX, MAX_HEIGHT_PX } from '../config/constants.js';

let canvasRef = null;
let isEnabled = false;
let activeGuides = []; // Stores { type: 'v'|'h', pos: number }

export const guidesManager = {
  init(canvas) {
    canvasRef = canvas;
    this.clearGuides();
  },

  enable() {
    if (isEnabled) return;
    isEnabled = true;
    if (canvasRef) {
      canvasRef.on('object:moving', this.handleObjectMoving);
      canvasRef.on('object:scaling', this.handleObjectMoving);
      canvasRef.on('before:render', this.clearGuides); // Clear before render starts
      canvasRef.on('after:render', this.drawGuides);   // Draw after render finishes
      canvasRef.on('mouse:up', this.clearGuidesAndRender);
    }
  },

  disable() {
    if (!isEnabled) return;
    isEnabled = false;
    this.clearGuides();
    if (canvasRef) {
      canvasRef.off('object:moving', this.handleObjectMoving);
      canvasRef.off('object:scaling', this.handleObjectMoving);
      canvasRef.off('before:render', this.clearGuides);
      canvasRef.off('after:render', this.drawGuides);
      canvasRef.off('mouse:up', this.clearGuidesAndRender);
      canvasRef.requestRenderAll();
    }
  },

  handleObjectMoving: (e) => {
    if (!isEnabled || !canvasRef) return;
    
    const obj = e.target;
    // Clear previous guides for this frame calculation (though before:render does it too, we need clean state for snap logic)
    activeGuides = [];

    // Snapping logic
    guidesManager.snapObject(obj);
    
    // Hard Limit (Clamp)
    guidesManager.enforceHardLimit(obj);
  },

  snapObject(obj) {
    const snapDist = SNAP_TOLERANCE / canvasRef.getZoom(); // Adjust tolerance by zoom for consistent feel
    const canvasW = canvasRef.width; // This is virtual width? No, fabric canvas.width is pixel width.
    // Wait, canvas.width is usually screen pixels?
    // In this project, canvas.width is fixed 58cm * 10px = 580px.
    // So coordinate space is 1:1 with pixels.
    
    const objBr = obj.getBoundingRect(true, true);
    
    const objEdges = {
        left: objBr.left,
        hCenter: objBr.left + objBr.width / 2,
        right: objBr.left + objBr.width,
        top: objBr.top,
        vCenter: objBr.top + objBr.height / 2,
        bottom: objBr.top + objBr.height
    };

    // Targets: Canvas
    // Use canvas.width directly as it matches CANVAS_WIDTH_PX in this setup
    const targets = [
        { type: 'canvas', x: 0 },
        { type: 'canvas', x: CANVAS_WIDTH_PX / 2 },
        { type: 'canvas', x: CANVAS_WIDTH_PX },
        { type: 'canvas', y: 0 },
        // { type: 'canvas', y: MAX_HEIGHT_PX / 2 }, // Maybe too many lines?
        // { type: 'canvas', y: MAX_HEIGHT_PX }
    ];

    // Targets: Other Objects
    canvasRef.getObjects().forEach(o => {
        if (o === obj || !o.visible) return;
        const br = o.getBoundingRect(true, true);
        targets.push(
            { type: 'object', x: br.left },
            { type: 'object', x: br.left + br.width / 2 },
            { type: 'object', x: br.left + br.width },
            { type: 'object', y: br.top },
            { type: 'object', y: br.top + br.height / 2 },
            { type: 'object', y: br.top + br.height }
        );
    });

    let snappedX = false;
    let snappedY = false;
    let dx = 0;
    let dy = 0;

    const checkSnap = (current, target) => Math.abs(current - target) <= snapDist;

    // --- HORIZONTAL SNAP (Vertical Lines) ---
    for (const t of targets) {
        if (t.x === undefined) continue;
        
        // Prioritize Center -> Left -> Right
        if (checkSnap(objEdges.hCenter, t.x)) {
            dx = t.x - objEdges.hCenter;
            snappedX = true;
            activeGuides.push({ type: 'v', pos: t.x });
            break; 
        }
        if (checkSnap(objEdges.left, t.x)) {
            dx = t.x - objEdges.left;
            snappedX = true;
            activeGuides.push({ type: 'v', pos: t.x });
            break;
        }
        if (checkSnap(objEdges.right, t.x)) {
            dx = t.x - objEdges.right;
            snappedX = true;
            activeGuides.push({ type: 'v', pos: t.x });
            break;
        }
    }

    // --- VERTICAL SNAP (Horizontal Lines) ---
    for (const t of targets) {
        if (t.y === undefined) continue;

        if (checkSnap(objEdges.vCenter, t.y)) {
            dy = t.y - objEdges.vCenter;
            snappedY = true;
            activeGuides.push({ type: 'h', pos: t.y });
            break;
        }
        if (checkSnap(objEdges.top, t.y)) {
            dy = t.y - objEdges.top;
            snappedY = true;
            activeGuides.push({ type: 'h', pos: t.y });
            break;
        }
        if (checkSnap(objEdges.bottom, t.y)) {
            dy = t.y - objEdges.bottom;
            snappedY = true;
            activeGuides.push({ type: 'h', pos: t.y });
            break;
        }
    }

    if (snappedX || snappedY) {
        obj.set({
            left: obj.left + dx,
            top: obj.top + dy
        });
        obj.setCoords();
    }
  },

  enforceHardLimit(obj) {
    const br = obj.getBoundingRect(true, true);
    let dx = 0;
    let dy = 0;
    const maxX = CANVAS_WIDTH_PX;
    
    // Strict clamp to 0-maxX and 0-MAX_HEIGHT_PX
    if (br.left < 0) dx = -br.left;
    if (br.left + br.width > maxX) dx = maxX - (br.left + br.width);
    if (br.top < 0) dy = -br.top;
    if (br.top + br.height > MAX_HEIGHT_PX) dy = MAX_HEIGHT_PX - (br.top + br.height);

    if (dx || dy) {
        obj.set({
            left: obj.left + dx,
            top: obj.top + dy
        });
        obj.setCoords();
    }
  },

  clearGuides() {
    activeGuides = [];
  },

  clearGuidesAndRender() {
    activeGuides = [];
    if (canvasRef) canvasRef.requestRenderAll();
  },

  drawGuides() {
    if (!isEnabled || !activeGuides.length || !canvasRef) return;
    
    const ctx = canvasRef.getContext();
    const vpt = canvasRef.viewportTransform;
    
    ctx.save();
    // Apply canvas transform so we can draw in scene coordinates
    ctx.transform(...vpt);
    
    ctx.lineWidth = 1 / canvasRef.getZoom(); // Keep line width constant 1px on screen? Or 1px in scene? 
    // Usually we want 1px on screen. So lineWidth = 1 / zoom.
    // If zoom is 2, 1 scene unit = 2 screen pixels. We want 1 screen pixel => 0.5 scene units.
    
    ctx.strokeStyle = GUIDE_COLOR;
    ctx.setLineDash([4 / canvasRef.getZoom(), 4 / canvasRef.getZoom()]); // Scale dash too
    ctx.beginPath();

    // Calculate visible bounds to draw lines only within view (optional optimization)
    // For now draw full length.
    
    // We need to draw across the whole canvas height/width
    // Since we are in scene coords, we can use 0 to MAX_HEIGHT_PX etc.
    const height = Math.max(canvasRef.height, MAX_HEIGHT_PX); // Ensure we cover expanded canvas
    const width = CANVAS_WIDTH_PX;

    activeGuides.forEach(g => {
        if (g.type === 'v') {
            ctx.moveTo(g.pos, 0);
            ctx.lineTo(g.pos, height);
        } else {
            ctx.moveTo(0, g.pos);
            ctx.lineTo(width, g.pos);
        }
    });

    ctx.stroke();
    ctx.restore();
  }
};

// Bind methods that are passed as callbacks
guidesManager.handleObjectMoving = guidesManager.handleObjectMoving.bind(guidesManager);
guidesManager.clearGuides = guidesManager.clearGuides.bind(guidesManager);
guidesManager.drawGuides = guidesManager.drawGuides.bind(guidesManager);
guidesManager.clearGuidesAndRender = guidesManager.clearGuidesAndRender.bind(guidesManager);
