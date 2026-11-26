import React, { useRef, useState } from 'react';
import { Download, Film, RefreshCw, Trash2, Upload } from 'lucide-react';
import { VideoAspectRatio } from '../types';

interface AnimateVideoPanelProps {
  studioPhoto: HTMLImageElement | null;
  studioPhotoTitle: string;
  onCaptureStudioWallpaper: () => string | null;
}

const MOTION_PROMPTS = [
  {
    label: 'Breeze & drifting light',
    text: 'A gentle breeze subtly moves the subject’s hair and clothing while soft natural light and distant clouds drift slowly across the background. Smooth, steady cinematic camera.',
  },
  {
    label: 'Slow portrait push-in',
    text: 'Subtle cinematic slow push-in toward the portrait subject with delicate shifts in ambient rim lighting and natural shallow depth-of-field motion.',
  },
  {
    label: 'Atmospheric horizon',
    text: 'Calm atmospheric motion in the sky and distant horizon while the foreground subject breathes naturally in soft golden-hour lighting.',
  },
];

function imageElementToJpegDataUrl(img: HTMLImageElement): string {
  const maxDim = 1280;
  const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export function AnimateVideoPanel({
  studioPhoto,
  studioPhotoTitle,
  onCaptureStudioWallpaper,
}: AnimateVideoPanelProps) {
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [sourceMimeType, setSourceMimeType] = useState<string>('image/jpeg');
  const [sourceLabel, setSourceLabel] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('9:16');
  const [duration, setDuration] = useState<'5s' | '8s' | '10s'>('8s');
  const [prompt, setPrompt] = useState<string>(MOTION_PROMPTS[0].text);

  const [generating, setGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelected = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please choose a valid PNG, JPEG, or WebP image.');
      return;
    }
    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (!result) {
        setErrorMessage('Could not read the selected image file.');
        return;
      }
      setSourceDataUrl(result);
      setSourceMimeType(
        file.type === 'image/png' || file.type === 'image/webp'
          ? file.type
          : 'image/jpeg'
      );
      setSourceLabel(file.name);
      setVideoUrl(null);
      setVideoMeta(null);
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read the uploaded file.');
    };
    reader.readAsDataURL(file);
  };

  const handleUseStudioPhoto = () => {
    if (!studioPhoto) return;
    setErrorMessage(null);
    const dataUrl = imageElementToJpegDataUrl(studioPhoto);
    setSourceDataUrl(dataUrl);
    setSourceMimeType('image/jpeg');
    setSourceLabel(`${studioPhotoTitle} (Raw photo)`);
    setAspectRatio(
      studioPhoto.naturalWidth > studioPhoto.naturalHeight ? '16:9' : '9:16'
    );
    setVideoUrl(null);
    setVideoMeta(null);
  };

  const handleUseCompositedWallpaper = () => {
    const captured = onCaptureStudioWallpaper();
    if (!captured) return;
    setErrorMessage(null);
    setSourceDataUrl(captured);
    setSourceMimeType('image/png');
    setSourceLabel(`${studioPhotoTitle} (Depth wallpaper)`);
    setAspectRatio(
      studioPhoto && studioPhoto.naturalWidth > studioPhoto.naturalHeight
        ? '16:9'
        : '9:16'
    );
    setVideoUrl(null);
    setVideoMeta(null);
  };

  const handleGenerate = async () => {
    if (!sourceDataUrl || generating) return;
    setGenerating(true);
    setErrorMessage(null);
    setVideoUrl(null);
    setVideoMeta(null);

    try {
      const response = await fetch('/api/animate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: sourceDataUrl,
          mimeType: sourceMimeType,
          prompt: prompt.trim(),
          aspectRatio,
          duration,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === 'string'
            ? payload.error
            : `Video generation failed (HTTP ${response.status}).`
        );
      }

      const finalUrl = payload.videoDataUrl || payload.videoUri;
      if (!finalUrl) {
        throw new Error('No video stream was returned by the server.');
      }

      setVideoUrl(finalUrl);
      setVideoMeta(
        `${payload.aspectRatio || aspectRatio} · ${payload.duration || duration} · 720p MP4`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Could not animate this image right now.'
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadVideo = () => {
    if (!videoUrl) return;
    const link = document.createElement('a');
    link.href = videoUrl;
    const slug = (sourceLabel || 'wallpaper-maya')
      .toLowerCase()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    link.download = `${slug || 'wallpaper-maya'}-${aspectRatio.replace(':', 'x')}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClear = () => {
    setSourceDataUrl(null);
    setSourceLabel('');
    setVideoUrl(null);
    setVideoMeta(null);
    setErrorMessage(null);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  };

  return (
    <section className="max-w-[1400px] mx-auto px-5 sm:px-6 py-6 lg:py-8">
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
        }}
      />

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-start">
        {/* Dominant Focal Stage: Starting Frame / Generated Video */}
        <div className="flex-1 w-full flex flex-col items-center">
          <div className="w-full max-w-[640px] flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="font-[var(--font-display)] text-xl font-semibold text-[#F4F4F6] tracking-tight">
                Animate Wallpaper into Video
              </h2>
              <p className="text-xs text-[#8E8E9E] mt-0.5">
                Upload a photo or pull from Studio, pick 9:16 portrait or 16:9 landscape, and render motion with Gemini Omni Flash.
              </p>
            </div>
            {videoUrl && (
              <button
                type="button"
                onClick={handleDownloadVideo}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#F2B705] text-[#08080A] hover:bg-[#e0aa04] transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download MP4
              </button>
            )}
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`relative w-full max-w-[640px] min-h-[460px] rounded-2xl border transition-colors flex items-center justify-center p-5 sm:p-6 bg-[#0F0F13] ${
              isDragOver ? 'border-[#F2B705] bg-[#161511]' : 'border-[#202028]'
            }`}
          >
            {videoUrl ? (
              <div className="w-full flex flex-col items-center">
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className={`rounded-2xl bg-black shadow-[0_24px_70px_rgba(0,0,0,0.75)] ring-1 ring-white/10 max-h-[68vh] ${
                    aspectRatio === '9:16'
                      ? 'aspect-[9/16] w-auto'
                      : 'aspect-[16/9] w-full'
                  }`}
                />
              </div>
            ) : sourceDataUrl ? (
              <div className="relative inline-flex items-center justify-center rounded-2xl overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.75)] ring-1 ring-white/10">
                <img
                  src={sourceDataUrl}
                  alt={sourceLabel || 'Uploaded frame to animate'}
                  referrerPolicy="no-referrer"
                  className="block max-h-[68vh] max-w-full w-auto h-auto"
                />
                {generating && (
                  <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4">
                    <div className="px-4 py-3 rounded-xl bg-[#111115]/95 border border-[#2A2A35] text-center max-w-xs">
                      <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#F4F4F6]">
                        <RefreshCw className="w-3.5 h-3.5 text-[#F2B705] animate-spin" />
                        <span>Rendering animated video…</span>
                      </div>
                      <p className="text-[11px] text-[#9898A6] mt-1.5 leading-relaxed">
                        Generating {duration} {aspectRatio} clip with gemini-omni-1.2-flash. This usually takes 1–2 minutes.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-16 px-6 text-center max-w-md">
                <Film className="w-8 h-8 text-[#5C5C6E] mx-auto mb-3" />
                <p className="font-[var(--font-display)] text-lg font-medium text-[#F4F4F6]">
                  Upload a photo to animate
                </p>
                <p className="text-sm text-[#8E8E9E] mt-1.5">
                  Drop a portrait or landscape image here, or bring in your active Wallpaper Maya composition.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#F2B705] text-[#08080A] hover:bg-[#e0aa04] transition-colors whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Photo
                  </button>
                  {studioPhoto && (
                    <button
                      type="button"
                      onClick={handleUseStudioPhoto}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-[#2A2A35] bg-[#14141B] text-[#E4E4EC] hover:border-[#3E3E4E] transition-colors whitespace-nowrap"
                    >
                      Use Active Studio Photo
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="w-full max-w-[640px] mt-3.5 px-1">
            {errorMessage ? (
              <div className="py-2.5 px-3.5 rounded-lg border border-rose-500/35 bg-rose-950/30 text-xs text-rose-200 leading-relaxed">
                {errorMessage}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#8E8E9E] font-mono tabular-nums">
                <span>
                  {videoMeta
                    ? `Generated · ${videoMeta}`
                    : sourceLabel
                    ? `Source · ${sourceLabel} · Target ${aspectRatio}`
                    : 'No source image selected'}
                </span>
                <span>Model · gemini-omni-1.2-flash</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Controls Inspector */}
        <aside
          aria-label="Video animation controls"
          className="w-full lg:w-[390px] shrink-0 divide-y divide-[#1E1E26] border-t lg:border-t-0 lg:border-l border-[#1E1E26] lg:pl-8 pt-6 lg:pt-0"
        >
          {/* Source Image Controls */}
          <div className="pb-6 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-[var(--font-display)] text-base font-semibold text-[#F4F4F6]">
                Starting Frame
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => uploadInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1A1A22] text-[#F4F4F6] hover:bg-[#24242F] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload
                </button>
                <button
                  type="button"
                  disabled={!sourceDataUrl || generating}
                  onClick={handleClear}
                  aria-label="Clear animation source"
                  className="inline-flex items-center justify-center p-1.5 rounded-lg border border-[#24242E] text-[#8E8E9E] hover:text-[#F4F4F6] hover:border-[#3A3A4A] disabled:opacity-35 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {studioPhoto && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={generating}
                  onClick={handleUseStudioPhoto}
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-[#24242E] bg-[#121218] text-[#D4D4DF] hover:text-[#F4F4F6] hover:border-[#3A3A4A] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  Use Studio Photo
                </button>
                <button
                  type="button"
                  disabled={generating}
                  onClick={handleUseCompositedWallpaper}
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-[#24242E] bg-[#121218] text-[#D4D4DF] hover:text-[#F4F4F6] hover:border-[#3A3A4A] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  Use Depth Clock
                </button>
              </div>
            )}
          </div>

          {/* Aspect Ratio & Duration */}
          <div className="py-6 space-y-4">
            <h3 className="font-[var(--font-display)] text-base font-semibold text-[#F4F4F6]">
              Video Format
            </h3>

            <div>
              <span className="block text-xs text-[#9898A6] mb-1.5">
                Aspect ratio
              </span>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#111116] border border-[#202028]">
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => setAspectRatio('9:16')}
                  className={`py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    aspectRatio === '9:16'
                      ? 'bg-[#23232D] text-[#F4F4F6]'
                      : 'text-[#8E8E9E] hover:text-[#D4D4DF]'
                  }`}
                >
                  9:16 Portrait
                </button>
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => setAspectRatio('16:9')}
                  className={`py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    aspectRatio === '16:9'
                      ? 'bg-[#23232D] text-[#F4F4F6]'
                      : 'text-[#8E8E9E] hover:text-[#D4D4DF]'
                  }`}
                >
                  16:9 Landscape
                </button>
              </div>
            </div>

            <div>
              <span className="block text-xs text-[#9898A6] mb-1.5">
                Clip duration
              </span>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#111116] border border-[#202028]">
                {(['5s', '8s', '10s'] as const).map((len) => (
                  <button
                    key={len}
                    type="button"
                    disabled={generating}
                    onClick={() => setDuration(len)}
                    className={`py-1.5 text-xs font-mono tabular-nums font-medium rounded-md transition-colors whitespace-nowrap ${
                      duration === len
                        ? 'bg-[#23232D] text-[#F4F4F6]'
                        : 'text-[#8E8E9E] hover:text-[#D4D4DF]'
                    }`}
                  >
                    {len}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Motion Prompt & Generate Action */}
          <div className="pt-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="video-motion-prompt"
                className="font-[var(--font-display)] text-base font-semibold text-[#F4F4F6]"
              >
                Motion Direction
              </label>
            </div>

            <textarea
              id="video-motion-prompt"
              rows={4}
              value={prompt}
              disabled={generating}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe how the photo should come to life…"
              className="w-full px-3 py-2.5 text-xs leading-relaxed rounded-lg bg-[#111116] border border-[#24242E] text-[#F4F4F6] placeholder:text-[#666676] focus:outline-none focus:border-[#F2B705] resize-none"
            />

            <div className="flex flex-wrap gap-1.5">
              {MOTION_PROMPTS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={generating}
                  onClick={() => setPrompt(preset.text)}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-[#22222A] bg-[#111116] text-[#B4B4C2] hover:text-[#F4F4F6] hover:border-[#383846] transition-colors whitespace-nowrap"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!sourceDataUrl || generating}
              onClick={() => void handleGenerate()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#F2B705] text-[#08080A] hover:bg-[#e0aa04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {generating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Generating {aspectRatio} Video…
                </>
              ) : (
                <>
                  <Film className="w-3.5 h-3.5" />
                  Generate Animated Video
                </>
              )}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
