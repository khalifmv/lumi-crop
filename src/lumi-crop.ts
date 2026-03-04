import { loadImage } from './image-loader';
import { CropEngine } from './crop-engine';
import { Renderer } from './renderer';
import { exportToBlob } from './exporter';
import type { CropBox, LumiCropOptions, ToBlobOptions } from './types';
import type { EngineAnimationSnapshot } from './crop-engine';

export class LumiCrop {
    private engine: CropEngine;
    private renderer: Renderer;
    private imageEl: HTMLImageElement;
    private canvas: HTMLCanvasElement;
    private dpr: number;
    private idleAutoFitDelayMs: number;
    private idleAutoFitAnimationDurationMs: number;

    private _readyPromise: Promise<void>;
    private _isPinching = false;
    private _pinchStartDistance = 0;
    private _pinchStartZoom = 1;
    private _idleAutoFitTimer: ReturnType<typeof window.setTimeout> | null = null;
    private _idleAutoFitAnimationRaf: number | null = null;
    private _interceptedIdleAutoFit = false;

    constructor(opts: LumiCropOptions) {
        this.canvas = opts.canvas;
        this.dpr = opts.devicePixelRatio ?? window.devicePixelRatio ?? 1;
        this.idleAutoFitDelayMs = Math.max(0, opts.idleAutoFitDelayMs ?? 0);
        this.idleAutoFitAnimationDurationMs = Math.max(0, opts.idleAutoFitAnimationDurationMs ?? 280);

        // Temporary dummy until image loads
        this.imageEl = new Image();
        this.engine = new CropEngine(1, 1);
        this.renderer = null as unknown as Renderer;

        this._readyPromise = this._init(opts);
    }

    /** Wait for image to be loaded and engine initialized */
    ready(): Promise<void> {
        return this._readyPromise;
    }

    // ─── Crop Box API ───

    setAspectRatio(ratio: number | null): void {
        if (!this.renderer) return;
        this._cancelIdleAutoFitFlow();
        this.engine.setAspectRatio(ratio);
        this.renderer.render();
    }

    setCropBox(box: CropBox): void {
        if (!this.renderer) return;
        this._cancelIdleAutoFitFlow();
        this.engine.setCropBox(box);
        this.renderer.render();
    }

    getCropBox(): CropBox {
        return this.engine.getCropBox();
    }

    // ─── Transform API ───

    rotate90(clockwise = true): void {
        if (!this.renderer) return;
        this._cancelIdleAutoFitFlow();
        this.engine.rotate90(clockwise);
        this.renderer.render();
    }

    setRotation(degrees: number): void {
        if (!this.renderer) return;
        this._cancelIdleAutoFitFlow();
        this.engine.setRotation(degrees);
        this.renderer.render();
    }

    flipX(): void {
        if (!this.renderer) return;
        this._cancelIdleAutoFitFlow();
        this.engine.flipH();
        this.renderer.render();
    }

    flipY(): void {
        if (!this.renderer) return;
        this._cancelIdleAutoFitFlow();
        this.engine.flipV();
        this.renderer.render();
    }

    setZoom(scale: number): void {
        if (!this.renderer) return;
        this._cancelIdleAutoFitFlow();
        this.engine.setZoom(scale);
        this.renderer.render();
        this._emitZoomChange();
    }

    zoomBy(delta: number): void {
        if (!this.renderer) return;
        this._cancelIdleAutoFitFlow();
        this.engine.zoomBy(delta);
        this.renderer.render();
        this._emitZoomChange();
    }

    fitCropBoxToViewport(): void {
        if (!this.renderer) return;
        this._cancelIdleAutoFitFlow();
        this.engine.fitCropBoxToViewport();
        this.renderer.render();
        this._emitZoomChange();
    }

    getZoom(): number {
        return this.engine.getZoom();
    }

    // ─── Export API ───

    async toBlob(options: ToBlobOptions = {}): Promise<Blob> {
        await this._readyPromise;
        return exportToBlob(
            this.imageEl,
            this.engine.getCropBox(),
            this.engine.getTransform(),
            options
        );
    }

    // ─── Lifecycle ───

    destroy(): void {
        this._cancelIdleAutoFitFlow();
        this._detachEventListeners();
        this.imageEl?.remove();
        this.renderer?.destroy();
    }

    // ─── Private ───

    private async _init(opts: LumiCropOptions): Promise<void> {
        this.imageEl = await loadImage(opts.image);

        const { naturalWidth: w, naturalHeight: h } = this.imageEl;
        this.engine = new CropEngine(w, h, opts.aspectRatio);
        this.engine.setCanvasSize(this.canvas.offsetWidth, this.canvas.offsetHeight);
        this.renderer = new Renderer(this.canvas, this.imageEl, this.engine, this.dpr);

        // Ensure image element is in the same stacking context as canvas
        if (!this.imageEl.parentElement) {
            this.canvas.parentElement?.insertBefore(this.imageEl, this.canvas);
        }
        this.imageEl.style.pointerEvents = 'none';
        this.imageEl.style.userSelect = 'none';
        this.imageEl.draggable = false;

        this._attachEventListeners();
        this.renderer.render();
        this._emitZoomChange();
    }

    private _attachEventListeners(): void {
        const c = this.canvas;
        c.addEventListener('mousedown', this._onMouseDown);
        c.addEventListener('mousemove', this._onMouseMove);
        c.addEventListener('mouseup', this._onMouseUp);
        c.addEventListener('mouseleave', this._onMouseUp);
        c.addEventListener('wheel', this._onWheel, { passive: false });
        c.addEventListener('touchstart', this._onTouchStart, { passive: false });
        c.addEventListener('touchmove', this._onTouchMove, { passive: false });
        c.addEventListener('touchend', this._onTouchEnd);
        c.addEventListener('touchcancel', this._onTouchEnd);
        window.addEventListener('resize', this._onResize);
    }

    private _detachEventListeners(): void {
        const c = this.canvas;
        c.removeEventListener('mousedown', this._onMouseDown);
        c.removeEventListener('mousemove', this._onMouseMove);
        c.removeEventListener('mouseup', this._onMouseUp);
        c.removeEventListener('mouseleave', this._onMouseUp);
        c.removeEventListener('wheel', this._onWheel);
        c.removeEventListener('touchstart', this._onTouchStart);
        c.removeEventListener('touchmove', this._onTouchMove);
        c.removeEventListener('touchend', this._onTouchEnd);
        c.removeEventListener('touchcancel', this._onTouchEnd);
        window.removeEventListener('resize', this._onResize);
    }

    private _onMouseDown = (e: MouseEvent): void => {
        this._interceptedIdleAutoFit = this._hasPendingIdleAutoFitFlow();
        this._cancelIdleAutoFitFlow();
        const { x, y } = this._relativePos(e.clientX, e.clientY);
        this.engine.onPointerDown(x, y);
    };

    private _onMouseMove = (e: MouseEvent): void => {
        const { x, y } = this._relativePos(e.clientX, e.clientY);
        const consumed = this.engine.onPointerMove(x, y);
        if (consumed) {
            this.renderer.render();
        } else {
            this.renderer.updateCursor(x, y);
        }
    };

    private _onMouseUp = (): void => {
        const interaction = this.engine.onPointerUp();
        if (interaction.wasResizing || this._interceptedIdleAutoFit) {
            this._scheduleIdleAutoFit();
        }
        this._interceptedIdleAutoFit = false;
    };

    private _onWheel = (e: WheelEvent): void => {
        e.preventDefault();
        this._cancelIdleAutoFitFlow();
        const { x, y } = this._relativePos(e.clientX, e.clientY);
        const focus = this.engine.screenToImageCoords(x, y);
        const normalizedDelta = this._normalizeWheelDelta(e);
        const factor = Math.exp(-normalizedDelta * 0.0015);
        const targetZoom = this.engine.getZoom() * factor;
        this.engine.zoomAt(targetZoom, focus.x, focus.y);
        this.renderer.render();
        this._emitZoomChange();
    };

    private _onTouchStart = (e: TouchEvent): void => {
        e.preventDefault();
        this._interceptedIdleAutoFit = this._hasPendingIdleAutoFitFlow();
        this._cancelIdleAutoFitFlow();
        if (e.touches.length === 2) {
            this._isPinching = true;
            this._pinchStartDistance = this._touchDistance(e.touches[0], e.touches[1]);
            this._pinchStartZoom = this.engine.getZoom();
            this.engine.onPointerUp();
            return;
        }

        if (e.touches.length === 1) {
            const t = e.touches[0];
            const { x, y } = this._relativePos(t.clientX, t.clientY);
            this.engine.onPointerDown(x, y);
        }
    };

    private _onTouchMove = (e: TouchEvent): void => {
        e.preventDefault();
        if (e.touches.length === 2) {
            const distance = this._touchDistance(e.touches[0], e.touches[1]);
            if (this._isPinching && this._pinchStartDistance > 0 && distance > 0) {
                const center = this._touchCenter(e.touches[0], e.touches[1]);
                const focus = this.engine.screenToImageCoords(center.x, center.y);
                const targetZoom = this._pinchStartZoom * (distance / this._pinchStartDistance);
                this.engine.zoomAt(targetZoom, focus.x, focus.y);
                this.renderer.render();
                this._emitZoomChange();
            }
            return;
        }

        if (e.touches.length === 1) {
            if (this._isPinching) {
                this._isPinching = false;
                this._pinchStartDistance = 0;
                this._pinchStartZoom = this.engine.getZoom();
                this.engine.onPointerUp();
                const t = e.touches[0];
                const start = this._relativePos(t.clientX, t.clientY);
                this.engine.onPointerDown(start.x, start.y);
                return;
            }

            const t = e.touches[0];
            const { x, y } = this._relativePos(t.clientX, t.clientY);
            const consumed = this.engine.onPointerMove(x, y);
            if (consumed) {
                this.renderer.render();
            }
        }
    };

    private _onTouchEnd = (e: TouchEvent): void => {
        if (e.touches.length < 2) {
            this._isPinching = false;
            this._pinchStartDistance = 0;
            this._pinchStartZoom = this.engine.getZoom();
        }
        if (e.touches.length === 0) {
            const interaction = this.engine.onPointerUp();
            if (interaction.wasResizing || this._interceptedIdleAutoFit) {
                this._scheduleIdleAutoFit();
            }
            this._interceptedIdleAutoFit = false;
        }
    };

    private _onResize = (): void => {
        this._cancelIdleAutoFitFlow();
        this.engine.setCanvasSize(this.canvas.offsetWidth, this.canvas.offsetHeight);
        this.renderer.resize();
        this.renderer.render();
    };

    private _relativePos(clientX: number, clientY: number): { x: number; y: number } {
        const rect = this.canvas.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    private _touchDistance(a: Touch, b: Touch): number {
        const dx = a.clientX - b.clientX;
        const dy = a.clientY - b.clientY;
        return Math.hypot(dx, dy);
    }

    private _touchCenter(a: Touch, b: Touch): { x: number; y: number } {
        return this._relativePos((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
    }

    private _normalizeWheelDelta(e: WheelEvent): number {
        if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * 16;
        if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY * this.canvas.clientHeight;
        return e.deltaY;
    }

    private _emitZoomChange(): void {
        this.canvas.dispatchEvent(new CustomEvent('lumicrop:zoom', {
            detail: { zoom: this.engine.getZoom() },
        }));
    }

    private _scheduleIdleAutoFit(): void {
        if (!this.renderer || this.idleAutoFitDelayMs <= 0) return;
        this._cancelIdleAutoFitFlow();
        this._idleAutoFitTimer = window.setTimeout(() => {
            this._idleAutoFitTimer = null;
            const state = this.engine.getState();
            if (state.isDraggingBox || state.isResizing) {
                this._scheduleIdleAutoFit();
                return;
            }
            this._runIdleAutoFitAnimation();
        }, this.idleAutoFitDelayMs);
    }

    private _runIdleAutoFitAnimation(): void {
        if (!this.renderer) return;
        this._cancelIdleAutoFitAnimation();

        const start = this.engine.getAnimationSnapshot();
        this.engine.fitCropBoxToViewport();
        const target = this.engine.getAnimationSnapshot();

        if (this._isSnapshotAlmostEqual(start, target) || this.idleAutoFitAnimationDurationMs <= 0) {
            this.renderer.render();
            this._emitZoomChange();
            return;
        }

        this.engine.setAnimationSnapshot(start);
        this.renderer.render();

        const startedAt = performance.now();
        const duration = this.idleAutoFitAnimationDurationMs;
        const step = (now: number) => {
            const t = Math.min(1, (now - startedAt) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const frame = this._lerpSnapshot(start, target, eased);
            this.engine.setAnimationSnapshot(frame);
            this.renderer.render();

            if (t < 1) {
                this._idleAutoFitAnimationRaf = window.requestAnimationFrame(step);
                return;
            }

            this._idleAutoFitAnimationRaf = null;
            this.engine.setAnimationSnapshot(target, true);
            this.renderer.render();
            this._emitZoomChange();
        };

        this._idleAutoFitAnimationRaf = window.requestAnimationFrame(step);
    }

    private _lerpSnapshot(
        start: EngineAnimationSnapshot,
        end: EngineAnimationSnapshot,
        t: number
    ): EngineAnimationSnapshot {
        const lerp = (a: number, b: number) => a + (b - a) * t;
        return {
            cropBox: {
                x: lerp(start.cropBox.x, end.cropBox.x),
                y: lerp(start.cropBox.y, end.cropBox.y),
                width: lerp(start.cropBox.width, end.cropBox.width),
                height: lerp(start.cropBox.height, end.cropBox.height),
            },
            transform: {
                rotation: lerp(start.transform.rotation, end.transform.rotation),
                scale: lerp(start.transform.scale, end.transform.scale),
                offsetX: lerp(start.transform.offsetX, end.transform.offsetX),
                offsetY: lerp(start.transform.offsetY, end.transform.offsetY),
                flipH: end.transform.flipH,
                flipV: end.transform.flipV,
            },
            userZoom: lerp(start.userZoom, end.userZoom),
        };
    }

    private _isSnapshotAlmostEqual(a: EngineAnimationSnapshot, b: EngineAnimationSnapshot): boolean {
        const close = (x: number, y: number, eps = 1e-4) => Math.abs(x - y) <= eps;
        return (
            close(a.cropBox.x, b.cropBox.x) &&
            close(a.cropBox.y, b.cropBox.y) &&
            close(a.cropBox.width, b.cropBox.width) &&
            close(a.cropBox.height, b.cropBox.height) &&
            close(a.transform.rotation, b.transform.rotation) &&
            close(a.transform.scale, b.transform.scale) &&
            close(a.transform.offsetX, b.transform.offsetX) &&
            close(a.transform.offsetY, b.transform.offsetY) &&
            a.transform.flipH === b.transform.flipH &&
            a.transform.flipV === b.transform.flipV &&
            close(a.userZoom, b.userZoom)
        );
    }

    private _cancelIdleAutoFitFlow(): void {
        this._clearIdleAutoFitTimer();
        this._cancelIdleAutoFitAnimation();
    }

    private _cancelIdleAutoFitAnimation(): void {
        if (this._idleAutoFitAnimationRaf !== null) {
            window.cancelAnimationFrame(this._idleAutoFitAnimationRaf);
            this._idleAutoFitAnimationRaf = null;
        }
    }

    private _hasPendingIdleAutoFitFlow(): boolean {
        return this._idleAutoFitTimer !== null || this._idleAutoFitAnimationRaf !== null;
    }

    private _clearIdleAutoFitTimer(): void {
        if (this._idleAutoFitTimer !== null) {
            window.clearTimeout(this._idleAutoFitTimer);
            this._idleAutoFitTimer = null;
        }
    }
}
