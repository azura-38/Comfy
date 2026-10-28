/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Download,
  Film,
  Sliders,
  MessageSquare,
  CheckCircle2,
  Trash2,
  RotateCcw,
  Tag,
} from 'lucide-react';
import {
  CharacterSheet,
  StyleLoRA,
  StoryboardBeat,
  PipelineConfig,
  BatchEpisodeJob,
  CameraCurve,
  PacingProfile,
  SpriteLayoutMode,
  GenreSetting,
  INITIAL_CHARACTERS,
  INITIAL_LORAS,
  INITIAL_STORYBOARD_BEATS,
  INITIAL_PIPELINE_CONFIG,
  INITIAL_BATCH_QUEUE,
  GENRE_STORYBOARD_SCRIPTS,
  resolveSceneGraphMapping,
  validateCharacterDimensionLock,
  buildComfyUIWorkflowJSON,
  exportFrameSyncedSubtitlesSRT,
  autoParseRawStoryboardBlock,
  normalizeBeatsToEpisodeWindow,
  getSceneThumbnailGradientSpec,
} from './utils/workflowEngine';
import { VerticalDramaMonitor } from './components/VerticalDramaMonitor';
import { CharacterSheetsView } from './components/CharacterSheetsView';
import { ComfyPipelineView } from './components/ComfyPipelineView';
import { AiProductionLab } from './components/AiProductionLab';
import { ChatbotDrawer } from './components/ChatbotDrawer';

type WorkspaceTab = 'storyboard' | 'characters' | 'pipeline' | 'ailab';

const STORAGE_KEY = 'vertinode_studio_local_state_v1';

const CAMERA_CURVES: CameraCurve[] = [
  'Dolly In',
  'Pan Right',
  'Tilt Up',
  'Dutch Whip',
  'Static Close-Up',
  'Crane Pullback',
];

const PACING_PROFILES: PacingProfile[] = [
  'Slow Burn',
  'Rhythmic Dialogue',
  'Rapid Cliffhanger',
];

const SPRITE_LAYOUTS: SpriteLayoutMode[] = [
  'Center Hero 9:16',
  'Dual Split Confrontation',
  'Over-Shoulder Upper Third',
  'Choker Lip-Sync Close-Up',
];

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('storyboard');
  const [characters, setCharacters] =
    useState<CharacterSheet[]>(INITIAL_CHARACTERS);
  const [loras, setLoras] = useState<StyleLoRA[]>(INITIAL_LORAS);
  const [beats, setBeats] = useState<StoryboardBeat[]>(
    INITIAL_STORYBOARD_BEATS
  );
  const [config, setConfig] = useState<PipelineConfig>(INITIAL_PIPELINE_CONFIG);
  const [batchQueue, setBatchQueue] =
    useState<BatchEpisodeJob[]>(INITIAL_BATCH_QUEUE);

  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [overrideStyleTag, setOverrideStyleTag] = useState<string | null>(null);
  const [selectedBeatId, setSelectedBeatId] = useState<string>('beat-1');
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [exportBanner, setExportBanner] = useState<string>('');
  const [selectedGenrePreset, setSelectedGenrePreset] =
    useState<GenreSetting>('Cyberpunk');
  const [rawStoryboardInput, setRawStoryboardInput] = useState<string>(
    GENRE_STORYBOARD_SCRIPTS.Cyberpunk
  );
  const [isParserExpanded, setIsParserExpanded] = useState<boolean>(false);

  // Load saved local state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.characters) && parsed.characters.length > 0) {
          setCharacters(parsed.characters);
        }
        if (Array.isArray(parsed.loras) && parsed.loras.length > 0) {
          setLoras(parsed.loras);
        }
        if (Array.isArray(parsed.beats) && parsed.beats.length > 0) {
          setBeats(parsed.beats);
        }
        if (parsed.config) {
          setConfig(parsed.config);
        }
      }
    } catch {
      // Ignore storage errors in restricted environments
    }
  }, []);

  // Save state locally on changes
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ characters, loras, beats, config })
      );
    } catch {
      // Ignore quota errors
    }
  }, [characters, loras, beats, config]);

  // Compute resolved scene graph, automatic asset mapping, and frame numbers
  const sceneGraph = useMemo(
    () =>
      resolveSceneGraphMapping(
        beats,
        characters,
        loras,
        config.fps,
        config.targetWidth,
        config.targetHeight
      ),
    [beats, characters, loras, config.fps, config.targetWidth, config.targetHeight]
  );

  const dimCheck = useMemo(
    () =>
      validateCharacterDimensionLock(
        characters,
        config.targetWidth,
        config.targetHeight
      ),
    [characters, config.targetWidth, config.targetHeight]
  );

  // Playback loop at active FPS
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = Math.round(1000 / Math.max(1, config.fps));
    const timer = window.setInterval(() => {
      setCurrentFrame((prev) => {
        const next = prev + 1;
        return next >= sceneGraph.totalFrames ? 0 : next;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, config.fps, sceneGraph.totalFrames]);

  const handleUpdateBeat = (updated: StoryboardBeat) => {
    setBeats((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  };

  const handleAddSceneBeat = () => {
    const nextNum = beats.length + 1;
    const defaultChar = characters[0]?.label || 'CHAR_KAEL';
    const defaultStyle = loras[0]?.styleTag || 'STYLE_CYBER_NOIR';
    const newBeat: StoryboardBeat = {
      id: `beat-${Date.now()}`,
      sceneNumber: nextNum,
      title: `Scene 0${nextNum} · New Narrative Beat`,
      rawNarrative: `[${defaultChar}] [${defaultStyle}] [POSE_DRAMATIC] Enters the vertical frame as the camera dollies in.`,
      subtitleText:
        'Every frame is locked to our local character sheet—no cloud required.',
      durationSec: 25,
      cameraCurve: 'Dolly In',
      pacing: 'Rhythmic Dialogue',
      lightingNote: 'High-contrast rim lighting with lower-third subtitle scrim',
    };
    setBeats((prev) => [...prev, newBeat]);
    setSelectedBeatId(newBeat.id);
  };

  const handleDeleteBeat = (id: string) => {
    if (beats.length <= 1) return;
    setBeats((prev) =>
      prev
        .filter((b) => b.id !== id)
        .map((b, idx) => ({ ...b, sceneNumber: idx + 1 }))
    );
  };

  const handleInsertTagIntoSelectedBeat = (tag: string) => {
    const target =
      beats.find((b) => b.id === selectedBeatId) || beats[0];
    if (!target) return;
    const bracketed = `[${tag}]`;
    if (target.rawNarrative.includes(bracketed)) return;
    handleUpdateBeat({
      ...target,
      rawNarrative: `${bracketed} ${target.rawNarrative}`,
    });
  };

  const handleApplyBatchCameraPacing = (
    camera: CameraCurve,
    pacing: PacingProfile
  ) => {
    setBeats((prev) =>
      prev.map((b) => ({
        ...b,
        cameraCurve: camera,
        pacing,
      }))
    );
    setExportBanner(
      `Applied "${camera}" camera curve and "${pacing}" pacing consistently across all ${beats.length} scenes.`
    );
  };

  const handleNormalizeEpisodeDuration = (targetSeconds: number) => {
    setBeats((prev) => normalizeBeatsToEpisodeWindow(prev, targetSeconds));
    setCurrentFrame(0);
    setExportBanner(
      `Normalized episode pacing across ${beats.length} scenes to ${targetSeconds}s (${Math.floor(
        targetSeconds / 60
      )}m ${targetSeconds % 60}s · ${targetSeconds * config.fps} frames).`
    );
  };

  const handleAutoParseStoryboardScript = (
    scriptText: string,
    genre?: GenreSetting
  ) => {
    const parsed = autoParseRawStoryboardBlock(scriptText, 180);
    if (parsed.length === 0) return;
    setBeats(parsed);
    setSelectedBeatId(parsed[0].id);
    setCurrentFrame(0);
    setExportBanner(
      `Auto-parsed ${parsed.length} storyboard scenes${
        genre ? ` (${genre} preset)` : ''
      } with sprite layouts, character poses, and frame-locked viseme subtitles.`
    );
  };

  const handleSyncAllCharacterDimensions = () => {
    setCharacters((prev) =>
      prev.map((c) => ({
        ...c,
        sheetWidth: config.targetWidth,
        sheetHeight: config.targetHeight,
      }))
    );
    setExportBanner(
      `All character spreadsheets synchronized to ${config.targetWidth}×${config.targetHeight} (9:16).`
    );
  };

  const handleExportWorkflowJSON = () => {
    const workflow = buildComfyUIWorkflowJSON(
      config,
      sceneGraph.resolvedBeats,
      characters,
      loras
    );
    const blob = new Blob([JSON.stringify(workflow, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.episodeCode.toLowerCase()}_comfyui_workflow.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportBanner(
      `Exported ComfyUI API workflow (${Object.keys(workflow).length} custom nodes, ${sceneGraph.totalFrames} frames @ ${config.targetWidth}×${config.targetHeight}).`
    );
  };

  const handleExportSRT = () => {
    const srt = exportFrameSyncedSubtitlesSRT(
      sceneGraph.resolvedBeats,
      config.fps
    );
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.episodeCode.toLowerCase()}_subtitles.srt`;
    a.click();
    URL.revokeObjectURL(url);
    setExportBanner(
      `Exported frame-synchronized .SRT subtitles for ${sceneGraph.resolvedBeats.length} scenes.`
    );
  };

  const handleAdvanceBatchQueue = () => {
    setBatchQueue((prev) =>
      prev.map((job) => {
        if (job.status === 'Rendering') {
          return { ...job, status: 'Completed', progressPct: 100 };
        }
        if (job.status === 'Queued') {
          return { ...job, status: 'Rendering', progressPct: 50 };
        }
        return job;
      })
    );
    setExportBanner('Local ComfyUI batch queue advanced.');
  };

  const handleResetDemoState = () => {
    setCharacters(INITIAL_CHARACTERS);
    setLoras(INITIAL_LORAS);
    setBeats(INITIAL_STORYBOARD_BEATS);
    setConfig(INITIAL_PIPELINE_CONFIG);
    setBatchQueue(INITIAL_BATCH_QUEUE);
    setCurrentFrame(0);
    setOverrideStyleTag(null);
    setExportBanner('Reset local workspace to default seed project.');
  };

  const minutes = Math.floor(sceneGraph.totalDurationSec / 60);
  const seconds = sceneGraph.totalDurationSec % 60;

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F17] text-[#F1F5F9]">
      {/* Strict 3-Zone Top Navigation Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800/90 bg-[#0B0F17]/95 sticky top-0 z-30 backdrop-blur">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('storyboard');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap shrink-0"
        >
          VertiNode Studio
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav
          aria-label="Primary Workspace Navigation"
          className="flex items-center gap-6 text-sm font-medium text-slate-400 overflow-x-auto"
        >
          <button
            type="button"
            onClick={() => setActiveTab('storyboard')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'storyboard'
                ? 'text-amber-300 border-amber-400'
                : 'border-transparent hover:text-slate-100'
            }`}
          >
            Storyboard & Sync
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('characters')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'characters'
                ? 'text-amber-300 border-amber-400'
                : 'border-transparent hover:text-slate-100'
            }`}
          >
            Character Sheets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pipeline')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'pipeline'
                ? 'text-amber-300 border-amber-400'
                : 'border-transparent hover:text-slate-100'
            }`}
          >
            ComfyUI Pipeline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ailab')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'ailab'
                ? 'text-amber-300 border-amber-400'
                : 'border-transparent hover:text-slate-100'
            }`}
          >
            AI Production Lab
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExportWorkflowJSON}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Export ComfyUI JSON
          </button>
        </div>
      </header>

      {/* Workspace Telemetry & Quick Action Strip (Clean unboxed metadata with typographic separators) */}
      <div className="border-b border-slate-800/80 bg-[#111724]/70 px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-300 font-mono tabular-nums">
            <span className="font-semibold text-slate-100">
              {config.episodeCode}
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span
              className={
                sceneGraph.isWithinTwoToFiveMinutes
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }
            >
              Episode Length: {minutes}m {seconds}s ({sceneGraph.totalFrames}{' '}
              frames · {sceneGraph.episodeWindowStatus})
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span>
              Frame Lock: {config.targetWidth}×{config.targetHeight} (
              {dimCheck.allLocked ? 'Sheets Matched' : 'Mismatch Detected'})
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span>
              Base: {config.architecture} · {loras.length} Style LoRAs · Silent
              Viseme Sync
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportSRT}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] transition-colors whitespace-nowrap shrink-0"
            >
              Export .SRT
            </button>
            <button
              type="button"
              onClick={handleResetDemoState}
              aria-label="Reset Workspace"
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] transition-colors whitespace-nowrap shrink-0"
            >
              Reset Seed Data
            </button>
            <button
              type="button"
              onClick={() => setIsChatOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 font-medium text-xs transition-colors whitespace-nowrap shrink-0"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Technical Director Chat</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notification Banner on Export / Sync */}
      {exportBanner && (
        <div
          role="status"
          className="bg-emerald-950/60 border-b border-emerald-500/30 px-6 py-2 text-xs font-mono text-emerald-300 flex items-center justify-between"
        >
          <span>{exportBanner}</span>
          <button
            type="button"
            onClick={() => setExportBanner('')}
            className="text-slate-400 hover:text-slate-200 underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {activeTab === 'storyboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left/Center Column: Storyboard Sequencer, Label Mapper & Camera/Pacing Controls */}
            <div className="lg:col-span-8 space-y-5">
              {/* Storyboard Header, Genre Script Auto-Parser & Quick Label Injector */}
              <div className="bg-[#111724] border border-slate-800/80 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h1 className="text-lg font-semibold text-slate-100">
                      Storyboard Label-to-Asset Sequencer & Subtitle Sync
                    </h1>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Include <code className="font-mono text-amber-300">[CHAR_*]</code>,{' '}
                      <code className="font-mono text-amber-300">[STYLE_*]</code>, and{' '}
                      <code className="font-mono text-amber-300">[POSE_*]</code> labels
                      in any scene to automatically bind character spreadsheets,
                      layout sprites, trigger LoRA style switches, and generate
                      silent viseme lip-sync frames.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsParserExpanded((prev) => !prev)}
                      className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs transition-colors whitespace-nowrap shrink-0"
                    >
                      {isParserExpanded
                        ? 'Hide Script Auto-Parser'
                        : 'Auto-Parse Storyboard Script'}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddSceneBeat}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Scene Beat</span>
                    </button>
                  </div>
                </div>

                {/* Genre Preset Switcher & Episode Window Normalizer */}
                <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-slate-400">
                      Genre Storyboard Templates:
                    </span>
                    {(['Cyberpunk', 'Sci-Fi', 'Fantasy'] as GenreSetting[]).map(
                      (genre) => (
                        <button
                          key={genre}
                          type="button"
                          onClick={() => {
                            setSelectedGenrePreset(genre);
                            const script = GENRE_STORYBOARD_SCRIPTS[genre];
                            setRawStoryboardInput(script);
                            handleAutoParseStoryboardScript(script, genre);
                          }}
                          className={`px-2.5 py-1 rounded font-mono text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                            selectedGenrePreset === genre
                              ? 'bg-amber-500 text-slate-950 font-semibold'
                              : 'bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200'
                          }`}
                        >
                          Load {genre} Episode
                        </button>
                      )
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleNormalizeEpisodeDuration(180)}
                      className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-mono text-emerald-300 transition-colors whitespace-nowrap shrink-0"
                    >
                      Lock 3m00s Pacing (180s)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleApplyBatchCameraPacing(
                          'Dolly In',
                          'Rhythmic Dialogue'
                        )
                      }
                      className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-mono text-sky-300 transition-colors whitespace-nowrap shrink-0"
                    >
                      Sync Dolly + Rhythmic Pacing
                    </button>
                  </div>
                </div>

                {/* Expandable Raw Storyboard Script Parser */}
                {isParserExpanded && (
                  <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <label
                        htmlFor="raw-storyboard-parser"
                        className="font-mono text-slate-300"
                      >
                        Paste Multi-Line Storyboard Script (` Narrative ||
                        Subtitle` per line — auto-infers poses, sprite layouts
                        & camera curves):
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          handleAutoParseStoryboardScript(rawStoryboardInput)
                        }
                        className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
                      >
                        Parse & Generate Sequence
                      </button>
                    </div>
                    <textarea
                      id="raw-storyboard-parser"
                      rows={5}
                      value={rawStoryboardInput}
                      onChange={(e) => setRawStoryboardInput(e.target.value)}
                      className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                {/* Quick Token Injector for Active Beat */}
                <div className="pt-3 border-t border-slate-800/80">
                  <div className="text-[11px] font-mono text-slate-400 mb-2 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      Click a token to inject into Selected Scene (
                      {beats.find((b) => b.id === selectedBeatId)?.title ||
                        'Scene 1'}
                      ):
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {characters.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleInsertTagIntoSelectedBeat(c.label)}
                        className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-mono text-amber-300 transition-colors whitespace-nowrap shrink-0"
                      >
                        + [{c.label}]
                      </button>
                    ))}
                    {loras.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() =>
                          handleInsertTagIntoSelectedBeat(l.styleTag)
                        }
                        className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-mono text-sky-300 transition-colors whitespace-nowrap shrink-0"
                      >
                        + [{l.styleTag}]
                      </button>
                    ))}
                    {['POSE_NEUTRAL', 'POSE_DRAMATIC', 'POSE_SHOCK', 'POSE_CLOSEUP'].map(
                      (pose) => (
                        <button
                          key={pose}
                          type="button"
                          onClick={() => handleInsertTagIntoSelectedBeat(pose)}
                          className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-mono text-emerald-300 transition-colors whitespace-nowrap shrink-0"
                        >
                          + [{pose}]
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Scene Beats List */}
              <div className="space-y-4">
                {sceneGraph.resolvedBeats.map((beat, beatIdx) => {
                  const isActiveInMonitor =
                    currentFrame >= beat.startFrame &&
                    currentFrame <= beat.endFrame;
                  const isSelected = selectedBeatId === beat.id;
                  const thumbGradient = getSceneThumbnailGradientSpec(beatIdx);

                  return (
                    <div
                      key={beat.id}
                      onClick={() => setSelectedBeatId(beat.id)}
                      className={`bg-[#111724] rounded-xl p-5 border transition-colors ${
                        isActiveInMonitor
                          ? 'border-amber-500/70'
                          : isSelected
                          ? 'border-slate-600'
                          : 'border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      {/* Beat Top Metadata Row (Unboxed typography with separators) */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800/80">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-amber-300">
                            0{beat.sceneNumber}.
                          </span>
                          <input
                            type="text"
                            aria-label={`Scene ${beat.sceneNumber} Title`}
                            value={beat.title}
                            onChange={(e) =>
                              handleUpdateBeat({
                                ...beat,
                                title: e.target.value,
                              })
                            }
                            className="bg-transparent font-semibold text-slate-100 min-w-[260px] sm:min-w-[310px] focus:outline-none focus:border-b focus:border-amber-400"
                          />
                          <span aria-hidden="true" className="text-slate-600">
                            ·
                          </span>
                          <span className="font-mono tabular-nums text-slate-400">
                            Frames {beat.startFrame}–{beat.endFrame} (
                            {beat.totalFrames}f)
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentFrame(beat.startFrame);
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono text-[11px] transition-colors whitespace-nowrap shrink-0"
                          >
                            Preview Frame {beat.startFrame}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBeat(beat.id);
                            }}
                            aria-label={`Delete Scene ${beat.sceneNumber}`}
                            disabled={beats.length <= 1}
                            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800 disabled:opacity-30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Resolved Asset Mapping Summary Strip */}
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-mono text-slate-300 bg-[#0B0F17] px-3 py-2 rounded-lg border border-slate-800/90">
                        <span>
                          Sprite:{' '}
                          <strong className="text-amber-300">
                            {beat.matchedCharacter?.displayName || 'Unbound'} (
                            {beat.matchedCharacter?.label || 'NONE'})
                            {beat.secondaryCharacter
                              ? ` + ${beat.secondaryCharacter.displayName}`
                              : ''}
                          </strong>
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span>
                          Layout:{' '}
                          <strong className="text-slate-100">
                            {beat.inferredLayout}
                          </strong>
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span>
                          Pose:{' '}
                          <strong className="text-emerald-300">
                            {beat.activePose}
                          </strong>
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span>
                          Style LoRA:{' '}
                          <strong className="text-sky-300">
                            {beat.matchedLoRA?.name || 'Default'}
                          </strong>
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span>
                          Viseme Cues: {beat.visemeTimeline.length} silent sync
                          points
                        </span>
                      </div>

                      {/* 9:16 Scene Thumbnail Placeholder + Editable Narrative & Frame-Synchronized Subtitle */}
                      <div className="flex flex-col sm:flex-row gap-4 mb-4 items-stretch">
                        {/* 9:16 Vertical Scene Flow Thumbnail */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBeatId(beat.id);
                            setCurrentFrame(beat.startFrame);
                          }}
                          data-testid={`scene-thumbnail-${beat.sceneNumber}`}
                          aria-label={`Scene ${beat.sceneNumber} 9:16 Thumbnail Preview`}
                          className={`group relative w-full sm:w-[96px] aspect-[9/16] shrink-0 rounded-lg overflow-hidden border border-slate-700/80 hover:border-amber-400/80 transition-colors text-left flex flex-col justify-between ${
                            beat.customPlateUrl ? 'bg-slate-950' : thumbGradient.gradientClass
                          }`}
                        >
                          {beat.customPlateUrl ? (
                            <img
                              src={beat.customPlateUrl}
                              alt={`Scene ${beat.sceneNumber} plate`}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : (
                            <svg
                              viewBox="0 0 90 160"
                              className="absolute inset-0 w-full h-full pointer-events-none"
                              aria-hidden="true"
                            >
                              {/* Subtle 9:16 composition grid lines */}
                              <line
                                x1="0"
                                y1="53"
                                x2="90"
                                y2="53"
                                stroke="#94A3B8"
                                strokeOpacity="0.14"
                                strokeDasharray="2 2"
                              />
                              <line
                                x1="0"
                                y1="106"
                                x2="90"
                                y2="106"
                                stroke="#94A3B8"
                                strokeOpacity="0.14"
                                strokeDasharray="2 2"
                              />
                              {/* Atmosphere glow orb */}
                              <circle
                                cx={beatIdx % 2 === 0 ? '64' : '26'}
                                cy="38"
                                r="24"
                                fill={thumbGradient.accentHex}
                                fillOpacity="0.22"
                              />
                              {/* Character composition silhouette(s) */}
                              {beat.inferredLayout === 'Dual Split Confrontation' ? (
                                <g>
                                  <line
                                    x1="56"
                                    y1="18"
                                    x2="34"
                                    y2="142"
                                    stroke={thumbGradient.accentHex}
                                    strokeOpacity="0.55"
                                    strokeWidth="1.2"
                                  />
                                  <circle
                                    cx="27"
                                    cy="64"
                                    r="9"
                                    fill="#0F172A"
                                    stroke={thumbGradient.accentHex}
                                    strokeWidth="1.4"
                                  />
                                  <path
                                    d="M 13 96 Q 27 76 41 96 L 43 132 L 11 132 Z"
                                    fill="#0F172A"
                                    stroke={thumbGradient.accentHex}
                                    strokeWidth="1.2"
                                  />
                                  <circle
                                    cx="63"
                                    cy="72"
                                    r="8.5"
                                    fill="#0F172A"
                                    stroke={thumbGradient.secondaryHex}
                                    strokeWidth="1.4"
                                  />
                                  <path
                                    d="M 49 102 Q 63 83 77 102 L 79 132 L 47 132 Z"
                                    fill="#0F172A"
                                    stroke={thumbGradient.secondaryHex}
                                    strokeWidth="1.2"
                                  />
                                </g>
                              ) : (
                                <g>
                                  <circle
                                    cx="45"
                                    cy={
                                      beat.inferredLayout ===
                                      'Choker Lip-Sync Close-Up'
                                        ? '58'
                                        : '64'
                                    }
                                    r={
                                      beat.inferredLayout ===
                                      'Choker Lip-Sync Close-Up'
                                        ? '14'
                                        : '11'
                                    }
                                    fill="#0F172A"
                                    stroke={thumbGradient.accentHex}
                                    strokeWidth="1.5"
                                  />
                                  <path
                                    d="M 24 102 Q 45 78 66 102 L 70 136 L 20 136 Z"
                                    fill="#0F172A"
                                    stroke={thumbGradient.accentHex}
                                    strokeWidth="1.3"
                                  />
                                </g>
                              )}
                            </svg>
                          )}

                          {/* Top Thumbnail Overlay: Scene Index */}
                          <div className="relative z-10 px-2 py-1 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-200">
                            <span className="font-semibold text-amber-300">
                              S0{beat.sceneNumber}
                            </span>
                            <span className="text-[9px] text-slate-300">
                              {beat.durationSec}s
                            </span>
                          </div>

                          {/* Bottom Thumbnail Overlay: Plate or Scene Gradient Flow */}
                          <div className="relative z-10 px-2 py-1.5 bg-gradient-to-t from-black/90 via-black/70 to-transparent">
                            <div className="text-[9px] font-mono text-slate-200 truncate">
                              {beat.matchedCharacter?.label.replace(
                                'CHAR_',
                                ''
                              ) || 'SCENE'}
                              {beat.secondaryCharacter
                                ? `×${beat.secondaryCharacter.label.replace(
                                    'CHAR_',
                                    ''
                                  )}`
                                : ''}
                            </div>
                            <div className="text-[8px] font-mono text-amber-300/90 truncate">
                              {beat.customPlateUrl
                                ? 'Custom Plate'
                                : thumbGradient.atmosphereLabel}
                            </div>
                          </div>
                        </button>

                        {/* Editable Narrative & Frame-Synchronized Subtitle */}
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label
                              htmlFor={`narrative-${beat.id}`}
                              className="block text-xs text-slate-400 mb-1"
                            >
                              Storyboard Narrative & [CHAR_*] / [STYLE_*] Labels
                            </label>
                            <textarea
                              id={`narrative-${beat.id}`}
                              rows={4}
                              value={beat.rawNarrative}
                              onChange={(e) =>
                                handleUpdateBeat({
                                  ...beat,
                                  rawNarrative: e.target.value,
                                })
                              }
                              className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          <div>
                            <label
                              htmlFor={`subtitle-${beat.id}`}
                              className="block text-xs text-slate-400 mb-1"
                            >
                              Silent Drama Subtitle (Drives Viseme Lip-Sync &
                              Burn-In)
                            </label>
                            <textarea
                              id={`subtitle-${beat.id}`}
                              rows={4}
                              value={beat.subtitleText}
                              onChange={(e) =>
                                handleUpdateBeat({
                                  ...beat,
                                  subtitleText: e.target.value,
                                })
                              }
                              className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 p-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Camera Movement, Pacing Profile, Sprite Layout & Duration Controls */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/60">
                        <div>
                          <label
                            htmlFor={`camera-${beat.id}`}
                            className="block text-[11px] text-slate-400 mb-1"
                          >
                            Camera Movement Curve
                          </label>
                          <select
                            id={`camera-${beat.id}`}
                            value={beat.cameraCurve}
                            onChange={(e) =>
                              handleUpdateBeat({
                                ...beat,
                                cameraCurve: e.target.value as CameraCurve,
                              })
                            }
                            className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-2.5 py-1.5 text-xs text-slate-200"
                          >
                            {CAMERA_CURVES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`pacing-${beat.id}`}
                            className="block text-[11px] text-slate-400 mb-1"
                          >
                            Character Pacing Curve
                          </label>
                          <select
                            id={`pacing-${beat.id}`}
                            value={beat.pacing}
                            onChange={(e) =>
                              handleUpdateBeat({
                                ...beat,
                                pacing: e.target.value as PacingProfile,
                              })
                            }
                            className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-2.5 py-1.5 text-xs text-slate-200"
                          >
                            {PACING_PROFILES.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`layout-${beat.id}`}
                            className="block text-[11px] text-slate-400 mb-1"
                          >
                            9:16 Sprite Layout
                          </label>
                          <select
                            id={`layout-${beat.id}`}
                            value={beat.spriteLayout || beat.inferredLayout}
                            onChange={(e) =>
                              handleUpdateBeat({
                                ...beat,
                                spriteLayout:
                                  e.target.value as SpriteLayoutMode,
                              })
                            }
                            className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-2.5 py-1.5 text-xs text-slate-200"
                          >
                            {SPRITE_LAYOUTS.map((layout) => (
                              <option key={layout} value={layout}>
                                {layout}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`duration-${beat.id}`}
                            className="block text-[11px] text-slate-400 mb-1"
                          >
                            Beat Duration ({beat.durationSec * config.fps}f)
                          </label>
                          <input
                            id={`duration-${beat.id}`}
                            type="number"
                            min={4}
                            max={120}
                            value={beat.durationSec}
                            onChange={(e) =>
                              handleUpdateBeat({
                                ...beat,
                                durationSec: Math.max(
                                  4,
                                  Number(e.target.value) || 10
                                ),
                              })
                            }
                            className="w-full rounded-lg bg-[#0B0F17] border border-slate-800 px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-200"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Sticky 9:16 Vertical Drama Monitor */}
            <div className="lg:col-span-4 lg:sticky lg:top-20">
              <VerticalDramaMonitor
                resolvedBeats={sceneGraph.resolvedBeats}
                currentFrame={currentFrame}
                totalFrames={sceneGraph.totalFrames}
                fps={config.fps}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                onSeekFrame={(f) => {
                  setIsPlaying(false);
                  setCurrentFrame(f);
                }}
                loras={loras}
                overrideStyleTag={overrideStyleTag}
                onSetOverrideStyleTag={setOverrideStyleTag}
                subtitleBurnIn={config.subtitleBurnIn}
                onToggleSubtitleBurnIn={() =>
                  setConfig((prev) => ({
                    ...prev,
                    subtitleBurnIn: !prev.subtitleBurnIn,
                  }))
                }
              />
            </div>
          </div>
        )}

        {activeTab === 'characters' && (
          <CharacterSheetsView
            characters={characters}
            targetWidth={config.targetWidth}
            targetHeight={config.targetHeight}
            onAddCharacter={(c) => setCharacters((prev) => [...prev, c])}
            onUpdateCharacter={(c) =>
              setCharacters((prev) =>
                prev.map((item) => (item.id === c.id ? c : item))
              )
            }
            onDeleteCharacter={(id) =>
              setCharacters((prev) => prev.filter((item) => item.id !== id))
            }
            onImportCSVCharacters={(imported) =>
              setCharacters((prev) => [...prev, ...imported])
            }
            onSyncAllDimensions={handleSyncAllCharacterDimensions}
          />
        )}

        {activeTab === 'pipeline' && (
          <ComfyPipelineView
            config={config}
            onUpdateConfig={setConfig}
            loras={loras}
            onUpdateLoRA={(updated) =>
              setLoras((prev) =>
                prev.map((l) => (l.id === updated.id ? updated : l))
              )
            }
            onAddLoRA={(created) => setLoras((prev) => [...prev, created])}
            characters={characters}
            resolvedBeats={sceneGraph.resolvedBeats}
            batchQueue={batchQueue}
            onAddBatchJob={(job) => setBatchQueue((prev) => [...prev, job])}
            onRunBatchQueue={handleAdvanceBatchQueue}
            onExportJSON={handleExportWorkflowJSON}
            onExportSRT={handleExportSRT}
            onApplyBatchCameraPacing={handleApplyBatchCameraPacing}
            onNormalizeEpisodeDuration={handleNormalizeEpisodeDuration}
          />
        )}

        {activeTab === 'ailab' && (
          <AiProductionLab
            characters={characters}
            beats={beats}
            loras={loras}
            onAssignCharacterImage={(charId, dataUrl) => {
              setCharacters((prev) =>
                prev.map((c) =>
                  c.id === charId ? { ...c, customImageUrl: dataUrl } : c
                )
              );
              setExportBanner(
                'Bound generated reference sheet to character sprite.'
              );
            }}
            onAssignBeatPlate={(beatId, dataUrl) => {
              setBeats((prev) =>
                prev.map((b) =>
                  b.id === beatId ? { ...b, customPlateUrl: dataUrl } : b
                )
              );
              setExportBanner('Bound generated 9:16 plate to storyboard scene.');
            }}
            onAssignBeatVideo={(beatId, videoUrl) => {
              setBeats((prev) =>
                prev.map((b) =>
                  b.id === beatId ? { ...b, customVideoUrl: videoUrl } : b
                )
              );
              setExportBanner('Bound animated video to storyboard scene.');
            }}
            onAppendGeneratedBeat={(beat) => {
              setBeats((prev) => [...prev, beat]);
              setExportBanner(
                `Appended "${beat.title}" to storyboard sequence.`
              );
            }}
          />
        )}
      </main>

      {/* Quiet Production Footer */}
      <footer className="border-t border-slate-800/80 px-6 py-4 text-xs text-slate-500 mt-12">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            VertiNode Studio · Local-First 9:16 Vertical Drama Automation for
            ComfyUI
          </span>
          <span className="font-mono">
            Offline Local Storage Active · Zero Cloud Storage Dependency
          </span>
        </div>
      </footer>

      {/* Multi-Turn Gemini Technical Director Chatbot Drawer */}
      <ChatbotDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </div>
  );
}
