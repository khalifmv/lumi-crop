import type { CropBox, ToBlobOptions, Transform } from './types';

/**
 * Export cropped image using the same rigid transform model as preview:
 * source -> rotate/flip/scale around image center -> crop box in interaction space.
 * Ported from Lumiviu Preview Engine.
 */
export async function exportToBlob(
    image: HTMLImageElement,
    cropBox: CropBox,
    transform: Transform,
    options: ToBlobOptions = {}
): Promise<Blob> {
    const { type = 'image/png', quality = 0.92, maxWidth, maxHeight } = options;

    const srcW = image.naturalWidth || image.width;
    const srcH = image.naturalHeight || image.height;

    // ─── Determine output dimensions (matches crop box aspect) ───
    let outW = cropBox.width;
    let outH = cropBox.height;

    if (maxWidth && outW > maxWidth) {
        outH = (outH * maxWidth) / outW;
        outW = maxWidth;
    }
    if (maxHeight && outH > maxHeight) {
        outW = (outW * maxHeight) / outH;
        outH = maxHeight;
    }

    outW = Math.max(1, Math.round(outW));
    outH = Math.max(1, Math.round(outH));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;

    const rotRad = (transform.rotation * Math.PI) / 180;
    const flipX = transform.flipH ? -1 : 1;
    const flipY = transform.flipV ? -1 : 1;
    const imageCx = srcW / 2;
    const imageCy = srcH / 2;
    const sx = outW / cropBox.width;
    const sy = outH / cropBox.height;
    const localScaleX = transform.scale * flipX;
    const localScaleY = transform.scale * flipY;

    // Forward matrix: source pixel -> output pixel
    // M = Scale(out/crop) * Translate(-crop) * Translate(center)
    //     * Scale(scale*flip) * Rotate(-rotation) * Translate(-center)
    let a = 1, b = 0, c = 0, d = 1, e = 0, f = 0;

    function mul(
        a2: number, b2: number, c2: number, d2: number, e2: number, f2: number
    ) {
        // Compose: new = [a2,b2,c2,d2,e2,f2] * [a,b,c,d,e,f]
        const na = a2 * a + c2 * b;
        const nb = b2 * a + d2 * b;
        const nc = a2 * c + c2 * d;
        const nd = b2 * c + d2 * d;
        const ne = a2 * e + c2 * f + e2;
        const nf = b2 * e + d2 * f + f2;
        a = na; b = nb; c = nc; d = nd; e = ne; f = nf;
    }

    mul(1, 0, 0, 1, -imageCx, -imageCy);
    const cos = Math.cos(-rotRad);
    const sin = Math.sin(-rotRad);
    mul(cos, sin, -sin, cos, 0, 0);
    mul(localScaleX, 0, 0, localScaleY, 0, 0);
    mul(1, 0, 0, 1, imageCx, imageCy);
    mul(1, 0, 0, 1, transform.offsetX, transform.offsetY);
    mul(1, 0, 0, 1, -cropBox.x, -cropBox.y);
    mul(sx, 0, 0, sy, 0, 0);

    ctx.save();
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(image, 0, 0, srcW, srcH);
    ctx.restore();

    // ── Export to Blob ───
    return new Promise((resolve, reject) => {
        if (typeof canvas.toBlob === 'function') {
            canvas.toBlob(
                (blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('canvas.toBlob returned null'));
                },
                type,
                quality
            );
        } else {
            try {
                const dataUrl = canvas.toDataURL(type, quality);
                const [header, base64] = dataUrl.split(',');
                const mime = header.match(/:(.*?);/)![1];
                const bstr = atob(base64);
                const u8arr = new Uint8Array(bstr.length);
                for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
                resolve(new Blob([u8arr], { type: mime }));
            } catch (e) {
                reject(e);
            }
        }
    });
}
