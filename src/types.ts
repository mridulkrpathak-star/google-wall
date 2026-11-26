export type CombineFormula = 'softmax-sum' | 'legacy-soft-union';

export type ViewMode = 'depth' | 'overlay' | 'mask-only' | 'split';

export type ClockFontStyle = 'sans-light' | 'sans-bold' | 'editorial-serif';

export type ClockColorPreset = 'ivory' | 'gold' | 'obsidian' | 'ice';

export type ClockPosPreset = 'top' | 'upper' | 'center' | 'lower';

export type ExportResolutionPreset = 'screen' | 'original' | '4k';

export type VideoAspectRatio = '9:16' | '16:9';

export type WorkspaceTab = 'studio' | 'animate' | 'channels' | 'diagnostics' | 'code';

export interface ChannelMask {
  index: number;
  label: string;
  data: Float32Array;
  width: number;
  height: number;
  mean: number;
  coverageAtHalf: number;
}

export interface ClockSettings {
  visible: boolean;
  timeText: string;
  dateText: string;
  posPreset: ClockPosPreset;
  yPercent: number;
  fontSize: number;
  fontStyle: ClockFontStyle;
  colorPreset: ClockColorPreset;
}

export interface SegmentationRun {
  channels: ChannelMask[];
  maskWidth: number;
  maskHeight: number;
  scaledWidth: number;
  scaledHeight: number;
  inputWidth: number;
  inputHeight: number;
  inferenceMs: number;
}

export interface MaskMetrics {
  min: number;
  max: number;
  average: number;
  abovePercent: number;
  pixelCount: number;
}

export interface SamplePhoto {
  id: string;
  title: string;
  location: string;
  url: string;
  recommendedClockY: number;
  recommendedClockColor: ClockColorPreset;
}

export interface AuditFixItem {
  id: string;
  severity: 'Breaking' | 'Visual Quality' | 'Memory & Perf' | 'Reliability';
  lineRef: string;
  title: string;
  cause: string;
  resolution: string;
}
