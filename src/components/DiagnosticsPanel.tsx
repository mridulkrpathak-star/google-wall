import { AUDIT_FIXES } from '../data/samples';
import { CombineFormula, MaskMetrics, SegmentationRun } from '../types';

interface DiagnosticsPanelProps {
  run: SegmentationRun | null;
  metrics: MaskMetrics | null;
  threshold: number;
  formula: CombineFormula;
  enabledChannels: number[];
  onSwitchToCode: () => void;
}

export function DiagnosticsPanel({
  run,
  metrics,
  threshold,
  formula,
  enabledChannels,
  onSwitchToCode,
}: DiagnosticsPanelProps) {
  const activeChannelNames = run
    ? run.channels
        .filter((c) => enabledChannels.includes(c.index))
        .map((c) => c.label)
        .join(', ')
    : 'None';

  return (
    <section className="max-w-[1280px] mx-auto px-6 py-8 space-y-12">
      {/* Live Run Diagnostics */}
      <div>
        <div className="pb-5 border-b border-[#1E1E26] flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[#F4F4F6] tracking-tight">
              Pipeline Diagnostics
            </h2>
            <p className="text-sm text-[#9898A6] mt-1">
              Live measurements from the current in-browser MediaPipe segmentation run.
            </p>
          </div>
          <button
            type="button"
            onClick={onSwitchToCode}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-[#2A2A35] text-[#D4D4DF] hover:text-[#F4F4F6] hover:border-[#3E3E4E] transition-colors whitespace-nowrap shrink-0"
          >
            View Fixed Standalone HTML
          </button>
        </div>

        {run && metrics ? (
          <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-6 py-6 border-b border-[#1E1E26]">
            <div>
              <dt className="text-xs text-[#8E8E9E]">Source Image</dt>
              <dd className="mt-1 text-lg font-mono tabular-nums text-[#F4F4F6]">
                {run.inputWidth} × {run.inputHeight}px
              </dd>
              <p className="text-xs text-[#727282] mt-0.5 font-mono tabular-nums">
                Scaled input {run.scaledWidth} × {run.scaledHeight}px
              </p>
            </div>

            <div>
              <dt className="text-xs text-[#8E8E9E]">Confidence Mask</dt>
              <dd className="mt-1 text-lg font-mono tabular-nums text-[#F4F4F6]">
                {run.maskWidth} × {run.maskHeight}px
              </dd>
              <p className="text-xs text-[#727282] mt-0.5 font-mono tabular-nums">
                Inference {run.inferenceMs} ms · WASM freed
              </p>
            </div>

            <div>
              <dt className="text-xs text-[#8E8E9E]">Combined Confidence</dt>
              <dd className="mt-1 text-lg font-mono tabular-nums text-[#F4F4F6]">
                {metrics.average.toFixed(4)} avg
              </dd>
              <p className="text-xs text-[#727282] mt-0.5 font-mono tabular-nums">
                min {metrics.min.toFixed(4)} · max {metrics.max.toFixed(4)}
              </p>
            </div>

            <div>
              <dt className="text-xs text-[#8E8E9E]">Foreground Coverage</dt>
              <dd className="mt-1 text-lg font-mono tabular-nums text-[#F2B705]">
                {metrics.abovePercent.toFixed(2)}%
              </dd>
              <p className="text-xs text-[#727282] mt-0.5 font-mono tabular-nums">
                At threshold {threshold.toFixed(2)} ·{' '}
                {formula === 'softmax-sum' ? 'Softmax sum' : 'Legacy soft-union'}
              </p>
            </div>

            <div className="md:col-span-2 lg:col-span-4 pt-2 border-t border-[#181820] flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[#8E8E9E]">Active foreground channels</span>
              <span className="text-[#D4D4DF] font-mono">
                {activeChannelNames || 'None selected'}
              </span>
            </div>
          </dl>
        ) : (
          <p className="py-8 text-sm text-[#8E8E9E] border-b border-[#1E1E26]">
            No segmentation has been run yet. Return to Studio and run foreground extraction to populate live metrics.
          </p>
        )}
      </div>

      {/* Diagnostic-9 Bug Audit Report */}
      <div>
        <div className="pb-5 border-b border-[#1E1E26]">
          <h3 className="font-[var(--font-display)] text-xl font-semibold text-[#F4F4F6] tracking-tight">
            Audit Log: wallpaper-maya-combined-foreground-diagnostic-9.html
          </h3>
          <p className="text-sm text-[#9898A6] mt-1">
            All eight issues identified in your repository prototype and resolved in this studio and in the exportable standalone HTML.
          </p>
        </div>

        <div className="divide-y divide-[#1E1E26]">
          {AUDIT_FIXES.map((item, idx) => (
            <article
              key={item.id}
              className="py-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start"
            >
              <div className="lg:col-span-4">
                <div className="text-xs text-[#8E8E9E] font-mono tabular-nums flex items-center gap-2">
                  <span>{String(idx + 1).padStart(2, '0')}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      item.severity === 'Breaking'
                        ? 'text-rose-400'
                        : item.severity === 'Visual Quality'
                        ? 'text-[#F2B705]'
                        : 'text-[#B4B4C2]'
                    }
                  >
                    {item.severity}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{item.lineRef}</span>
                </div>
                <h4 className="text-sm font-semibold text-[#F4F4F6] mt-1.5 leading-snug">
                  {item.title}
                </h4>
              </div>

              <div className="lg:col-span-4 text-sm text-[#9898A6] leading-relaxed">
                <span className="text-[#C8C8D4] font-medium">Root cause: </span>
                {item.cause}
              </div>

              <div className="lg:col-span-4 text-sm text-[#B8C4BA] leading-relaxed">
                <span className="text-[#E2EFE5] font-medium">Fix applied: </span>
                {item.resolution}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
