import { Check, Copy, Download } from 'lucide-react';
import { useState } from 'react';
import { FIXED_DIAGNOSTIC_HTML } from '../data/samples';

export function FixedCodePanel() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(FIXED_DIAGNOSTIC_HTML);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for restricted clipboard contexts
      const area = document.createElement('textarea');
      area.value = FIXED_DIAGNOSTIC_HTML;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([FIXED_DIAGNOSTIC_HTML], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'wallpaper-maya-combined-foreground-diagnostic-9.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="max-w-[1280px] mx-auto px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-[#1E1E26]">
        <div>
          <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[#F4F4F6] tracking-tight">
            Fixed Standalone HTML
          </h2>
          <p className="text-sm text-[#9898A6] mt-1">
            Ready-to-commit drop-in replacement for{' '}
            <code className="font-mono text-[#D4D4DF]">
              wallpaper-maya-combined-foreground-diagnostic-9.html
            </code>{' '}
            with all eight bugs resolved.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-[#2A2A35] bg-[#14141A] text-[#F4F4F6] hover:border-[#3E3E4E] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705]"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#F2B705]" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied HTML' : 'Copy HTML'}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#F2B705] text-[#08080A] hover:bg-[#e0aa04] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705]"
          >
            <Download className="w-3.5 h-3.5" />
            Download .html
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-[#22222A] bg-[#0D0D11] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1E1E26] flex items-center justify-between text-xs text-[#8E8E9E] font-mono">
          <span>wallpaper-maya-combined-foreground-diagnostic-9.html</span>
          <span>float32 · vision_bundle.mjs · softmax sum · WASM cleanup</span>
        </div>
        <pre className="p-5 overflow-x-auto text-xs leading-relaxed font-mono text-[#D2D4DE] max-h-[68vh]">
          <code>{FIXED_DIAGNOSTIC_HTML}</code>
        </pre>
      </div>
    </section>
  );
}
