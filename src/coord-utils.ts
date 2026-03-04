/**
 * Converts screen coordinates (relative to canvas top-left) to image-space coordinates.
 * Uses the fit zoom and canvas dimensions to account for centering.
 */
export function screenToImage(
    screenX: number,
    screenY: number,
    imageWidth: number,
    imageHeight: number,
    canvasW: number,
    canvasH: number,
    zoom: number,
): { x: number; y: number } {
    const imgW = imageWidth * zoom;
    const imgH = imageHeight * zoom;
    const imgX = canvasW / 2 - imgW / 2;
    const imgY = canvasH / 2 - imgH / 2;
    return {
        x: (screenX - imgX) / zoom,
        y: (screenY - imgY) / zoom,
    };
}

/**
 * Converts image-space coordinates to screen coordinates (relative to canvas top-left).
 */
export function imageToScreen(
    imageX: number,
    imageY: number,
    imageWidth: number,
    imageHeight: number,
    canvasW: number,
    canvasH: number,
    zoom: number,
): { x: number; y: number } {
    const imgW = imageWidth * zoom;
    const imgH = imageHeight * zoom;
    const imgX = canvasW / 2 - imgW / 2;
    const imgY = canvasH / 2 - imgH / 2;
    return {
        x: imageX * zoom + imgX,
        y: imageY * zoom + imgY,
    };
}
