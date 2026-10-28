import React, { useState } from 'react';
import {
  Cpu,
  Layers,
  Play,
  Download,
  Plus,
  HardDrive,
  CheckCircle2,
  FileCode2,
} from 'lucide-react';
import {
  PipelineConfig,
  BaseModelArchitecture,
  LocalVramProfile,
  StyleLoRA,
  CharacterSheet,
  ResolvedBeat,
  BatchEpisodeJob,
  GenreSetting,
  CameraCurve,
  PacingProfile,
  buildComfyUIWorkflowJSON,
  exportFrameSyncedSubtitlesSRT,
  generateComfyUICustomNodesPython,
  snapToLTXVFrameRule,
  estimateLocalLTXVHardwareMetrics,
} from '../utils/workflowEngine';

interface ComfyPipelineViewProps {
  config: PipelineConfig;
  onUpdateConfig: (next: PipelineConfig) => void;
  loras: StyleLoRA[];
  onUpdateLoRA: (lora: StyleLoRA) => void;
  onAddLoRA: (lora: StyleLoRA) => void;
  characters: CharacterSheet[];
  resolvedBeats: ResolvedBeat[];
  batchQueue: BatchEpisodeJob[];
  onAddBatchJob: (job: BatchEpisodeJob) => void;
  onRunBatchQueue: () => void;
  onExportJSON: () => void;
  onExportSRT: () => void;
  onApplyBatchCameraPacing: (camera: CameraCurve, pacing: PacingProfile) => void;
  onNormalizeEpisodeDuration: (targetSeconds: number) => void;
}

const CHECKPOINT_PRESETS: Record<
  BaseModelArchitecture,
  Array<{ label: string; filename: string }>
> = {
  'LTX-Video': [
    {
      label: 'LTX-Video 2B v0.9.5 Local',
      filename: 'ltx-video-2b-v0.9.5.safetensors',
    },
    {
      label: 'LTX-Video 2B 0.9.5 Distilled FP8 Local',
      filename: 'ltxv-2b-0.9.5-distilled-fp8.safetensors',
    },
    {
      label: 'LTX-Video 2B v0.9.1 Local',
      filename: 'ltx-video-2b-v0.9.1.safetensors',
    },
  ],
  'Flux.1-dev': [
    { label: 'Flux.1 Dev FP8 Local', filename: 'flux1-dev-fp8-local.safetensors' },
    { label: 'Flux.1 Schnell NF4 Local', filename: 'flux1-schnell-nf4-local.safetensors' },
  ],
  'SDXL-1.0': [
    { label: 'Animagine XL v3.1 Local', filename: 'sdxl_animagine_v31_local.safetensors' },
    { label: 'Juggernaut XL v9 Local', filename: 'juggernautXL_v9_local.safetensors' },
  ],
  'SD-1.5': [
    { label: 'DreamShaper v8 Local', filename: 'dreamshaper_8_local.safetensors' },
    { label: 'MeinaMix v11 Anime Local', filename: 'meinamix_v11_local.safetensors' },
  ],
};

export const ComfyPipelineView: React.FC<ComfyPipelineViewProps> = ({
  config,
  onUpdateConfig,
  loras,
  onUpdateLoRA,
  onAddLoRA,
  characters,
  resolvedBeats,
  batchQueue,
  onAddBatchJob,
  onRunBatchQueue,
  onExportJSON,
  onExportSRT,
  onApplyBatchCameraPacing,
  onNormalizeEpisodeDuration,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('5');
  const [newLoraTag, setNewLoraTag] = useState('');
  const [newLoraName, setNewLoraName] = useState('');
  const [newLoraFile, setNewLoraFile] = useState('');
  const [newLoraGenre, setNewLoraGenre] = useState<GenreSetting>('Cyberpunk');

  const [newBatchTitle, setNewBatchTitle] = useState('');
  const [newBatchDuration, setNewBatchDuration] = useState(180);

  const [batchCamera, setBatchCamera] = useState<CameraCurve>('Dolly In');
  const [batchPacing, setBatchPacing] = useState<PacingProfile>('Rhythmic Dialogue');
  const [targetEpSec, setTargetEpSec] = useState<number>(180);
  const [codeTab, setCodeTab] = useState<'srt' | 'python'>('srt');

  const workflowGraph = buildComfyUIWorkflowJSON(
    config,
    resolvedBeats,
    characters,
    loras
  );

  const srtPreview = exportFrameSyncedSubtitlesSRT(resolvedBeats, config.fps);
  const pythonCustomNodes = generateComfyUICustomNodesPython(config);

  const totalEpisodeFrames = resolvedBeats.reduce(
    (sum, b) => sum + b.totalFrames,
    0
  );
  const ltxHardware = estimateLocalLTXVHardwareMetrics(
    config,
    totalEpisodeFrames
  );
  const ltxFrameCheck = snapToLTXVFrameRule(config.ltxChunkFrames || 161);

  const handleDownloadPythonNodes = () => {
    const blob = new Blob([pythonCustomNodes], {
      type: 'text/x-python;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vertinode_comfy_nodes.py';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleArchChange = (arch: BaseModelArchitecture) => {
    const defaultCkpt = CHECKPOINT_PRESETS[arch][0].filename;
    onUpdateConfig({
      ...config,
      architecture: arch,
      checkpointName: defaultCkpt,
      cfg: arch === 'LTX-Video' ? 3.2 : arch === 'Flux.1-dev' ? 3.5 : 7.0,
    });
  };

  const handleAddLoRASubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTag = newLoraTag.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!cleanTag || !newLoraName.trim()) return;
    const formattedTag = cleanTag.startsWith('STYLE_')
      ? cleanTag
      : `STYLE_${cleanTag}`;

    onAddLoRA({
      id: `lora-${Date.now()}`,
      styleTag: formattedTag,
      name: newLoraName.trim(),
      filename:
        newLoraFile.trim() || `${formattedTag.toLowerCase()}.safetensors`,
      compatibleArch: ['LTX-Video', 'Flux.1-dev', 'SDXL-1.0', 'SD-1.5'],
      genre: newLoraGenre,
      modelStrength: 0.85,
      clipStrength: 0.8,
      triggerPhrase: `${newLoraName.trim().toLowerCase()}, vertical 9:16 drama`,
      tintHex:
        newLoraGenre === 'Sci-Fi'
          ? '#38BDF8'
          : newLoraGenre === 'Fantasy'
          ? '#EF4444'
          : '#F59E0B',
      contrastBoost: 1.12,
    });

    setNewLoraTag('');
    setNewLoraName('');
    setNewLoraFile('');
  };

  const handleCreateBatchEpisode = (e: React.FormEvent) => {
    e.preventDefault();
    const clampedSec = Math.max(120, Math.min(300, Number(newBatchDuration) || 180));
    const nextEpNum = batchQueue.length + 1;
    onAddBatchJob({
      id: `batch-ep-${Date.now()}`,
      episodeNumber: nextEpNum,
      title:
        newBatchTitle.trim() ||
        `EP0${nextEpNum} · Vertical Sequence (${clampedSec}s)`,
      genre: config.genre,
      durationSec: clampedSec,
      totalFrames: clampedSec * config.fps,
      status: 'Queued',
      progressPct: 0,
      checkpoint: config.checkpointName,
      loraStack: loras.map((l) => l.styleTag),
      outputResolution: `${config.targetWidth}x${config.targetHeight}`,
    });
    setNewBatchTitle('');
  };

  const nodeEntries = Object.entries(workflowGraph);

  return (
    <div className="space-y-6">
      {/* Row 1: Local Base Model Checkpoint & Latent Frame Lock Config */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 bg-[#111724] border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100">
                01. Local Base Model & LTX-Video Engine
              </h2>
              <span className="text-xs font-mono text-emerald-400">
                100% Local SafeTensors
              </span>
            </div>

            {/* Architecture Segmented Selector */}
            <div>
              <span className="block text-xs text-slate-400 mb-1.5">
                Local Video / Diffusion Architecture
              </span>
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#0B0F17] rounded-lg border border-slate-800">
                {(
                  [
                    'LTX-Video',
                    'Flux.1-dev',
                    'SDXL-1.0',
                    'SD-1.5',
                  ] as BaseModelArchitecture[]
                ).map((arch) => (
                  <button
                    key={arch}
                    type="button"
                    onClick={() => handleArchChange(arch)}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      config.architecture === arch
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {arch}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="checkpoint-select"
                className="block text-xs text-slate-400 mb-1"
              >
                Local Checkpoint File (/models/checkpoints/)
              </label>
              <select
                id="checkpoint-select"
                value={config.checkpointName}
                onChange={(e) =>
                  onUpdateConfig({ ...config, checkpointName: e.target.value })
                }
                className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-500"
              >
                {(
                  CHECKPOINT_PRESETS[config.architecture] ||
                  CHECKPOINT_PRESETS['LTX-Video']
                ).map((preset) => (
                  <option key={preset.filename} value={preset.filename}>
                    {preset.label} ({preset.filename})
                  </option>
                ))}
              </select>
            </div>

            {/* Dedicated LTX-Video 2B Local Hardware & 8n+1 Frame Rule Panel */}
            {config.architecture === 'LTX-Video' && (
              <div className="p-3 rounded-lg bg-[#0B0F17] border border-amber-500/30 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-amber-300 font-semibold">
                    ComfyUI-LTXVideo Native 8n+1 Tuning
                  </span>
                  <span className="text-slate-300 tabular-nums">
                    {ltxFrameCheck.formula}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label
                      htmlFor="ltx-vram-select"
                      className="block text-[10px] text-slate-400 mb-1"
                    >
                      Local GPU VRAM Mode
                    </label>
                    <select
                      id="ltx-vram-select"
                      value={config.vramProfile || '16GB Balanced'}
                      onChange={(e) =>
                        onUpdateConfig({
                          ...config,
                          vramProfile: e.target.value as LocalVramProfile,
                        })
                      }
                      className="w-full rounded bg-slate-900 border border-slate-800 px-2 py-1 text-[11px] font-mono text-slate-200"
                    >
                      <option value="12GB FP8 Offload">12GB FP8 Offload</option>
                      <option value="16GB Balanced">16GB Balanced</option>
                      <option value="24GB+ Full VRAM">24GB+ Full VRAM</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="ltx-chunk-select"
                      className="block text-[10px] text-slate-400 mb-1"
                    >
                      LTX Chunk (8n+1)
                    </label>
                    <select
                      id="ltx-chunk-select"
                      value={ltxFrameCheck.validFrames}
                      onChange={(e) =>
                        onUpdateConfig({
                          ...config,
                          ltxChunkFrames: Number(e.target.value),
                        })
                      }
                      className="w-full rounded bg-slate-900 border border-slate-800 px-2 py-1 text-[11px] font-mono tabular-nums text-slate-200"
                    >
                      <option value={97}>97f (4.0s)</option>
                      <option value={121}>121f (5.0s)</option>
                      <option value={161}>161f (6.7s)</option>
                      <option value={241}>241f (10.0s)</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="ltx-stg-input"
                      className="block text-[10px] text-slate-400 mb-1"
                    >
                      STG Guidance Scale
                    </label>
                    <input
                      id="ltx-stg-input"
                      type="number"
                      step="0.1"
                      min={0.5}
                      max={3.0}
                      value={config.ltxStgScale ?? 1.4}
                      onChange={(e) =>
                        onUpdateConfig({
                          ...config,
                          ltxStgScale: Number(e.target.value),
                        })
                      }
                      className="w-full rounded bg-slate-900 border border-slate-800 px-2 py-1 text-[11px] font-mono tabular-nums text-slate-200"
                    />
                  </div>
                </div>

                <div className="text-[10px] font-mono tabular-nums text-slate-400 flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-slate-800/80">
                  <span>
                    Latent: {ltxHardware.nativeLatentSize} →{' '}
                    {ltxHardware.upscaleTargetSize}
                  </span>
                  <span>·</span>
                  <span className="text-emerald-300">
                    ~{ltxHardware.estimatedVramGb} GB VRAM ({ltxHardware.totalChunks}{' '}
                    chunks · ~{ltxHardware.estimatedMinutes}m local)
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="steps-input"
                  className="block text-xs text-slate-400 mb-1"
                >
                  Steps
                </label>
                <input
                  id="steps-input"
                  type="number"
                  min={8}
                  max={60}
                  value={config.steps}
                  onChange={(e) =>
                    onUpdateConfig({ ...config, steps: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-3 py-1.5 text-xs font-mono tabular-nums text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="cfg-input"
                  className="block text-xs text-slate-400 mb-1"
                >
                  CFG Guidance
                </label>
                <input
                  id="cfg-input"
                  type="number"
                  step="0.2"
                  min={1}
                  max={15}
                  value={config.cfg}
                  onChange={(e) =>
                    onUpdateConfig({ ...config, cfg: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-3 py-1.5 text-xs font-mono tabular-nums text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="fps-input"
                  className="block text-xs text-slate-400 mb-1"
                >
                  Frame Rate
                </label>
                <select
                  id="fps-input"
                  value={config.fps}
                  onChange={(e) =>
                    onUpdateConfig({ ...config, fps: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-2 py-1.5 text-xs font-mono tabular-nums text-slate-100"
                >
                  <option value={24}>24 fps</option>
                  <option value={30}>30 fps</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Output Path: {config.localCacheDirectory}</span>
            <span className="text-emerald-400">100% Local Disk</span>
          </div>
        </div>

        {/* Dynamic Style LoRA Stack */}
        <div className="lg:col-span-7 bg-[#111724] border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  02. Dynamic Animation Style LoRA Stack
                </h2>
                <p className="text-xs text-slate-400">
                  Storyboard <code className="font-mono text-amber-300">[STYLE_*]</code>{' '}
                  labels trigger automatic weight switching mid-episode.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {loras.length} Active LoRAs
              </span>
            </div>

            <div className="space-y-2.5">
              {loras.map((lora) => (
                <div
                  key={lora.id}
                  className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-amber-300">
                        [{lora.styleTag}]
                      </span>
                      <span className="text-xs font-medium text-slate-100">
                        {lora.name}
                      </span>
                      <span className="text-xs text-slate-500">·</span>
                      <span className="text-xs text-slate-400">{lora.genre}</span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                      File: {lora.filename} · Prompt: "{lora.triggerPhrase}"
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums text-xs">
                    <label className="flex items-center gap-2 text-slate-300">
                      <span className="text-slate-400">Weight</span>
                      <input
                        type="range"
                        aria-label={`Model strength for ${lora.name}`}
                        min="0.1"
                        max="1.2"
                        step="0.05"
                        value={lora.modelStrength}
                        onChange={(e) =>
                          onUpdateLoRA({
                            ...lora,
                            modelStrength: Number(e.target.value),
                          })
                        }
                        className="w-20 accent-amber-500 cursor-pointer"
                      />
                      <span className="w-9 text-right">
                        {lora.modelStrength.toFixed(2)}
                      </span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Add LoRA Form */}
          <form
            onSubmit={handleAddLoRASubmit}
            className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-4 gap-2"
          >
            <input
              type="text"
              aria-label="New LoRA Style Tag"
              placeholder="STYLE_CEL_MECHA"
              value={newLoraTag}
              onChange={(e) => setNewLoraTag(e.target.value)}
              className="rounded-lg bg-[#0B0F17] border border-slate-800 px-3 py-1.5 text-xs font-mono text-slate-100"
            />
            <input
              type="text"
              aria-label="New LoRA Display Name"
              placeholder="Mecha Cel-Shade v2"
              value={newLoraName}
              onChange={(e) => setNewLoraName(e.target.value)}
              className="rounded-lg bg-[#0B0F17] border border-slate-800 px-3 py-1.5 text-xs text-slate-100"
            />
            <select
              aria-label="New LoRA Genre"
              value={newLoraGenre}
              onChange={(e) => setNewLoraGenre(e.target.value as GenreSetting)}
              className="rounded-lg bg-[#0B0F17] border border-slate-800 px-3 py-1.5 text-xs text-slate-100"
            >
              <option value="Cyberpunk">Cyberpunk</option>
              <option value="Sci-Fi">Sci-Fi</option>
              <option value="Fantasy">Fantasy</option>
            </select>
            <button
              type="submit"
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register LoRA</span>
            </button>
          </form>
        </div>
      </div>

      {/* Row 2: ComfyUI Node Camera Movement, Pacing & Custom Node Graph */}
      <div className="bg-[#111724] border border-slate-800/80 rounded-xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              03. ComfyUI Custom Node Automation Graph & Global Camera/Pacing Controller
            </h2>
            <p className="text-xs text-slate-400">
              Configure camera movements (pans, zooms, dolly shots) and character
              pacing consistently across all scenes for 2–5 minute vertical episodes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPythonNodes}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download vertinode_comfy_nodes.py</span>
            </button>
            <button
              type="button"
              onClick={onExportSRT}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .SRT Subtitles</span>
            </button>
            <button
              type="button"
              onClick={onExportJSON}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>Download workflow_api.json</span>
            </button>
          </div>
        </div>

        {/* Interactive Node #5 Camera Movement & Pacing Consistency Bar */}
        <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-3">
            <label
              htmlFor="global-camera-select"
              className="block text-xs text-slate-400 mb-1"
            >
              Node #5 Camera Movement Preset
            </label>
            <select
              id="global-camera-select"
              value={batchCamera}
              onChange={(e) => setBatchCamera(e.target.value as CameraCurve)}
              className="w-full rounded-lg bg-[#111724] border border-slate-700 px-3 py-2 text-xs text-slate-100"
            >
              <option value="Dolly In">Dolly In (Zoom Push)</option>
              <option value="Pan Right">Pan Right (Lateral Track)</option>
              <option value="Tilt Up">Tilt Up (Vertical Spire Reveal)</option>
              <option value="Dutch Whip">Dutch Whip (Action Confrontation)</option>
              <option value="Static Close-Up">Static Close-Up (Lip-Sync Focus)</option>
              <option value="Crane Pullback">Crane Pullback (Cliffhanger Wide)</option>
            </select>
          </div>

          <div className="lg:col-span-3">
            <label
              htmlFor="global-pacing-select"
              className="block text-xs text-slate-400 mb-1"
            >
              Node #5 Character Pacing Curve
            </label>
            <select
              id="global-pacing-select"
              value={batchPacing}
              onChange={(e) => setBatchPacing(e.target.value as PacingProfile)}
              className="w-full rounded-lg bg-[#111724] border border-slate-700 px-3 py-2 text-xs text-slate-100"
            >
              <option value="Slow Burn">Slow Burn (Smoothstep Ease)</option>
              <option value="Rhythmic Dialogue">Rhythmic Dialogue (Balanced)</option>
              <option value="Rapid Cliffhanger">Rapid Cliffhanger (Fast Attack)</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <button
              type="button"
              onClick={() => onApplyBatchCameraPacing(batchCamera, batchPacing)}
              className="w-full px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/50 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs transition-colors whitespace-nowrap"
            >
              Apply Across All Scenes
            </button>
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="episode-target-sec"
              className="block text-xs text-slate-400 mb-1 font-mono tabular-nums"
            >
              Episode Target: {targetEpSec}s ({Math.floor(targetEpSec / 60)}m{' '}
              {targetEpSec % 60}s)
            </label>
            <input
              id="episode-target-sec"
              type="range"
              min={120}
              max={300}
              step={10}
              value={targetEpSec}
              onChange={(e) => setTargetEpSec(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="lg:col-span-2">
            <button
              type="button"
              onClick={() => onNormalizeEpisodeDuration(targetEpSec)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs transition-colors whitespace-nowrap"
            >
              Fit Episode to {targetEpSec}s
            </button>
          </div>
        </div>

        {/* 8-Node Pipeline Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {nodeEntries.map(([nodeId, node]) => {
            const isSelected = selectedNodeId === nodeId;
            return (
              <button
                key={nodeId}
                type="button"
                onClick={() => setSelectedNodeId(nodeId)}
                className={`text-left p-3.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500/60'
                    : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span>Node #{nodeId}</span>
                  <span className="text-amber-300 truncate max-w-[150px]">
                    {node.class_type}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {node._meta.title}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400 truncate">
                  Inputs: {Object.keys(node.inputs).join(', ')}
                </div>
              </button>
            );
          })}
        </div>

        {/* Live Node JSON & SRT / Python Custom Node Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
          <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
              <span>
                Node #{selectedNodeId} Payload (
                {workflowGraph[selectedNodeId]?.class_type})
              </span>
              <span className="text-amber-300">ComfyUI API Format</span>
            </div>
            <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48 leading-relaxed">
              {JSON.stringify(workflowGraph[selectedNodeId], null, 2)}
            </pre>
          </div>

          <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-4">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCodeTab('srt')}
                  className={`px-2 py-0.5 rounded text-[11px] ${
                    codeTab === 'srt'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Frame-Locked .SRT
                </button>
                <button
                  type="button"
                  onClick={() => setCodeTab('python')}
                  className={`px-2 py-0.5 rounded text-[11px] ${
                    codeTab === 'python'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  vertinode_comfy_nodes.py
                </button>
              </div>
              <span className="text-emerald-400">
                {codeTab === 'srt' ? 'Silent Viseme Synced' : 'ComfyUI Custom Nodes'}
              </span>
            </div>
            <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48 leading-relaxed">
              {codeTab === 'srt' ? srtPreview : pythonCustomNodes}
            </pre>
          </div>
        </div>
      </div>

      {/* Row 3: Multi-Episode Local Batch Processing Queue (2–5 min episodes) */}
      <div className="bg-[#111724] border border-slate-800/80 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              04. Local Batch Episode Queue (2–5 Min DramaBox / NetShorts Standard)
            </h2>
            <p className="text-xs text-slate-400">
              Queue multiple 2-to-5 minute vertical episodes for unattended local
              GPU generation with zero cloud storage dependencies.
            </p>
          </div>
          <button
            type="button"
            onClick={onRunBatchQueue}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Advance Local Batch Render</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 bg-slate-900/40">
                <th className="py-2.5 px-4">Episode Title</th>
                <th className="py-2.5 px-4">Genre & Checkpoint</th>
                <th className="py-2.5 px-4 text-right">Duration</th>
                <th className="py-2.5 px-4 text-right">Total Frames</th>
                <th className="py-2.5 px-4 text-right">Frame Lock</th>
                <th className="py-2.5 px-4">Batch Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {batchQueue.map((job) => (
                <tr key={job.id} className="hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-medium text-slate-100">
                    {job.title}
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-mono">
                    {job.genre} · {job.checkpoint}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                    {Math.floor(job.durationSec / 60)}m {job.durationSec % 60}s
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                    {job.totalFrames.toLocaleString()} frames
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-400">
                    {job.outputResolution}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          job.status === 'Completed'
                            ? 'text-emerald-400'
                            : job.status === 'Rendering'
                            ? 'text-amber-300'
                            : 'text-slate-400'
                        }
                      >
                        {job.status} ({job.progressPct}%)
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Episode to Batch Form */}
        <form
          onSubmit={handleCreateBatchEpisode}
          className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
        >
          <div className="flex-1">
            <label
              htmlFor="batch-ep-title"
              className="block text-xs text-slate-400 mb-1"
            >
              New Batch Episode Title
            </label>
            <input
              id="batch-ep-title"
              type="text"
              placeholder="EP04 · Vault of the Cyber-Empress"
              value={newBatchTitle}
              onChange={(e) => setNewBatchTitle(e.target.value)}
              className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs text-slate-100"
            />
          </div>
          <div className="w-full sm:w-48">
            <label
              htmlFor="batch-ep-duration"
              className="block text-xs text-slate-400 mb-1"
            >
              Target Duration (120s–300s)
            </label>
            <input
              id="batch-ep-duration"
              type="number"
              min={120}
              max={300}
              value={newBatchDuration}
              onChange={(e) => setNewBatchDuration(Number(e.target.value))}
              className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-3 py-2 text-xs font-mono tabular-nums text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            Enqueue Episode (2–5m)
          </button>
        </form>
      </div>
    </div>
  );
};
