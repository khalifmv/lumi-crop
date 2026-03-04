# LumiCrop

A lightweight, framework-agnostic, and dependency-free image cropping engine for modern web applications. LumiCrop provides a headless architecture, featuring a fixed crop box, smooth panning and pinch-to-zoom, rotation support, and pixel-perfect canvas export.

## Features

- **Zero Dependencies**: Built entirely with standard Web APIs (Canvas, Touch Events, Pointer Events).
- **Framework Agnostic**: Works seamlessly with Vanilla JS, React, Vue, Angular, or any other web framework.
- **Headless Architecture**: You provide the UI controls; LumiCrop handles the complex math, rendering, and interactions.
- **TypeScript Ready**: Strongly typed for excellent developer experience.

## Installation

```bash
npm install lumi-crop
```

## Quick Start

```javascript
import { LumiCrop } from 'lumi-crop';

// 1. Get your canvas element
const canvasElement = document.getElementById('crop-preview-canvas');

// 2. Initialize the cropper
const cropper = new LumiCrop({
    canvas: canvasElement,
    image: 'path/to/image.jpg', // Can be a URL, a File object, or an HTMLImageElement
    aspectRatio: 16 / 9         // Optional: Lock aspect ratio
});

// 3. Wait for the image to load and the engine to initialize
await cropper.ready();

// 4. Export the cropped result when the user confirms
const blob = await cropper.toBlob({ 
    type: 'image/jpeg', 
    quality: 0.95 
});

// Use the blob (e.g., upload to server or display)
const objectUrl = URL.createObjectURL(blob);
console.log('Cropped image blob:', blob);
```

## API Reference

### `LumiCropOptions`

Configuration object passed to the `LumiCrop` constructor.

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `canvas` | `HTMLCanvasElement` | (Required) | The target canvas element used for viewport rendering. |
| `image` | `string \| File \| HTMLImageElement` | (Required) | The source image to be cropped. |
| `aspectRatio` | `number` | `undefined` | Optional initial aspect ratio lock (e.g., `16/9`). |
| `devicePixelRatio` | `number` | `window.devicePixelRatio` | Pixel ratio for rendering crispness on high-DPI displays. |
| `idleAutoFitDelayMs` | `number` | `0` (Disabled) | Delay in milliseconds before auto-fitting/auto-centering the image after an interaction ends. |
| `idleAutoFitAnimationDurationMs` | `number` | `280` | Duration of the auto-fit transition animation in milliseconds. |

### Instance Methods

The `LumiCrop` instance exposes the following methods for interacting with the crop engine.

| Method | Returns | Description |
| :--- | :--- | :--- |
| `ready()` | `Promise<void>` | Resolves when the source image has fully loaded and the engine is ready for interaction. |
| `setAspectRatio(ratio: number \| null)` | `void` | Updates the crop box constraint. Pass `null` for a freeform crop box (no aspect ratio). |
| `setCropBox(box: CropBox)` | `void` | Manually sets the crop box dimensions and position. |
| `getCropBox()` | `CropBox` | Returns the current crop box coordinates (`{ x, y, width, height }`). |
| `rotate90(clockwise: boolean = true)` | `void` | Rotates the image by 90 degrees around its anchor point. |
| `setRotation(degrees: number)` | `void` | Sets an absolute rotation value in degrees (`0` to `360`). |
| `flipX()` | `void` | Flips the image horizontally. |
| `flipY()` | `void` | Flips the image vertically. |
| `setZoom(scale: number)` | `void` | Sets an absolute zoom scale factor. |
| `zoomBy(delta: number)` | `void` | Adjusts the current zoom by a relative delta. |
| `fitCropBoxToViewport()` | `void` | Forces the crop box to center and fit within the visible canvas viewport boundaries. |
| `getZoom()` | `number` | Returns the current effective zoom scale. |
| `toBlob(options?: ToBlobOptions)` | `Promise<Blob>` | Renders the cropped area and returns it as a Blob. See `ToBlobOptions` below. |
| `destroy()` | `void` | Cleans up event listeners, removes internal DOM elements, and frees memory. |

### `ToBlobOptions`

Options for the `toBlob` export method.

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `type` | `'image/png' \| 'image/jpeg' \| 'image/webp'` | `'image/png'` | The MIME type of the exported image. |
| `quality` | `number` | `undefined` | Compression quality for JPEG or WEBP formats (between `0.0` and `1.0`). |
| `maxWidth` | `number` | `undefined` | Maximum width in pixels for the output image. Ratio is preserved. |
| `maxHeight` | `number` | `undefined` | Maximum height in pixels for the output image. Ratio is preserved. |

## TODO

- [ ] Publish to NPM

## License

Copyright 2026 Khalif. Licensed under the Apache License 2.0.
