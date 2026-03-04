/**
 * Loads an image from a URL string, File, or existing HTMLImageElement.
 * Returns a fully decoded HTMLImageElement.
 */
export async function loadImage(
    source: string | File | HTMLImageElement
): Promise<HTMLImageElement> {
    if (source instanceof HTMLImageElement) {
        if (source.complete && source.naturalWidth > 0) {
            return source;
        }
        return new Promise((resolve, reject) => {
            source.onload = () => resolve(source);
            source.onerror = () => reject(new Error('Failed to load provided HTMLImageElement'));
        });
    }

    if (source instanceof File) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Failed to decode image from File'));
                img.src = e.target!.result as string;
            };
            reader.onerror = () => reject(new Error('Failed to read File'));
            reader.readAsDataURL(source);
        });
    }

    // string URL
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Allow cross-origin images when possible
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image from URL: ${source}`));
        img.src = source;
    });
}
