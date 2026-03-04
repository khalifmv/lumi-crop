import type { CropBox, CropState, ResizeHandle, Transform } from './types';
import { clampOffsetToBounds, computeMinCoverScale, computeMinScaleForOffset } from './geometry-utils';
import { screenToImage, imageToScreen } from './coord-utils';

const MIN_BOX_SIZE = 50;
const DEFAULT_VIEWPORT_PADDING = 24;

export interface EngineAnimationSnapshot {
    cropBox: CropBox;
    transform: Transform;
    userZoom: number;
}

/**
 * Core crop engine. Manages crop box, transform state, and interaction logic.
 * Ported from Lumiviu Preview Engine. Canvas dimensions must be provided for coordinate conversion.
 */
export class CropEngine {
    private state: CropState;
    /** Canvas CSS dimensions (not pixel buffer size) */
    private canvasW = 0;
    private canvasH = 0;
    private canvasPadding = DEFAULT_VIEWPORT_PADDING;
    /** Fit zoom — scale factor to fit image in canvas */
    private fitZoom = 1;
    /** User-requested zoom. Final transform.scale = max(requiredMinScale, userZoom). */
    private userZoom = 1;
    /** Transform offset snapshot while dragging image under crop frame. */
    private dragOffsetStartX = 0;
    private dragOffsetStartY = 0;

    constructor(imageWidth: number, imageHeight: number, aspectRatio?: number | null) {
        this.state = {
            imageWidth,
            imageHeight,
            cropBox: { x: 0, y: 0, width: imageWidth, height: imageHeight },
            transform: { rotation: 0, scale: 1, offsetX: 0, offsetY: 0, flipH: false, flipV: false },
            aspectRatio: aspectRatio ?? null,
            isDraggingBox: false,
            isResizing: false,
            resizeHandle: null,
            dragStart: { x: 0, y: 0 },
            boxStart: null,
        };

        if (aspectRatio) {
            this._adjustCropBoxToRatio(aspectRatio);
        }
    }

    // ─── Canvas dimensions ───

    /** Must be called whenever the canvas resizes or on init */
    setCanvasSize(w: number, h: number, margin = DEFAULT_VIEWPORT_PADDING): void {
        this.canvasW = w;
        this.canvasH = h;
        this.canvasPadding = Math.max(0, margin);
        // Recompute fit zoom
        const innerW = Math.max(1, w - this.canvasPadding * 2);
        const innerH = Math.max(1, h - this.canvasPadding * 2);
        if (this.state.imageWidth <= innerW && this.state.imageHeight <= innerH) {
            this.fitZoom = 1;
        } else {
            this.fitZoom = Math.min(innerW / this.state.imageWidth, innerH / this.state.imageHeight);
        }
    }

    getFitZoom(): number {
        return this.fitZoom;
    }

    getCanvasSize(): { w: number; h: number } {
        return { w: this.canvasW, h: this.canvasH };
    }

    // ─── Public getters ──────

    getState(): Readonly<CropState> {
        return this.state;
    }

    getCropBox(): CropBox {
        return { ...this.state.cropBox };
    }

    getTransform(): Transform {
        return { ...this.state.transform };
    }

    getZoom(): number {
        return this.state.transform.scale;
    }

    getAnimationSnapshot(): EngineAnimationSnapshot {
        return {
            cropBox: { ...this.state.cropBox },
            transform: { ...this.state.transform },
            userZoom: this.userZoom,
        };
    }

    setAnimationSnapshot(snapshot: EngineAnimationSnapshot, clampOffset = false): void {
        this.state.cropBox = { ...snapshot.cropBox };
        this.state.transform = { ...snapshot.transform };
        this.userZoom = Math.max(1, snapshot.userZoom);
        if (clampOffset) {
            this._clampOffsetToBounds();
        }
    }

    // ─── Crop Box API ────

    setCropBox(box: CropBox): void {
        const bounds = this._getViewportBounds();
        const minW = Math.min(MIN_BOX_SIZE, Math.max(1, bounds.width));
        const minH = Math.min(MIN_BOX_SIZE, Math.max(1, bounds.height));
        const maxW = Math.max(minW, bounds.width);
        const maxH = Math.max(minH, bounds.height);
        const w = Math.max(minW, Math.min(box.width, maxW));
        const h = Math.max(minH, Math.min(box.height, maxH));
        this.state.cropBox = {
            x: Math.max(bounds.minX, Math.min(box.x, bounds.maxX - w)),
            y: Math.max(bounds.minY, Math.min(box.y, bounds.maxY - h)),
            width: w,
            height: h,
        };
        this._syncScaleAndOffset();
    }

    setAspectRatio(ratio: number | null): void {
        this.state.aspectRatio = ratio;
        if (ratio !== null) {
            this._adjustCropBoxToRatio(ratio);
            this._syncScaleAndOffset();
        }
    }

    /**
     * Fit crop box to visible viewport bounds and center it.
     * If aspect ratio is unlocked, preserve the current crop box ratio.
     * Keeps the previous crop focus (offset) and scales zoom proportionally
     * so visual content remains anchored to the user's last selected area.
     */
    fitCropBoxToViewport(): void {
        const { transform } = this.state;
        const prevBox = { ...this.state.cropBox };
        const prevScale = transform.scale;
        const prevOffsetX = transform.offsetX;
        const prevOffsetY = transform.offsetY;
        const bounds = this._getViewportBounds();
        const minW = Math.min(MIN_BOX_SIZE, Math.max(1, bounds.width));
        const minH = Math.min(MIN_BOX_SIZE, Math.max(1, bounds.height));

        const currentRatio = this.state.cropBox.width / Math.max(1e-6, this.state.cropBox.height);
        const lockedRatio = this.state.aspectRatio;
        const ratio = (lockedRatio !== null && Number.isFinite(lockedRatio) && lockedRatio > 0)
            ? lockedRatio
            : Math.max(1e-6, currentRatio);

        let width = bounds.width;
        let height = width / ratio;
        if (height > bounds.height) {
            height = bounds.height;
            width = height * ratio;
        }
        if (width > bounds.width) {
            width = bounds.width;
            height = width / ratio;
        }

        width = Math.max(minW, Math.min(width, bounds.width));
        height = Math.max(minH, Math.min(height, bounds.height));

        this.state.cropBox = {
            x: bounds.minX + (bounds.width - width) / 2,
            y: bounds.minY + (bounds.height - height) / 2,
            width,
            height,
        };

        // Preserve prior crop content when box is uniformly scaled to viewport fit.
        // For equal aspect ratio this mapping is exact.
        const scaleFactorX = width / Math.max(1e-6, prevBox.width);
        const scaleFactorY = height / Math.max(1e-6, prevBox.height);
        const uniformScale = (scaleFactorX + scaleFactorY) * 0.5;
        const baseScale = Math.max(1, prevScale * Math.max(1e-6, uniformScale));

        const cx = this.state.imageWidth / 2;
        const cy = this.state.imageHeight / 2;

        const offsetFromScale = (scale: number) => {
            const sf = scale / Math.max(1e-6, prevScale);
            return {
                x: this.state.cropBox.x - cx - sf * (prevBox.x - prevOffsetX - cx),
                y: this.state.cropBox.y - cy - sf * (prevBox.y - prevOffsetY - cy),
            };
        };

        // Solve scale-offset dependency so mapped focus does not get clamped afterwards.
        let solvedScale = baseScale;
        for (let i = 0; i < 4; i++) {
            const candidateOffset = offsetFromScale(solvedScale);
            const need = this._computeMinScaleForOffset(
                this.state.cropBox,
                candidateOffset.x,
                candidateOffset.y
            );
            if (need <= solvedScale + 1e-6) {
                break;
            }
            solvedScale = need;
        }

        const finalOffset = offsetFromScale(solvedScale);
        this.userZoom = solvedScale;
        this.state.transform.offsetX = finalOffset.x;
        this.state.transform.offsetY = finalOffset.y;

        this._syncScaleAndOffset();
    }

    // ─── Transform API ───

    rotate90(clockwise = true): void {
        const delta = clockwise ? 90 : -90;
        this.state.transform.rotation = ((this.state.transform.rotation + delta) % 360 + 360) % 360;
        this._syncScaleAndOffset();
        this._clampCropBoxToBounds();
        this._syncScaleAndOffset();
    }

    setRotation(degrees: number): void {
        this.state.transform.rotation = ((degrees % 360) + 360) % 360;
        this._syncScaleAndOffset();
        this._clampCropBoxToBounds();
        this._syncScaleAndOffset();
    }

    flipH(): void {
        this.state.transform.flipH = !this.state.transform.flipH;
        this._syncScaleAndOffset();
        this._clampCropBoxToBounds();
        this._syncScaleAndOffset();
    }

    flipV(): void {
        this.state.transform.flipV = !this.state.transform.flipV;
        this._syncScaleAndOffset();
        this._clampCropBoxToBounds();
        this._syncScaleAndOffset();
    }

    setZoom(scale: number): void {
        const box = this.state.cropBox;
        this.zoomAt(scale, box.x + box.width / 2, box.y + box.height / 2);
    }

    zoomAt(scale: number, focusX: number, focusY: number): void {
        if (!Number.isFinite(scale) || !Number.isFinite(focusX) || !Number.isFinite(focusY)) return;

        const { imageWidth, imageHeight, transform } = this.state;
        const centerX = imageWidth / 2;
        const centerY = imageHeight / 2;

        const prevScale = Math.max(1e-6, transform.scale);
        const prevOffsetX = transform.offsetX;
        const prevOffsetY = transform.offsetY;

        this.userZoom = Math.max(1, scale);
        this._adjustImageToCropBox();

        const nextScale = transform.scale;
        const ratio = nextScale / prevScale;
        this.state.transform.offsetX = prevOffsetX * ratio + (1 - ratio) * (focusX - centerX);
        this.state.transform.offsetY = prevOffsetY * ratio + (1 - ratio) * (focusY - centerY);

        this._syncScaleAndOffset();
        this._clampCropBoxToBounds();
        this._syncScaleAndOffset();
    }

    zoomBy(delta: number): void {
        if (!Number.isFinite(delta)) return;
        this.setZoom(this.userZoom + delta);
    }

    // ─── Interaction handlers ──────────────────────────────────────────

    onPointerDown(screenX: number, screenY: number): boolean {
        const handle = this._getResizeHandle(screenX, screenY);
        if (handle) {
            this.state.isResizing = true;
            this.state.resizeHandle = handle;
            this.state.dragStart = { x: screenX, y: screenY };
            this.state.boxStart = { ...this.state.cropBox };
            return true;
        }

        const imgCoords = this._screenToImageCoords(screenX, screenY);
        if (this._isInsideCropBox(imgCoords.x, imgCoords.y)) {
            this.state.isDraggingBox = true;
            this.state.dragStart = { x: screenX, y: screenY };
            this.dragOffsetStartX = this.state.transform.offsetX;
            this.dragOffsetStartY = this.state.transform.offsetY;
            return true;
        }

        return false;
    }

    onPointerMove(screenX: number, screenY: number): boolean {
        if (this.state.isResizing) {
            this._handleResize(screenX, screenY);
            return true;
        }
        if (this.state.isDraggingBox) {
            this._handleBoxDrag(screenX, screenY);
            return true;
        }
        return false;
    }

    onPointerUp(): { wasResizing: boolean; wasDraggingBox: boolean } {
        const wasResizing = this.state.isResizing;
        const wasDraggingBox = this.state.isDraggingBox;
        this.state.isResizing = false;
        this.state.isDraggingBox = false;
        this.state.resizeHandle = null;
        this.state.boxStart = null;
        return { wasResizing, wasDraggingBox };
    }

    getResizeHandleAt(screenX: number, screenY: number): ResizeHandle | null {
        return this._getResizeHandle(screenX, screenY);
    }

    isInsideCropBoxAt(screenX: number, screenY: number): boolean {
        const img = this._screenToImageCoords(screenX, screenY);
        return this._isInsideCropBox(img.x, img.y);
    }

    // ─── Coordinate helpers ───

    screenToImageCoords(screenX: number, screenY: number): { x: number; y: number } {
        return this._screenToImageCoords(screenX, screenY);
    }

    imageToScreenCoords(imageX: number, imageY: number): { x: number; y: number } {
        return this._imageToScreenCoords(imageX, imageY);
    }

    // ─── Private ───

    private _screenToImageCoords(screenX: number, screenY: number): { x: number; y: number } {
        return screenToImage(screenX, screenY, this.state.imageWidth, this.state.imageHeight, this.canvasW, this.canvasH, this.fitZoom);
    }

    private _imageToScreenCoords(imageX: number, imageY: number): { x: number; y: number } {
        return imageToScreen(imageX, imageY, this.state.imageWidth, this.state.imageHeight, this.canvasW, this.canvasH, this.fitZoom);
    }

    private _adjustImageToCropBox(): void {
        const requiredScale = this._computeMinCoverScale(this.state.cropBox);
        this.state.transform.scale = Math.max(requiredScale, this.userZoom);
    }

    private _syncScaleAndOffset(): void {
        this._adjustImageToCropBox();
        this._clampOffsetToBounds();
        this._adjustImageToCropBox();
    }

    private _adjustCropBoxToRatio(ratio: number): void {
        const { width, height, x, y } = this.state.cropBox;
        const bounds = this._getViewportBounds();
        const minX = bounds.minX;
        const minY = bounds.minY;
        const maxX = bounds.maxX;
        const maxY = bounds.maxY;
        const minW = Math.min(MIN_BOX_SIZE, Math.max(1, bounds.width));
        const minH = Math.min(MIN_BOX_SIZE, Math.max(1, bounds.height));
        const imgW = bounds.width;
        const imgH = bounds.height;

        let newWidth: number, newHeight: number;

        if (width / height > ratio) {
            newHeight = height;
            newWidth = height * ratio;
        } else {
            newWidth = width;
            newHeight = width / ratio;
        }

        if (newWidth > imgW) { newWidth = imgW; newHeight = imgW / ratio; }
        if (newHeight > imgH) { newHeight = imgH; newWidth = imgH * ratio; }
        newWidth = Math.max(minW, newWidth);
        newHeight = Math.max(minH, newHeight);

        const centerX = x + width / 2;
        const centerY = y + height / 2;

        this.state.cropBox = {
            width: newWidth,
            height: newHeight,
            x: Math.max(minX, Math.min(maxX - newWidth, centerX - newWidth / 2)),
            y: Math.max(minY, Math.min(maxY - newHeight, centerY - newHeight / 2)),
        };
    }

    private _handleResize(mouseX: number, mouseY: number): void {
        const handle = this.state.resizeHandle!;
        const ratio = this.state.aspectRatio;
        const isLocked = ratio !== null;
        const zoom = this.fitZoom;

        let dx = (mouseX - this.state.dragStart.x) / zoom;
        let dy = (mouseY - this.state.dragStart.y) / zoom;

        const box: CropBox = { ...this.state.boxStart! };
        const bounds = this._getViewportBounds();
        const minX = bounds.minX;
        const minY = bounds.minY;
        const maxX = bounds.maxX;
        const maxY = bounds.maxY;
        const minW = Math.min(MIN_BOX_SIZE, Math.max(1, bounds.width));
        const minH = Math.min(MIN_BOX_SIZE, Math.max(1, bounds.height));

        if (isLocked && ratio !== null) {
            if (handle === 'l' || handle === 'r') {
                if (handle === 'l') { dx = Math.min(dx, box.width - minW); box.x += dx; box.width -= dx; }
                else { box.width += dx; }
                const nh = box.width / ratio;
                box.y += (box.height - nh) / 2;
                box.height = nh;
            } else if (handle === 't' || handle === 'b') {
                if (handle === 't') { dy = Math.min(dy, box.height - minH); box.y += dy; box.height -= dy; }
                else { box.height += dy; }
                const nw = box.height * ratio;
                box.x += (box.width - nw) / 2;
                box.width = nw;
            } else {
                if (Math.abs(dx) > Math.abs(dy * ratio)) {
                    if (handle.includes('l')) { dx = Math.min(dx, box.width - minW); box.x += dx; box.width -= dx; }
                    else { box.width += dx; }
                    const nh = box.width / ratio;
                    if (handle.includes('t')) { box.y += (box.height - nh); }
                    box.height = nh;
                } else {
                    if (handle.includes('t')) { dy = Math.min(dy, box.height - minH); box.y += dy; box.height -= dy; }
                    else { box.height += dy; }
                    const nw = box.height * ratio;
                    if (handle.includes('l')) { box.x += (box.width - nw); }
                    box.width = nw;
                }
            }

            // Boundary correction
            if (box.x < minX) {
                const off = minX - box.x; box.x = minX; box.width -= off; box.height = box.width / ratio;
                if (handle.includes('t')) box.y = (this.state.boxStart!.y + this.state.boxStart!.height) - box.height;
            }
            if (box.y < minY) {
                const off = minY - box.y; box.y = minY; box.height -= off; box.width = box.height * ratio;
                if (handle.includes('l')) box.x = (this.state.boxStart!.x + this.state.boxStart!.width) - box.width;
            }
            if (box.x + box.width > maxX) {
                box.width = maxX - box.x; box.height = box.width / ratio;
                if (handle.includes('t')) box.y = (this.state.boxStart!.y + this.state.boxStart!.height) - box.height;
            }
            if (box.y + box.height > maxY) {
                box.height = maxY - box.y; box.width = box.height * ratio;
                if (handle.includes('l')) box.x = (this.state.boxStart!.x + this.state.boxStart!.width) - box.width;
            }
            box.width = Math.max(minW, box.width);
            box.height = Math.max(minH, box.height);

        } else {
            // FREE RESIZE
            if (handle.includes('t')) { box.y += dy; box.height -= dy; }
            if (handle.includes('b')) { box.height += dy; }
            if (handle.includes('l')) { box.x += dx; box.width -= dx; }
            if (handle.includes('r')) { box.width += dx; }

            box.x = Math.max(minX, box.x);
            box.y = Math.max(minY, box.y);
            box.width = Math.max(minW, Math.min(box.width, maxX - box.x));
            box.height = Math.max(minH, Math.min(box.height, maxY - box.y));
        }

        this.state.cropBox = box;
        this._syncScaleAndOffset();
    }

    private _handleBoxDrag(mouseX: number, mouseY: number): void {
        const zoom = Math.max(1e-6, this.fitZoom);
        const dx = (mouseX - this.state.dragStart.x) / zoom;
        const dy = (mouseY - this.state.dragStart.y) / zoom;
        this.state.transform.offsetX = this.dragOffsetStartX + dx;
        this.state.transform.offsetY = this.dragOffsetStartY + dy;
        this._clampOffsetToBounds();
    }

    private _getResizeHandle(screenX: number, screenY: number): ResizeHandle | null {
        const box = this.state.cropBox;
        const threshold = 15;

        const tl = this._imageToScreenCoords(box.x, box.y);
        const tr = this._imageToScreenCoords(box.x + box.width, box.y);
        const bl = this._imageToScreenCoords(box.x, box.y + box.height);
        const br = this._imageToScreenCoords(box.x + box.width, box.y + box.height);
        const tm = this._imageToScreenCoords(box.x + box.width / 2, box.y);
        const bm = this._imageToScreenCoords(box.x + box.width / 2, box.y + box.height);
        const lm = this._imageToScreenCoords(box.x, box.y + box.height / 2);
        const rm = this._imageToScreenCoords(box.x + box.width, box.y + box.height / 2);

        const near = (a: { x: number; y: number }, bx: number, by: number) =>
            Math.abs(bx - a.x) < threshold && Math.abs(by - a.y) < threshold;

        if (near(tl, screenX, screenY)) return 'tl';
        if (near(tr, screenX, screenY)) return 'tr';
        if (near(bl, screenX, screenY)) return 'bl';
        if (near(br, screenX, screenY)) return 'br';
        if (near(tm, screenX, screenY)) return 't';
        if (near(bm, screenX, screenY)) return 'b';
        if (near(lm, screenX, screenY)) return 'l';
        if (near(rm, screenX, screenY)) return 'r';

        return null;
    }

    private _isInsideCropBox(imageX: number, imageY: number): boolean {
        const { x, y, width, height } = this.state.cropBox;
        return imageX >= x && imageX <= x + width && imageY >= y && imageY <= y + height;
    }

    private _clampCropBoxToBounds(): void {
        const bounds = this._getViewportBounds();
        const box = this.state.cropBox;
        const minW = Math.min(MIN_BOX_SIZE, Math.max(1, bounds.width));
        const minH = Math.min(MIN_BOX_SIZE, Math.max(1, bounds.height));
        const width = Math.max(minW, Math.min(box.width, bounds.width));
        const height = Math.max(minH, Math.min(box.height, bounds.height));
        this.state.cropBox = {
            width,
            height,
            x: Math.max(bounds.minX, Math.min(box.x, bounds.maxX - width)),
            y: Math.max(bounds.minY, Math.min(box.y, bounds.maxY - height)),
        };
    }

    private _getViewportBounds(): {
        minX: number; minY: number; maxX: number; maxY: number; width: number; height: number;
    } {
        const W = this.state.imageWidth;
        const H = this.state.imageHeight;

        if (this.canvasW <= 0 || this.canvasH <= 0 || this.fitZoom <= 0) {
            return { minX: 0, minY: 0, maxX: W, maxY: H, width: W, height: H };
        }

        const edgePad = this.canvasPadding;
        const zoom = this.fitZoom;
        const imgW = W * zoom;
        const imgH = H * zoom;
        const imgX = this.canvasW / 2 - imgW / 2;
        const imgY = this.canvasH / 2 - imgH / 2;

        let minX = (edgePad - imgX) / zoom;
        let minY = (edgePad - imgY) / zoom;
        let maxX = (this.canvasW - edgePad - imgX) / zoom;
        let maxY = (this.canvasH - edgePad - imgY) / zoom;

        if (maxX <= minX) {
            const mid = (maxX + minX) / 2;
            minX = mid - 0.5;
            maxX = mid + 0.5;
        }
        if (maxY <= minY) {
            const mid = (maxY + minY) / 2;
            minY = mid - 0.5;
            maxY = mid + 0.5;
        }

        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    private _clampOffsetToBounds(): void {
        const result = clampOffsetToBounds(
            this.state.cropBox,
            this.state.imageWidth,
            this.state.imageHeight,
            this.state.transform.scale,
            this.state.transform.rotation,
            this.state.transform.offsetX,
            this.state.transform.offsetY,
        );
        this.state.transform.offsetX = result.offsetX;
        this.state.transform.offsetY = result.offsetY;
    }

    private _computeMinCoverScale(box: CropBox): number {
        return computeMinCoverScale(box, this.state.imageWidth, this.state.imageHeight, this.state.transform.rotation);
    }

    private _computeMinScaleForOffset(box: CropBox, offsetX: number, offsetY: number): number {
        return computeMinScaleForOffset(box, this.state.imageWidth, this.state.imageHeight, this.state.transform.rotation, offsetX, offsetY);
    }
}
