import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStoryboardLabels,
  findMentionedCharacterLabels,
  generateSilentVisemesForSubtitle,
  validateCharacterDimensionLock,
  resolveSceneGraphMapping,
  computeCameraMotionAtFrame,
  buildComfyUIWorkflowJSON,
  buildComfyUIWorkflowWithFallbacks,
  validateWorkflowAgainstObjectInfo,
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
import {
  validateComfyBaseUrl,
  parseRequiredNodesParam,
  fetchComfyStatus,
  fetchComfyQueue,
  fetchComfyObjectInfo,
  FetchLike,
} from './comfyApiClient';

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

test('storyboard character matching resolves aliases as whole words and avoids random fallback', () => {
  const characters = INITIAL_CHARACTERS.map((character, index) => ({
    ...character,
    aliases: index === 0 ? ['Kaan', 'Kaan-kun'] : index === 1 ? ['Hana'] : [],
  }));

  assert.deepEqual(
    findMentionedCharacterLabels('Kaan walks into the cafe while Hana waits.', characters),
    ['CHAR_KAEL', 'CHAR_LYRA']
  );
  assert.deepEqual(
    findMentionedCharacterLabels('A man walks through a rainy Tokyo street.', characters),
    []
  );
  assert.deepEqual(
    findMentionedCharacterLabels('The word kaleidoscope appears inside unrelated text.', characters),
    []
  );

  const parsed = autoParseRawStoryboardBlock(
    'Scene 1: Empty Tokyo street\nA rainy street sits empty beneath neon signs.',
    characters,
    INITIAL_LORAS
  );
  assert.equal(parsed.length, 1);
  assert.equal(parseStoryboardLabels(parsed[0].rawNarrative).characters.length, 0);
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

test('buildComfyUIWorkflowJSON outputs valid ComfyUI API graph with LTXV23ModelsLoader, AnimateDiffCameraPacingController, and KSampler', () => {
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

  const classTypes = Object.values(workflow).map((n) => n.class_type);
  assert.equal(workflow['1'].class_type, 'LTXV23ModelsLoader');
  assert.equal(workflow['1'].inputs.model_name, '10Eros_v15.gguf');
  assert.equal(workflow['2'].inputs.width, 1080);
  assert.equal(workflow['2'].inputs.height, 1920);
  assert.equal(workflow['5'].class_type, 'AnimateDiffCameraPacingController');
  assert.equal(workflow['6'].class_type, 'VertiNodeSilentVisemeLipSync');
  assert.equal(workflow['7'].class_type, 'KSampler');
  assert.equal(workflow['8'].inputs.audio_track, 'NONE_SILENT_DRAMA');

  // Verify obsolete/assumed missing node class names are never emitted
  assert.equal(classTypes.includes('LTXVLoader'), false);
  assert.equal(classTypes.includes('LTXVConditioningCameraController'), false);
  assert.equal(classTypes.includes('LTXVSamplerCustom'), false);
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

test('1. ComfyUI API: successful /system_stats response returns actual fields without inventing data', async () => {
  const mockSystemStats = {
    system: {
      os: 'nt',
      comfyui_version: '0.3.14',
      python_version: '3.11.9',
    },
    devices: [
      {
        name: 'cuda:0 NVIDIA GeForce RTX 4050 Laptop GPU : cudaMallocAsync',
        type: 'cuda',
        vram_total: 6441926656,
        vram_free: 5120000000,
      },
    ],
  };

  const mockFetch: FetchLike = async (url) => {
    assert.equal(url, 'http://127.0.0.1:8188/system_stats');
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(mockSystemStats),
    };
  };

  const result = await fetchComfyStatus('http://127.0.0.1:8188/', {
    fetchImpl: mockFetch,
  });

  assert.equal(result.connected, true);
  assert.equal(result.baseUrl, 'http://127.0.0.1:8188');
  assert.equal(result.serverVersion, '0.3.14');
  assert.equal(result.system?.os, 'nt');
  assert.equal(result.devices.length, 1);
  assert.equal(
    result.devices[0].name,
    'cuda:0 NVIDIA GeForce RTX 4050 Laptop GPU : cudaMallocAsync'
  );
  assert.equal(result.error, undefined);
});

test('2. ComfyUI API: server unavailable (ECONNREFUSED) reports connected: false and clear error', async () => {
  const mockFetch: FetchLike = async () => {
    const err = new Error('fetch failed') as Error & { cause?: { code: string } };
    err.cause = { code: 'ECONNREFUSED' };
    throw err;
  };

  const result = await fetchComfyStatus('http://127.0.0.1:8188', {
    fetchImpl: mockFetch,
  });

  assert.equal(result.connected, false);
  assert.equal(result.serverVersion, null);
  assert.equal(result.system, null);
  assert.deepEqual(result.devices, []);
  assert.ok(result.error?.includes('ECONNREFUSED'));
});

test('3. ComfyUI API: request timeout reports connected: false and timeout message', async () => {
  const mockFetch: FetchLike = async (_url, init) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        reject(abortErr);
      });
    });
  };

  const result = await fetchComfyStatus('http://127.0.0.1:8188', {
    timeoutMs: 30,
    fetchImpl: mockFetch,
  });

  assert.equal(result.connected, false);
  assert.ok(result.error?.includes('timed out after 30ms'));
});

test('4. ComfyUI API: invalid JSON or unexpected payload structure is rejected as connected: false', async () => {
  const invalidJsonFetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '<html>Not ComfyUI JSON</html>',
  });

  const res1 = await fetchComfyStatus('http://127.0.0.1:8188', {
    fetchImpl: invalidJsonFetch,
  });
  assert.equal(res1.connected, false);
  assert.ok(res1.error?.includes('invalid JSON'));

  const unexpectedShapeFetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({ hello: 'world' }),
  });

  const res2 = await fetchComfyStatus('http://127.0.0.1:8188', {
    fetchImpl: unexpectedShapeFetch,
  });
  assert.equal(res2.connected, false);
  assert.ok(res2.error?.includes('missing "system" and "devices"'));
});

test('5. ComfyUI API: successful /queue response returns actual running and pending queues', async () => {
  const mockQueuePayload = {
    queue_running: [[1, 'prompt-id-101', {}]],
    queue_pending: [
      [2, 'prompt-id-102', {}],
      [3, 'prompt-id-103', {}],
    ],
  };

  const mockFetch: FetchLike = async (url) => {
    assert.equal(url, 'http://127.0.0.1:8000/queue');
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(mockQueuePayload),
    };
  };

  const result = await fetchComfyQueue('http://127.0.0.1:8000', {
    fetchImpl: mockFetch,
  });

  assert.equal(result.connected, true);
  assert.equal(result.runningCount, 1);
  assert.equal(result.pendingCount, 2);
  assert.equal(result.queueRunning.length, 1);
  assert.equal(result.queuePending.length, 2);
});

test('6. ComfyUI API: /object_info accurately detects present and missing required nodes and extracts nodeSchemas', async () => {
  const mockObjectInfo = {
    KSampler: {
      input: {
        required: {
          model: ['MODEL'],
          seed: ['INT', { default: 0 }],
          steps: ['INT', { default: 20 }],
          cfg: ['FLOAT', { default: 8.0 }],
          sampler_name: [['euler', 'euler_ancestral'], {}],
          scheduler: [['normal', 'karras'], {}],
          positive: ['CONDITIONING'],
          negative: ['CONDITIONING'],
          latent_image: ['LATENT'],
          denoise: ['FLOAT', { default: 1.0 }],
        },
      },
      output: ['LATENT'],
    },
    CheckpointLoaderSimple: { input: { required: { ckpt_name: [['model.safetensors'], {}] } }, output: ['MODEL', 'CLIP', 'VAE'] },
    EmptyLatentImage: { input: { required: { width: ['INT'], height: ['INT'], batch_size: ['INT'] } }, output: ['LATENT'] },
    LTXV23ModelsLoader: {
      input: {
        required: {
          model_name: [['10Eros_v15.gguf'], {}],
          text_encoder: [['t5xxl_fp8_e4m3fn.safetensors'], {}],
        },
      },
      output: ['MODEL', 'CLIP', 'VAE'],
    },
  };

  const mockFetch: FetchLike = async (url) => {
    assert.equal(url, 'http://127.0.0.1:8188/object_info');
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(mockObjectInfo),
    };
  };

  const parsedQuery = parseRequiredNodesParam(
    'KSampler,LTXV23ModelsLoader,VertiNodeSilentVisemeLipSync,EmptyLTXVLatentVideo'
  );
  assert.equal(parsedQuery.valid, true);

  const result = await fetchComfyObjectInfo(
    'http://127.0.0.1:8188',
    parsedQuery.nodes,
    { fetchImpl: mockFetch }
  );

  assert.equal(result.connected, true);
  assert.equal(result.installedCount, 4);
  assert.deepEqual(result.presentNodes, ['KSampler', 'LTXV23ModelsLoader']);
  assert.deepEqual(result.missingNodes, [
    'VertiNodeSilentVisemeLipSync',
    'EmptyLTXVLatentVideo',
  ]);
  assert.deepEqual(result.nodeSchemas?.LTXV23ModelsLoader?.requiredInputs, [
    'model_name',
    'text_encoder',
  ]);
  assert.equal(
    result.nodeSchemas?.LTXV23ModelsLoader?.inputDefaults.model_name,
    '10Eros_v15.gguf'
  );
});

test('7. ComfyUI API: invalid base URL rejection', async () => {
  const badProtocol = validateComfyBaseUrl('ftp://127.0.0.1:8188');
  assert.equal(badProtocol.valid, false);
  assert.ok(badProtocol.error?.includes('Unsupported protocol'));

  const missingPort = validateComfyBaseUrl('http://127.0.0.1');
  assert.equal(missingPort.valid, false);
  assert.ok(missingPort.error?.includes('explicit port number'));

  const embeddedCreds = validateComfyBaseUrl('http://user:pass@127.0.0.1:8188');
  assert.equal(embeddedCreds.valid, false);
  assert.ok(embeddedCreds.error?.includes('credentials'));

  const statusWithInvalidUrl = await fetchComfyStatus('not-a-valid-url');
  assert.equal(statusWithInvalidUrl.connected, false);
  assert.ok(statusWithInvalidUrl.error?.includes('Invalid COMFYUI_BASE_URL'));
});

test('8. Workflow /object_info validation verifies all 8 nodes and required inputs for 10Eros + LTXV23ModelsLoader', async () => {
  const { resolvedBeats } = resolveSceneGraphMapping(
    INITIAL_STORYBOARD_BEATS,
    INITIAL_CHARACTERS,
    INITIAL_LORAS,
    24
  );

  const fullObjectInfoPayload = {
    LTXV23ModelsLoader: {
      input: {
        required: {
          model_name: [['10Eros_v15.gguf'], {}],
          text_encoder: [['t5xxl_fp8_e4m3fn.safetensors'], {}],
           custom_gguf_device: [['cuda:0', 'cpu'], { default: 'cuda:0' }],
        },
      },
      output: ['MODEL', 'CLIP', 'VAE'],
    },
    EmptyLTXVLatentVideo: {
      input: {
        required: {
          width: ['INT', { default: 768 }],
          height: ['INT', { default: 1344 }],
          length: ['INT', { default: 161 }],
          batch_size: ['INT', { default: 1 }],
        },
      },
      output: ['LATENT'],
    },
    VertiNodeDynamicLoRAStack: {
      input: {
        required: {
          model: ['MODEL'],
          lora_stack: ['STRING'],
        },
      },
      output: ['MODEL'],
    },
    VertiNodeCharacterSheetMapper: {
      input: {
        required: {
          model: ['MODEL'],
          spreadsheet_Lock_width: ['INT'],
          spreadsheet_Lock_height: ['INT'],
        },
      },
      output: ['MODEL'],
    },
    AnimateDiffCameraPacingController: {
      input: {
        required: {
          model: ['MODEL'],
          fps: ['INT'],
        },
      },
      output: ['MODEL'],
    },
    VertiNodeSilentVisemeLipSync: {
      input: {
        required: {
          conditioning_model: ['MODEL'],
          enabled: ['BOOLEAN'],
          fps: ['INT'],
        },
      },
      output: ['MODEL'],
    },
    KSampler: {
      input: {
        required: {
          model: ['MODEL'],
          seed: ['INT'],
          steps: ['INT'],
          cfg: ['FLOAT'],
          sampler_name: [['euler_ancestral'], {}],
          scheduler: [['normal', 'karras'], {}],
          positive: ['CONDITIONING'],
          negative: ['CONDITIONING'],
          latent_image: ['LATENT'],
          denoise: ['FLOAT'],
        },
      },
      output: ['LATENT'],
    },
    VertiNodeSubtitleVideoCombine: {
      input: {
        required: {
          samples: ['LATENT'],
          frame_rate: ['INT'],
          subtitle_burn_in: ['BOOLEAN'],
        },
      },
      output: ['STRING'],
    },
  };

  const baseWorkflow = buildComfyUIWorkflowJSON(
    INITIAL_PIPELINE_CONFIG,
    resolvedBeats,
    INITIAL_CHARACTERS,
    INITIAL_LORAS
  );
  const requiredNodes = Object.values(baseWorkflow).map((n) => n.class_type);

  const objectInfo = await fetchComfyObjectInfo(
    'http://127.0.0.1:8188',
    requiredNodes,
    {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify(fullObjectInfoPayload),
      }),
    }
  );

  assert.equal(objectInfo.missingNodes.length, 0);

  const { workflow, fallbacksApplied } = buildComfyUIWorkflowWithFallbacks(
    INITIAL_PIPELINE_CONFIG,
    resolvedBeats,
    INITIAL_CHARACTERS,
    INITIAL_LORAS,
    objectInfo
  );

  assert.equal(fallbacksApplied.length, 0);
  // Verify additional required input from live /object_info schema was populated automatically
  assert.equal(workflow['1'].inputs.custom_gguf_device, 'cuda:0');

  const validation = validateWorkflowAgainstObjectInfo(
    workflow,
    objectInfo,
    fallbacksApplied
  );
  assert.equal(validation.verified, true);
  assert.equal(validation.canSubmitQueue, true);
  assert.equal(validation.missingClasses.length, 0);
  assert.equal(validation.invalidInputs.length, 0);
});

test('9. Workflow /object_info fallback and missing-input gate behave safely without inventing nodes', async () => {
  const { resolvedBeats } = resolveSceneGraphMapping(
    INITIAL_STORYBOARD_BEATS,
    INITIAL_CHARACTERS,
    INITIAL_LORAS,
    24
  );

  // Simulate an environment where EmptyLTXVLatentVideo and AnimateDiffCameraPacingController are missing,
  // but EmptyLatentImage and the remaining nodes are installed.
  const partialObjectInfoPayload = {
    LTXV23ModelsLoader: {
      input: { required: { model_name: [['10Eros_v15.gguf'], {}] } },
      output: ['MODEL'],
    },
    EmptyLatentImage: {
      input: { required: { width: ['INT'], height: ['INT'], batch_size: ['INT'] } },
      output: ['LATENT'],
    },
    VertiNodeDynamicLoRAStack: {
      input: { required: { model: ['MODEL'], lora_stack: ['STRING'] } },
      output: ['MODEL'],
    },
    VertiNodeCharacterSheetMapper: {
      input: {
        required: {
          model: ['MODEL'],
          spreadsheet_Lock_width: ['INT'],
          spreadsheet_Lock_height: ['INT'],
        },
      },
      output: ['MODEL'],
    },
    VertiNodeSilentVisemeLipSync: {
      input: {
        required: {
          conditioning_model: ['MODEL'],
          enabled: ['BOOLEAN'],
          fps: ['INT'],
        },
      },
      output: ['MODEL'],
    },
    KSampler: {
      input: {
        required: {
          model: ['MODEL'],
          seed: ['INT'],
          steps: ['INT'],
          cfg: ['FLOAT'],
          sampler_name: [['euler_ancestral'], {}],
          scheduler: [['normal'], {}],
          positive: ['CONDITIONING'],
          negative: ['CONDITIONING'],
          latent_image: ['LATENT'],
          denoise: ['FLOAT'],
        },
      },
      output: ['LATENT'],
    },
    VertiNodeSubtitleVideoCombine: {
      input: {
        required: {
          samples: ['LATENT'],
          frame_rate: ['INT'],
          subtitle_burn_in: ['BOOLEAN'],
        },
      },
      output: ['STRING'],
    },
  };

  const objectInfo = await fetchComfyObjectInfo(
    'http://127.0.0.1:8188',
    ['LTXV23ModelsLoader', 'EmptyLatentImage', 'KSampler'],
    {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify(partialObjectInfoPayload),
      }),
    }
  );

  const { workflow, fallbacksApplied } = buildComfyUIWorkflowWithFallbacks(
    INITIAL_PIPELINE_CONFIG,
    resolvedBeats,
    INITIAL_CHARACTERS,
    INITIAL_LORAS,
    objectInfo
  );

  // Verify fallbacks were applied and clearly reported
  assert.equal(fallbacksApplied.length, 2);
  assert.equal(workflow['2'].class_type, 'EmptyLatentImage');
  assert.equal(workflow['5'], undefined);
  assert.deepEqual(workflow['6'].inputs.conditioning_model, ['4', 0]);

  const validation = validateWorkflowAgainstObjectInfo(
    workflow,
    objectInfo,
    fallbacksApplied
  );
  assert.equal(validation.canSubmitQueue, true);

  // Verify that if a required link input is removed, validation blocks queue submission
  delete workflow['7'].inputs.latent_image;
  const blockedValidation = validateWorkflowAgainstObjectInfo(
    workflow,
    objectInfo,
    fallbacksApplied
  );
  assert.equal(blockedValidation.canSubmitQueue, false);
  assert.equal(blockedValidation.invalidInputs.length, 1);
  assert.deepEqual(
    blockedValidation.invalidInputs[0].missingRequiredInputs,
    ['latent_image']
  );
});


