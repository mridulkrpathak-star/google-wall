import { AuditFixItem, SamplePhoto } from '../types';

export const SAMPLE_PHOTOS: SamplePhoto[] = [
  {
    id: 'alpine-golden',
    title: 'Alpine Golden Hour',
    location: 'Warm sunset skyline',
    url: '/src/assets/images/sample_portrait_golden_1795689987555.jpg',
    recommendedClockY: 42,
    recommendedClockColor: 'ivory',
  },
  {
    id: 'concrete-studio',
    title: 'Concrete Studio',
    location: 'Minimal architectural light',
    url: '/src/assets/images/sample_portrait_studio_1795689989513.jpg',
    recommendedClockY: 37,
    recommendedClockColor: 'obsidian',
  },
  {
    id: 'misty-coast',
    title: 'Misty Coast',
    location: 'Dawn sea horizon',
    url: '/src/assets/images/sample_portrait_ocean_1795689988413.jpg',
    recommendedClockY: 43,
    recommendedClockColor: 'ivory',
  },
];

export const AUDIT_FIXES: AuditFixItem[] = [
  {
    id: 'model-url',
    severity: 'Breaking',
    lineRef: 'Line 104',
    title: 'Wrong MediaPipe model path (float16 instead of float32)',
    cause:
      'selfie_multiclass_256x256.tflite is hosted by Google only under float32/latest/, not float16/latest/. Requesting float16 returns HTTP 404 and aborts initialization.',
    resolution:
      'Point modelAssetPath to .../selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite.',
  },
  {
    id: 'esm-bundle',
    severity: 'Breaking',
    lineRef: 'Line 101',
    title: 'Incomplete jsDelivr ESM module path',
    cause:
      'Importing the bare @mediapipe/tasks-vision package root relies on default CDN entry resolution, which can fail to expose named ESM exports (FilesetResolver, ImageSegmenter).',
    resolution:
      'Import the explicit /vision_bundle.mjs entry point or bundle @mediapipe/tasks-vision locally with matching WASM binaries.',
  },
  {
    id: 'softmax-sum',
    severity: 'Visual Quality',
    lineRef: 'Line 63',
    title: 'Soft-union formula creates internal seams between foreground classes',
    cause:
      'Multiclass confidence masks are mutually exclusive softmax probabilities summing to 1.0. Using 1 - Π(1 - v) drops a 50% hair + 50% face pixel to 0.75, letting the clock bleed through hairlines and collars.',
    resolution:
      'Sum the selected foreground softmax channels directly and clamp to [0, 1] for seamless internal boundaries.',
  },
  {
    id: 'fg-resolution',
    severity: 'Visual Quality',
    lineRef: 'Lines 85–87',
    title: 'Foreground canvas sized to maskW × maskH instead of display size',
    cause:
      'Drawing the photo into a mask-sized offscreen canvas blurs the subject whenever maskW < w, or wastes tens of megabytes of GPU memory on full-resolution phone camera photos.',
    resolution:
      'Size the foreground and green-overlay canvases to display dimensions (w × h) and scale only the alpha mask.',
  },
  {
    id: 'wasm-leak',
    severity: 'Memory & Perf',
    lineRef: 'Lines 105, 113–114',
    title: 'WASM memory leak (missing result.close()) and unused category mask',
    cause:
      'ImageSegmenterResult holds native C++/WASM buffers until closed, and outputCategoryMask: true allocates an extra mask that is never read.',
    resolution:
      'Copy Float32Array buffers with .slice(), call result.close() in a finally block, and set outputCategoryMask: false.',
  },
  {
    id: 'downscale-slider',
    severity: 'Memory & Perf',
    lineRef: 'Lines 113, 122',
    title: 'Full-resolution 12 MP segmentation and redundant slider recomputation',
    cause:
      'Segmenting raw camera photos allocates ~288 MB across 6 Float32 masks, and dragging the threshold slider re-runs makeCombined() across all channels on every tick.',
    resolution:
      'Downscale input to display bounds (max 640×1100) before segmentation and separate threshold stats/redraw from channel combination.',
  },
  {
    id: 'race-condition',
    severity: 'Reliability',
    lineRef: 'Lines 109–120',
    title: 'Async race condition if photo is cleared or changed during model load',
    cause:
      'Clearing or replacing the image while await init() resolves causes task.segment(null) to crash or paints a stale mask onto the new photo.',
    resolution:
      'Track an active run token (or activePhoto reference), disable clear/input controls while busy, and abort stale results.',
  },
  {
    id: 'revoke-url',
    severity: 'Reliability',
    lineRef: 'Line 125',
    title: 'Object URL not revoked when clearing photo',
    cause:
      'Resetting photo = null without calling URL.revokeObjectURL(photoUrl) leaks the uploaded file blob in memory until tab close.',
    resolution:
      'Revoke photoUrl immediately on Clear and whenever a new file replaces the previous upload.',
  },
];

export const FIXED_DIAGNOSTIC_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#0b0c10" />
  <title>Wallpaper Maya — Combined Foreground Diagnostic (Fixed)</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0b0c10; color: #f3f4f6; }
    main { max-width: 720px; margin: 0 auto; padding: 20px 16px 40px; }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    p.lead { margin: 0 0 16px; color: #9ca3af; font-size: 0.92rem; }
    .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }
    button, select, input[type="file"] { font: inherit; }
    button { padding: 9px 14px; border-radius: 8px; border: 1px solid #2e3440; background: #1f2430; color: #fff; cursor: pointer; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    button.primary { background: #eab308; color: #0b0c10; border-color: #eab308; font-weight: 600; }
    label { display: inline-flex; align-items: center; gap: 6px; font-size: 0.9rem; color: #d1d5db; }
    input[type="range"] { vertical-align: middle; }
    #status { margin: 10px 0; padding: 10px 12px; border-radius: 8px; background: #141821; border: 1px solid #252c3b; font-size: 0.88rem; }
    #stats { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.8rem; color: #cbd5e1; background: #11151d; border: 1px solid #222836; border-radius: 8px; padding: 10px 12px; margin: 12px 0; }
    canvas { display: block; max-width: 100%; height: auto; border-radius: 12px; background: #111; margin: 16px auto 0; }
  </style>
</head>
<body>
  <main>
    <h1>Wallpaper Maya — Combined Foreground Diagnostic (Fixed)</h1>
    <p class="lead">Uses float32 selfie_multiclass_256x256, softmax foreground channel sum, display-resolution foreground compositing, and clean WASM memory disposal.</p>

    <div class="row">
      <input id="photo" type="file" accept="image/*" />
      <button id="detect" class="primary" disabled>Build foreground mask</button>
      <button id="clear" disabled>Clear photo</button>
    </div>

    <div id="status">Choose a portrait photo to begin.</div>

    <div class="row">
      <label><input id="showClock" type="checkbox" checked /> Show clock</label>
      <label><input id="overlay" type="checkbox" checked /> Green mask overlay</label>
      <label><input id="maskOnly" type="checkbox" /> Mask only</label>
    </div>

    <div class="row">
      <label>
        Mask threshold (<span id="thresholdValue">0.35</span>):
        <input id="threshold" type="range" min="0" max="95" value="35" />
      </label>
    </div>

    <div class="row">
      <label>
        Clock position:
        <select id="clockPos">
          <option value="top">Top</option>
          <option value="center" selected>Center</option>
          <option value="lower">Lower</option>
        </select>
      </label>
      <label>
        Clock size (<span id="clockSizeValue">104</span>px):
        <input id="clockSize" type="range" min="48" max="160" value="104" />
      </label>
    </div>

    <pre id="stats">No segmentation yet.</pre>
    <canvas id="view"></canvas>
  </main>

  <script type="module">
  const $ = id => document.getElementById(id), canvas = $('view'), ctx = canvas.getContext('2d');
  let photo = null, segmenter = null, photoUrl = null, masks = [], maskW = 0, maskH = 0, busy = false, combined = null;

  function status(s) { $('status').textContent = s; }

  function dims(img) {
    const scale = Math.min(640 / img.naturalWidth, 1100 / img.naturalHeight, 1);
    return [
      Math.max(1, Math.round(img.naturalWidth * scale)),
      Math.max(1, Math.round(img.naturalHeight * scale))
    ];
  }

  function buildCutout() {
    const tmp = document.createElement('canvas');
    tmp.width = maskW;
    tmp.height = maskH;
    const t = tmp.getContext('2d');
    const im = t.createImageData(maskW, maskH);
    const threshold = Number($('threshold').value) / 100;
    const denom = Math.max(0.001, 1 - threshold);
    for (let i = 0; i < combined.length; i++) {
      const a = Math.round(255 * Math.max(0, Math.min(1, (combined[i] - threshold) / denom)));
      im.data[i * 4] = 255;
      im.data[i * 4 + 1] = 255;
      im.data[i * 4 + 2] = 255;
      im.data[i * 4 + 3] = a;
    }
    t.putImageData(im, 0, 0);
    return tmp;
  }

  function updateStatsAndDraw() {
    if (!combined || !photo) return;
    const n = combined.length;
    const threshold = Number($('threshold').value) / 100;
    let above = 0, sum = 0, min = 1, max = 0;
    for (const v of combined) {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      if (v >= threshold) above++;
    }
    $('stats').textContent =
\`Input: \${photo.naturalWidth} × \${photo.naturalHeight}px
Mask: \${maskW} × \${maskH}px
Foreground channels combined: \${masks.slice(1).map(m => m.label).join(', ')}
Combination: sum of foreground softmax channels
Mask threshold: \${threshold.toFixed(2)}
Combined confidence: min \${min.toFixed(4)}, max \${max.toFixed(4)}, average \${(n ? sum / n : 0).toFixed(4)}
Pixels at/above threshold: \${(n ? 100 * above / n : 0).toFixed(2)}%\`;
    draw();
  }

  function makeCombined() {
    if (!masks.length) return;
    const n = masks[0].data.length;
    const vals = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      let fg = 0;
      for (let c = 1; c < masks.length; c++) {
        fg += Math.max(0, Math.min(1, masks[c].data[p]));
      }
      vals[p] = Math.min(1, fg);
    }
    combined = vals;
    updateStatsAndDraw();
  }

  function draw() {
    if (!photo) return;
    const [w, h] = dims(photo);
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    if (!combined) {
      ctx.drawImage(photo, 0, 0, w, h);
      return;
    }
    const mask = buildCutout();
    if ($('maskOnly').checked) {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(mask, 0, 0, w, h);
      return;
    }
    ctx.drawImage(photo, 0, 0, w, h);
    if ($('showClock').checked) {
      const size = Number($('clockSize').value);
      const y = $('clockPos').value === 'top' ? h * 0.22 : $('clockPos').value === 'lower' ? h * 0.68 : h * 0.46;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(255,255,255,.96)';
      ctx.font = \`300 \${size}px system-ui,sans-serif\`;
      ctx.fillText('10:08', w / 2, y);
      ctx.font = \`400 \${Math.max(14, Math.round(size * 0.24))}px system-ui,sans-serif\`;
      ctx.fillText('Thursday, November 26', w / 2, y + size * 0.72);
      ctx.restore();
    }
    const fg = document.createElement('canvas');
    fg.width = w;
    fg.height = h;
    const f = fg.getContext('2d');
    f.drawImage(photo, 0, 0, w, h);
    f.globalCompositeOperation = 'destination-in';
    f.drawImage(mask, 0, 0, w, h);
    ctx.drawImage(fg, 0, 0, w, h);

    if ($('overlay').checked) {
      const green = document.createElement('canvas');
      green.width = w;
      green.height = h;
      const g = green.getContext('2d');
      g.fillStyle = '#00ff55';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(mask, 0, 0, w, h);
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.drawImage(green, 0, 0, w, h);
      ctx.restore();
    }
  }

  $('photo').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      photo = im;
      masks = [];
      combined = null;
      $('stats').textContent = 'Photo loaded; segmentation not run yet.';
      $('detect').disabled = false;
      $('clear').disabled = false;
      draw();
      status('Photo loaded. Tap Build foreground mask.');
    };
    im.onerror = () => status('The browser could not decode this image. Try another JPG or PNG.');
    im.src = photoUrl;
  });

  async function init() {
    if (segmenter) return segmenter;
    status('Loading MediaPipe library and segmentation model. Please wait…');
    const { FilesetResolver, ImageSegmenter } = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs'
    );
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
    );
    segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
        delegate: 'CPU'
      },
      runningMode: 'IMAGE',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
      displayNamesLocale: 'en'
    });
    return segmenter;
  }

  $('detect').addEventListener('click', async () => {
    if (!photo || busy) return;
    const activePhoto = photo;
    busy = true;
    $('detect').disabled = true;
    $('clear').disabled = true;
    $('photo').disabled = true;
    try {
      const task = await init();
      if (photo !== activePhoto) return;
      status('Running segmentation and combining foreground channels…');

      const [sw, sh] = dims(activePhoto);
      const inputCanvas = document.createElement('canvas');
      inputCanvas.width = sw;
      inputCanvas.height = sh;
      inputCanvas.getContext('2d').drawImage(activePhoto, 0, 0, sw, sh);

      const result = task.segment(inputCanvas);
      try {
        const labels = task.getLabels();
        masks = (result.confidenceMasks || []).map((mask, i) => ({
          label: labels[i] || \`Channel \${i}\`,
          data: mask.getAsFloat32Array().slice(),
          width: mask.width,
          height: mask.height
        }));
      } finally {
        result.close();
      }

      if (masks.length < 2) {
        throw new Error('Expected multiple confidence channels, but the model returned ' + masks.length + '.');
      }
      maskW = masks[0].width;
      maskH = masks[0].height;
      makeCombined();
      status('Combined foreground mask ready. Inspect the green overlay and clock layering.');
    } catch (err) {
      console.error(err);
      status('Segmentation could not start: ' + (err?.message || String(err)) + ' — Check internet access or try Chrome.');
    } finally {
      busy = false;
      $('detect').disabled = !photo;
      $('clear').disabled = !photo;
      $('photo').disabled = false;
    }
  });

  $('threshold').addEventListener('input', () => {
    $('thresholdValue').textContent = (Number($('threshold').value) / 100).toFixed(2);
    if (combined) updateStatsAndDraw();
  });

  $('clockSize').addEventListener('input', () => {
    $('clockSizeValue').textContent = $('clockSize').value;
    draw();
  });

  ['overlay', 'maskOnly', 'clockPos', 'showClock'].forEach(id => $(id).addEventListener('change', draw));

  $('clear').addEventListener('click', () => {
    if (photoUrl) {
      URL.revokeObjectURL(photoUrl);
      photoUrl = null;
    }
    photo = null;
    masks = [];
    combined = null;
    maskW = maskH = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
    $('photo').value = '';
    $('detect').disabled = true;
    $('clear').disabled = true;
    $('stats').textContent = 'No segmentation yet.';
    status('Photo cleared.');
  });
  </script>
</body>
</html>
`;
