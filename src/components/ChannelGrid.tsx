import { useEffect, useRef } from 'react';
import { ChannelMask } from '../types';

interface ChannelTileProps {
  channel: ChannelMask;
  enabled: boolean;
  onToggle: (index: number) => void;
}

function ChannelTile({ channel, enabled, onToggle }: ChannelTileProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = channel.width;
    canvas.height = channel.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(channel.width, channel.height);
    const out = imgData.data;
    const src = channel.data;

    for (let i = 0; i < src.length; i++) {
      const v = src[i] < 0 ? 0 : src[i] > 1 ? 1 : src[i];
      const lum = Math.round(v * 255);
      const idx = i * 4;
      if (enabled) {
        // Subtle warm tint on active foreground channels
        out[idx] = Math.min(255, Math.round(lum * 1.02));
        out[idx + 1] = Math.round(lum * 0.96);
        out[idx + 2] = Math.round(lum * 0.84);
      } else {
        out[idx] = lum;
        out[idx + 1] = lum;
        out[idx + 2] = lum;
      }
      out[idx + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
  }, [channel, enabled]);

  const isBackground = channel.index === 0;

  return (
    <div className="flex flex-col border border-[#22222A] bg-[#111115] rounded-xl overflow-hidden">
      <div className="relative bg-[#08080A] aspect-[9/14] flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain"
          aria-label={`${channel.label} confidence mask`}
        />
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#F4F4F6] truncate">
              {channel.label}
            </h3>
            <p className="text-xs text-[#9898A6] font-mono tabular-nums mt-0.5">
              Ch {channel.index} · {channel.coverageAtHalf.toFixed(1)}% area
            </p>
          </div>
          <button
            type="button"
            onClick={() => onToggle(channel.index)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705] ${
              enabled
                ? 'bg-[#F2B705] text-[#08080A] hover:bg-[#e0aa04]'
                : 'bg-[#1B1B22] text-[#B4B4C2] hover:text-[#F4F4F6] hover:bg-[#24242E]'
            }`}
          >
            {enabled ? 'Included' : isBackground ? 'Background' : 'Excluded'}
          </button>
        </div>

        <div className="flex items-center justify-between text-xs text-[#8E8E9E] border-t border-[#1E1E26] pt-2.5 font-mono tabular-nums">
          <span>Mean confidence</span>
          <span className="text-[#D4D4DF]">{channel.mean.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}

interface ChannelGridProps {
  channels: ChannelMask[];
  enabledChannels: number[];
  onToggleChannel: (index: number) => void;
  onResetChannels: () => void;
  onRunSegmentation: () => void;
  busy: boolean;
  hasPhoto: boolean;
}

export function ChannelGrid({
  channels,
  enabledChannels,
  onToggleChannel,
  onResetChannels,
  onRunSegmentation,
  busy,
  hasPhoto,
}: ChannelGridProps) {
  if (!channels.length) {
    return (
      <section className="max-w-[1280px] mx-auto px-6 py-16 text-center">
        <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[#F4F4F6] tracking-tight">
          Softmax Confidence Channels
        </h2>
        <p className="text-sm text-[#9898A6] max-w-md mx-auto mt-2">
          Run segmentation on the active photo to inspect all six MediaPipe multiclass probability maps individually.
        </p>
        <button
          type="button"
          disabled={!hasPhoto || busy}
          onClick={onRunSegmentation}
          className="mt-6 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#F2B705] text-[#08080A] hover:bg-[#e0aa04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {busy ? 'Segmenting…' : 'Build Foreground Mask'}
        </button>
      </section>
    );
  }

  return (
    <section className="max-w-[1280px] mx-auto px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-[#1E1E26]">
        <div>
          <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[#F4F4F6] tracking-tight">
            Softmax Confidence Channels
          </h2>
          <p className="text-sm text-[#9898A6] mt-1">
            Each pixel across these six channels sums to 1.00. Toggle any class to control which regions occlude the lock-screen clock.
          </p>
        </div>

        <button
          type="button"
          onClick={onResetChannels}
          className="px-4 py-2 text-xs font-medium rounded-lg border border-[#2A2A35] text-[#D4D4DF] hover:text-[#F4F4F6] hover:border-[#3E3E4E] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705]"
        >
          Reset to Foreground (Ch 1–5)
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
        {channels.map((ch) => (
          <ChannelTile
            key={ch.index}
            channel={ch}
            enabled={enabledChannels.includes(ch.index)}
            onToggle={onToggleChannel}
          />
        ))}
      </div>
    </section>
  );
}
