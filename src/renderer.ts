import type { CropEngine } from './crop-engine';
import type { ResizeHandle, LumiCropOptions } from './types';

const HANDLE_SIZE = 12;
const R = "resize"
const RESIZE_CURSORS: Record<ResizeHandle, string> = {
    tl: `nwse-${R}`, tr: `nesw-${R}`,
    bl: `nesw-${R}`, br: `nwse-${R}`,
    t: `ns-${R}`, b: `ns-${R}`,
    l: `ew-${R}`, r: `ew-${R}`,
};

/**
 * Renderer: draws crop overlay on a Canvas 2D context.
 * Image preview is accomplished via CSS transform on an <img> element.
 *
 * Preview transform intentionally keeps image rigid (no shear) for UX:
 *   transformOrigin: top left
 *   base fit transform around image
 *   then crop-centered rotate/scale/flip
 */
export class Renderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private imageEl: HTMLImageElement;
    private dpr: number;
    private engine: CropEngine;
    private style?: LumiCropOptions['style'];

    constructor(
        canvas: HTMLCanvasElement,
        imageEl: HTMLImageElement,
        engine: CropEngine,
        dpr: number,
        style?: LumiCropOptions['style']
    ) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.imageEl = imageEl;
        this.engine = engine;
        this.dpr = dpr;
        this.style = style;

        this._setupCanvas();
    }

    private _setupCanvas(): void {
        const c = this.canvas;
        const dpr = this.dpr;
        c.width = c.offsetWidth * dpr;
        c.height = c.offsetHeight * dpr;
        this.ctx.scale(dpr, dpr);
    }

    resize(): void {
        this._setupCanvas();
        this.engine.setCanvasSize(this.canvas.offsetWidth, this.canvas.offsetHeight);
    }

    // ─── Main render ───

    render(): void {
        const c = this.canvas;
        const w = c.offsetWidth;
        const h = c.offsetHeight;
        const state = this.engine.getState();
        const t = state.transform;
        const zoom = this.engine.getFitZoom();

        this.ctx.clearRect(0, 0, w, h);

        // ─── Image positioning ───
        // Base image placement (fit & center on canvas).
        const imgW = state.imageWidth * zoom;
        const imgH = state.imageHeight * zoom;
        const imgX = w / 2 - imgW / 2;
        const imgY = h / 2 - imgH / 2;
        const flipX = t.flipH ? -1 : 1;
        const flipY = t.flipV ? -1 : 1;
        const imageCx = state.imageWidth / 2;
        const imageCy = state.imageHeight / 2;
        const offsetX = t.offsetX;
        const offsetY = t.offsetY;

        this.imageEl.style.position = 'absolute';
        this.imageEl.style.top = '0';
        this.imageEl.style.left = '0';
        this.imageEl.style.width = `${state.imageWidth}px`;
        this.imageEl.style.height = `${state.imageHeight}px`;
        this.imageEl.style.transformOrigin = 'top left';

        // Keep preview rigid (rotation+scale+flip only) to avoid visual skew.
        // Right-to-left:
        //   translate(-imageCenter) -> rotate(-rotation) -> scale(scale*flip) -> translate(imageCenter)
        //   then fit zoom and canvas placement.
        this.imageEl.style.transform = [
            `translate(${imgX}px, ${imgY}px)`,
            `scale(${zoom}, ${zoom})`,
            `translate(${offsetX}px, ${offsetY}px)`,
            `translate(${imageCx}px, ${imageCy}px)`,
            `scale(${t.scale * flipX}, ${t.scale * flipY})`,
            `rotate(${-t.rotation}deg)`,
            `translate(${-imageCx}px, ${-imageCy}px)`,
        ].join(' ');

        // ─── Crop overlay ───
        this._drawCropOverlay();
    }

    // ─── Overlay drawing ───

    private _drawCropOverlay(): void {
        const state = this.engine.getState();
        const box = state.cropBox;
        const c = this.canvas;
        const w = c.offsetWidth;
        const h = c.offsetHeight;

        // Use engine's coordinate conversion (properly uses canvas dimensions)
        const tl = this.engine.imageToScreenCoords(box.x, box.y);
        const br = this.engine.imageToScreenCoords(box.x + box.width, box.y + box.height);
        const boxW = br.x - tl.x;
        const boxH = br.y - tl.y;

        this.ctx.save();

        // Safe style defaults
        const s = this.style || {};
        const maskColor = s.maskColor || 'rgba(0, 0, 0, 0.5)';
        const cropBorderColor = s.cropBorderColor || '#ffffff';
        const cropBorderLineWidth = s.cropBorderLineWidth ?? 1;
        const gridColor = s.gridColor || 'rgba(255, 255, 255, 0.3)';
        const gridLineWidth = s.gridLineWidth ?? 1;
        const handleColor = s.handleColor || '#ffffff';
        const handleLineWidth = s.handleLineWidth ?? 4;
        const targetHandleLength = s.handleLength ?? 20;

        // Darkened mask outside crop box
        this.ctx.fillStyle = maskColor;
        this.ctx.fillRect(0, 0, w, tl.y);
        this.ctx.fillRect(0, br.y, w, h - br.y);
        this.ctx.fillRect(0, tl.y, tl.x, boxH);
        this.ctx.fillRect(br.x, tl.y, w - br.x, boxH);

        // Crop border
        this.ctx.strokeStyle = cropBorderColor;
        this.ctx.lineWidth = cropBorderLineWidth;
        this.ctx.strokeRect(tl.x, tl.y, boxW, boxH);

        // Rule of thirds grid
        this.ctx.strokeStyle = gridColor;
        this.ctx.lineWidth = gridLineWidth;
        this.ctx.beginPath();
        this.ctx.moveTo(tl.x + boxW / 3, tl.y);
        this.ctx.lineTo(tl.x + boxW / 3, br.y);
        this.ctx.moveTo(tl.x + (boxW * 2) / 3, tl.y);
        this.ctx.lineTo(tl.x + (boxW * 2) / 3, br.y);
        this.ctx.moveTo(tl.x, tl.y + boxH / 3);
        this.ctx.lineTo(br.x, tl.y + boxH / 3);
        this.ctx.moveTo(tl.x, tl.y + (boxH * 2) / 3);
        this.ctx.lineTo(br.x, tl.y + (boxH * 2) / 3);
        this.ctx.stroke();

        // Resize handles (L-shaped corners & straight edges)
        const hl = targetHandleLength; // Handle length

        this.ctx.beginPath();
        // Top-Left
        this.ctx.moveTo(tl.x, tl.y + hl);
        this.ctx.lineTo(tl.x, tl.y);
        this.ctx.lineTo(tl.x + hl, tl.y);
        // Top-Right
        this.ctx.moveTo(br.x - hl, tl.y);
        this.ctx.lineTo(br.x, tl.y);
        this.ctx.lineTo(br.x, tl.y + hl);
        // Bottom-Right
        this.ctx.moveTo(br.x, br.y - hl);
        this.ctx.lineTo(br.x, br.y);
        this.ctx.lineTo(br.x - hl, br.y);
        // Bottom-Left
        this.ctx.moveTo(tl.x + hl, br.y);
        this.ctx.lineTo(tl.x, br.y);
        this.ctx.lineTo(tl.x, br.y - hl);

        // Edges
        const cx = tl.x + boxW / 2;
        const cy = tl.y + boxH / 2;
        this.ctx.moveTo(cx - hl / 2, tl.y);
        this.ctx.lineTo(cx + hl / 2, tl.y);
        this.ctx.moveTo(cx - hl / 2, br.y);
        this.ctx.lineTo(cx + hl / 2, br.y);
        this.ctx.moveTo(tl.x, cy - hl / 2);
        this.ctx.lineTo(tl.x, cy + hl / 2);
        this.ctx.moveTo(br.x, cy - hl / 2);
        this.ctx.lineTo(br.x, cy + hl / 2);

        this.ctx.strokeStyle = handleColor;
        this.ctx.lineWidth = handleLineWidth;
        this.ctx.stroke();

        this.ctx.restore();
    }

    // ─── Cursor ───

    updateCursor(screenX: number, screenY: number): void {
        const handle = this.engine.getResizeHandleAt(screenX, screenY);
        if (handle) {
            this.canvas.style.cursor = RESIZE_CURSORS[handle];
        } else if (this.engine.isInsideCropBoxAt(screenX, screenY)) {
            this.canvas.style.cursor = 'move';
        } else {
            this.canvas.style.cursor = 'default';
        }
    }

    destroy(): void {
        this.imageEl.style.transform = '';
        this.imageEl.style.position = '';
    }
}
