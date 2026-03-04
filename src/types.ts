// Shared types for lumi-crop

export interface CropBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Transform {
    /** Rotation in degrees (0–360) */
    rotation: number;
    /** Effective scale = max(user zoom, minimum cover scale) */
    scale: number;
    /** Interaction-space translation in source pixels (used for cursor-focused zoom/pan) */
    offsetX: number;
    /** Interaction-space translation in source pixels (used for cursor-focused zoom/pan) */
    offsetY: number;
    flipH: boolean;
    flipV: boolean;
}

export interface CropState {
    imageWidth: number;
    imageHeight: number;
    cropBox: CropBox;
    transform: Transform;
    aspectRatio: number | null;
    // Interaction
    isDraggingBox: boolean;
    isResizing: boolean;
    resizeHandle: ResizeHandle | null;
    dragStart: { x: number; y: number };
    boxStart: CropBox | null;
}

export type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';

export interface ToBlobOptions {
    type?: 'image/png' | 'image/jpeg' | 'image/webp';
    quality?: number;
    /** Max output width in px (aspect-ratio safe) */
    maxWidth?: number;
    /** Max output height in px (aspect-ratio safe) */
    maxHeight?: number;
}

export interface LumiCropOptions {
    /** Canvas element used for overlay rendering */
    canvas: HTMLCanvasElement;
    /** Image source: URL string, File, or HTMLImageElement */
    image: string | File | HTMLImageElement;
    /** Optional initial aspect ratio lock (e.g. 16/9) */
    aspectRatio?: number;
    /** Defaults to window.devicePixelRatio */
    devicePixelRatio?: number;
    /** Delay before auto-fit/auto-center after interaction ends. Default: 0 (disabled). */
    idleAutoFitDelayMs?: number;
    /** Auto-fit transition duration in ms. Default: 280. */
    idleAutoFitAnimationDurationMs?: number;
}
