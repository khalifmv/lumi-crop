import type { CropBox } from './types';

/**
 * Returns the four corner points of a crop box.
 */
export function getBoxCorners(box: CropBox): Array<{ x: number; y: number }> {
    return [
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x + box.width, y: box.y + box.height },
        { x: box.x, y: box.y + box.height },
    ];
}

/**
 * Computes the minimum image scale needed to fully cover the crop box,
 * taking rotation into account. Does NOT depend on offset position.
 */
export function computeMinCoverScale(
    box: CropBox,
    imageWidth: number,
    imageHeight: number,
    rotationDeg: number,
): number {
    const rad = rotationDeg * (Math.PI / 180);
    const absCos = Math.abs(Math.cos(rad));
    const absSin = Math.abs(Math.sin(rad));
    const needX = (box.width * absCos + box.height * absSin) / imageWidth;
    const needY = (box.width * absSin + box.height * absCos) / imageHeight;
    return Math.max(1, needX, needY);
}

/**
 * Computes the minimum image scale needed so that the rotated image at the
 * given offset still fully covers all four corners of the crop box.
 */
export function computeMinScaleForOffset(
    box: CropBox,
    imageWidth: number,
    imageHeight: number,
    rotationDeg: number,
    offsetX: number,
    offsetY: number,
): number {
    const cx = imageWidth / 2;
    const cy = imageHeight / 2;
    const rad = rotationDeg * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const offsetU = offsetX * cos - offsetY * sin;
    const offsetV = offsetX * sin + offsetY * cos;

    let needScale = 1;
    for (const p of getBoxCorners(box)) {
        const qx = p.x - cx;
        const qy = p.y - cy;
        const cornerU = qx * cos - qy * sin;
        const cornerV = qx * sin + qy * cos;
        needScale = Math.max(
            needScale,
            Math.abs(cornerU - offsetU) / Math.max(1e-6, cx),
            Math.abs(cornerV - offsetV) / Math.max(1e-6, cy),
        );
    }
    return needScale;
}

/**
 * Clamps the image offset (offsetX, offsetY) so that the rotated+scaled image
 * at that offset fully covers all four corners of the crop box.
 * Returns the clamped { offsetX, offsetY }.
 */
export function clampOffsetToBounds(
    box: CropBox,
    imageWidth: number,
    imageHeight: number,
    scale: number,
    rotationDeg: number,
    offsetX: number,
    offsetY: number,
): { offsetX: number; offsetY: number } {
    const cx = imageWidth / 2;
    const cy = imageHeight / 2;
    const rad = rotationDeg * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const limitU = scale * cx;
    const limitV = scale * cy;

    let minOffsetU = -Infinity;
    let maxOffsetU = Infinity;
    let minOffsetV = -Infinity;
    let maxOffsetV = Infinity;

    for (const p of getBoxCorners(box)) {
        const qx = p.x - cx;
        const qy = p.y - cy;
        const cornerU = qx * cos - qy * sin;
        const cornerV = qx * sin + qy * cos;
        minOffsetU = Math.max(minOffsetU, cornerU - limitU);
        maxOffsetU = Math.min(maxOffsetU, cornerU + limitU);
        minOffsetV = Math.max(minOffsetV, cornerV - limitV);
        maxOffsetV = Math.min(maxOffsetV, cornerV + limitV);
    }

    if (maxOffsetU < minOffsetU) { const mid = (maxOffsetU + minOffsetU) / 2; minOffsetU = mid; maxOffsetU = mid; }
    if (maxOffsetV < minOffsetV) { const mid = (maxOffsetV + minOffsetV) / 2; minOffsetV = mid; maxOffsetV = mid; }

    const curOffsetU = offsetX * cos - offsetY * sin;
    const curOffsetV = offsetX * sin + offsetY * cos;
    const clampedU = Math.max(minOffsetU, Math.min(maxOffsetU, curOffsetU));
    const clampedV = Math.max(minOffsetV, Math.min(maxOffsetV, curOffsetV));

    return {
        offsetX: clampedU * cos + clampedV * sin,
        offsetY: -clampedU * sin + clampedV * cos,
    };
}
