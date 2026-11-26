import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Download,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { AnimateVideoPanel } from './components/AnimateVideoPanel';
import { ChannelGrid } from './components/ChannelGrid';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { FixedCodePanel } from './components/FixedCodePanel';
import { SAMPLE_PHOTOS } from './data/samples';
import {
  combineForegroundChannels,
  computeExportDims,
  computeMaskMetrics,
  exportWallpaperDataUrl,
  renderWallpaperPreview,
  runMulticlassSegmentation,
} from './lib/segmentation';
import {
  ClockColorPreset,
  ClockFontStyle,
  ClockPosPreset,
  ClockSettings,
  CombineFormula,
  ExportResolutionPreset,
  SamplePhoto,
  SegmentationRun,
  ViewMode,
  WorkspaceTab,
} from './types';

const EXPORT_PRESET_OPTIONS: {
  id: ExportResolutionPreset;
  label: string;
  description: string;
}[] = [
  {
    id: 'screen',
    label: 'Current screen size',
    description: 'Matched to this display',
  },
  {
    id: 'original',
    label: 'Original resolution',
    description: 'Native source dimensions',
  },
  {
    id: '4k',
    label: 'High-quality 4K',
    description: '3840px long edge UHD',
  },
];

const DEFAULT_FG_CHANNELS = [1, 2, 3, 4, 5];

const POS_PRESET_Y: Record<ClockPosPreset, number> = {
  top: 22,
  upper: 38,
  center: 48,
  lower: 68,
};

function formatNowStrings(): { timeText: string; dateText: string } {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const dateText = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return { timeText: `${hours}:${minutes}`, dateText };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('studio');
  const [activeSampleId, setActiveSampleId] = useState<string | null>(
    SAMPLE_PHOTOS[0].id
  );
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [photoTitle, setPhotoTitle] = useState<string>(SAMPLE_PHOTOS[0].title);
  const [segRun, setSegRun] = useState<SegmentationRun | null>(null);

  const [busy, setBusy] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>(
    'Loading sample portrait…'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mask & compositing controls
  const [formula, setFormula] = useState<CombineFormula>('softmax-sum');
  const [enabledChannels, setEnabledChannels] = useState<number[]>(
    DEFAULT_FG_CHANNELS
  );
  const [threshold, setThreshold] = useState<number>(0.35);
  const [featherPx, setFeatherPx] = useState<number>(0.8);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.42);
  const [viewMode, setViewMode] = useState<ViewMode>('depth');
  const [splitRatio, setSplitRatio] = useState<number>(0.5);
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Lock-screen clock settings
  const [clock, setClock] = useState<ClockSettings>(() => ({
    visible: true,
    timeText: '10:08',
    dateText: 'Thursday, November 26',
    posPreset: 'upper',
    yPercent: SAMPLE_PHOTOS[0].recommendedClockY,
    fontSize: 112,
    fontStyle: 'sans-light',
    colorPreset: SAMPLE_PHOTOS[0].recommendedClockColor,
  }));

  const [exportPreset, setExportPreset] =
    useState<ExportResolutionPreset>('original');
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const runTokenRef = useRef<number>(0);

  // Close top-bar Export PNG dropdown on outside click or Escape
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as Node)
      ) {
        setExportMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [exportMenuOpen]);

  // Cleanup any uploaded ObjectURL on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  // Recompute combined foreground probability only when channels, selection, or formula changes
  const combined = useMemo(() => {
    if (!segRun) return null;
    return combineForegroundChannels(segRun.channels, enabledChannels, formula);
  }, [segRun, enabledChannels, formula]);

  // Fast metrics calculation on threshold change without re-combining channels
  const metrics = useMemo(() => {
    if (!combined) return null;
    return computeMaskMetrics(combined, threshold);
  }, [combined, threshold]);

  const executeSegmentation = useCallback(async (img: HTMLImageElement) => {
    const token = ++runTokenRef.current;
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage('Running MediaPipe multiclass foreground segmentation…');

    try {
      const result = await runMulticlassSegmentation(img);
      if (runTokenRef.current !== token) return;
      setSegRun(result);
      setEnabledChannels(
        result.channels.slice(1).map((ch) => ch.index)
      );
      setStatusMessage(
        `Foreground mask ready in ${result.inferenceMs} ms.`
      );
    } catch (err) {
      if (runTokenRef.current !== token) return;
      const msg =
        err instanceof Error ? err.message : 'Unable to initialize MediaPipe segmenter.';
      setErrorMessage(msg);
      setStatusMessage('Segmentation paused.');
    } finally {
      if (runTokenRef.current === token) {
        setBusy(false);
      }
    }
  }, []);

  const loadSamplePhoto = useCallback(
    (sample: SamplePhoto) => {
      const token = ++runTokenRef.current;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setActiveSampleId(sample.id);
      setPhotoTitle(sample.title);
      setSegRun(null);
      setErrorMessage(null);
      setStatusMessage(`Loading ${sample.title}…`);
      setClock((prev) => ({
        ...prev,
        yPercent: sample.recommendedClockY,
        colorPreset: sample.recommendedClockColor,
      }));

      const img = new Image();
      img.onload = () => {
        if (runTokenRef.current !== token) return;
        setPhoto(img);
        void executeSegmentation(img);
      };
      img.onerror = () => {
        if (runTokenRef.current !== token) return;
        setErrorMessage(`Could not load sample image "${sample.title}".`);
        setStatusMessage('Image failed to load.');
      };
      img.src = sample.url;
    },
    [executeSegmentation]
  );

  // Auto-load initial sample portrait on mount
  useEffect(() => {
    loadSamplePhoto(SAMPLE_PHOTOS[0]);
  }, [loadSamplePhoto]);

  const loadUserFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        setErrorMessage('Please choose a valid JPG, PNG, or WebP image file.');
        return;
      }
      const token = ++runTokenRef.current;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;

      setActiveSampleId(null);
      setPhotoTitle(file.name);
      setSegRun(null);
      setErrorMessage(null);
      setStatusMessage(`Decoding ${file.name}…`);

      const img = new Image();
      img.onload = () => {
        if (runTokenRef.current !== token) return;
        setPhoto(img);
        void executeSegmentation(img);
      };
      img.onerror = () => {
        if (runTokenRef.current !== token) return;
        setErrorMessage('The browser could not decode this image. Try another JPG or PNG.');
        setStatusMessage('Could not decode image.');
      };
      img.src = url;
    },
    [executeSegmentation]
  );

  const handleClearPhoto = () => {
    runTokenRef.current++;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPhoto(null);
    setSegRun(null);
    setActiveSampleId(null);
    setPhotoTitle('No photo loaded');
    setBusy(false);
    setErrorMessage(null);
    setStatusMessage('Photo cleared. Upload an image or pick a studio sample.');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Render preview canvas whenever any visual parameter changes
  useEffect(() => {
    if (activeTab !== 'studio') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!photo) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    renderWallpaperPreview(canvas, {
      photo,
      combined,
      maskW: segRun?.maskWidth ?? 0,
      maskH: segRun?.maskHeight ?? 0,
      threshold,
      featherPx,
      overlayOpacity,
      viewMode,
      splitRatio,
      clock,
    });
  }, [
    activeTab,
    photo,
    combined,
    segRun,
    threshold,
    featherPx,
    overlayOpacity,
    viewMode,
    splitRatio,
    clock,
  ]);

  const handleToggleChannel = (index: number) => {
    setEnabledChannels((prev) =>
      prev.includes(index)
        ? prev.filter((item) => item !== index)
        : [...prev, index].sort((a, b) => a - b)
    );
  };

  const exportDimsByPreset = useMemo(() => {
    if (!photo) return null;
    return {
      screen: computeExportDims(photo.naturalWidth, photo.naturalHeight, 'screen'),
      original: computeExportDims(photo.naturalWidth, photo.naturalHeight, 'original'),
      '4k': computeExportDims(photo.naturalWidth, photo.naturalHeight, '4k'),
    };
  }, [photo]);

  const handleExportPng = (presetOverride?: ExportResolutionPreset) => {
    if (!photo) return;
    const chosenPreset = presetOverride ?? exportPreset;
    const dataUrl = exportWallpaperDataUrl(
      photo,
      combined,
      segRun?.maskWidth ?? 0,
      segRun?.maskHeight ?? 0,
      threshold,
      featherPx,
      clock,
      chosenPreset
    );
    const link = document.createElement('a');
    link.href = dataUrl;
    const slug = photoTitle
      .toLowerCase()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    link.download = `wallpaper-maya-${slug || 'export'}-${chosenPreset}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportMenuOpen(false);
  };

  const handleCaptureStudioWallpaper = useCallback((): string | null => {
    if (!photo) return null;
    return exportWallpaperDataUrl(
      photo,
      combined,
      segRun?.maskWidth ?? 0,
      segRun?.maskHeight ?? 0,
      threshold,
      featherPx,
      clock,
      'screen'
    );
  }, [photo, combined, segRun, threshold, featherPx, clock]);

  const updateSplitFromClientX = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    setSplitRatio(Math.max(0.05, Math.min(0.95, ratio)));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadUserFile(file);
  };

  const handleSelectPosPreset = (preset: ClockPosPreset) => {
    setClock((prev) => ({
      ...prev,
      posPreset: preset,
      yPercent: POS_PRESET_Y[preset],
    }));
  };

  const handleSyncNow = () => {
    const { timeText, dateText } = formatNowStrings();
    setClock((prev) => ({ ...prev, timeText, dateText }));
  };

  return (
    <div className="min-h-screen bg-[#08080A] text-[#F4F4F6] flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#08080A]/92 backdrop-blur-md border-b border-[#1E1E26]">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-6 h-15 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            className="font-[var(--font-display)] text-lg font-semibold tracking-tight text-[#F4F4F6] hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] rounded"
          >
            Wallpaper Maya
          </button>

          {/* Zone 2: Clean single-line text navigation links */}
          <nav
            aria-label="Primary workspace navigation"
            className="flex items-center gap-5 sm:gap-7 overflow-x-auto"
          >
            {(
              [
                ['studio', 'Studio'],
                ['animate', 'Animate'],
                ['channels', 'Channels'],
                ['diagnostics', 'Diagnostics'],
                ['code', 'Fixed HTML'],
              ] as [WorkspaceTab, string][]
            ).map(([id, label]) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`relative py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] rounded ${
                    isActive
                      ? 'text-[#F4F4F6]'
                      : 'text-[#8E8E9E] hover:text-[#D4D4DF]'
                  }`}
                >
                  {label}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-[13px] h-[2px] bg-[#F2B705]"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single primary Export PNG action with resolution dropdown */}
          <div ref={exportMenuRef} className="relative shrink-0">
            <div className="inline-flex items-stretch rounded-lg bg-[#F2B705] text-[#08080A] overflow-hidden">
              <button
                type="button"
                onClick={() => handleExportPng()}
                disabled={!photo}
                className="inline-flex items-center gap-2 pl-3.5 pr-3 py-2 text-xs font-semibold hover:bg-[#e0aa04] disabled:opacity-35 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#08080A]"
              >
                <Download className="w-3.5 h-3.5" />
                Export PNG
              </button>
              <button
                type="button"
                disabled={!photo}
                aria-label="Choose Export PNG resolution"
                aria-expanded={exportMenuOpen}
                aria-haspopup="menu"
                onClick={() => setExportMenuOpen((prev) => !prev)}
                className="inline-flex items-center justify-center px-2 py-2 border-l border-[#08080A]/20 hover:bg-[#e0aa04] disabled:opacity-35 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#08080A]"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-150 ${
                    exportMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            {exportMenuOpen && photo && (
              <div
                role="menu"
                aria-label="Export PNG resolution options"
                className="absolute right-0 mt-2 w-64 rounded-xl border border-[#262632] bg-[#111116] shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-1.5 z-40"
              >
                <div className="px-2.5 py-1.5 text-[11px] font-medium text-[#8E8E9E] border-b border-[#1E1E26] mb-1">
                  Output Resolution
                </div>
                {EXPORT_PRESET_OPTIONS.map((opt) => {
                  const dims = exportDimsByPreset?.[opt.id];
                  const selected = exportPreset === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => {
                        setExportPreset(opt.id);
                        handleExportPng(opt.id);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg flex items-start justify-between gap-2 transition-colors ${
                        selected
                          ? 'bg-[#1D1C15] text-[#F4F4F6]'
                          : 'text-[#D4D4DF] hover:bg-[#1A1A22]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[#F4F4F6] flex items-center gap-1.5">
                          <span>{opt.label}</span>
                        </div>
                        <div className="text-[11px] text-[#8E8E9E] font-mono tabular-nums mt-0.5">
                          {dims
                            ? `${dims[0]} × ${dims[1]} px`
                            : opt.description}
                        </div>
                      </div>
                      {selected && (
                        <Check className="w-3.5 h-3.5 text-[#F2B705] shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadUserFile(file);
        }}
      />

      {/* Main Workspace */}
      <main className="flex-1">
        {activeTab === 'studio' && (
          <div className="max-w-[1400px] mx-auto px-5 sm:px-6 py-6 lg:py-8">
            <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-start">
              {/* Dominant Focal Anchor: Darkroom Canvas Viewport */}
              <section
                aria-label="Wallpaper depth preview stage"
                className="flex-1 w-full flex flex-col items-center"
              >
                {/* Interactive View Mode Segmented Control */}
                <div className="w-full max-w-[540px] flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div
                    role="tablist"
                    aria-label="Canvas preview mode"
                    className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#121217] border border-[#22222A]"
                  >
                    {(
                      [
                        ['depth', 'Depth'],
                        ['overlay', 'Mask Overlay'],
                        ['mask-only', 'Alpha Mask'],
                        ['split', 'Split Compare'],
                      ] as [ViewMode, string][]
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        role="tab"
                        aria-selected={viewMode === mode}
                        type="button"
                        onClick={() => setViewMode(mode)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] ${
                          viewMode === mode
                            ? 'bg-[#23232D] text-[#F4F4F6]'
                            : 'text-[#8E8E9E] hover:text-[#D4D4DF]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <span className="text-xs text-[#8E8E9E] truncate max-w-[200px]">
                    {photoTitle}
                  </span>
                </div>

                {/* Canvas Stage Frame */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  className={`relative w-full max-w-[540px] min-h-[460px] rounded-2xl border transition-colors flex items-center justify-center p-4 sm:p-6 bg-[#0F0F13] ${
                    isDragOver
                      ? 'border-[#F2B705] bg-[#161511]'
                      : 'border-[#202028]'
                  }`}
                >
                  {photo ? (
                    <div
                      className={`relative inline-flex items-center justify-center rounded-[28px] overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.75)] ring-1 ring-white/10 select-none ${
                        viewMode === 'split' ? 'cursor-ew-resize' : ''
                      }`}
                      onPointerDown={(e) => {
                        if (viewMode !== 'split') return;
                        setIsDraggingSplit(true);
                        (e.currentTarget as HTMLElement).setPointerCapture(
                          e.pointerId
                        );
                        updateSplitFromClientX(e.clientX);
                      }}
                      onPointerMove={(e) => {
                        if (!isDraggingSplit || viewMode !== 'split') return;
                        updateSplitFromClientX(e.clientX);
                      }}
                      onPointerUp={() => setIsDraggingSplit(false)}
                      onPointerCancel={() => setIsDraggingSplit(false)}
                    >
                      <canvas
                        ref={canvasRef}
                        className="block max-h-[70vh] max-w-full w-auto h-auto"
                        aria-label="Composited lock-screen wallpaper preview"
                      />

                      {viewMode === 'split' && segRun && (
                        <>
                          <div className="pointer-events-none absolute top-3 left-3 text-[11px] font-medium text-white/90 bg-black/55 backdrop-blur-sm px-2.5 py-1 rounded-md">
                            Flat Clock
                          </div>
                          <div className="pointer-events-none absolute top-3 right-3 text-[11px] font-medium text-[#F2B705] bg-black/55 backdrop-blur-sm px-2.5 py-1 rounded-md">
                            Depth Masked
                          </div>
                        </>
                      )}

                      {busy && (
                        <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center">
                          <div className="px-4 py-2.5 rounded-lg bg-[#111115]/95 border border-[#2A2A35] text-xs font-medium text-[#F4F4F6] flex items-center gap-2.5">
                            <RefreshCw className="w-3.5 h-3.5 text-[#F2B705] animate-spin" />
                            <span>Building foreground mask…</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-20 px-6 text-center max-w-sm">
                      <p className="font-[var(--font-display)] text-lg font-medium text-[#F4F4F6]">
                        Drop a portrait photo here
                      </p>
                      <p className="text-sm text-[#8E8E9E] mt-1.5">
                        Upload any JPG, PNG, or WebP portrait, or choose one of the studio samples on the right.
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#F2B705] text-[#08080A] hover:bg-[#e0aa04] transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Choose Photo
                      </button>
                    </div>
                  )}
                </div>

                {/* Unboxed Inline Metadata & Error Caption */}
                <div className="w-full max-w-[540px] mt-3.5 px-1">
                  {errorMessage ? (
                    <div className="flex items-center justify-between gap-3 py-2.5 px-3.5 rounded-lg border border-rose-500/35 bg-rose-950/30 text-xs text-rose-200">
                      <span>{errorMessage}</span>
                      {photo && (
                        <button
                          type="button"
                          onClick={() => void executeSegmentation(photo)}
                          className="text-rose-100 underline underline-offset-2 hover:text-white whitespace-nowrap shrink-0 font-medium"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#8E8E9E] font-mono tabular-nums">
                      <span>
                        {segRun && metrics
                          ? `${segRun.inputWidth}×${segRun.inputHeight}px · Mask ${segRun.maskWidth}×${segRun.maskHeight}px · ${metrics.abovePercent.toFixed(1)}% foreground · ${segRun.inferenceMs} ms`
                          : statusMessage}
                      </span>
                      {viewMode === 'split' && segRun && (
                        <span className="text-[#B4B4C2]">
                          Drag canvas to compare
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Right Control Inspector */}
              <aside
                aria-label="Segmentation and clock controls"
                className="w-full lg:w-[390px] shrink-0 divide-y divide-[#1E1E26] border-t lg:border-t-0 lg:border-l border-[#1E1E26] lg:pl-8 pt-6 lg:pt-0"
              >
                {/* Section 1: Photo Source */}
                <div className="pb-6">
                  <div className="flex items-center justify-between gap-2 mb-3.5">
                    <h2 className="font-[var(--font-display)] text-base font-semibold text-[#F4F4F6]">
                      Photo Source
                    </h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1A1A22] text-[#F4F4F6] hover:bg-[#24242F] disabled:opacity-40 transition-colors whitespace-nowrap"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload
                      </button>
                      <button
                        type="button"
                        disabled={!photo || busy}
                        onClick={handleClearPhoto}
                        aria-label="Clear photo"
                        className="inline-flex items-center justify-center p-1.5 rounded-lg border border-[#24242E] text-[#8E8E9E] hover:text-[#F4F4F6] hover:border-[#3A3A4A] disabled:opacity-35 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Studio Sample Portrait Strip */}
                  <div className="grid grid-cols-3 gap-2.5">
                    {SAMPLE_PHOTOS.map((sample) => {
                      const isSelected = activeSampleId === sample.id;
                      return (
                        <button
                          key={sample.id}
                          type="button"
                          disabled={busy}
                          onClick={() => loadSamplePhoto(sample)}
                          className={`group text-left rounded-xl overflow-hidden border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] disabled:opacity-50 ${
                            isSelected
                              ? 'border-[#F2B705]'
                              : 'border-[#22222A] hover:border-[#3A3A48]'
                          }`}
                        >
                          <div className="aspect-[3/4] bg-[#14141B] overflow-hidden">
                            <img
                              src={sample.url}
                              alt={`${sample.title} — ${sample.location}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover object-top transition-transform duration-200 group-hover:scale-[1.03]"
                            />
                          </div>
                          <div className="px-2 py-1.5 bg-[#101014]">
                            <p className="text-[11px] font-medium text-[#E4E4EC] truncate">
                              {sample.title}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={!photo || busy}
                    onClick={() => photo && void executeSegmentation(photo)}
                    className="mt-3.5 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border border-[#2C2C38] bg-[#14141B] text-[#F4F4F6] hover:bg-[#1C1C26] hover:border-[#3E3E4E] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${busy ? 'animate-spin text-[#F2B705]' : 'text-[#9898A6]'}`}
                    />
                    {busy
                      ? 'Segmenting Foreground…'
                      : segRun
                      ? 'Re-run Foreground Segmentation'
                      : 'Build Foreground Mask'}
                  </button>
                </div>

                {/* Section 2: Foreground Mask Controls */}
                <div className="py-6 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-[var(--font-display)] text-base font-semibold text-[#F4F4F6]">
                      Foreground Mask
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('channels')}
                      className="text-xs text-[#F2B705] hover:underline underline-offset-2 whitespace-nowrap"
                    >
                      Inspect 6 channels
                    </button>
                  </div>

                  {/* Formula Toggle: Softmax Sum vs Legacy Soft-Union */}
                  <div>
                    <span className="block text-xs text-[#9898A6] mb-1.5">
                      Channel combination formula
                    </span>
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#111116] border border-[#202028]">
                      <button
                        type="button"
                        onClick={() => setFormula('softmax-sum')}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          formula === 'softmax-sum'
                            ? 'bg-[#23232D] text-[#F4F4F6]'
                            : 'text-[#8E8E9E] hover:text-[#D4D4DF]'
                        }`}
                      >
                        Softmax Sum (Fixed)
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormula('legacy-soft-union')}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          formula === 'legacy-soft-union'
                            ? 'bg-[#23232D] text-[#F4F4F6]'
                            : 'text-[#8E8E9E] hover:text-[#D4D4DF]'
                        }`}
                      >
                        Soft-Union (Legacy)
                      </button>
                    </div>
                  </div>

                  {/* Mask Threshold Slider */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <label htmlFor="threshold-slider" className="text-[#C8C8D4]">
                        Mask threshold
                      </label>
                      <span className="font-mono tabular-nums text-[#F4F4F6]">
                        {threshold.toFixed(2)}
                      </span>
                    </div>
                    <input
                      id="threshold-slider"
                      type="range"
                      min={0}
                      max={95}
                      step={1}
                      value={Math.round(threshold * 100)}
                      onChange={(e) =>
                        setThreshold(Number(e.target.value) / 100)
                      }
                      className="w-full"
                    />
                  </div>

                  {/* Edge Feather Slider */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <label htmlFor="feather-slider" className="text-[#C8C8D4]">
                        Edge feather
                      </label>
                      <span className="font-mono tabular-nums text-[#F4F4F6]">
                        {featherPx.toFixed(1)} px
                      </span>
                    </div>
                    <input
                      id="feather-slider"
                      type="range"
                      min={0}
                      max={40}
                      step={2}
                      value={Math.round(featherPx * 10)}
                      onChange={(e) =>
                        setFeatherPx(Number(e.target.value) / 10)
                      }
                      className="w-full"
                    />
                  </div>

                  {/* Overlay Opacity (visible in Mask Overlay mode) */}
                  {viewMode === 'overlay' && (
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <label
                          htmlFor="overlay-opacity-slider"
                          className="text-[#C8C8D4]"
                        >
                          Green overlay opacity
                        </label>
                        <span className="font-mono tabular-nums text-[#F4F4F6]">
                          {Math.round(overlayOpacity * 100)}%
                        </span>
                      </div>
                      <input
                        id="overlay-opacity-slider"
                        type="range"
                        min={10}
                        max={85}
                        step={1}
                        value={Math.round(overlayOpacity * 100)}
                        onChange={(e) =>
                          setOverlayOpacity(Number(e.target.value) / 100)
                        }
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* Quick Foreground Channel Selector */}
                  {segRun && (
                    <div>
                      <span className="block text-xs text-[#9898A6] mb-2">
                        Active foreground classes
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {segRun.channels.slice(1).map((ch) => {
                          const active = enabledChannels.includes(ch.index);
                          return (
                            <button
                              key={ch.index}
                              type="button"
                              onClick={() => handleToggleChannel(ch.index)}
                              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                                active
                                  ? 'bg-[#1F1E17] border-[#F2B705]/70 text-[#F4E3A8]'
                                  : 'bg-[#111116] border-[#22222A] text-[#7E7E8E] hover:text-[#C8C8D4]'
                              }`}
                            >
                              {ch.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 3: Lock-Screen Clock */}
                <div className="pt-6 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-[var(--font-display)] text-base font-semibold text-[#F4F4F6]">
                      Lock-Screen Clock
                    </h2>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSyncNow}
                        className="text-xs text-[#9898A6] hover:text-[#F4F4F6] transition-colors whitespace-nowrap"
                      >
                        Use current time
                      </button>
                      <label className="inline-flex items-center gap-1.5 text-xs text-[#D4D4DF] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={clock.visible}
                          onChange={(e) =>
                            setClock((prev) => ({
                              ...prev,
                              visible: e.target.checked,
                            }))
                          }
                          className="accent-[#F2B705] w-3.5 h-3.5 rounded"
                        />
                        Visible
                      </label>
                    </div>
                  </div>

                  {/* Time & Date Inputs */}
                  <div className="grid grid-cols-12 gap-2.5">
                    <div className="col-span-4">
                      <label
                        htmlFor="clock-time-input"
                        className="block text-[11px] text-[#8E8E9E] mb-1"
                      >
                        Time
                      </label>
                      <input
                        id="clock-time-input"
                        type="text"
                        value={clock.timeText}
                        maxLength={8}
                        onChange={(e) =>
                          setClock((prev) => ({
                            ...prev,
                            timeText: e.target.value,
                          }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-lg bg-[#111116] border border-[#24242E] text-[#F4F4F6] focus:outline-none focus:border-[#F2B705]"
                      />
                    </div>
                    <div className="col-span-8">
                      <label
                        htmlFor="clock-date-input"
                        className="block text-[11px] text-[#8E8E9E] mb-1"
                      >
                        Date subtitle
                      </label>
                      <input
                        id="clock-date-input"
                        type="text"
                        value={clock.dateText}
                        maxLength={32}
                        onChange={(e) =>
                          setClock((prev) => ({
                            ...prev,
                            dateText: e.target.value,
                          }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[#111116] border border-[#24242E] text-[#F4F4F6] focus:outline-none focus:border-[#F2B705]"
                      />
                    </div>
                  </div>

                  {/* Position Presets + Fine Vertical Slider */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <label
                        htmlFor="clock-y-slider"
                        className="text-[#C8C8D4]"
                      >
                        Vertical position
                      </label>
                      <span className="font-mono tabular-nums text-[#F4F4F6]">
                        {clock.yPercent}%
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#111116] border border-[#202028] mb-2">
                      {(
                        [
                          ['top', 'Top'],
                          ['upper', 'Upper'],
                          ['center', 'Center'],
                          ['lower', 'Lower'],
                        ] as [ClockPosPreset, string][]
                      ).map(([preset, label]) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleSelectPosPreset(preset)}
                          className={`py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            clock.posPreset === preset
                              ? 'bg-[#23232D] text-[#F4F4F6]'
                              : 'text-[#8E8E9E] hover:text-[#D4D4DF]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <input
                      id="clock-y-slider"
                      type="range"
                      min={14}
                      max={80}
                      step={1}
                      value={clock.yPercent}
                      onChange={(e) =>
                        setClock((prev) => ({
                          ...prev,
                          yPercent: Number(e.target.value),
                        }))
                      }
                      className="w-full"
                    />
                  </div>

                  {/* Clock Size Slider */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <label
                        htmlFor="clock-size-slider"
                        className="text-[#C8C8D4]"
                      >
                        Clock size
                      </label>
                      <span className="font-mono tabular-nums text-[#F4F4F6]">
                        {clock.fontSize} px
                      </span>
                    </div>
                    <input
                      id="clock-size-slider"
                      type="range"
                      min={56}
                      max={160}
                      step={2}
                      value={clock.fontSize}
                      onChange={(e) =>
                        setClock((prev) => ({
                          ...prev,
                          fontSize: Number(e.target.value),
                        }))
                      }
                      className="w-full"
                    />
                  </div>

                  {/* Typography & Ink Color */}
                  <div className="grid grid-cols-12 gap-3 pt-1">
                    <div className="col-span-7">
                      <span className="block text-[11px] text-[#8E8E9E] mb-1.5">
                        Typography
                      </span>
                      <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#111116] border border-[#202028]">
                        {(
                          [
                            ['sans-light', 'Light'],
                            ['sans-bold', 'Bold'],
                            ['editorial-serif', 'Serif'],
                          ] as [ClockFontStyle, string][]
                        ).map(([style, label]) => (
                          <button
                            key={style}
                            type="button"
                            onClick={() =>
                              setClock((prev) => ({ ...prev, fontStyle: style }))
                            }
                            className={`py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                              clock.fontStyle === style
                                ? 'bg-[#23232D] text-[#F4F4F6]'
                                : 'text-[#8E8E9E] hover:text-[#D4D4DF]'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="col-span-5">
                      <span className="block text-[11px] text-[#8E8E9E] mb-1.5">
                        Clock ink
                      </span>
                      <div className="flex items-center gap-2 pt-1">
                        {(
                          [
                            ['ivory', 'Ivory white', 'bg-[#F5F5F7]'],
                            ['gold', 'Warm gold', 'bg-[#F7D786]'],
                            ['ice', 'Cool ice', 'bg-[#CFE6FF]'],
                            ['obsidian', 'Dark ink', 'bg-[#1E2128]'],
                          ] as [ClockColorPreset, string, string][]
                        ).map(([preset, ariaLabel, bgClass]) => {
                          const selected = clock.colorPreset === preset;
                          return (
                            <button
                              key={preset}
                              type="button"
                              aria-label={ariaLabel}
                              title={ariaLabel}
                              onClick={() =>
                                setClock((prev) => ({
                                  ...prev,
                                  colorPreset: preset,
                                }))
                              }
                              className={`w-7 h-7 rounded-full border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] ${bgClass} ${
                                selected
                                  ? 'ring-2 ring-[#F2B705] ring-offset-2 ring-offset-[#08080A] border-white/40 scale-105'
                                  : 'border-white/20 hover:scale-105'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 4: Export PNG Resolution */}
                <div className="pt-6 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-[var(--font-display)] text-base font-semibold text-[#F4F4F6]">
                      Export PNG
                    </h2>
                    {exportDimsByPreset && (
                      <span className="text-xs font-mono tabular-nums text-[#8E8E9E]">
                        {exportDimsByPreset[exportPreset][0]} ×{' '}
                        {exportDimsByPreset[exportPreset][1]} px
                      </span>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="export-resolution-select"
                      className="block text-[11px] text-[#8E8E9E] mb-1.5"
                    >
                      Output resolution
                    </label>
                    <div className="relative">
                      <select
                        id="export-resolution-select"
                        value={exportPreset}
                        onChange={(e) =>
                          setExportPreset(
                            e.target.value as ExportResolutionPreset
                          )
                        }
                        className="w-full appearance-none pl-3 pr-9 py-2 text-xs font-medium rounded-lg bg-[#111116] border border-[#24242E] text-[#F4F4F6] focus:outline-none focus:border-[#F2B705] cursor-pointer"
                      >
                        <option value="screen">
                          Current screen size
                          {exportDimsByPreset
                            ? ` (${exportDimsByPreset.screen[0]} × ${exportDimsByPreset.screen[1]})`
                            : ''}
                        </option>
                        <option value="original">
                          Original resolution
                          {exportDimsByPreset
                            ? ` (${exportDimsByPreset.original[0]} × ${exportDimsByPreset.original[1]})`
                            : ''}
                        </option>
                        <option value="4k">
                          High-quality 4K
                          {exportDimsByPreset
                            ? ` (${exportDimsByPreset['4k'][0]} × ${exportDimsByPreset['4k'][1]})`
                            : ''}
                        </option>
                      </select>
                      <ChevronDown
                        aria-hidden="true"
                        className="pointer-events-none w-3.5 h-3.5 text-[#8E8E9E] absolute right-3 top-1/2 -translate-y-1/2"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!photo}
                    onClick={() => handleExportPng()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#F2B705] text-[#08080A] hover:bg-[#e0aa04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PNG
                  </button>
                </div>
              </aside>
            </div>
          </div>
        )}

        {activeTab === 'animate' && (
          <AnimateVideoPanel
            studioPhoto={photo}
            studioPhotoTitle={photoTitle}
            onCaptureStudioWallpaper={handleCaptureStudioWallpaper}
          />
        )}

        {activeTab === 'channels' && (
          <ChannelGrid
            channels={segRun?.channels ?? []}
            enabledChannels={enabledChannels}
            onToggleChannel={handleToggleChannel}
            onResetChannels={() =>
              setEnabledChannels(
                segRun
                  ? segRun.channels.slice(1).map((c) => c.index)
                  : DEFAULT_FG_CHANNELS
              )
            }
            onRunSegmentation={() => photo && void executeSegmentation(photo)}
            busy={busy}
            hasPhoto={Boolean(photo)}
          />
        )}

        {activeTab === 'diagnostics' && (
          <DiagnosticsPanel
            run={segRun}
            metrics={metrics}
            threshold={threshold}
            formula={formula}
            enabledChannels={enabledChannels}
            onSwitchToCode={() => setActiveTab('code')}
          />
        )}

        {activeTab === 'code' && <FixedCodePanel />}
      </main>
    </div>
  );
}
