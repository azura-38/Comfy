import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
  Captions,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  ResolvedBeat,
  StyleLoRA,
  VisemeShape,
  computeCameraMotionAtFrame,
  getVisemeAtFrameOffset,
  framesToSRTTimestamp,
} from '../utils/workflowEngine';

interface VerticalDramaMonitorProps {
  resolvedBeats: ResolvedBeat[];
  currentFrame: number;
  totalFrames: number;
  fps: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeekFrame: (frame: number) => void;
  loras: StyleLoRA[];
  overrideStyleTag: string | null;
  onSetOverrideStyleTag: (tag: string | null) => void;
  subtitleBurnIn: boolean;
  onToggleSubtitleBurnIn: () => void;
}

export const VerticalDramaMonitor: React.FC<VerticalDramaMonitorProps> = ({
  resolvedBeats,
  currentFrame,
  totalFrames,
  fps,
  isPlaying,
  onTogglePlay,
  onSeekFrame,
  loras,
  overrideStyleTag,
  onSetOverrideStyleTag,
  subtitleBurnIn,
  onToggleSubtitleBurnIn,
}) => {
  const activeBeat =
    resolvedBeats.find(
      (b) => currentFrame >= b.startFrame && currentFrame <= b.endFrame
    ) ||
    resolvedBeats[resolvedBeats.length - 1] ||
    null;

  const beatLocalFrame = activeBeat
    ? Math.max(0, currentFrame - activeBeat.startFrame)
    : 0;
  const beatProgress =
    activeBeat && activeBeat.totalFrames > 1
      ? beatLocalFrame / (activeBeat.totalFrames - 1)
      : 0;

  const activeLoRA = overrideStyleTag
    ? loras.find((l) => l.styleTag === overrideStyleTag) || activeBeat?.matchedLoRA
    : activeBeat?.matchedLoRA || loras[0];

  const cameraTransform = activeBeat
    ? computeCameraMotionAtFrame(
        activeBeat.cameraCurve,
        activeBeat.pacing,
        beatProgress
      )
    : { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, pacingEase: 0 };

  const visemeState = activeBeat
    ? getVisemeAtFrameOffset(activeBeat.visemeTimeline, beatLocalFrame)
    : { viseme: 'REST' as VisemeShape, activeWord: '' };

  const activeChar = activeBeat?.matchedCharacter;
  const currentTimestamp = framesToSRTTimestamp(currentFrame, fps).slice(3, 11);
  const totalTimestamp = framesToSRTTimestamp(totalFrames, fps).slice(3, 11);

  // Render mouth geometry based on silent viseme shape
  const renderVisemeMouth = (viseme: VisemeShape, accentColor: string) => {
    switch (viseme) {
      case 'A':
        return (
          <ellipse
            cx="180"
            cy="238"
            rx="11"
            ry="8"
            fill="#090D16"
            stroke={accentColor}
            strokeWidth="1.8"
          />
        );
      case 'O':
        return (
          <ellipse
            cx="180"
            cy="238"
            rx="7"
            ry="9"
            fill="#090D16"
            stroke={accentColor}
            strokeWidth="1.8"
          />
        );
      case 'U':
        return (
          <ellipse
            cx="180"
            cy="238"
            rx="5"
            ry="6"
            fill="#090D16"
            stroke={accentColor}
            strokeWidth="1.8"
          />
        );
      case 'E':
      case 'I':
        return (
          <rect
            x="168"
            y="234"
            width="24"
            height="6"
            rx="3"
            fill="#090D16"
            stroke={accentColor}
            strokeWidth="1.6"
          />
        );
      case 'M':
        return (
          <line
            x1="168"
            y1="237"
            x2="192"
            y2="237"
            stroke={accentColor}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        );
      case 'REST':
      default:
        return (
          <path
            d="M 170 237 Q 180 239 190 237"
            fill="none"
            stroke="#CBD5E1"
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
    }
  };

  const styleGenre = activeLoRA?.genre || activeChar?.genre || 'Cyberpunk';
  const accentHex = activeLoRA?.tintHex || activeChar?.paletteAccent || '#F59E0B';

  // Pose-specific character transform inside 9:16 frame
  const getPoseTransform = (pose: string) => {
    if (pose === 'POSE_CLOSEUP') return 'scale(1.28) translate(0px, 28px)';
    if (pose === 'POSE_DRAMATIC') return 'scale(1.08) translate(-6px, 4px)';
    if (pose === 'POSE_SHOCK') return 'scale(1.04) translate(8px, 6px)';
    if (pose === 'POSE_SIDE') return 'scale(1.1) translate(-12px, 8px)';
    return 'scale(1) translate(0px, 0px)';
  };

  return (
    <div className="flex flex-col bg-[#111724] border border-slate-800/80 rounded-xl p-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800/80">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            9:16 Vertical Drama Monitor
          </h2>
          <p className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
            1080×1920 · {fps} fps · Silent Viseme Sync · DramaBox/NetShorts Lock
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleSubtitleBurnIn}
          aria-label="Toggle subtitle burn-in overlay"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            subtitleBurnIn
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
              : 'bg-slate-800/70 text-slate-400 border border-slate-700/60 hover:text-slate-200'
          }`}
        >
          <Captions className="w-3.5 h-3.5" />
          <span>Burn-In {subtitleBurnIn ? 'On' : 'Off'}</span>
        </button>
      </div>

      {/* 9:16 Viewport Container */}
      <div className="relative mx-auto w-full max-w-[310px] aspect-[9/16] rounded-xl overflow-hidden bg-[#070A10] border border-slate-700/80 shadow-inner select-none"
        data-testid="vertical-drama-canvas"
      >
        {/* Custom Video / Plate Layer or Procedural 9:16 Scene + Character Sprite */}
        {activeBeat?.customVideoUrl ? (
          <video
            src={activeBeat.customVideoUrl}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full transition-transform duration-75 ease-linear"
            style={{
              transform: `scale(${cameraTransform.scale}) translate(${cameraTransform.offsetX}px, ${cameraTransform.offsetY}px) rotate(${cameraTransform.rotationDeg}deg)`,
            }}
          >
            {activeBeat?.customPlateUrl ? (
              <img
                src={activeBeat.customPlateUrl}
                alt={activeBeat.title}
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover opacity-80"
              />
            ) : null}

            {/* Procedural High-Detail 9:16 Scene & Character Sprite SVG */}
            <svg
              viewBox="0 0 360 640"
              className="w-full h-full block"
              role="img"
              aria-label={`Vertical frame preview for ${activeBeat?.title || 'Scene'}`}
            >
              <defs>
                <linearGradient id="bgGradCyber" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#090D16" />
                  <stop offset="50%" stopColor="#131C2E" />
                  <stop offset="100%" stopColor="#1E1B18" />
                </linearGradient>
                <linearGradient id="bgGradScifi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#081221" />
                  <stop offset="55%" stopColor="#0F243C" />
                  <stop offset="100%" stopColor="#0B1320" />
                </linearGradient>
                <linearGradient id="bgGradFantasy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#140A0E" />
                  <stop offset="55%" stopColor="#23121A" />
                  <stop offset="100%" stopColor="#0D090C" />
                </linearGradient>
                <radialGradient id="rimGlow" cx="50%" cy="38%" r="52%">
                  <stop offset="0%" stopColor={accentHex} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={accentHex} stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Background Plate by Dynamic Style LoRA */}
              {!activeBeat?.customPlateUrl && (
                <>
                  <rect
                    width="360"
                    height="640"
                    fill={
                      styleGenre === 'Sci-Fi'
                        ? 'url(#bgGradScifi)'
                        : styleGenre === 'Fantasy'
                        ? 'url(#bgGradFantasy)'
                        : 'url(#bgGradCyber)'
                    }
                  />
                  {/* Architectural Vertical Lines */}
                  <g opacity="0.32" stroke={accentHex} strokeWidth="0.75">
                    <line x1="48" y1="0" x2="48" y2="640" />
                    <line x1="312" y1="0" x2="312" y2="640" />
                    <line x1="0" y1="140" x2="360" y2="190" />
                    <line x1="0" y1="420" x2="360" y2="390" />
                    <circle cx="180" cy="210" r="118" fill="none" strokeDasharray="4 6" />
                  </g>
                  <rect width="360" height="640" fill="url(#rimGlow)" />
                </>
              )}

              {/* Character Sprite Layer mapped from [CHAR_*] and [POSE_*] */}
              <g
                style={{
                  transform: getPoseTransform(activeBeat?.activePose || 'POSE_NEUTRAL'),
                  transformOrigin: '180px 260px',
                }}
              >
                {activeChar?.customImageUrl ? (
                  <image
                    href={activeChar.customImageUrl}
                    x="30"
                    y="70"
                    width="300"
                    height="460"
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : (
                  <>
                    {/* Shoulders & High-Collar Coat Silhouette */}
                    <path
                      d="M 65 540 L 92 315 L 138 282 L 222 282 L 268 315 L 295 540 Z"
                      fill={activeChar?.palettePrimary || '#0F172A'}
                      stroke={accentHex}
                      strokeWidth="2"
                    />
                    {/* Collar Lapels */}
                    <path
                      d="M 132 275 L 164 365 L 180 345 L 196 365 L 228 275"
                      fill="#0B0F17"
                      stroke={accentHex}
                      strokeWidth="1.5"
                    />
                    {/* Neck */}
                    <rect
                      x="164"
                      y="248"
                      width="32"
                      height="42"
                      rx="8"
                      fill="#E2C6B2"
                    />
                    {/* Head Contour */}
                    <path
                      d="M 140 165 Q 140 122 180 122 Q 220 122 220 165 L 214 228 Q 180 264 146 228 Z"
                      fill="#EAD0BE"
                      stroke="#1E293B"
                      strokeWidth="1.5"
                    />
                    {/* Hair / Crest by Character Label */}
                    {activeChar?.label === 'CHAR_LYRA' ? (
                      <path
                        d="M 134 178 Q 135 112 182 112 Q 228 114 228 184 L 218 238 L 210 175 Q 180 154 146 175 L 140 232 Z"
                        fill="#E2E8F0"
                        stroke="#38BDF8"
                        strokeWidth="1.2"
                      />
                    ) : activeChar?.label === 'CHAR_VEX' ? (
                      <path
                        d="M 132 162 L 152 108 L 180 120 L 208 108 L 228 162 L 216 146 L 180 158 L 144 146 Z"
                        fill="#18181B"
                        stroke="#EF4444"
                        strokeWidth="1.5"
                      />
                    ) : (
                      <path
                        d="M 136 168 Q 142 114 180 116 Q 222 116 224 166 L 206 148 L 184 162 L 162 146 Z"
                        fill="#1E293B"
                        stroke="#F59E0B"
                        strokeWidth="1.2"
                      />
                    )}
                    {/* Eyes & Brows */}
                    <line
                      x1="154"
                      y1="184"
                      x2="171"
                      y2="187"
                      stroke="#0F172A"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <line
                      x1="189"
                      y1="187"
                      x2="206"
                      y2="184"
                      stroke="#0F172A"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <ellipse cx="163" cy="195" rx="6" ry="3.5" fill="#0F172A" />
                    <ellipse cx="197" cy="195" rx="6" ry="3.5" fill="#0F172A" />
                    <circle cx="163" cy="195" r="2.2" fill={accentHex} />
                    <circle cx="197" cy="195" r="2.2" fill={accentHex} />

                    {/* Nose */}
                    <path
                      d="M 180 198 L 177 219 L 183 221"
                      fill="none"
                      stroke="#947460"
                      strokeWidth="1.6"
                    />

                    {/* Dynamic Silent Viseme Lip-Sync Mouth */}
                    {renderVisemeMouth(visemeState.viseme, accentHex)}
                  </>
                )}

                {/* Lip-Sync ROI Target Box Overlay */}
                <rect
                  x="154"
                  y="224"
                  width="52"
                  height="26"
                  rx="4"
                  fill="none"
                  stroke={accentHex}
                  strokeOpacity="0.45"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
              </g>

              {/* Secondary Character Split Confrontation Sprite Layer when 2+ characters are mapped */}
              {activeBeat?.secondaryCharacter && (
                <g transform="translate(198, 22) scale(0.42)" opacity="0.92">
                  <rect
                    x="10"
                    y="70"
                    width="320"
                    height="360"
                    rx="14"
                    fill="#070A10"
                    stroke={activeBeat.secondaryCharacter.paletteAccent}
                    strokeWidth="4"
                  />
                  <path
                    d="M 65 420 L 92 285 L 138 252 L 222 252 L 268 285 L 295 420 Z"
                    fill={activeBeat.secondaryCharacter.palettePrimary}
                    stroke={activeBeat.secondaryCharacter.paletteAccent}
                    strokeWidth="3"
                  />
                  <path
                    d="M 140 165 Q 140 122 180 122 Q 220 122 220 165 L 214 228 Q 180 264 146 228 Z"
                    fill="#EAD0BE"
                    stroke="#1E293B"
                    strokeWidth="2"
                  />
                  <text
                    x="28"
                    y="104"
                    fill={activeBeat.secondaryCharacter.paletteAccent}
                    fontFamily="monospace"
                    fontSize="24"
                    fontWeight="bold"
                  >
                    {activeBeat.secondaryCharacter.label}
                  </text>
                </g>
              )}
            </svg>
          </div>
        )}

        {/* Top HUD Overlay: Active Node Bindings (Clean unboxed typography) */}
        <div className="absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/85 via-black/45 to-transparent text-[11px] font-mono tabular-nums text-slate-200 flex items-center justify-between gap-2">
          <span className="truncate">
            S0{activeBeat?.sceneNumber || 1} · {activeChar?.label || 'CHAR_NONE'} ·{' '}
            {(activeBeat?.activePose || 'POSE_NEUTRAL').replace('POSE_', '')}
          </span>
          <span className="text-amber-300 shrink-0">
            F:{currentFrame} · V:{visemeState.viseme}
          </span>
        </div>

        {/* Camera, Sprite Layout & Style Metadata Overlay */}
        <div className="absolute top-9 inset-x-3 flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-slate-300/90">
          <span className="truncate">
            {activeBeat?.cameraCurve || 'Static'} ({cameraTransform.scale.toFixed(2)}x) ·{' '}
            {(activeBeat?.inferredLayout || 'Center Hero 9:16')
              .replace('Center Hero 9:16', 'Center 9:16')
              .replace('Dual Split Confrontation', 'Dual Split')
              .replace('Over-Shoulder Upper Third', 'Over-Shoulder')
              .replace('Choker Lip-Sync Close-Up', 'Close-Up')}
          </span>
          <span className="shrink-0 text-sky-300">
            {(activeLoRA?.styleTag || 'STYLE_DEFAULT').replace('STYLE_', '')}
          </span>
        </div>

        {/* DramaBox / NetShorts Vertical Drama Lower-Third Scrim & Synchronized Subtitle */}
        {subtitleBurnIn && activeBeat && (
          <div className="absolute bottom-0 inset-x-0 p-4 pt-12 bg-gradient-to-t from-black/95 via-black/75 to-transparent">
            <div className="mb-1 flex items-center justify-between text-[10px] font-mono tabular-nums text-amber-300/90">
              <span>
                {activeChar?.displayName || 'Narrator'}
                {activeBeat.secondaryCharacter
                  ? ` vs ${activeBeat.secondaryCharacter.displayName}`
                  : ''}
              </span>
              <span>
                Frames {activeBeat.startFrame}–{activeBeat.endFrame}
              </span>
            </div>
            <p
              className="text-sm font-semibold leading-snug text-white drop-shadow"
              data-testid="active-frame-subtitle"
            >
              {activeBeat.subtitleText.split(/\s+/).map((word, idx) => {
                const isCurrentWord =
                  visemeState.activeWord &&
                  word.replace(/[^a-zA-Z]/g, '') ===
                    visemeState.activeWord.replace(/[^a-zA-Z]/g, '');
                return (
                  <span
                    key={idx}
                    className={
                      isCurrentWord
                        ? 'text-amber-300 underline decoration-amber-400/80 underline-offset-4'
                        : 'text-slate-100'
                    }
                  >
                    {word}{' '}
                  </span>
                );
              })}
            </p>
          </div>
        )}
      </div>

      {/* Frame Transport & Scrubber */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSeekFrame(Math.max(0, currentFrame - 1))}
              aria-label="Previous Frame"
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause Playback' : 'Play Vertical Sequence'}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Play 24fps</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                onSeekFrame(Math.min(Math.max(0, totalFrames - 1), currentFrame + 1))
              }
              aria-label="Next Frame"
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="text-right font-mono tabular-nums text-xs text-slate-300">
            <span>{currentTimestamp}</span>
            <span className="text-slate-600 mx-1">/</span>
            <span className="text-slate-400">{totalTimestamp}</span>
          </div>
        </div>

        <div>
          <label
            htmlFor="frame-scrubber-input"
            className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400 mb-1"
          >
            <span>Frame Timeline Scrubber</span>
            <span>
              Frame {currentFrame} / {Math.max(0, totalFrames - 1)} · Viseme [{visemeState.viseme}]
            </span>
          </label>
          <input
            id="frame-scrubber-input"
            type="range"
            min={0}
            max={Math.max(1, totalFrames - 1)}
            value={currentFrame}
            onChange={(e) => onSeekFrame(Number(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Interactive Frame-by-Frame Subtitle Viseme Lip-Sync Track */}
        {activeBeat && (
          <div className="pt-2 border-t border-slate-800/70">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5">
              <span>Subtitle-to-Lip-Sync Frame Matrix (Click frame cue)</span>
              <span className="text-amber-300">
                Active Word: "{visemeState.activeWord || 'SILENT'}"
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {activeBeat.visemeTimeline.slice(0, 12).map((cue, idx) => {
                const targetAbsFrame = activeBeat.startFrame + cue.frameOffset;
                const isCueActive =
                  Math.abs(beatLocalFrame - cue.frameOffset) < 3;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSeekFrame(targetAbsFrame)}
                    className={`px-1.5 py-1 rounded text-[10px] font-mono tabular-nums text-center truncate transition-colors ${
                      isCueActive
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'bg-[#0B0F17] text-slate-300 border border-slate-800 hover:border-slate-600'
                    }`}
                    title={`Frame ${targetAbsFrame} · Viseme ${cue.viseme} · "${cue.charSnippet}"`}
                  >
                    F{targetAbsFrame}·{cue.viseme}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Rapid Style LoRA Prototyping Switcher */}
        <div className="pt-2 border-t border-slate-800/70">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="flex items-center gap-1.5 font-medium text-slate-300">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Real-Time Style LoRA Swap</span>
            </span>
            <span className="font-mono text-[11px]">
              {overrideStyleTag ? 'Manual Override' : 'Auto Scene Tag'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onSetOverrideStyleTag(null)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-left truncate transition-colors ${
                overrideStyleTag === null
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-900/70 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              Auto (Scene Metadata)
            </button>
            {loras.map((lora) => (
              <button
                key={lora.id}
                type="button"
                onClick={() => onSetOverrideStyleTag(lora.styleTag)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-left truncate transition-colors ${
                  overrideStyleTag === lora.styleTag
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-900/70 text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                {lora.genre} · {lora.styleTag.replace('STYLE_', '')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
