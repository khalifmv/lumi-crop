import { LumiCrop } from './lumicrop.js';

const canvas = document.getElementById('preview-canvas');
const status = document.getElementById('status');
let cropper = null;

function resetUI() {
    // Reset rotation display
    document.getElementById('rotation-val').textContent = '0.0°';
    // Reset ruler position to 0
    if (rulerInstance) {
        rulerInstance.showValue = 0;
        rulerInstance.state.value = 0;
        rulerInstance.updateByValue();
    }
    // Reset aspect ratio select to freeform
    document.getElementById('ratio-select').value = 'free';
}

// ── Load ──
document.getElementById('btn-load').addEventListener('click', () => {
    document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    status.textContent = 'Loading…';
    if (cropper) { cropper.destroy(); cropper = null; }

    try {
        cropper = new LumiCrop({
            canvas,
            image: file,
            idleAutoFitDelayMs: 1000,
            idleAutoFitAnimationDurationMs: 320
        });
        await cropper.ready();
        status.textContent = '';
        resetUI();
    } catch (err) {
        status.textContent = `Error: ${err.message}`;
        console.error(err);
    }
    // Clear input so same file can be re-selected
    e.target.value = '';
});

// ── Auto-load default test image ──
(async function autoLoad() {
    status.textContent = 'Loading…';
    try {
        cropper = new LumiCrop({
            canvas,
            image: './test.jpg',
            idleAutoFitDelayMs: 1000,
            idleAutoFitAnimationDurationMs: 320
        });
        await cropper.ready();
        status.textContent = '';
    } catch (err) {
        status.textContent = 'Failed to autoload test.jpg';
    }
})();

// ── Ruler ──
let rulerInstance = null;
if (window.RulerDrag) {
    const rulerContainer = document.getElementById('ruler-container');
    const rulerWidth = Math.round(rulerContainer.getBoundingClientRect().width) || 390;
    rulerInstance = new window.RulerDrag({
        direction: 'horizontal',
        width: rulerWidth,
        height: 60,
        pixelStep: 8,
        step: 1,
        initValue: 0,
        rulerRange: [-90, 90],
        limit: [-90, 90],
        smooth: false,
        dragSensitivity: 5,
        momentumSensitivity: 0.1,
        momentumFriction: 3.4,
        maxMomentumSpeed: 0.008,
        tickColor: '#6f6f6f',
        activeTickColor: '#a9a9a9',
        callback: (data) => {
            const val = Math.round(data.showValue * 10) / 10;
            document.getElementById('rotation-val').textContent = `${val.toFixed(1)}°`;
            if (cropper) cropper.setRotation(val);
        }
    });
    rulerContainer.append(rulerInstance.render());
    // Hide the built-in arrow marker; use custom center-mark instead.
    const downArrow = document.querySelector('.rulerDragSvg .rulerDownArrow');
    if (downArrow) downArrow.style.display = 'none';
}

// ── Flip & Ratio ──
document.getElementById('btn-flipx').addEventListener('click', () => cropper?.flipX());

document.getElementById('ratio-select').addEventListener('change', (e) => {
    if (!cropper) return;
    const val = e.target.value;
    cropper.setAspectRatio(val === 'free' ? null : parseFloat(val));
});

// ── Export ──
document.getElementById('btn-export').addEventListener('click', async () => {
    if (!cropper) return;
    status.textContent = 'Exporting…';
    try {
        const blob = await cropper.toBlob({ type: 'image/jpeg', quality: 0.95 });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `crop.jpg`;
        a.click();
        URL.revokeObjectURL(url);
        status.textContent = '';
    } catch (err) {
        status.textContent = `Error: ${err.message}`;
        console.error(err);
    }
});
