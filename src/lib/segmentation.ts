import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import {
  ChannelMask,
  ClockColorPreset,
  ClockFontStyle,
  ClockSettings,
  CombineFormula,
  ExportResolutionPreset,
  MaskMetrics,
  SegmentationRun,
  ViewMode,
} from '../types';

const MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';

const DEFAULT_CHANNEL_LABELS = [
  'Background',
  'Hair',
  'Body skin',
  'Face skin',
  'Clothes',
  'Others',
];

let segmenterPromise: Promise<ImageSegmenter> | null = null;

export function computeDisplayDims(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth = 640,
  maxHeight = 1100
): [number, number] {
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
  return [
    Math.max(1, Math.round(naturalWidth * scale)),
    Math.max(1, Math.round(naturalHeight * scale)),
  ];
}

async function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks('/mediapipe-wasm');
      } catch {
        vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
        );
      }

      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_URL,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
        displayNamesLocale: 'en',
      });
    })().catch((err) => {
      segmenterPromise = null;
      throw err;
    });
  }
  return segmenterPromise;
}

function formatChannelLabel(raw: string | undefined, index: number): string {
  if (!raw) return DEFAULT_CHANNEL_LABELS[index] ?? `Channel ${index}`;
  const cleaned = raw.replace(/_/g, ' ').trim();
  if (!cleaned) return DEFAULT_CHANNEL_LABELS[index] ?? `Channel ${index}`;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export async function runMulticlassSegmentation(
  img: HTMLImageElement
): Promise<SegmentationRun> {
  const segmenter = await getSegmenter();
  const [scaledWidth, scaledHeight] = computeDisplayDims(
    img.naturalWidth,
    img.naturalHeight
  );

  const inputCanvas = document.createElement('canvas');
  inputCanvas.width = scaledWidth;
  inputCanvas.height = scaledHeight;
  const inputCtx = inputCanvas.getContext('2d');
  if (!inputCtx) {
    throw new Error('Could not initialize 2D canvas context for segmentation.');
  }
  inputCtx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

  const t0 = performance.now();
  const result = segmenter.segment(inputCanvas);
  const inferenceMs = Math.max(1, Math.round(performance.now() - t0));

  let channels: ChannelMask[] = [];
  try {
    const labels = segmenter.getLabels();
    const confidenceMasks = result.confidenceMasks ?? [];
    channels = confidenceMasks.map((mask, index) => {
      const copied = mask.getAsFloat32Array().slice();
      let sum = 0;
      let aboveHalf = 0;
      for (let i = 0; i < copied.length; i++) {
        const v = copied[i];
        sum += v;
        if (v >= 0.5) aboveHalf++;
      }
      const len = copied.length || 1;
      return {
        index,
        label: formatChannelLabel(labels[index], index),
        data: copied,
        width: mask.width,
        height: mask.height,
        mean: sum / len,
        coverageAtHalf: (100 * aboveHalf) / len,
      };
    });
  } finally {
    result.close();
  }

  if (channels.length < 2) {
    throw new Error(
      `Expected multiclass confidence masks, but the model returned ${channels.length}.`
    );
  }

  return {
    channels,
    maskWidth: channels[0].width,
    maskHeight: channels[0].height,
    scaledWidth,
    scaledHeight,
    inputWidth: img.naturalWidth,
    inputHeight: img.naturalHeight,
    inferenceMs,
  };
}

export function combineForegroundChannels(
  channels: ChannelMask[],
  enabledIndices: number[],
  formula: CombineFormula
): Float32Array {
  if (!channels.length) return new Float32Array(0);
  const n = channels[0].data.length;
  const active = channels.filter((c) => enabledIndices.includes(c.index));
  const out = new Float32Array(n);
  if (!active.length) return out;

  if (formula === 'softmax-sum') {
    for (let p = 0; p < n; p++) {
      let fg = 0;
      for (let c = 0; c < active.length; c++) {
        const v = active[c].data[p];
        fg += v < 0 ? 0 : v > 1 ? 1 : v;
      }
      out[p] = fg > 1 ? 1 : fg;
    }
  } else {
    // Legacy soft-union formula for direct visual seam comparison
    for (let p = 0; p < n; p++) {
      let remain = 1;
      for (let c = 0; c < active.length; c++) {
        const raw = active[c].data[p];
        const v = raw < 0 ? 0 : raw > 1 ? 1 : raw;
        remain *= 1 - v;
      }
      out[p] = 1 - remain;
    }
  }

  return out;
}

export function computeMaskMetrics(
  combined: Float32Array,
  threshold: number
): MaskMetrics {
  const n = combined.length;
  if (!n) {
    return { min: 0, max: 0, average: 0, abovePercent: 0, pixelCount: 0 };
  }
  let min = 1;
  let max = 0;
  let sum = 0;
  let above = 0;
  for (let i = 0; i < n; i++) {
    const v = combined[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    if (v >= threshold) above++;
  }
  return {
    min,
    max,
    average: sum / n,
    abovePercent: (100 * above) / n,
    pixelCount: n,
  };
}

export function buildAlphaCutoutCanvas(
  combined: Float32Array,
  maskW: number,
  maskH: number,
  threshold: number
): HTMLCanvasElement {
  const tmp = document.createElement('canvas');
  tmp.width = maskW;
  tmp.height = maskH;
  const t = tmp.getContext('2d')!;
  const im = t.createImageData(maskW, maskH);
  const denom = Math.max(0.001, 1 - threshold);
  const data = im.data;
  for (let i = 0; i < combined.length; i++) {
    const norm = (combined[i] - threshold) / denom;
    const clamped = norm < 0 ? 0 : norm > 1 ? 1 : norm;
    const idx = i * 4;
    data[idx] = 255;
    data[idx + 1] = 255;
    data[idx + 2] = 255;
    data[idx + 3] = Math.round(255 * clamped);
  }
  t.putImageData(im, 0, 0);
  return tmp;
}

const CLOCK_COLOR_MAP: Record<
  ClockColorPreset,
  { fill: string; dateFill: string; shadow: string }
> = {
  ivory: {
    fill: 'rgba(255, 255, 255, 0.96)',
    dateFill: 'rgba(255, 255, 255, 0.88)',
    shadow: 'rgba(0, 0, 0, 0.48)',
  },
  gold: {
    fill: 'rgba(252, 224, 155, 0.96)',
    dateFill: 'rgba(252, 224, 155, 0.88)',
    shadow: 'rgba(18, 12, 4, 0.56)',
  },
  obsidian: {
    fill: 'rgba(18, 20, 24, 0.92)',
    dateFill: 'rgba(18, 20, 24, 0.82)',
    shadow: 'rgba(255, 255, 255, 0.35)',
  },
  ice: {
    fill: 'rgba(219, 238, 255, 0.96)',
    dateFill: 'rgba(219, 238, 255, 0.86)',
    shadow: 'rgba(8, 20, 38, 0.5)',
  },
};

function getClockFontSpec(
  style: ClockFontStyle,
  size: number
): { timeFont: string; dateFont: string } {
  const dateSize = Math.max(13, Math.round(size * 0.21));
  switch (style) {
    case 'editorial-serif':
      return {
        timeFont: `600 ${Math.round(size * 1.12)}px "Cormorant Garamond", Georgia, serif`,
        dateFont: `500 ${dateSize}px "Plus Jakarta Sans", system-ui, sans-serif`,
      };
    case 'sans-bold':
      return {
        timeFont: `700 ${size}px "Outfit", system-ui, sans-serif`,
        dateFont: `500 ${dateSize}px "Plus Jakarta Sans", system-ui, sans-serif`,
      };
    case 'sans-light':
    default:
      return {
        timeFont: `300 ${size}px "Outfit", system-ui, sans-serif`,
        dateFont: `400 ${dateSize}px "Plus Jakarta Sans", system-ui, sans-serif`,
      };
  }
}

function drawLockScreenClock(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  clock: ClockSettings,
  scaleFactor = 1
) {
  if (!clock.visible) return;
  const size = Math.round(clock.fontSize * scaleFactor);
  const y = (h * clock.yPercent) / 100;
  const palette = CLOCK_COLOR_MAP[clock.colorPreset];
  const { timeFont, dateFont } = getClockFontSpec(clock.fontStyle, size);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = Math.round(14 * scaleFactor);
  ctx.shadowOffsetY = Math.round(2 * scaleFactor);

  if (clock.dateText.trim()) {
    ctx.fillStyle = palette.dateFill;
    ctx.font = dateFont;
    ctx.fillText(clock.dateText, w / 2, y - size * 0.62);
  }

  ctx.fillStyle = palette.fill;
  ctx.font = timeFont;
  ctx.fillText(clock.timeText || '10:08', w / 2, y);
  ctx.restore();
}

export interface RenderCompositeParams {
  photo: HTMLImageElement;
  combined: Float32Array | null;
  maskW: number;
  maskH: number;
  threshold: number;
  featherPx: number;
  overlayOpacity: number;
  viewMode: ViewMode;
  splitRatio: number;
  clock: ClockSettings;
}

export function renderWallpaperPreview(
  canvas: HTMLCanvasElement,
  params: RenderCompositeParams
) {
  const {
    photo,
    combined,
    maskW,
    maskH,
    threshold,
    featherPx,
    overlayOpacity,
    viewMode,
    splitRatio,
    clock,
  } = params;

  const [w, h] = computeDisplayDims(photo.naturalWidth, photo.naturalHeight);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);

  if (!combined || maskW === 0 || maskH === 0) {
    ctx.drawImage(photo, 0, 0, w, h);
    drawLockScreenClock(ctx, w, h, clock, 1);
    return;
  }

  const rawMask = buildAlphaCutoutCanvas(combined, maskW, maskH, threshold);

  if (viewMode === 'mask-only') {
    ctx.fillStyle = '#0e0e12';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    if (featherPx > 0) ctx.filter = `blur(${featherPx}px)`;
    ctx.drawImage(rawMask, 0, 0, w, h);
    ctx.restore();
    return;
  }

  // Build crisp display-resolution foreground cutout
  const fg = document.createElement('canvas');
  fg.width = w;
  fg.height = h;
  const fCtx = fg.getContext('2d')!;
  fCtx.drawImage(photo, 0, 0, w, h);
  fCtx.globalCompositeOperation = 'destination-in';
  if (featherPx > 0) fCtx.filter = `blur(${featherPx}px)`;
  fCtx.drawImage(rawMask, 0, 0, w, h);
  fCtx.filter = 'none';

  // Background + clock
  ctx.drawImage(photo, 0, 0, w, h);
  drawLockScreenClock(ctx, w, h, clock, 1);

  if (viewMode === 'split') {
    const splitX = Math.round(w * splitRatio);
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, w - splitX, h);
    ctx.clip();
    ctx.drawImage(fg, 0, 0, w, h);
    ctx.restore();

    // Subtle crisp split hairline
    ctx.save();
    ctx.strokeStyle = 'rgba(242, 183, 5, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, h);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Foreground layered cleanly above the clock
  ctx.drawImage(fg, 0, 0, w, h);

  if (viewMode === 'overlay') {
    const green = document.createElement('canvas');
    green.width = w;
    green.height = h;
    const gCtx = green.getContext('2d')!;
    gCtx.fillStyle = '#00ff55';
    gCtx.fillRect(0, 0, w, h);
    gCtx.globalCompositeOperation = 'destination-in';
    if (featherPx > 0) gCtx.filter = `blur(${featherPx}px)`;
    gCtx.drawImage(rawMask, 0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = overlayOpacity;
    ctx.drawImage(green, 0, 0, w, h);
    ctx.restore();
  }
}

export function computeExportDims(
  naturalWidth: number,
  naturalHeight: number,
  preset: ExportResolutionPreset
): [number, number] {
  const safeW = Math.max(1, naturalWidth);
  const safeH = Math.max(1, naturalHeight);

  if (preset === 'original') {
    return [safeW, safeH];
  }

  if (preset === '4k') {
    // High-quality 4K UHD preserving exact photo aspect ratio (long edge = 3840px)
    const longEdge = 3840;
    const scale = longEdge / Math.max(safeW, safeH);
    return [
      Math.max(1, Math.round(safeW * scale)),
      Math.max(1, Math.round(safeH * scale)),
    ];
  }

  // 'screen': Fit cleanly to the user's current device screen pixel dimensions
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const screenW =
    typeof window !== 'undefined'
      ? Math.max(360, Math.round(window.screen.width * dpr))
      : 1170;
  const screenH =
    typeof window !== 'undefined'
      ? Math.max(640, Math.round(window.screen.height * dpr))
      : 2532;

  const isPortraitPhoto = safeH >= safeW;
  const targetMaxW = isPortraitPhoto
    ? Math.min(screenW, screenH)
    : Math.max(screenW, screenH);
  const targetMaxH = isPortraitPhoto
    ? Math.max(screenW, screenH)
    : Math.min(screenW, screenH);

  const scale = Math.min(targetMaxW / safeW, targetMaxH / safeH);
  return [
    Math.max(1, Math.round(safeW * scale)),
    Math.max(1, Math.round(safeH * scale)),
  ];
}

export function exportWallpaperDataUrl(
  photo: HTMLImageElement,
  combined: Float32Array | null,
  maskW: number,
  maskH: number,
  threshold: number,
  featherPx: number,
  clock: ClockSettings,
  preset: ExportResolutionPreset = 'original'
): string {
  const [displayW] = computeDisplayDims(photo.naturalWidth, photo.naturalHeight);
  const [exportW, exportH] = computeExportDims(
    photo.naturalWidth,
    photo.naturalHeight,
    preset
  );
  const scaleFactor = exportW / displayW;

  const out = document.createElement('canvas');
  out.width = exportW;
  out.height = exportH;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(photo, 0, 0, exportW, exportH);
  drawLockScreenClock(ctx, exportW, exportH, clock, scaleFactor);

  if (combined && maskW > 0 && maskH > 0) {
    const rawMask = buildAlphaCutoutCanvas(combined, maskW, maskH, threshold);
    const fg = document.createElement('canvas');
    fg.width = exportW;
    fg.height = exportH;
    const fCtx = fg.getContext('2d')!;
    fCtx.imageSmoothingEnabled = true;
    fCtx.imageSmoothingQuality = 'high';
    fCtx.drawImage(photo, 0, 0, exportW, exportH);
    fCtx.globalCompositeOperation = 'destination-in';
    if (featherPx > 0) {
      fCtx.filter = `blur(${(featherPx * scaleFactor).toFixed(2)}px)`;
    }
    fCtx.drawImage(rawMask, 0, 0, exportW, exportH);
    fCtx.filter = 'none';
    ctx.drawImage(fg, 0, 0, exportW, exportH);
  }

  return out.toDataURL('image/png');
}

