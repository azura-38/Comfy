/**
 * Server-side local ComfyUI API client and diagnostic validators.
 * Never invents hardware metrics, version numbers, or fake connection states.
 */

export interface ComfyUrlValidationResult {
  valid: boolean;
  normalizedUrl: string;
  error?: string;
}

export interface ComfyStatusResponse {
  connected: boolean;
  baseUrl: string;
  serverVersion: string | null;
  system: Record<string, unknown> | null;
  devices: Array<Record<string, unknown>>;
  checkedAt: string;
  error?: string;
}

export interface ComfyQueueResponse {
  connected: boolean;
  baseUrl: string;
  queueRunning: unknown[];
  queuePending: unknown[];
  runningCount: number;
  pendingCount: number;
  checkedAt: string;
  error?: string;
}

export interface ComfyNodeSchemaSummary {
  classType: string;
  requiredInputs: string[];
  optionalInputs: string[];
  inputDefaults: Record<string, unknown>;
  returnTypes: string[];
}

export interface ComfyObjectInfoResponse {
  connected: boolean;
  baseUrl: string;
  installedCount: number;
  installedNodes: string[];
  requiredNodes: string[];
  presentNodes: string[];
  missingNodes: string[];
  nodeSchemas?: Record<string, ComfyNodeSchemaSummary>;
  checkedAt: string;
  error?: string;
}

export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}>;

const DEFAULT_COMFYUI_BASE_URL = 'http://127.0.0.1:8188';

/**
 * Validates that the configured ComfyUI base URL is a valid HTTP or HTTPS URL
 * with a valid hostname and port (1..65535), without embedded credentials.
 */
export function validateComfyBaseUrl(
  rawUrl: string | undefined
): ComfyUrlValidationResult {
  const candidate = (rawUrl ?? DEFAULT_COMFYUI_BASE_URL).trim();
  if (!candidate) {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'COMFYUI_BASE_URL is empty. Configure an http:// or https:// URL such as http://127.0.0.1:8188.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      valid: false,
      normalizedUrl: candidate,
      error: `Invalid COMFYUI_BASE_URL "${candidate}". Must be a valid HTTP or HTTPS URL (for example, http://127.0.0.1:8188).`,
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalizedUrl: candidate,
      error: `Unsupported protocol "${parsed.protocol}" in COMFYUI_BASE_URL. Only http: and https: are allowed.`,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      normalizedUrl: candidate,
      error: 'COMFYUI_BASE_URL must not contain embedded credentials.',
    };
  }

  if (!parsed.hostname) {
    return {
      valid: false,
      normalizedUrl: candidate,
      error: 'COMFYUI_BASE_URL is missing a valid hostname.',
    };
  }

  if (!parsed.port) {
    return {
      valid: false,
      normalizedUrl: candidate,
      error: `COMFYUI_BASE_URL "${candidate}" must specify an explicit port number (for example, :8188 or :8000).`,
    };
  }

  const portNum = Number(parsed.port);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return {
      valid: false,
      normalizedUrl: candidate,
      error: `Invalid port "${parsed.port}" in COMFYUI_BASE_URL. Port must be an integer between 1 and 65535.`,
    };
  }

  if (parsed.search || parsed.hash) {
    return {
      valid: false,
      normalizedUrl: candidate,
      error: 'COMFYUI_BASE_URL must not include query parameters or hash fragments.',
    };
  }

  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  const normalizedUrl = `${parsed.protocol}//${parsed.host}${cleanPath}`;

  return {
    valid: true,
    normalizedUrl,
  };
}

/**
 * Parses and validates an optional comma-separated or array query parameter of required node names.
 */
export function parseRequiredNodesParam(rawParam: unknown): {
  valid: boolean;
  nodes: string[];
  error?: string;
} {
  if (rawParam === undefined || rawParam === null || rawParam === '') {
    return { valid: true, nodes: [] };
  }

  const rawString = Array.isArray(rawParam)
    ? rawParam.map((v) => String(v)).join(',')
    : typeof rawParam === 'string'
    ? rawParam
    : '';

  const parts = rawString
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (parts.length > 100) {
    return {
      valid: false,
      nodes: [],
      error: 'Too many required node names specified (maximum 100).',
    };
  }

  const nodePattern = /^[A-Za-z0-9_ .-]{1,120}$/;
  for (const name of parts) {
    if (!nodePattern.test(name)) {
      return {
        valid: false,
        nodes: [],
        error: `Invalid node class name "${name}". Node names may only contain alphanumeric characters, underscores, spaces, dots, and hyphens.`,
      };
    }
  }

  return {
    valid: true,
    nodes: Array.from(new Set(parts)),
  };
}

function formatComfyFetchError(
  err: unknown,
  baseUrl: string,
  endpoint: string,
  timeoutMs: number
): string {
  if (err && typeof err === 'object') {
    const anyErr = err as { name?: string; message?: string; cause?: { code?: string; message?: string } };
    if (anyErr.name === 'AbortError' || anyErr.message?.includes('timed out')) {
      return `Request to ComfyUI (${baseUrl}${endpoint}) timed out after ${timeoutMs}ms. Verify ComfyUI Desktop is running and responsive.`;
    }
    const causeCode = anyErr.cause?.code;
    if (causeCode === 'ECONNREFUSED') {
      return `Connection refused by ${baseUrl}${endpoint} (ECONNREFUSED). Ensure ComfyUI Desktop is running and check the port configured in COMFYUI_BASE_URL.`;
    }
    if (causeCode === 'ENOTFOUND') {
      return `Host not found for ${baseUrl}${endpoint} (ENOTFOUND). Check the hostname in COMFYUI_BASE_URL.`;
    }
    if (causeCode === 'ECONNRESET' || causeCode === 'EPIPE') {
      return `Connection to ${baseUrl}${endpoint} was reset (${causeCode}).`;
    }
    if (typeof anyErr.message === 'string' && anyErr.message.length > 0) {
      if (anyErr.message.includes('ECONNREFUSED')) {
        return `Connection refused by ${baseUrl}${endpoint} (ECONNREFUSED). Ensure ComfyUI Desktop is running and check the port in COMFYUI_BASE_URL.`;
      }
      return `Failed to reach ComfyUI at ${baseUrl}${endpoint}: ${anyErr.message}`;
    }
  }
  return `Failed to connect to ComfyUI at ${baseUrl}${endpoint}.`;
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number,
  fetchImpl: FetchLike
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `ComfyUI returned HTTP ${response.status} (${response.statusText || 'Error'}) from ${url}.`,
      };
    }

    const rawText = await response.text();
    try {
      const parsed = JSON.parse(rawText);
      return { ok: true, data: parsed };
    } catch {
      return {
        ok: false,
        error: `ComfyUI at ${url} returned invalid JSON.`,
      };
    }
  } catch (err: unknown) {
    const parsedUrl = new URL(url);
    return {
      ok: false,
      error: formatComfyFetchError(
        err,
        `${parsedUrl.protocol}//${parsedUrl.host}`,
        parsedUrl.pathname,
        timeoutMs
      ),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Queries GET {baseUrl}/system_stats and normalizes the response using only fields
 * actually returned by ComfyUI.
 */
export async function fetchComfyStatus(
  rawBaseUrl: string | undefined,
  options?: { timeoutMs?: number; fetchImpl?: FetchLike }
): Promise<ComfyStatusResponse> {
  const checkedAt = new Date().toISOString();
  const validation = validateComfyBaseUrl(rawBaseUrl);
  if (!validation.valid) {
    return {
      connected: false,
      baseUrl: validation.normalizedUrl,
      serverVersion: null,
      system: null,
      devices: [],
      checkedAt,
      error: validation.error,
    };
  }

  const baseUrl = validation.normalizedUrl;
  const timeoutMs = options?.timeoutMs ?? 4000;
  const fetchImpl = options?.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);

  const result = await fetchJsonWithTimeout(
    `${baseUrl}/system_stats`,
    timeoutMs,
    fetchImpl
  );

  if (!result.ok) {
    return {
      connected: false,
      baseUrl,
      serverVersion: null,
      system: null,
      devices: [],
      checkedAt,
      error: result.error,
    };
  }

  const payload = result.data;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      connected: false,
      baseUrl,
      serverVersion: null,
      system: null,
      devices: [],
      checkedAt,
      error: `Unexpected /system_stats payload structure from ${baseUrl}/system_stats (expected a JSON object).`,
    };
  }

  const record = payload as Record<string, unknown>;
  const rawSystem = record.system;
  const rawDevices = record.devices;

  if (
    (!rawSystem || typeof rawSystem !== 'object' || Array.isArray(rawSystem)) &&
    !Array.isArray(rawDevices)
  ) {
    return {
      connected: false,
      baseUrl,
      serverVersion: null,
      system: null,
      devices: [],
      checkedAt,
      error: `Unexpected /system_stats response from ${baseUrl}: missing "system" and "devices" fields.`,
    };
  }

  const systemObj =
    rawSystem && typeof rawSystem === 'object' && !Array.isArray(rawSystem)
      ? (rawSystem as Record<string, unknown>)
      : null;

  const devicesArr = Array.isArray(rawDevices)
    ? rawDevices.filter(
        (d): d is Record<string, unknown> =>
          Boolean(d) && typeof d === 'object' && !Array.isArray(d)
      )
    : [];

  let serverVersion: string | null = null;
  if (systemObj) {
    if (typeof systemObj.comfyui_version === 'string') {
      serverVersion = systemObj.comfyui_version;
    } else if (typeof systemObj.version === 'string') {
      serverVersion = systemObj.version;
    }
  }

  return {
    connected: true,
    baseUrl,
    serverVersion,
    system: systemObj,
    devices: devicesArr,
    checkedAt,
  };
}

/**
 * Queries GET {baseUrl}/queue and returns the actual running and pending queues.
 */
export async function fetchComfyQueue(
  rawBaseUrl: string | undefined,
  options?: { timeoutMs?: number; fetchImpl?: FetchLike }
): Promise<ComfyQueueResponse> {
  const checkedAt = new Date().toISOString();
  const validation = validateComfyBaseUrl(rawBaseUrl);
  if (!validation.valid) {
    return {
      connected: false,
      baseUrl: validation.normalizedUrl,
      queueRunning: [],
      queuePending: [],
      runningCount: 0,
      pendingCount: 0,
      checkedAt,
      error: validation.error,
    };
  }

  const baseUrl = validation.normalizedUrl;
  const timeoutMs = options?.timeoutMs ?? 4000;
  const fetchImpl = options?.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);

  const result = await fetchJsonWithTimeout(
    `${baseUrl}/queue`,
    timeoutMs,
    fetchImpl
  );

  if (!result.ok) {
    return {
      connected: false,
      baseUrl,
      queueRunning: [],
      queuePending: [],
      runningCount: 0,
      pendingCount: 0,
      checkedAt,
      error: result.error,
    };
  }

  const payload = result.data;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      connected: false,
      baseUrl,
      queueRunning: [],
      queuePending: [],
      runningCount: 0,
      pendingCount: 0,
      checkedAt,
      error: `Unexpected /queue payload structure from ${baseUrl}/queue.`,
    };
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.queue_running) && !Array.isArray(record.queue_pending)) {
    return {
      connected: false,
      baseUrl,
      queueRunning: [],
      queuePending: [],
      runningCount: 0,
      pendingCount: 0,
      checkedAt,
      error: `Unexpected /queue response from ${baseUrl}: missing "queue_running" and "queue_pending" arrays.`,
    };
  }

  const queueRunning = Array.isArray(record.queue_running)
    ? record.queue_running
    : [];
  const queuePending = Array.isArray(record.queue_pending)
    ? record.queue_pending
    : [];

  return {
    connected: true,
    baseUrl,
    queueRunning,
    queuePending,
    runningCount: queueRunning.length,
    pendingCount: queuePending.length,
    checkedAt,
  };
}

const CANDIDATE_SCHEMA_NODES = [
  'LTXV23ModelsLoader',
  'CheckpointLoaderSimple',
  'UNETLoader',
  'EmptyLTXVLatentVideo',
  'EmptyLatentImage',
  'AnimateDiffCameraPacingController',
  'LTXVConditioning',
  'KSampler',
  'SamplerCustom',
  'VertiNodeDynamicLoRAStack',
  'VertiNodeCharacterSheetMapper',
  'VertiNodeSilentVisemeLipSync',
  'VertiNodeSubtitleVideoCombine',
];

const NON_PRIMITIVE_COMFY_TYPES = new Set([
  'MODEL',
  'CLIP',
  'VAE',
  'CONDITIONING',
  'LATENT',
  'IMAGE',
  'MASK',
  'CONTROL_NET',
  'SAMPLER',
  'SIGMAS',
  'GUIDER',
  'NOISE',
]);

/**
 * Extracts required/optional input names, safe primitive/combo defaults, and output types
 * from a single ComfyUI /object_info node definition entry.
 */
export function extractNodeSchemaSummary(
  classType: string,
  rawDef: unknown
): ComfyNodeSchemaSummary | null {
  if (!rawDef || typeof rawDef !== 'object' || Array.isArray(rawDef)) {
    return null;
  }
  const defObj = rawDef as Record<string, unknown>;
  const rawInput =
    defObj.input && typeof defObj.input === 'object' && !Array.isArray(defObj.input)
      ? (defObj.input as Record<string, unknown>)
      : {};

  const rawRequired =
    rawInput.required &&
    typeof rawInput.required === 'object' &&
    !Array.isArray(rawInput.required)
      ? (rawInput.required as Record<string, unknown>)
      : {};

  const rawOptional =
    rawInput.optional &&
    typeof rawInput.optional === 'object' &&
    !Array.isArray(rawInput.optional)
      ? (rawInput.optional as Record<string, unknown>)
      : {};

  const requiredInputs = Object.keys(rawRequired);
  const optionalInputs = Object.keys(rawOptional);
  const inputDefaults: Record<string, unknown> = {};

  const extractDefaultFromSpec = (spec: unknown): unknown => {
    if (!Array.isArray(spec) || spec.length === 0) return undefined;
    const typeOrOptions = spec[0];
    const configObj =
      spec.length > 1 &&
      spec[1] &&
      typeof spec[1] === 'object' &&
      !Array.isArray(spec[1])
        ? (spec[1] as Record<string, unknown>)
        : null;

    if (configObj && 'default' in configObj && configObj.default !== undefined) {
      return configObj.default;
    }

    if (Array.isArray(typeOrOptions) && typeOrOptions.length > 0) {
      const firstChoice = typeOrOptions[0];
      if (
        typeof firstChoice === 'string' ||
        typeof firstChoice === 'number' ||
        typeof firstChoice === 'boolean'
      ) {
        return firstChoice;
      }
    }

    if (typeof typeOrOptions === 'string') {
      const upper = typeOrOptions.toUpperCase();
      if (NON_PRIMITIVE_COMFY_TYPES.has(upper)) {
        return undefined;
      }
      if (upper === 'INT') return 1;
      if (upper === 'FLOAT') return 1.0;
      if (upper === 'STRING') return '';
      if (upper === 'BOOLEAN') return true;
    }

    return undefined;
  };

  for (const [key, spec] of Object.entries(rawRequired)) {
    const defVal = extractDefaultFromSpec(spec);
    if (defVal !== undefined) {
      inputDefaults[key] = defVal;
    }
  }
  for (const [key, spec] of Object.entries(rawOptional)) {
    const defVal = extractDefaultFromSpec(spec);
    if (defVal !== undefined && !(key in inputDefaults)) {
      inputDefaults[key] = defVal;
    }
  }

  const returnTypes = Array.isArray(defObj.output)
    ? defObj.output.map((t) => String(t))
    : [];

  return {
    classType,
    requiredInputs,
    optionalInputs,
    inputDefaults,
    returnTypes,
  };
}

/**
 * Queries GET {baseUrl}/object_info and returns a summary of installed node classes
 * along with exact missing node detection and input/output schemas for requiredNodes.
 */
export async function fetchComfyObjectInfo(
  rawBaseUrl: string | undefined,
  requiredNodes: string[] = [],
  options?: { timeoutMs?: number; fetchImpl?: FetchLike }
): Promise<ComfyObjectInfoResponse> {
  const checkedAt = new Date().toISOString();
  const validation = validateComfyBaseUrl(rawBaseUrl);
  if (!validation.valid) {
    return {
      connected: false,
      baseUrl: validation.normalizedUrl,
      installedCount: 0,
      installedNodes: [],
      requiredNodes,
      presentNodes: [],
      missingNodes: [...requiredNodes],
      nodeSchemas: {},
      checkedAt,
      error: validation.error,
    };
  }

  const baseUrl = validation.normalizedUrl;
  const timeoutMs = options?.timeoutMs ?? 6000;
  const fetchImpl = options?.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);

  const result = await fetchJsonWithTimeout(
    `${baseUrl}/object_info`,
    timeoutMs,
    fetchImpl
  );

  if (!result.ok) {
    return {
      connected: false,
      baseUrl,
      installedCount: 0,
      installedNodes: [],
      requiredNodes,
      presentNodes: [],
      missingNodes: [...requiredNodes],
      nodeSchemas: {},
      checkedAt,
      error: result.error,
    };
  }

  const payload = result.data;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      connected: false,
      baseUrl,
      installedCount: 0,
      installedNodes: [],
      requiredNodes,
      presentNodes: [],
      missingNodes: [...requiredNodes],
      nodeSchemas: {},
      checkedAt,
      error: `Unexpected /object_info payload structure from ${baseUrl}/object_info.`,
    };
  }

  const record = payload as Record<string, unknown>;
  const installedNodes = Object.keys(record).sort();
  const installedSet = new Set(installedNodes);

  const presentNodes = requiredNodes.filter((n) => installedSet.has(n));
  const missingNodes = requiredNodes.filter((n) => !installedSet.has(n));

  const schemaTargets = Array.from(
    new Set([...requiredNodes, ...CANDIDATE_SCHEMA_NODES])
  );
  const nodeSchemas: Record<string, ComfyNodeSchemaSummary> = {};
  for (const className of schemaTargets) {
    if (installedSet.has(className)) {
      const summary = extractNodeSchemaSummary(className, record[className]);
      if (summary) {
        nodeSchemas[className] = summary;
      }
    }
  }

  return {
    connected: true,
    baseUrl,
    installedCount: installedNodes.length,
    installedNodes,
    requiredNodes,
    presentNodes,
    missingNodes,
    nodeSchemas,
    checkedAt,
  };
}
