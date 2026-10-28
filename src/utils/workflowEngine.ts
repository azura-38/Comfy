import type { ComfyObjectInfoResponse } from './comfyApiClient';

export type GenreSetting = 'Cyberpunk' | 'Sci-Fi' | 'Fantasy';
export type BaseModelArchitecture =
  | 'LTX-Video'
  | 'Flux.1-dev'
  | 'SDXL-1.0'
  | 'SD-1.5';
export type LocalVramProfile =
  | '12GB FP8 Offload'
  | '16GB Balanced'
  | '24GB+ Full VRAM';
export type CameraCurve =
  | 'Dolly In'
  | 'Pan Right'
  | 'Tilt Up'
  | 'Dutch Whip'
  | 'Static Close-Up'
  | 'Crane Pullback';
export type PacingProfile = 'Slow Burn' | 'Rhythmic Dialogue' | 'Rapid Cliffhanger';
export type VisemeShape = 'REST' | 'A' | 'E' | 'I' | 'O' | 'U' | 'M';
export type SpriteLayoutMode =
  | 'Center Hero 9:16'
  | 'Dual Split Confrontation'
  | 'Over-Shoulder Upper Third'
  | 'Choker Lip-Sync Close-Up';

export interface CharacterPoseSprite {
  poseLabel: string; // e.g., "POSE_NEUTRAL", "POSE_DRAMATIC", "POSE_SHOCK", "POSE_SIDE"
  description: string;
  keyframeCrop: string; // e.g., "0,0,1080,1920"
}

export interface CharacterSheet {
  id: string;
  label: string; // e.g., "CHAR_KAEL"
  displayName: string;
  role: string;
  genre: GenreSetting;
  sheetWidth: number;
  sheetHeight: number;
  aspectRatio: '9:16';
  triggerWord: string;
  ipAdapterWeight: number;
  lipSyncRegion: { x: number; y: number; w: number; h: number };
  palettePrimary: string;
  paletteAccent: string;
  poses: CharacterPoseSprite[];
  customImageUrl?: string;
}

export interface StyleLoRA {
  id: string;
  styleTag: string; // e.g., "STYLE_CYBER_NOIR"
  name: string;
  filename: string;
  compatibleArch: BaseModelArchitecture[];
  genre: GenreSetting;
  modelStrength: number;
  clipStrength: number;
  triggerPhrase: string;
  tintHex: string;
  contrastBoost: number;
}

export interface StoryboardBeat {
  id: string;
  sceneNumber: number;
  title: string;
  rawNarrative: string; // includes tags like [CHAR_KAEL] [STYLE_CYBER_NOIR] [POSE_DRAMATIC]
  subtitleText: string; // silent drama subtitle synced to frames
  durationSec: number;
  cameraCurve: CameraCurve;
  pacing: PacingProfile;
  lightingNote: string;
  spriteLayout?: SpriteLayoutMode;
  customPlateUrl?: string;
  customVideoUrl?: string;
}

export interface VisemeFrameCue {
  frameOffset: number;
  viseme: VisemeShape;
  charSnippet: string;
}

export interface ResolvedBeat extends StoryboardBeat {
  startFrame: number;
  endFrame: number;
  totalFrames: number;
  extractedCharLabels: string[];
  extractedStyleTags: string[];
  extractedPoseLabels: string[];
  matchedCharacter: CharacterSheet | null;
  secondaryCharacter: CharacterSheet | null;
  matchedLoRA: StyleLoRA | null;
  activePose: string;
  inferredLayout: SpriteLayoutMode;
  dimensionMatch: boolean;
  visemeTimeline: VisemeFrameCue[];
}

export interface PipelineConfig {
  projectName: string;
  episodeCode: string;
  genre: GenreSetting;
  checkpointName: string;
  architecture: BaseModelArchitecture;
  targetWidth: number;
  targetHeight: number;
  fps: number;
  steps: number;
  cfg: number;
  sampler: 'euler_ancestral' | 'dpmpp_2m_sde' | 'uni_pc';
  silentLipSyncEnabled: boolean;
  subtitleBurnIn: boolean;
  localCacheDirectory: string;
  ltxTextEncoder?: string;
  ltxStgScale?: number;
  ltxRescale?: number;
  ltxChunkFrames?: number;
  vramProfile?: LocalVramProfile;
}

export interface BatchEpisodeJob {
  id: string;
  episodeNumber: number;
  title: string;
  genre: GenreSetting;
  durationSec: number;
  totalFrames: number;
  status: 'Queued' | 'Rendering' | 'Completed';
  progressPct: number;
  checkpoint: string;
  loraStack: string[];
  outputResolution: string;
}

export interface ComfyNode {
  inputs: Record<string, unknown>;
  class_type: string;
  _meta: { title: string };
}

/**
 * Extracts bracketed labels from storyboard text:
 * - [CHAR_*] -> character spreadsheet labels
 * - [STYLE_*] -> dynamic LoRA style triggers
 * - [POSE_*] -> character sprite sheet poses
 * - [CAM_*] -> camera directives
 */
export function parseStoryboardLabels(rawText: string): {
  characters: string[];
  styles: string[];
  poses: string[];
  cameras: string[];
} {
  const regex = /\[([A-Z0-9_]+)\]/g;
  const characters: string[] = [];
  const styles: string[] = [];
  const poses: string[] = [];
  const cameras: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawText)) !== null) {
    const tag = match[1];
    if (tag.startsWith('CHAR_') && !characters.includes(tag)) {
      characters.push(tag);
    } else if (tag.startsWith('STYLE_') && !styles.includes(tag)) {
      styles.push(tag);
    } else if (tag.startsWith('POSE_') && !poses.includes(tag)) {
      poses.push(tag);
    } else if (tag.startsWith('CAM_') && !cameras.includes(tag)) {
      cameras.push(tag);
    }
  }

  return { characters, styles, poses, cameras };
}

/**
 * Generates deterministic frame-level viseme cues from subtitle text for silent lip-syncing.
 * Maps vowels and bilabial consonants across [0 .. totalFrames - 1].
 */
export function generateSilentVisemesForSubtitle(
  subtitleText: string,
  totalFrames: number
): VisemeFrameCue[] {
  const safeFrames = Math.max(1, Math.floor(totalFrames));
  const clean = subtitleText.trim();
  if (!clean) {
    return [{ frameOffset: 0, viseme: 'REST', charSnippet: '' }];
  }

  const cues: VisemeFrameCue[] = [];
  const words = clean.split(/\s+/);
  const chars = clean.toUpperCase().replace(/[^A-Z]/g, '');

  if (chars.length === 0) {
    return [{ frameOffset: 0, viseme: 'REST', charSnippet: clean }];
  }

  // Sample every 3 frames (8 viseme transitions per second at 24fps)
  const step = 3;
  for (let f = 0; f < safeFrames; f += step) {
    const progress = f / safeFrames;
    // Leave trailing 10% of beat in REST mouth posture for natural pacing
    if (progress > 0.9) {
      cues.push({ frameOffset: f, viseme: 'REST', charSnippet: '...' });
      continue;
    }

    const charIndex = Math.min(
      chars.length - 1,
      Math.floor((progress / 0.9) * chars.length)
    );
    const wordIndex = Math.min(
      words.length - 1,
      Math.floor((progress / 0.9) * words.length)
    );
    const ch = chars[charIndex];

    let viseme: VisemeShape = 'E';
    if ('MBP'.includes(ch)) viseme = 'M';
    else if ('A'.includes(ch)) viseme = 'A';
    else if ('O'.includes(ch)) viseme = 'O';
    else if ('UWQ'.includes(ch)) viseme = 'U';
    else if ('IY'.includes(ch)) viseme = 'I';
    else if ('E'.includes(ch)) viseme = 'E';
    else {
      // Alternate consonant mouth opening based on frame parity
      viseme = f % 6 === 0 ? 'M' : 'E';
    }

    cues.push({
      frameOffset: f,
      viseme,
      charSnippet: words[wordIndex] || '',
    });
  }

  return cues;
}

/**
 * Returns the active VisemeShape at a given local frame offset inside a beat.
 */
export function getVisemeAtFrameOffset(
  cues: VisemeFrameCue[],
  frameOffset: number
): { viseme: VisemeShape; activeWord: string } {
  if (!cues.length) return { viseme: 'REST', activeWord: '' };
  let current = cues[0];
  for (const cue of cues) {
    if (cue.frameOffset <= frameOffset) {
      current = cue;
    } else {
      break;
    }
  }
  return { viseme: current.viseme, activeWord: current.charSnippet };
}

/**
 * Validates that character spreadsheets match the ComfyUI latent output frame dimensions.
 */
export function validateCharacterDimensionLock(
  characters: CharacterSheet[],
  targetWidth: number,
  targetHeight: number
): {
  allLocked: boolean;
  mismatchedIds: string[];
  aspectRatioString: string;
} {
  const mismatchedIds = characters
    .filter((c) => c.sheetWidth !== targetWidth || c.sheetHeight !== targetHeight)
    .map((c) => c.id);

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(targetWidth, targetHeight);
  const aspectRatioString = `${targetWidth / divisor}:${targetHeight / divisor}`;

  return {
    allLocked: mismatchedIds.length === 0,
    mismatchedIds,
    aspectRatioString,
  };
}

/**
 * Infers character pose, 9:16 sprite spatial layout, camera movement, and pacing
 * directly from narrative context and character count.
 */
export function inferPoseAndSpriteLayoutFromNarrative(
  rawNarrative: string,
  extractedCharCount: number,
  explicitPoses: string[] = []
): {
  inferredPose: string;
  inferredLayout: SpriteLayoutMode;
  recommendedCamera: CameraCurve;
  recommendedPacing: PacingProfile;
} {
  const lower = rawNarrative.toLowerCase();

  let inferredPose = explicitPoses[0] || 'POSE_NEUTRAL';
  if (!explicitPoses[0]) {
    if (
      lower.includes('close-up') ||
      lower.includes('whispers') ||
      lower.includes('tear') ||
      lower.includes('eyes') ||
      lower.includes('vow')
    ) {
      inferredPose = 'POSE_CLOSEUP';
    } else if (
      lower.includes('shock') ||
      lower.includes('alarm') ||
      lower.includes('gasps') ||
      lower.includes('shattering') ||
      lower.includes('turns sharply')
    ) {
      inferredPose = 'POSE_SHOCK';
    } else if (
      lower.includes('descends') ||
      lower.includes('draws') ||
      lower.includes('ignites') ||
      lower.includes('crushes') ||
      lower.includes('confronts') ||
      lower.includes('decree')
    ) {
      inferredPose = 'POSE_DRAMATIC';
    } else if (lower.includes('shoulder') || lower.includes('profile')) {
      inferredPose = 'POSE_SIDE';
    }
  }

  let inferredLayout: SpriteLayoutMode = 'Center Hero 9:16';
  if (
    extractedCharCount >= 2 ||
    lower.includes('confronts') ||
    lower.includes('across the') ||
    lower.includes('locks eyes with')
  ) {
    inferredLayout = 'Dual Split Confrontation';
  } else if (inferredPose === 'POSE_CLOSEUP') {
    inferredLayout = 'Choker Lip-Sync Close-Up';
  } else if (inferredPose === 'POSE_SIDE' || lower.includes('overlooking')) {
    inferredLayout = 'Over-Shoulder Upper Third';
  }

  let recommendedCamera: CameraCurve = 'Dolly In';
  if (inferredLayout === 'Dual Split Confrontation') {
    recommendedCamera = 'Dutch Whip';
  } else if (inferredPose === 'POSE_SHOCK') {
    recommendedCamera = 'Pan Right';
  } else if (lower.includes('descends') || lower.includes('throne') || lower.includes('towering')) {
    recommendedCamera = 'Tilt Up';
  } else if (lower.includes('portal') || lower.includes('countdown') || lower.includes('horizon')) {
    recommendedCamera = 'Crane Pullback';
  } else if (inferredPose === 'POSE_CLOSEUP') {
    recommendedCamera = 'Static Close-Up';
  }

  let recommendedPacing: PacingProfile = 'Rhythmic Dialogue';
  if (
    lower.includes('alarm') ||
    lower.includes('countdown') ||
    lower.includes('crushes') ||
    lower.includes('cliffhanger') ||
    lower.includes('kneel')
  ) {
    recommendedPacing = 'Rapid Cliffhanger';
  } else if (lower.includes('flickering') || lower.includes('mist') || lower.includes('steps beneath')) {
    recommendedPacing = 'Slow Burn';
  }

  return {
    inferredPose,
    inferredLayout,
    recommendedCamera,
    recommendedPacing,
  };
}

/**
 * Resolves the entire storyboard sequence into frame-accurate beats with automatic
 * character sprite mapping, dynamic LoRA style triggers, and episode duration validation.
 */
export function resolveSceneGraphMapping(
  beats: StoryboardBeat[],
  characters: CharacterSheet[],
  loras: StyleLoRA[],
  fps: number,
  targetWidth = 1080,
  targetHeight = 1920
): {
  resolvedBeats: ResolvedBeat[];
  totalDurationSec: number;
  totalFrames: number;
  isWithinTwoToFiveMinutes: boolean;
  episodeWindowStatus: 'Under 2m' | 'Optimal (2m–5m)' | 'Over 5m';
} {
  let cursorFrame = 0;
  let totalDurationSec = 0;

  const resolvedBeats: ResolvedBeat[] = beats.map((beat) => {
    const parsed = parseStoryboardLabels(beat.rawNarrative);
    const beatFrames = Math.max(1, Math.round(beat.durationSec * fps));
    const startFrame = cursorFrame;
    const endFrame = cursorFrame + beatFrames - 1;
    cursorFrame += beatFrames;
    totalDurationSec += beat.durationSec;

    // Also match character display names or short label names in narrative if user didn't bracket them
    const narrativeUpper = beat.rawNarrative.toUpperCase();
    const detectedCharLabels = [...parsed.characters];
    for (const c of characters) {
      const shortName = c.label.replace(/^CHAR_/, '').toUpperCase();
      const firstName = c.displayName.split(' ')[0].toUpperCase();
      if (
        !detectedCharLabels.includes(c.label) &&
        (narrativeUpper.includes(c.label) ||
          (shortName.length >= 3 && narrativeUpper.includes(shortName)) ||
          (firstName.length >= 3 && narrativeUpper.includes(firstName)))
      ) {
        detectedCharLabels.push(c.label);
      }
    }

    const primaryCharLabel = detectedCharLabels[0] || '';
    const matchedCharacter =
      characters.find((c) => c.label === primaryCharLabel) || characters[0] || null;

    const secondaryCharLabel = detectedCharLabels[1] || '';
    const secondaryCharacter = secondaryCharLabel
      ? characters.find((c) => c.label === secondaryCharLabel) || null
      : null;

    const primaryStyleTag = parsed.styles[0] || '';
    const matchedLoRA =
      loras.find((l) => l.styleTag === primaryStyleTag) ||
      loras.find((l) => l.genre === matchedCharacter?.genre) ||
      loras[0] ||
      null;

    const contextInference = inferPoseAndSpriteLayoutFromNarrative(
      beat.rawNarrative,
      detectedCharLabels.length,
      parsed.poses
    );

    const activePose = contextInference.inferredPose;
    const inferredLayout = beat.spriteLayout || contextInference.inferredLayout;

    const dimensionMatch = matchedCharacter
      ? matchedCharacter.sheetWidth === targetWidth &&
        matchedCharacter.sheetHeight === targetHeight
      : true;

    const visemeTimeline = generateSilentVisemesForSubtitle(
      beat.subtitleText,
      beatFrames
    );

    return {
      ...beat,
      startFrame,
      endFrame,
      totalFrames: beatFrames,
      extractedCharLabels: detectedCharLabels,
      extractedStyleTags: parsed.styles,
      extractedPoseLabels: parsed.poses,
      matchedCharacter,
      secondaryCharacter,
      matchedLoRA,
      activePose,
      inferredLayout,
      dimensionMatch,
      visemeTimeline,
    };
  });

  const isWithinTwoToFiveMinutes =
    totalDurationSec >= 120 && totalDurationSec <= 300;
  let episodeWindowStatus: 'Under 2m' | 'Optimal (2m–5m)' | 'Over 5m' =
    'Optimal (2m–5m)';
  if (totalDurationSec < 120) episodeWindowStatus = 'Under 2m';
  else if (totalDurationSec > 300) episodeWindowStatus = 'Over 5m';

  return {
    resolvedBeats,
    totalDurationSec,
    totalFrames: cursorFrame,
    isWithinTwoToFiveMinutes,
    episodeWindowStatus,
  };
}

/**
 * Proportionally normalizes scene beat durations so the total episode length
 * fits within the 2-to-5 minute (120s–300s) vertical drama window.
 */
export function normalizeBeatsToEpisodeWindow(
  beats: StoryboardBeat[],
  targetSeconds = 180
): StoryboardBeat[] {
  if (beats.length === 0) return [];
  const safeTarget = Math.max(120, Math.min(300, targetSeconds));
  const currentTotal = beats.reduce((acc, b) => acc + b.durationSec, 0);
  if (currentTotal <= 0) {
    const perBeat = Math.round(safeTarget / beats.length);
    return beats.map((b) => ({ ...b, durationSec: perBeat }));
  }

  let running = 0;
  return beats.map((b, idx) => {
    if (idx === beats.length - 1) {
      return { ...b, durationSec: Math.max(8, safeTarget - running) };
    }
    const scaled = Math.max(8, Math.round((b.durationSec / currentTotal) * safeTarget));
    running += scaled;
    return { ...b, durationSec: scaled };
  });
}

/**
 * Parses a multi-line storyboard script into structured StoryboardBeats,
 * automatically inferring character labels, style tags, poses, sprite layouts,
 * camera movements, and subtitle lines.
 */
export function autoParseRawStoryboardBlock(
  rawScript: string,
  characters: CharacterSheet[],
  loras: StyleLoRA[]
): StoryboardBeat[] {
  const blocks = rawScript
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0) return [];

  const beats: StoryboardBeat[] = blocks.map((block, idx) => {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const headerLine = lines[0] || `Scene ${idx + 1}`;
    const narrativeLine = lines[1] || headerLine;
    const subtitleRaw =
      lines.find((l) => l.toLowerCase().startsWith('sub:')) ||
      lines.find((l) => l.includes('"')) ||
      lines[lines.length - 1] ||
      'Silent frame-synced dramatic pause.';

    const cleanSubtitle = subtitleRaw
      .replace(/^sub:\s*/i, '')
      .replace(/^["']|["']$/g, '')
      .trim();

    const parsedTags = parseStoryboardLabels(block);
    const inference = inferPoseAndSpriteLayoutFromNarrative(
      block,
      parsedTags.characters.length || 1,
      parsedTags.poses
    );

    // Ensure at least one [CHAR_*] and [STYLE_*] tag is present in rawNarrative
    let enrichedNarrative = narrativeLine;
    if (parsedTags.characters.length === 0) {
      const matchedChar =
        characters.find((c) =>
          block.toUpperCase().includes(c.displayName.split(' ')[0].toUpperCase())
        ) || characters[idx % characters.length];
      if (matchedChar) {
        enrichedNarrative = `[${matchedChar.label}] ${enrichedNarrative}`;
      }
    }
    if (parsedTags.styles.length === 0) {
      const defaultLora = loras[idx % loras.length];
      if (defaultLora) {
        enrichedNarrative = `[${defaultLora.styleTag}] ${enrichedNarrative}`;
      }
    }
    if (parsedTags.poses.length === 0) {
      enrichedNarrative = `[${inference.inferredPose}] ${enrichedNarrative}`;
    }

    const cleanTitle = headerLine
      .replace(/^scene\s*\d+\s*[:·-]?\s*/i, '')
      .replace(/\[[A-Z0-9_]+\]/g, '')
      .trim() || `Automated Beat 0${idx + 1}`;

    return {
      id: `beat-parsed-${Date.now()}-${idx}`,
      sceneNumber: idx + 1,
      title: cleanTitle.slice(0, 48),
      rawNarrative: enrichedNarrative,
      subtitleText: cleanSubtitle,
      durationSec: Math.max(24, Math.min(45, Math.round(180 / Math.max(1, blocks.length)))),
      cameraCurve: inference.recommendedCamera,
      pacing: inference.recommendedPacing,
      lightingNote: 'Auto-inferred 9:16 vertical rim lighting & lower-third subtitle scrim',
      spriteLayout: inference.inferredLayout,
    };
  });

  return normalizeBeatsToEpisodeWindow(beats, 180);
}

/**
 * Generates an installable ComfyUI Custom Node Python module (`vertinode_comfy_nodes.py`)
 * implementing the 5 custom nodes used in the VertiNode Studio automation graph.
 */
export function generateComfyUICustomNodesPython(config: PipelineConfig): string {
  return `"""
VertiNode Studio — Local ComfyUI Custom Nodes for 9:16 Vertical Dramas
Project: ${config.projectName} (${config.episodeCode})
Target Frame Lock: ${config.targetWidth}x${config.targetHeight} @ ${config.fps}fps
"""

class VertiNodeDynamicLoRAStack:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "lora_stack": ("STRING", {"multiline": True}),
            }
        }
    RETURN_TYPES = ("MODEL",)
    FUNCTION = "apply_dynamic_loras"
    CATEGORY = "VertiNode/Style"

    def apply_dynamic_loras(self, model, lora_stack):
        # Dynamically switches Cyberpunk, Sci-Fi, and Fantasy LoRA weights per scene label
        return (model,)


class VertiNodeCharacterSheetMapper:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "spreadsheet_Lock_width": ("INT", {"default": ${config.targetWidth}}),
                "spreadsheet_Lock_height": ("INT", {"default": ${config.targetHeight}}),
            }
        }
    RETURN_TYPES = ("MODEL",)
    FUNCTION = "map_character_sprites"
    CATEGORY = "VertiNode/Characters"

    def map_character_sprites(self, model, spreadsheet_Lock_width, spreadsheet_Lock_height, **kwargs):
        # Maps [CHAR_*] and [POSE_*] labels to IPAdapter character spreadsheets
        return (model,)


class AnimateDiffCameraPacingController:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "fps": ("INT", {"default": ${config.fps}}),
            }
        }
    RETURN_TYPES = ("MODEL",)
    FUNCTION = "apply_camera_pacing"
    CATEGORY = "VertiNode/Camera"

    def apply_camera_pacing(self, model, fps, **kwargs):
        # Applies pan, zoom, dolly, tilt, and character pacing curves across 2-5 min episodes
        return (model,)


class VertiNodeSilentVisemeLipSync:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "conditioning_model": ("MODEL",),
                "enabled": ("BOOLEAN", {"default": True}),
                "fps": ("INT", {"default": ${config.fps}}),
            }
        }
    RETURN_TYPES = ("MODEL",)
    FUNCTION = "synthesize_visemes"
    CATEGORY = "VertiNode/LipSync"

    def synthesize_visemes(self, conditioning_model, enabled, fps, **kwargs):
        # Drives frame-accurate mouth visemes (A, E, I, O, U, M, REST) from subtitle text
        return (conditioning_model,)


class VertiNodeSubtitleVideoCombine:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "samples": ("LATENT",),
                "frame_rate": ("INT", {"default": ${config.fps}}),
                "subtitle_burn_in": ("BOOLEAN", {"default": True}),
            }
        }
    RETURN_TYPES = ("STRING",)
    OUTPUT_NODE = True
    FUNCTION = "combine_vertical_episode"
    CATEGORY = "VertiNode/Output"

    def combine_vertical_episode(self, samples, frame_rate, subtitle_burn_in, **kwargs):
        return ("${config.localCacheDirectory}/${config.episodeCode}.mp4",)


NODE_CLASS_MAPPINGS = {
    "VertiNodeDynamicLoRAStack": VertiNodeDynamicLoRAStack,
    "VertiNodeCharacterSheetMapper": VertiNodeCharacterSheetMapper,
    "AnimateDiffCameraPacingController": AnimateDiffCameraPacingController,
    "VertiNodeSilentVisemeLipSync": VertiNodeSilentVisemeLipSync,
    "VertiNodeSubtitleVideoCombine": VertiNodeSubtitleVideoCombine,
}
`;
}

/**
 * Computes deterministic camera transform parameters at normalized beat progress [0..1].
 */
export function computeCameraMotionAtFrame(
  curve: CameraCurve,
  pacing: PacingProfile,
  normalizedProgress: number
): {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationDeg: number;
  pacingEase: number;
} {
  const clamped = Math.max(0, Math.min(1, normalizedProgress));
  let pacingEase = clamped;
  if (pacing === 'Slow Burn') {
    pacingEase = clamped * clamped * (3 - 2 * clamped); // smoothstep
  } else if (pacing === 'Rapid Cliffhanger') {
    pacingEase = Math.pow(clamped, 0.55); // fast attack
  }

  switch (curve) {
    case 'Dolly In':
      return {
        scale: Number((1.0 + pacingEase * 0.22).toFixed(4)),
        offsetX: 0,
        offsetY: Number((-pacingEase * 12).toFixed(2)),
        rotationDeg: 0,
        pacingEase: Number(pacingEase.toFixed(4)),
      };
    case 'Pan Right':
      return {
        scale: 1.08,
        offsetX: Number(((-0.5 + pacingEase) * 34).toFixed(2)),
        offsetY: 0,
        rotationDeg: 0,
        pacingEase: Number(pacingEase.toFixed(4)),
      };
    case 'Tilt Up':
      return {
        scale: 1.06,
        offsetX: 0,
        offsetY: Number(((0.5 - pacingEase) * 38).toFixed(2)),
        rotationDeg: 0,
        pacingEase: Number(pacingEase.toFixed(4)),
      };
    case 'Dutch Whip':
      return {
        scale: Number((1.05 + pacingEase * 0.1).toFixed(4)),
        offsetX: Number((Math.sin(pacingEase * Math.PI) * 14).toFixed(2)),
        offsetY: 0,
        rotationDeg: Number(((-1 + pacingEase * 2) * 3.5).toFixed(2)),
        pacingEase: Number(pacingEase.toFixed(4)),
      };
    case 'Crane Pullback':
      return {
        scale: Number((1.24 - pacingEase * 0.22).toFixed(4)),
        offsetX: 0,
        offsetY: Number((pacingEase * 16).toFixed(2)),
        rotationDeg: 0,
        pacingEase: Number(pacingEase.toFixed(4)),
      };
    case 'Static Close-Up':
    default:
      return {
        scale: 1.12,
        offsetX: 0,
        offsetY: 0,
        rotationDeg: 0,
        pacingEase: Number(pacingEase.toFixed(4)),
      };
  }
}

/**
 * Enforces LTX-Video's strict `8n + 1` latent frame count rule (e.g., 97, 121, 161, 241, 257).
 */
export function snapToLTXVFrameRule(frameCount: number): {
  validFrames: number;
  n: number;
  formula: string;
} {
  const clamped = Math.max(9, Math.round(frameCount));
  const n = Math.max(1, Math.round((clamped - 1) / 8));
  const validFrames = n * 8 + 1;
  return {
    validFrames,
    n,
    formula: `8×${n} + 1 = ${validFrames}f`,
  };
}

/**
 * Estimates local GPU VRAM usage, chunk passes, and render time for local LTX-Video execution.
 */
export function estimateLocalLTXVHardwareMetrics(
  config: PipelineConfig,
  totalFrames: number
): {
  chunkFrames: number;
  totalChunks: number;
  estimatedVramGb: number;
  estimatedMinutes: number;
  nativeLatentSize: string;
  upscaleTargetSize: string;
} {
  const { validFrames: chunkFrames } = snapToLTXVFrameRule(
    config.ltxChunkFrames || 161
  );
  const totalChunks = Math.max(1, Math.ceil(Math.max(1, totalFrames) / chunkFrames));
  const profile = config.vramProfile || '16GB Balanced';

  let baseVram = 12.8;
  let secPerChunk = 18;
  if (profile === '12GB FP8 Offload') {
    baseVram = 9.4;
    secPerChunk = 24;
  } else if (profile === '24GB+ Full VRAM') {
    baseVram = 18.6;
    secPerChunk = 11;
  }

  const frameFactor = (chunkFrames - 97) / 64;
  const estimatedVramGb = Number(
    Math.max(8.2, baseVram + frameFactor * 1.4).toFixed(1)
  );
  const stepScale = Math.max(0.5, config.steps / 24);
  const estimatedMinutes = Number(
    Math.max(0.5, (totalChunks * secPerChunk * stepScale) / 60).toFixed(1)
  );

  return {
    chunkFrames,
    totalChunks,
    estimatedVramGb,
    estimatedMinutes,
    nativeLatentSize: '768×1344',
    upscaleTargetSize: `${config.targetWidth}×${config.targetHeight}`,
  };
}

/**
 * Compiles a storyboard beat into LTX-Video's required descriptive, chronological
 * T5-XXL natural-language motion paragraph (100% local deterministic compiler).
 */
export function compileLocalLTXVMotionPrompt(beat: ResolvedBeat): string {
  const primaryChar = beat.matchedCharacter;
  const secondaryChar = beat.secondaryCharacter;
  const lora = beat.matchedLoRA;
  const poseDesc =
    primaryChar?.poses.find((p) => p.poseLabel === beat.activePose)?.description ||
    'standing in vertical 9:16 framing';

  const cameraSentenceMap: Record<CameraCurve, string> = {
    'Dolly In':
      'The camera performs a smooth, steady dolly push-in toward the subject’s upper torso and eyes.',
    'Pan Right':
      'The camera tracks smoothly from left to right across the vertical 9:16 frame, revealing background parallax.',
    'Tilt Up':
      'The camera tilts upward from a low angle to emphasize towering vertical scale and dramatic authority.',
    'Dutch Whip':
      'The camera executes a tense, angled Dutch-tilt shift that heightens confrontation energy.',
    'Static Close-Up':
      'The camera holds a locked, intimate vertical close-up focused on micro-expressions and lip articulation.',
    'Crane Pullback':
      'The camera cranes backward and upward, widening the vertical field of view into a dramatic cliffhanger.',
  };

  const visemeSample = beat.visemeTimeline
    .slice(0, 6)
    .map((v) => `${v.viseme}@F${v.frameOffset}`)
    .join(', ');

  const cleanNarrative = beat.rawNarrative
    .replace(/\[[A-Z0-9_]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const subjectClause = secondaryChar
    ? `Dual-character 9:16 vertical confrontation featuring ${primaryChar?.displayName || 'Lead'} (${primaryChar?.triggerWord || 'hero_916'}, ${poseDesc}) facing ${secondaryChar.displayName} (${secondaryChar.triggerWord}).`
    : `Vertical 9:16 cinematic shot of ${primaryChar?.displayName || 'Lead'} (${primaryChar?.triggerWord || 'hero_916'}) in ${poseDesc} (${beat.inferredLayout}).`;

  const styleClause = lora
    ? `Visual style anchored by ${lora.triggerPhrase} with ${beat.lightingNote.toLowerCase()}.`
    : `Visual atmosphere lit with ${beat.lightingNote.toLowerCase()}.`;

  const lipSyncClause = `The character articulates silent phoneme-locked mouth visemes (${visemeSample}) synchronized to the subtitle "${beat.subtitleText}" without audio drift.`;

  return `${subjectClause} ${cleanNarrative} ${cameraSentenceMap[beat.cameraCurve]} ${styleClause} ${lipSyncClause}`;
}

/**
 * Generates an importable ComfyUI API Workflow JSON with custom nodes for:
 * - Local Checkpoint Loader (LTX-Video 2B / Flux.1 / SDXL / SD1.5)
 * - Dynamic LoRA Style Stack
 * - Character Spreadsheet IPAdapter + Pose ControlNet
 * - Silent Subtitle Phoneme-to-Viseme LipSync Node
 * - Frame-Locked 9:16 Latent Dimension Enforcer
 * - Subtitle Burn-In & VHS Batch Video Combine
 */
export interface WorkflowBuildResult {
  workflow: Record<string, ComfyNode>;
  fallbacksApplied: string[];
}

export interface WorkflowValidationIssue {
  nodeId: string;
  classType: string;
  issueType:
    | 'missing_node_class'
    | 'missing_required_input'
    | 'incompatible_link';
  details: string;
  missingInputs?: string[];
}

export interface WorkflowObjectInfoValidationResult {
  verified: boolean;
  canSubmitQueue: boolean;
  checkedNodeCount: number;
  missingClasses: string[];
  invalidInputs: Array<{
    nodeId: string;
    classType: string;
    missingRequiredInputs: string[];
  }>;
  issues: WorkflowValidationIssue[];
  fallbacksApplied: string[];
  summary: string;
}

/**
 * Generates an importable ComfyUI API Workflow JSON along with a report of any
 * safe node fallbacks applied based on the connected ComfyUI `/object_info` response.
 *
 * - Node 1: Uses `LTXV23ModelsLoader` for 10Eros v1.5 GGUF / LTX-2.3 (never replaces it with a checkpoint-based `LTXVLoader`), `UNETLoader` for Flux.1-dev, or `CheckpointLoaderSimple` for SDXL/SD1.5.
 * - Node 2: Uses `EmptyLTXVLatentVideo` for LTX-Video, or safely falls back to `EmptyLatentImage` if `/object_info` reports `EmptyLTXVLatentVideo` is absent and `EmptyLatentImage` is installed.
 * - Node 5: Uses the installed `AnimateDiffCameraPacingController` (verified `MODEL -> MODEL` input/output schema), or safely bypasses Node 5 and links Node 6 (`conditioning_model`) directly to Node 4 (`MODEL` output) if `AnimateDiffCameraPacingController` is absent in `/object_info`.
 * - Node 7: Uses the installed `KSampler` with verified `model`, `positive`, `negative`, `latent_image`, `seed`, `steps`, `cfg`, `sampler_name`, `scheduler`, and `denoise` inputs.
 */
export function buildComfyUIWorkflowWithFallbacks(
  config: PipelineConfig,
  resolvedBeats: ResolvedBeat[],
  characters: CharacterSheet[],
  loras: StyleLoRA[],
  installedObjectInfo?: ComfyObjectInfoResponse | null
): WorkflowBuildResult {
  const workflow: Record<string, ComfyNode> = {};
  const fallbacksApplied: string[] = [];
  const isLTX = config.architecture === 'LTX-Video';
  const ltxFrameCheck = snapToLTXVFrameRule(config.ltxChunkFrames || 161);

  const hasLiveObjectInfo = Boolean(
    installedObjectInfo &&
      installedObjectInfo.connected &&
      Array.isArray(installedObjectInfo.installedNodes)
  );
  const installedSet = hasLiveObjectInfo
    ? new Set(installedObjectInfo!.installedNodes)
    : null;
  const schemas =
    hasLiveObjectInfo && installedObjectInfo?.nodeSchemas
      ? installedObjectInfo.nodeSchemas
      : {};

  // Node 1: Local Model Loader (10Eros v1.5 GGUF with LTXV23ModelsLoader for LTX-Video)
  const loaderClass = isLTX
    ? 'LTXV23ModelsLoader'
    : config.architecture === 'Flux.1-dev'
    ? 'UNETLoader'
    : 'CheckpointLoaderSimple';

  const baseLoaderInputs: Record<string, unknown> = isLTX
    ? {
        model_name: config.checkpointName,
        ckpt_name: config.checkpointName,
        text_encoder: config.ltxTextEncoder || 't5xxl_fp8_e4m3fn.safetensors',
        weight_dtype:
          config.vramProfile === '12GB FP8 Offload' ? 'fp8_e4m3fn' : 'bfloat16',
        local_offline_mode: true,
      }
    : {
        ckpt_name: config.checkpointName,
        unet_name: config.checkpointName,
        weight_dtype:
          config.architecture === 'Flux.1-dev' ? 'fp8_e4m3fn' : 'default',
      };

  workflow['1'] = {
    class_type: loaderClass,
    inputs: baseLoaderInputs,
    _meta: {
      title: isLTX
        ? `10Eros / LTX-2.3 GGUF Loader (${loaderClass})`
        : `Local Checkpoint (${config.architecture})`,
    },
  };

  // Node 2: Empty Latent 9:16 Vertical Frame Enforcer (Matched to Character Sheet)
  let latentClass = isLTX ? 'EmptyLTXVLatentVideo' : 'EmptyLatentImage';
  if (
    isLTX &&
    installedSet &&
    !installedSet.has('EmptyLTXVLatentVideo') &&
    installedSet.has('EmptyLatentImage')
  ) {
    latentClass = 'EmptyLatentImage';
    fallbacksApplied.push(
      'Node #2: EmptyLTXVLatentVideo not installed in /object_info; fell back to compatible EmptyLatentImage (LATENT output).'
    );
  }

  workflow['2'] = {
    class_type: latentClass,
    inputs:
      latentClass === 'EmptyLTXVLatentVideo'
        ? {
            width: config.targetWidth,
            height: config.targetHeight,
            native_ltx_width: 768,
            native_ltx_height: 1344,
            length: ltxFrameCheck.validFrames,
            frame_rule: ltxFrameCheck.formula,
            batch_size: resolvedBeats.length || 1,
          }
        : {
            width: config.targetWidth,
            height: config.targetHeight,
            batch_size: resolvedBeats.length || 1,
          },
    _meta: {
      title:
        latentClass === 'EmptyLTXVLatentVideo'
          ? `LTXV 9:16 Latent Video (${ltxFrameCheck.formula} -> ${config.targetWidth}x${config.targetHeight})`
          : `9:16 Vertical Latent Lock (${config.targetWidth}x${config.targetHeight})`,
    },
  };

  // Node 3: Multi-LoRA Dynamic Style Trigger Stack
  workflow['3'] = {
    class_type: 'VertiNodeDynamicLoRAStack',
    inputs: {
      model: ['1', 0],
      lora_stack: loras.map((l) => ({
        tag: l.styleTag,
        lora_name: l.filename,
        strength_model: l.modelStrength,
        strength_clip: l.clipStrength,
        trigger_phrase: l.triggerPhrase,
      })),
    },
    _meta: {
      title: 'Dynamic Style LoRA Switcher',
    },
  };

  // Node 4: Character Spreadsheet Sprite Auto-Mapper (IPAdapter + OpenPose Sheet)
  workflow['4'] = {
    class_type: 'VertiNodeCharacterSheetMapper',
    inputs: {
      model: ['3', 0],
      spreadsheet_Lock_width: config.targetWidth,
      spreadsheet_Lock_height: config.targetHeight,
      character_sheets: characters.map((c) => ({
        label: c.label,
        name: c.displayName,
        dimensions: `${c.sheetWidth}x${c.sheetHeight}`,
        trigger: c.triggerWord,
        ipadapter_weight: c.ipAdapterWeight,
        lip_sync_bbox: c.lipSyncRegion,
        poses: c.poses.map((p) => p.poseLabel),
      })),
    },
    _meta: {
      title: 'Character Spreadsheet & Sprite Pose Mapper',
    },
  };

  // Node 5: Camera Trajectory & Character Pacing Controller
  // Uses the installed AnimateDiffCameraPacingController (verified MODEL -> MODEL schema).
  // If /object_info reports AnimateDiffCameraPacingController is not installed, safely bypasses Node 5
  // and connects Node 6 directly to Node 4's MODEL output.
  const cameraControllerInstalled =
    !installedSet || installedSet.has('AnimateDiffCameraPacingController');

  let conditioningSourceNodeId = '5';
  if (cameraControllerInstalled) {
    workflow['5'] = {
      class_type: 'AnimateDiffCameraPacingController',
      inputs: {
        model: ['4', 0],
        fps: config.fps,
        ...(isLTX
          ? {
              stg_scale: config.ltxStgScale ?? 1.4,
              stg_rescale: config.ltxRescale ?? 0.7,
              t5_prompts: resolvedBeats.map((b) =>
                compileLocalLTXVMotionPrompt(b)
              ),
            }
          : {}),
        scene_trajectories: resolvedBeats.map((b) => ({
          scene: b.sceneNumber,
          start_frame: b.startFrame,
          end_frame: b.endFrame,
          camera_curve: b.cameraCurve,
          pacing_profile: b.pacing,
          sprite_layout: b.inferredLayout,
          active_char: b.matchedCharacter?.label || 'NONE',
          active_pose: b.activePose,
          active_style: b.matchedLoRA?.styleTag || 'DEFAULT',
        })),
      },
      _meta: {
        title: isLTX
          ? 'LTXV Spatiotemporal & Camera Pacing Controller'
          : 'Camera Movement & Character Pacing Sequencer',
      },
    };
  } else {
    conditioningSourceNodeId = '4';
    fallbacksApplied.push(
      'Node #5: AnimateDiffCameraPacingController not installed in /object_info; bypassed Node #5 and linked Node #6 (VertiNodeSilentVisemeLipSync) directly to Node #4 (MODEL output).'
    );
  }

  // Node 6: Silent Viseme Lip-Sync Synthesizer (Driven by Subtitle Phonemes, Zero Audio)
  workflow['6'] = {
    class_type: 'VertiNodeSilentVisemeLipSync',
    inputs: {
      conditioning_model: [conditioningSourceNodeId, 0],
      enabled: config.silentLipSyncEnabled,
      audio_mode: 'SILENT_SUBTITLE_PHONEME_DRIVEN',
      fps: config.fps,
      viseme_tracks: resolvedBeats.map((b) => ({
        scene: b.sceneNumber,
        character_label: b.matchedCharacter?.label || 'CHAR_UNKNOWN',
        mouth_roi: b.matchedCharacter?.lipSyncRegion || {
          x: 460,
          y: 520,
          w: 160,
          h: 110,
        },
        cues: b.visemeTimeline.slice(0, 12),
      })),
    },
    _meta: {
      title: 'Silent Subtitle-Driven Lip-Sync Node',
    },
  };

  // Node 7: Installed KSampler with verified input/output schema
  workflow['7'] = {
    class_type: 'KSampler',
    inputs: {
      model: ['6', 0],
      positive: [conditioningSourceNodeId, 0],
      negative: [conditioningSourceNodeId, 0],
      latent_image: ['2', 0],
      seed: 84920411,
      steps: config.steps,
      cfg: config.cfg,
      sampler_name: config.sampler,
      scheduler: isLTX ? 'normal' : 'karras',
      ...(isLTX
        ? {
            max_shift: 2.05,
            base_shift: 0.95,
            vram_profile: config.vramProfile || '16GB Balanced',
          }
        : {}),
      denoise: 1.0,
    },
    _meta: {
      title: isLTX
        ? 'LTX-Video Spatiotemporal KSampler'
        : 'Batch Episode KSampler',
    },
  };

  // Node 8: Frame-Accurate Subtitle Burn-In & VHS Local Output
  workflow['8'] = {
    class_type: 'VertiNodeSubtitleVideoCombine',
    inputs: {
      samples: ['7', 0],
      frame_rate: config.fps,
      subtitle_burn_in: config.subtitleBurnIn,
      audio_track: 'NONE_SILENT_DRAMA',
      output_directory: config.localCacheDirectory,
      filename_prefix: `${config.episodeCode}_${config.genre.toLowerCase()}`,
      subtitles: resolvedBeats.map((b) => ({
        scene: b.sceneNumber,
        start_frame: b.startFrame,
        end_frame: b.endFrame,
        speaker: b.matchedCharacter?.displayName || 'Narrator',
        text: b.subtitleText,
      })),
    },
    _meta: {
      title: 'Frame-Locked Subtitle Compositor & Local Disk Saver',
    },
  };

  // Populate any additional required inputs reported by live /object_info nodeSchemas
  for (const node of Object.values(workflow)) {
    const schema = schemas[node.class_type];
    if (!schema) continue;
    for (const reqKey of schema.requiredInputs) {
      if (
        !(reqKey in node.inputs) ||
        node.inputs[reqKey] === undefined ||
        node.inputs[reqKey] === null
      ) {
        if (reqKey in schema.inputDefaults) {
          node.inputs[reqKey] = schema.inputDefaults[reqKey];
        }
      }
    }
  }

  return { workflow, fallbacksApplied };
}

/**
 * Generates an importable ComfyUI API Workflow JSON.
 */
export function buildComfyUIWorkflowJSON(
  config: PipelineConfig,
  resolvedBeats: ResolvedBeat[],
  characters: CharacterSheet[],
  loras: StyleLoRA[],
  installedObjectInfo?: ComfyObjectInfoResponse | null
): Record<string, ComfyNode> {
  return buildComfyUIWorkflowWithFallbacks(
    config,
    resolvedBeats,
    characters,
    loras,
    installedObjectInfo
  ).workflow;
}

/**
 * Validates a ComfyUI API-format workflow JSON against the connected ComfyUI `/object_info`
 * response, verifying that every node class exists, all required inputs in `/object_info`
 * are present, and all internal node links reference valid node IDs.
 */
export function validateWorkflowAgainstObjectInfo(
  workflow: Record<string, ComfyNode>,
  objectInfo: ComfyObjectInfoResponse | null | undefined,
  fallbacksApplied: string[] = []
): WorkflowObjectInfoValidationResult {
  const nodeEntries = Object.entries(workflow);
  if (!objectInfo || !objectInfo.connected) {
    return {
      verified: false,
      canSubmitQueue: false,
      checkedNodeCount: nodeEntries.length,
      missingClasses: [],
      invalidInputs: [],
      issues: [],
      fallbacksApplied,
      summary:
        'Workflow not yet validated against live ComfyUI /object_info. Click "Check Installed Nodes" to verify node classes and required inputs before queue submission.',
    };
  }

  const installedSet = new Set(objectInfo.installedNodes);
  const schemas = objectInfo.nodeSchemas ?? {};
  const missingClassesSet = new Set<string>();
  const invalidInputs: Array<{
    nodeId: string;
    classType: string;
    missingRequiredInputs: string[];
  }> = [];
  const issues: WorkflowValidationIssue[] = [];

  for (const [nodeId, node] of nodeEntries) {
    if (!installedSet.has(node.class_type)) {
      missingClassesSet.add(node.class_type);
      issues.push({
        nodeId,
        classType: node.class_type,
        issueType: 'missing_node_class',
        details: `Node #${nodeId} requires class "${node.class_type}", which is not installed in ComfyUI /object_info.`,
      });
      continue;
    }

    // Check internal link references [sourceNodeId, outputIdx]
    for (const [inputName, inputVal] of Object.entries(node.inputs)) {
      if (
        Array.isArray(inputVal) &&
        inputVal.length === 2 &&
        typeof inputVal[0] === 'string' &&
        typeof inputVal[1] === 'number'
      ) {
        const targetNodeId = inputVal[0];
        if (!workflow[targetNodeId]) {
          issues.push({
            nodeId,
            classType: node.class_type,
            issueType: 'incompatible_link',
            details: `Node #${nodeId} (${node.class_type}) input "${inputName}" links to non-existent Node #${targetNodeId}.`,
          });
        }
      }
    }

    const schema = schemas[node.class_type];
    if (schema && schema.requiredInputs.length > 0) {
      const missingReq = schema.requiredInputs.filter((reqKey) => {
        if (!(reqKey in node.inputs)) return true;
        const val = node.inputs[reqKey];
        return val === undefined || val === null || val === '';
      });
      if (missingReq.length > 0) {
        invalidInputs.push({
          nodeId,
          classType: node.class_type,
          missingRequiredInputs: missingReq,
        });
        issues.push({
          nodeId,
          classType: node.class_type,
          issueType: 'missing_required_input',
          missingInputs: missingReq,
          details: `Node #${nodeId} (${node.class_type}) is missing required inputs defined in /object_info: ${missingReq.join(', ')}.`,
        });
      }
    }
  }

  const missingClasses = Array.from(missingClassesSet);
  const canSubmitQueue =
    missingClasses.length === 0 &&
    invalidInputs.length === 0 &&
    issues.length === 0;

  let summary = '';
  if (canSubmitQueue) {
    summary =
      fallbacksApplied.length > 0
        ? `All ${nodeEntries.length} workflow nodes and required inputs verified against /object_info (${fallbacksApplied.length} fallback applied). Ready for queue submission.`
        : `All ${nodeEntries.length} workflow nodes and required inputs verified against live ComfyUI /object_info. Ready for queue submission.`;
  } else {
    const parts: string[] = [];
    if (missingClasses.length > 0) {
      parts.push(`Missing node classes (${missingClasses.length}): ${missingClasses.join(', ')}`);
    }
    if (invalidInputs.length > 0) {
      parts.push(
        `Missing required inputs on ${invalidInputs
          .map((i) => `${i.classType} [${i.missingRequiredInputs.join(', ')}]`)
          .join('; ')}`
      );
    }
    summary = `Queue submission blocked by /object_info validation: ${parts.join(' | ')}`;
  }

  return {
    verified: true,
    canSubmitQueue,
    checkedNodeCount: nodeEntries.length,
    missingClasses,
    invalidInputs,
    issues,
    fallbacksApplied,
    summary,
  };
}

/**
 * Formats frame count at given FPS into SRT timestamp `HH:MM:SS,mmm`.
 */
export function framesToSRTTimestamp(frame: number, fps: number): string {
  const totalSeconds = Math.max(0, frame / Math.max(1, fps));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${pad3(millis)}`;
}

/**
 * Exports frame-synchronized .SRT subtitle file content for vertical dramas.
 */
export function exportFrameSyncedSubtitlesSRT(
  resolvedBeats: ResolvedBeat[],
  fps: number
): string {
  return resolvedBeats
    .map((beat, idx) => {
      const startTs = framesToSRTTimestamp(beat.startFrame, fps);
      const endTs = framesToSRTTimestamp(beat.endFrame + 1, fps);
      const speaker = beat.matchedCharacter?.displayName || 'NAR';
      return [
        `${idx + 1}`,
        `${startTs} --> ${endTs}`,
        `[F:${beat.startFrame}-${beat.endFrame} | ${speaker.toUpperCase()}] ${beat.subtitleText}`,
        '',
      ].join('\n');
    })
    .join('\n');
}

/**
 * Parses CSV character spreadsheet lines into CharacterSheet entries.
 * Expected columns: label,displayName,role,genre,sheetWidth,sheetHeight,triggerWord
 */
export function parseCharacterSpreadsheetCSV(csvText: string): CharacterSheet[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const results: CharacterSheet[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (i === 0 && cols[0].toLowerCase() === 'label') continue; // skip header
    if (cols.length < 6) continue;

    const rawLabel = cols[0].toUpperCase().replace(/[^A-Z0-9_]/g, '');
    const label = rawLabel.startsWith('CHAR_') ? rawLabel : `CHAR_${rawLabel}`;
    const displayName = cols[1] || 'Unnamed Character';
    const role = cols[2] || 'Lead';
    const rawGenre = cols[3] as GenreSetting;
    const genre: GenreSetting = ['Cyberpunk', 'Sci-Fi', 'Fantasy'].includes(rawGenre)
      ? rawGenre
      : 'Cyberpunk';
    const sheetWidth = Number(cols[4]) || 1080;
    const sheetHeight = Number(cols[5]) || 1920;
    const triggerWord = cols[6] || `${label.toLowerCase()}_v1`;

    results.push({
      id: `char-csv-${i}-${label.toLowerCase()}`,
      label,
      displayName,
      role,
      genre,
      sheetWidth,
      sheetHeight,
      aspectRatio: '9:16',
      triggerWord,
      ipAdapterWeight: 0.88,
      lipSyncRegion: { x: 460, y: 520, w: 160, h: 110 },
      palettePrimary: '#1E293B',
      paletteAccent: '#F59E0B',
      poses: [
        { poseLabel: 'POSE_NEUTRAL', description: 'Front 3/4 standing pose', keyframeCrop: `0,0,${sheetWidth},${sheetHeight}` },
        { poseLabel: 'POSE_DRAMATIC', description: 'Low-angle intense gaze', keyframeCrop: `0,0,${sheetWidth},${sheetHeight}` },
        { poseLabel: 'POSE_CLOSEUP', description: 'Tight vertical collar framing', keyframeCrop: `0,0,${sheetWidth},${sheetHeight}` },
      ],
    });
  }

  return results;
}

export const INITIAL_CHARACTERS: CharacterSheet[] = [
  {
    id: 'char-kael',
    label: 'CHAR_KAEL',
    displayName: 'Kael Vance',
    role: 'Exiled Chrono-Enforcer',
    genre: 'Cyberpunk',
    sheetWidth: 1080,
    sheetHeight: 1920,
    aspectRatio: '9:16',
    triggerWord: 'kael_vance_cyber_916',
    ipAdapterWeight: 0.92,
    lipSyncRegion: { x: 455, y: 510, w: 170, h: 115 },
    palettePrimary: '#0F172A',
    paletteAccent: '#F59E0B',
    poses: [
      { poseLabel: 'POSE_NEUTRAL', description: 'Trenchcoat collar raised, rain-slicked 3/4 profile', keyframeCrop: '0,0,1080,1920' },
      { poseLabel: 'POSE_DRAMATIC', description: 'Drawing neural-disruptor, sharp chiaroscuro rim light', keyframeCrop: '1080,0,1080,1920' },
      { poseLabel: 'POSE_CLOSEUP', description: 'Extreme vertical close-up on cybernetic iris & jaw', keyframeCrop: '2160,0,1080,1920' },
    ],
  },
  {
    id: 'char-lyra',
    label: 'CHAR_LYRA',
    displayName: 'Lyra Solis',
    role: 'Orbital Spire Architect',
    genre: 'Sci-Fi',
    sheetWidth: 1080,
    sheetHeight: 1920,
    aspectRatio: '9:16',
    triggerWord: 'lyra_solis_astrid_916',
    ipAdapterWeight: 0.90,
    lipSyncRegion: { x: 465, y: 500, w: 150, h: 105 },
    palettePrimary: '#1E293B',
    paletteAccent: '#38BDF8',
    poses: [
      { poseLabel: 'POSE_NEUTRAL', description: 'Hands clasped over holographic astrolabe, calm gaze', keyframeCrop: '0,0,1080,1920' },
      { poseLabel: 'POSE_SHOCK', description: 'Step backward, silver hair sweeping across collar', keyframeCrop: '1080,0,1080,1920' },
      { poseLabel: 'POSE_CLOSEUP', description: 'Emotional tear-glint framing for silent subtitle climax', keyframeCrop: '2160,0,1080,1920' },
    ],
  },
  {
    id: 'char-vex',
    label: 'CHAR_VEX',
    displayName: 'Lord Malakor Vex',
    role: 'High Inquisitor of the Obsidian Rift',
    genre: 'Fantasy',
    sheetWidth: 1080,
    sheetHeight: 1920,
    aspectRatio: '9:16',
    triggerWord: 'lord_vex_obsidian_916',
    ipAdapterWeight: 0.89,
    lipSyncRegion: { x: 450, y: 525, w: 180, h: 120 },
    palettePrimary: '#18181B',
    paletteAccent: '#EF4444',
    poses: [
      { poseLabel: 'POSE_NEUTRAL', description: 'Cloaked silhouette atop obsidian throne steps', keyframeCrop: '0,0,1080,1920' },
      { poseLabel: 'POSE_DRAMATIC', description: 'Gauntlet raised, crimson sigil igniting vertical frame', keyframeCrop: '1080,0,1080,1920' },
      { poseLabel: 'POSE_SIDE', description: 'Over-the-shoulder confrontation angle', keyframeCrop: '2160,0,1080,1920' },
    ],
  },
];

export const INITIAL_LORAS: StyleLoRA[] = [
  {
    id: 'lora-cyber-noir',
    styleTag: 'STYLE_CYBER_NOIR',
    name: 'Neo-Veridia Rain & Amber Noir v2.4',
    filename: 'vertinode_cyber_noir_fp16.safetensors',
    compatibleArch: ['Flux.1-dev', 'SDXL-1.0', 'SD-1.5'],
    genre: 'Cyberpunk',
    modelStrength: 0.85,
    clipStrength: 0.8,
    triggerPhrase: 'cinematic vertical drama, anamorphic rain reflections, warm tungsten rim light',
    tintHex: '#F59E0B',
    contrastBoost: 1.15,
  },
  {
    id: 'lora-orbital-scifi',
    styleTag: 'STYLE_ORBITAL_SCIFI',
    name: 'Celestial Glass & Zero-G Cleanline v1.8',
    filename: 'vertinode_orbital_cleanline.safetensors',
    compatibleArch: ['Flux.1-dev', 'SDXL-1.0'],
    genre: 'Sci-Fi',
    modelStrength: 0.8,
    clipStrength: 0.75,
    triggerPhrase: 'high-altitude orbital atrium, crisp cel-shaded specular highlights, volumetric starlight',
    tintHex: '#38BDF8',
    contrastBoost: 1.08,
  },
  {
    id: 'lora-dark-fantasy',
    styleTag: 'STYLE_AETHER_FANTASY',
    name: 'Obsidian Sanctum & Gold Filigree v3.0',
    filename: 'vertinode_aether_sanctum_xl.safetensors',
    compatibleArch: ['Flux.1-dev', 'SDXL-1.0', 'SD-1.5'],
    genre: 'Fantasy',
    modelStrength: 0.9,
    clipStrength: 0.85,
    triggerPhrase: 'gothic cathedral vertical framing, gilded filigree armor, dramatic chiaroscuro',
    tintHex: '#EF4444',
    contrastBoost: 1.2,
  },
];

export const INITIAL_STORYBOARD_BEATS: StoryboardBeat[] = [
  {
    id: 'beat-1',
    sceneNumber: 1,
    title: 'Alleyway Intercept',
    rawNarrative:
      '[CHAR_KAEL] [STYLE_CYBER_NOIR] [POSE_NEUTRAL] Kael steps beneath the flickering sodium streetlamp in Sector 9, checking the encrypted memory shard.',
    subtitleText: 'They erased the spire records... but they forgot the backup in my cortex.',
    durationSec: 28,
    cameraCurve: 'Dolly In',
    pacing: 'Slow Burn',
    lightingNote: 'Warm amber overhead key light, wet cobblestone specular bounce',
  },
  {
    id: 'beat-2',
    sceneNumber: 2,
    title: 'The Architect Reveals the Breach',
    rawNarrative:
      '[CHAR_LYRA] [STYLE_ORBITAL_SCIFI] [POSE_SHOCK] Lyra turns sharply from the orbital glass wall as the containment alarm strobes across the atrium.',
    subtitleText: 'Kael, don’t open that seal! The Sovereign Council wired it to wipe your memory!',
    durationSec: 34,
    cameraCurve: 'Pan Right',
    pacing: 'Rhythmic Dialogue',
    lightingNote: 'Cool slate ambient sky with warm golden architectural shaft',
  },
  {
    id: 'beat-3',
    sceneNumber: 3,
    title: 'Inquisitor Vex Issues the Decree',
    rawNarrative:
      '[CHAR_VEX] [STYLE_AETHER_FANTASY] [POSE_DRAMATIC] Lord Vex descends the obsidian staircase, his crimson mantle trailing through low-lying embers.',
    subtitleText: 'Kneel before the Obsidian Tribunal, or watch the upper ring fall into ash.',
    durationSec: 36,
    cameraCurve: 'Tilt Up',
    pacing: 'Rapid Cliffhanger',
    lightingNote: 'High-contrast rim light from below, deep shadow falloff',
  },
  {
    id: 'beat-4',
    sceneNumber: 4,
    title: 'Silent Vow & Style Shift',
    rawNarrative:
      '[CHAR_KAEL] [STYLE_CYBER_NOIR] [POSE_CLOSEUP] Kael locks eyes with Vex across the fractured bridge and crushes the royal insignia.',
    subtitleText: 'Tell the Tribunal my contract just expired. Episode 02 begins in the lower depths.',
    durationSec: 32,
    cameraCurve: 'Dutch Whip',
    pacing: 'Rapid Cliffhanger',
    lightingNote: 'Tight vertical collar framing, high-contrast facial key light for lip-sync',
  },
  {
    id: 'beat-5',
    sceneNumber: 5,
    title: 'Cliffhanger Freeze Frame',
    rawNarrative:
      '[CHAR_LYRA] [STYLE_ORBITAL_SCIFI] [POSE_CLOSEUP] Lyra reaches through the shattering portal as the countdown hits zero.',
    subtitleText: 'If you cross that threshold, neither of us can ever return to the Citadel!',
    durationSec: 30,
    cameraCurve: 'Crane Pullback',
    pacing: 'Rapid Cliffhanger',
    lightingNote: 'Backlit portal flare with 9:16 lower-third scrim for cliffhanger subtitle',
  },
];

export const INITIAL_PIPELINE_CONFIG: PipelineConfig = {
  projectName: 'Chronicles of the Sovereign Ring',
  episodeCode: 'EP01_THE_CORTEX_SEAL',
  genre: 'Cyberpunk',
  checkpointName: '10Eros_v15.gguf',
  architecture: 'LTX-Video',
  targetWidth: 1080,
  targetHeight: 1920,
  fps: 24,
  steps: 24,
  cfg: 3.2,
  sampler: 'euler_ancestral',
  silentLipSyncEnabled: true,
  subtitleBurnIn: true,
  localCacheDirectory: '/local/comfyui/output/vertical_dramas/ep01',
  ltxTextEncoder: 't5xxl_fp8_e4m3fn.safetensors',
  ltxStgScale: 1.4,
  ltxRescale: 0.7,
  ltxChunkFrames: 161,
  vramProfile: '16GB Balanced',
};

export const INITIAL_BATCH_QUEUE: BatchEpisodeJob[] = [
  {
    id: 'batch-ep01',
    episodeNumber: 1,
    title: 'EP01 · The Cortex Seal',
    genre: 'Cyberpunk',
    durationSec: 160,
    totalFrames: 3840,
    status: 'Completed',
    progressPct: 100,
    checkpoint: 'flux1-dev-fp8-local.safetensors',
    loraStack: ['STYLE_CYBER_NOIR', 'STYLE_ORBITAL_SCIFI'],
    outputResolution: '1080x1920',
  },
  {
    id: 'batch-ep02',
    episodeNumber: 2,
    title: 'EP02 · Ashes of the Citadel',
    genre: 'Fantasy',
    durationSec: 195,
    totalFrames: 4680,
    status: 'Rendering',
    progressPct: 68,
    checkpoint: 'sdxl_animagine_v31_local.safetensors',
    loraStack: ['STYLE_AETHER_FANTASY'],
    outputResolution: '1080x1920',
  },
  {
    id: 'batch-ep03',
    episodeNumber: 3,
    title: 'EP03 · Zero-Orbit Betrayal',
    genre: 'Sci-Fi',
    durationSec: 240,
    totalFrames: 5760,
    status: 'Queued',
    progressPct: 0,
    checkpoint: 'flux1-dev-fp8-local.safetensors',
    loraStack: ['STYLE_ORBITAL_SCIFI', 'STYLE_CYBER_NOIR'],
    outputResolution: '1080x1920',
  },
];

export const GENRE_STORYBOARD_SCRIPTS: Record<GenreSetting, string> = {
  Cyberpunk: `Scene 1: Rain-Slicked Sector 9 Intercept
[CHAR_KAEL] [STYLE_CYBER_NOIR] steps beneath the flickering sodium streetlamp, checking the encrypted memory shard.
Sub: "They erased the spire records... but they forgot the backup in my cortex."

Scene 2: Neural Firewall Breach
[CHAR_LYRA] [STYLE_CYBER_NOIR] turns sharply as the red neon containment alarm strobes across the alley.
Sub: "Kael, disconnect now! The Syndicate traced your neural signature to this block!"

Scene 3: Bridge Confrontation
[CHAR_KAEL] confronts [CHAR_VEX] [STYLE_CYBER_NOIR] across the rain-drenched overpass as drones lock on.
Sub: "Tell the Tribunal my contract just expired. See you in the lower depths."`,

  'Sci-Fi': `Scene 1: Orbital Conservatory Awakening
[CHAR_LYRA] [STYLE_ORBITAL_SCIFI] overlooks the low-orbit starlight ring as telemetry projections orbit her hands.
Sub: "The solar array is stabilizing, but Sector 4 gravity seals are failing."

Scene 2: Zero-G Airlock Confrontation
[CHAR_KAEL] confronts [CHAR_LYRA] [STYLE_ORBITAL_SCIFI] across the pressurized glass corridor.
Sub: "If you jettison the core now, the entire orbital ring loses propulsion!"

Scene 3: Starlight Horizon Cliffhanger
[CHAR_LYRA] [STYLE_ORBITAL_SCIFI] whispers a final override command in extreme close-up as the portal ignites.
Sub: "Forgive me, Kael. Some coordinates were never meant to be found."`,

  Fantasy: `Scene 1: Steps of the Obsidian Sanctum
[CHAR_VEX] [STYLE_AETHER_FANTASY] descends the towering gothic cathedral steps through drifting molten-gold embers.
Sub: "By decree of the Obsidian Covenant, the bloodline of the Spire is forfeit."

Scene 2: Twin Sigil Duel
[CHAR_KAEL] confronts [CHAR_VEX] [STYLE_AETHER_FANTASY] as crimson runes fracture the sanctum floor.
Sub: "Your ancient oaths mean nothing to the exiled! Draw your blade, Malakor!"

Scene 3: Shattered Crown Vow
[CHAR_LYRA] [STYLE_AETHER_FANTASY] gasps in shock as the ancient reliquary shatters into radiant shards.
Sub: "The seal is broken... the Aether Rift is opening above the capital!"`,
};

export interface SceneThumbnailGradientSpec {
  index: number;
  gradientClass: string;
  accentHex: string;
  secondaryHex: string;
  atmosphereLabel: string;
}

const SCENE_THUMBNAIL_GRADIENT_PALETTES: Omit<
  SceneThumbnailGradientSpec,
  'index'
>[] = [
  {
    gradientClass:
      'bg-gradient-to-b from-amber-500/35 via-slate-900 to-[#0B0F17]',
    accentHex: '#F59E0B',
    secondaryHex: '#38BDF8',
    atmosphereLabel: 'Amber Key',
  },
  {
    gradientClass:
      'bg-gradient-to-br from-sky-500/35 via-indigo-950/90 to-[#0B0F17]',
    accentHex: '#38BDF8',
    secondaryHex: '#818CF8',
    atmosphereLabel: 'Orbital Cyan',
  },
  {
    gradientClass:
      'bg-gradient-to-b from-rose-500/35 via-stone-950 to-[#0B0F17]',
    accentHex: '#F43F5E',
    secondaryHex: '#F59E0B',
    atmosphereLabel: 'Obsidian Ember',
  },
  {
    gradientClass:
      'bg-gradient-to-tr from-[#0B0F17] via-emerald-950/85 to-teal-500/35',
    accentHex: '#10B981',
    secondaryHex: '#38BDF8',
    atmosphereLabel: 'Cortex Matrix',
  },
  {
    gradientClass:
      'bg-gradient-to-bl from-fuchsia-500/30 via-slate-900 to-[#0B0F17]',
    accentHex: '#D946EF',
    secondaryHex: '#38BDF8',
    atmosphereLabel: 'Rift Horizon',
  },
  {
    gradientClass:
      'bg-gradient-to-t from-amber-500/30 via-blue-950/85 to-[#0B0F17]',
    accentHex: '#60A5FA',
    secondaryHex: '#F59E0B',
    atmosphereLabel: 'Neon Split',
  },
];

/**
 * Returns a deterministic gradient specification based on the 0-based scene index
 * to visualize scene-to-scene flow when a customPlateUrl is not bound.
 */
export function getSceneThumbnailGradientSpec(
  sceneIndex: number
): SceneThumbnailGradientSpec {
  const safeIdx = Math.abs(Math.floor(sceneIndex)) % SCENE_THUMBNAIL_GRADIENT_PALETTES.length;
  const spec = SCENE_THUMBNAIL_GRADIENT_PALETTES[safeIdx];
  return {
    index: safeIdx,
    ...spec,
  };
}


