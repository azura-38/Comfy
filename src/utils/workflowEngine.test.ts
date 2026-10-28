import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStoryboardLabels,
  generateSilentVisemesForSubtitle,
  validateCharacterDimensionLock,
  resolveSceneGraphMapping,
  computeCameraMotionAtFrame,
  buildComfyUIWorkflowJSON,
  exportFrameSyncedSubtitlesSRT,
  parseCharacterSpreadsheetCSV,
  inferPoseAndSpriteLayoutFromNarrative,
  autoParseRawStoryboardBlock,
  normalizeBeatsToEpisodeWindow,
  generateComfyUICustomNodesPython,
  getSceneThumbnailGradientSpec,
  snapToLTXVFrameRule,
  estimateLocalLTXVHardwareMetrics,
  compileLocalLTXVMotionPrompt,
  GENRE_STORYBOARD_SCRIPTS,
  INITIAL_CHARACTERS,
  INITIAL_LORAS,
  INITIAL_STORYBOARD_BEATS,
  INITIAL_PIPELINE_CONFIG,
} from './workflowEngine';

test('getSceneThumbnailGradientSpec returns deterministic gradient classes per scene index', () => {
  const g0 = getSceneThumbnailGradientSpec(0);
  const g1 = getSceneThumbnailGradientSpec(1);
  const g6 = getSceneThumbnailGradientSpec(6);

  assert.ok(g0.gradientClass.includes('bg-gradient-'));
  assert.notEqual(g0.gradientClass, g1.gradientClass);
  assert.equal(g0.gradientClass, g6.gradientClass);
});

test('snapToLTXVFrameRule, estimateLocalLTXVHardwareMetrics, and compileLocalLTXVMotionPrompt support local LTX-Video', () => {
  const snapped = snapToLTXVFrameRule(160);
  assert.equal(snapped.validFrames, 161);
  assert.equal(snapped.validFrames % 8, 1);

  const hw = estimateLocalLTXVHardwareMetrics(INITIAL_PIPELINE_CONFIG, 3840);
  assert.equal(hw.chunkFrames, 161);
  assert.ok(hw.totalChunks >= 23);
  assert.equal(hw.upscaleTargetSize, '1080×1920');

  const { resolvedBeats } = resolveSceneGraphMapping(
    INITIAL_STORYBOARD_BEATS,
    INITIAL_CHARACTERS,
    INITIAL_LORAS,
    24
  );
  const ltxPrompt = compileLocalLTXVMotionPrompt(resolvedBeats[0]);
  assert.ok(ltxPrompt.includes('Kael Vance'));
  assert.ok(ltxPrompt.includes('dolly push-in'));
  assert.ok(ltxPrompt.includes('visemes'));
});

test('parseStoryboardLabels extracts character, style, pose, and camera tokens accurately', () => {
  const input =
    '[CHAR_KAEL] confronts [CHAR_VEX] under [STYLE_CYBER_NOIR] with [POSE_DRAMATIC] and [CAM_DOLLY_IN].';
  const result = parseStoryboardLabels(input);
  assert.deepEqual(result.characters, ['CHAR_KAEL', 'CHAR_VEX']);
  assert.deepEqual(result.styles, ['STYLE_CYBER_NOIR']);
  assert.deepEqual(result.poses, ['POSE_DRAMATIC']);
  assert.deepEqual(result.cameras, ['CAM_DOLLY_IN']);
});

test('validateCharacterDimensionLock verifies 1080x1920 9:16 frame lock', () => {
  const validCheck = validateCharacterDimensionLock(INITIAL_CHARACTERS, 1080, 1920);
  assert.equal(validCheck.allLocked, true);
  assert.equal(validCheck.mismatchedIds.length, 0);
  assert.equal(validCheck.aspectRatioString, '9:16');

  const mismatchedCheck = validateCharacterDimensionLock(INITIAL_CHARACTERS, 1920, 1080);
  assert.equal(mismatchedCheck.allLocked, false);
  assert.equal(mismatchedCheck.mismatchedIds.length, 3);
});

test('resolveSceneGraphMapping maps storyboard labels to character sheets and enforces 2-5 min episode window', () => {
  const mapping = resolveSceneGraphMapping(
    INITIAL_STORYBOARD_BEATS,
    INITIAL_CHARACTERS,
    INITIAL_LORAS,
    24,
    1080,
    1920
  );

  // Total duration is 28 + 34 + 36 + 32 + 30 = 160 seconds (2 min 40 sec -> within 2-5 min window)
  assert.equal(mapping.totalDurationSec, 160);
  assert.equal(mapping.totalFrames, 160 * 24);
  assert.equal(mapping.isWithinTwoToFiveMinutes, true);
  assert.equal(mapping.episodeWindowStatus, 'Optimal (2m–5m)');

  // Scene 2 should automatically bind to CHAR_LYRA and STYLE_ORBITAL_SCIFI
  const scene2 = mapping.resolvedBeats[1];
  assert.equal(scene2.matchedCharacter?.label, 'CHAR_LYRA');
  assert.equal(scene2.matchedLoRA?.styleTag, 'STYLE_ORBITAL_SCIFI');
  assert.equal(scene2.activePose, 'POSE_SHOCK');
  assert.equal(scene2.startFrame, 28 * 24);

  // Scene 4 mentions both Kael and Vex -> Dual Split Confrontation layout + secondaryCharacter
  const scene4 = mapping.resolvedBeats[3];
  assert.equal(scene4.matchedCharacter?.label, 'CHAR_KAEL');
  assert.equal(scene4.secondaryCharacter?.label, 'CHAR_VEX');
  assert.equal(scene4.inferredLayout, 'Dual Split Confrontation');
});

test('inferPoseAndSpriteLayoutFromNarrative and autoParseRawStoryboardBlock parse genre scripts into 2-5m sequences', () => {
  const inference = inferPoseAndSpriteLayoutFromNarrative(
    'Kael confronts Vex across the obsidian bridge as the alarm sounds',
    2
  );
  assert.equal(inference.inferredLayout, 'Dual Split Confrontation');
  assert.equal(inference.recommendedCamera, 'Dutch Whip');
  assert.equal(inference.recommendedPacing, 'Rapid Cliffhanger');

  const parsedBeats = autoParseRawStoryboardBlock(
    GENRE_STORYBOARD_SCRIPTS.Fantasy,
    INITIAL_CHARACTERS,
    INITIAL_LORAS
  );
  assert.equal(parsedBeats.length, 3);
  const totalSec = parsedBeats.reduce((sum, b) => sum + b.durationSec, 0);
  assert.equal(totalSec, 180); // Normalized to 3 minutes (within 2-5m target)

  const normalized = normalizeBeatsToEpisodeWindow(parsedBeats, 240);
  const normTotal = normalized.reduce((sum, b) => sum + b.durationSec, 0);
  assert.equal(normTotal, 240);

  const pyCode = generateComfyUICustomNodesPython(INITIAL_PIPELINE_CONFIG);
  assert.ok(pyCode.includes('NODE_CLASS_MAPPINGS'));
  assert.ok(pyCode.includes('VertiNodeSilentVisemeLipSync'));
});

test('generateSilentVisemesForSubtitle produces deterministic frame-synced mouth cues without audio', () => {
  const cues = generateSilentVisemesForSubtitle('Open the seal now!', 48);
  assert.ok(cues.length > 0);
  assert.equal(cues[0].frameOffset, 0);
  // Last cue in trailing 10% should return to REST
  assert.equal(cues[cues.length - 1].viseme, 'REST');
});

test('computeCameraMotionAtFrame computes deterministic camera trajectories', () => {
  const start = computeCameraMotionAtFrame('Dolly In', 'Slow Burn', 0);
  const end = computeCameraMotionAtFrame('Dolly In', 'Slow Burn', 1);
  assert.equal(start.scale, 1.0);
  assert.equal(end.scale, 1.22);
  assert.ok(end.offsetY < start.offsetY);
});

test('buildComfyUIWorkflowJSON outputs valid ComfyUI API graph with latent 9:16 lock and silent lip-sync node', () => {
  const { resolvedBeats } = resolveSceneGraphMapping(
    INITIAL_STORYBOARD_BEATS,
    INITIAL_CHARACTERS,
    INITIAL_LORAS,
    24
  );
  const workflow = buildComfyUIWorkflowJSON(
    INITIAL_PIPELINE_CONFIG,
    resolvedBeats,
    INITIAL_CHARACTERS,
    INITIAL_LORAS
  );

  assert.equal(workflow['2'].inputs.width, 1080);
  assert.equal(workflow['2'].inputs.height, 1920);
  assert.equal(workflow['6'].class_type, 'VertiNodeSilentVisemeLipSync');
  assert.equal(workflow['8'].inputs.audio_track, 'NONE_SILENT_DRAMA');
});

test('exportFrameSyncedSubtitlesSRT and parseCharacterSpreadsheetCSV roundtrip cleanly', () => {
  const { resolvedBeats } = resolveSceneGraphMapping(
    INITIAL_STORYBOARD_BEATS,
    INITIAL_CHARACTERS,
    INITIAL_LORAS,
    24
  );
  const srt = exportFrameSyncedSubtitlesSRT(resolvedBeats, 24);
  assert.ok(srt.includes('00:00:00,000 --> 00:00:28,000'));
  assert.ok(srt.includes('[F:0-671 | KAEL VANCE]'));

  const csv = `label,displayName,role,genre,sheetWidth,sheetHeight,triggerWord
CHAR_ARIA,Aria Nocturne,Shadow Weaver,Fantasy,1080,1920,aria_nocturne_916`;
  const parsed = parseCharacterSpreadsheetCSV(csv);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].label, 'CHAR_ARIA');
  assert.equal(parsed[0].sheetWidth, 1080);
  assert.equal(parsed[0].sheetHeight, 1920);
});
