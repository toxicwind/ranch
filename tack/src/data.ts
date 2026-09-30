/**
 * Canonical provider data — the single source of truth for the estate.
 *
 * Reconciled 2026-09-30 from:
 * - tools/sovereign-router/sovereign-router-ts/router_config.ts
 *   (PROVIDERS, PROVIDER_MODELS, CODING, DEAD_MODEL_IDS)
 * - projects/range/ranch/stockyard/herd/internal/astmatrix/providers.go
 *   (defaultProviders, codingAlias)
 *
 * Reconciliation notes (newer audit wins on conflict):
 * - openrouter seeds: TS 2026-09-21 sweep (4 verified) ∪ herd 2026-07-28
 *   list minus openai/gpt-oss-20b:free (delisted 2026-09-21 → deadIds).
 * - nvidia seeds: TS 12 (superset of herd's minus meta/llama-3.3-70b-instruct,
 *   EOL 2026-08-26 → deadIds). Herd gains nemotron-3-nano-omni-30b-a3b-reasoning.
 * - groq seeds: identical in both (6); the 4 verified-dead 2026-09-30 stay
 *   in seeds but are filtered by deadIds everywhere (cold start included).
 * - llama-swap seeds: the canonical stable role names. The TS router
 *   overlays its runtime LOCAL_ROLES (best-models.json) at catalog build;
 *   herd serves these names directly.
 * - mistral: baseUrl WITHOUT the /v1 segment; the mistral adapter appends
 *   /v1/models via the default modelsPath. (The old `${base}/models`
 *   composition would have produced /v1/models correctly only by accident
 *   of the hardcoded base; the package composes it explicitly.)
 * - google: configured against the v1beta/openai compat endpoint, so the
 *   adapter is "openai". The native "google-v1beta" adapter exists for
 *   providers that stop using /openai.
 * - kimi-auto: static ["kimi-auto"] — the shim's virtual model is the whole
 *   list (adapter "none" would wrongly demote the seed after one refresh).
 * - nim-local / kimi-auto are TS-router-local concepts (local proxy + shim);
 *   marked routerLocal: true — herd and other consumers skip them by flag,
 *   no name denylist.
 * - keyEnvAlt for nvidia is NVIDIA_API_KEYS (TS multi-key pool, the live
 *   semantic). Herd previously used NVIDIA_NIM_API_KEY as its alt.
 * - aliases: union of TS CODING + herd codingAlias, restricted to pairs
 *   whose provider is one of the 9 core defs. Excluded: strategy
 *   directives (auto/fcm/free → null, router-local), runtime-dynamic
 *   local-role aliases (router-local overlays), aliases pointing at
 *   deadIds (nim-llama-3.3-70b, gpt-oss-20b — removed by the TS 2026-09-21
 *   sweep), and extended-registry aliases (opencode, xai-*, mimo-auto,
 *   perplexity-sonar, together-llama-3.3 — they belong to herd's registry
 *   layer, which stays in registry.go).
 * - Conflict resolutions (newer TS audit wins): nemotron-nano and
 *   nim-nemotron-nano point at the nvidia reasoning model, not the
 *   openrouter :free form.
 *
 * CONTRACT:
 * - `seeds` are cold-start data only (served pre-discovery, inert after).
 * - Membership of the live set is owned by discovery, never by this file.
 * - `deadIds` is the permanent EOL tier. Everything else prunes via
 *   quarantine (serve-404 or vanished-from-live-listing x2).
 */
import type { ModelAlias, ProviderDef } from "./types.ts";

export const PROVIDER_DEFS: ProviderDef[] = [
  {
    name: "llama-swap",
    displayName: "llama-swap (local)",
    baseUrl: "http://127.0.0.1:25100/v1",
    keyEnv: "LLAMA_SWAP_API_KEY",
    auth: "none",
    adapter: "openai",
    seeds: ["local-fast", "local-quality", "local-longctx"],
  },
  {
    name: "nim-local",
    displayName: "NIM proxy (local)",
    baseUrl: "http://127.0.0.1:8000/v1",
    keyEnv: "NIM_PROXY_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: [],
    routerLocal: true,
  },
  {
    name: "kimi-auto",
    displayName: "kimi-auto shim",
    baseUrl: "http://127.0.0.1:25105/v1",
    keyEnv: "KIMI_AUTO_SHIM_KEY",
    auth: "none",
    adapter: "static",
    staticModels: ["kimi-auto"],
    seeds: ["kimi-auto"],
    routerLocal: true,
  },
  {
    name: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: [
      "poolside/laguna-xs-2.1:free",
      "google/gemma-4-31b-it:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "inclusionai/ling-3.0-flash-fin:free",
      "google/gemma-4-26b-a4b-it:free",
      "nvidia/nemotron-3-nano-30b-a3b:free",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      "nvidia/nemotron-nano-12b-v2-vl:free",
      "nvidia/nemotron-nano-9b-v2:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "poolside/laguna-s-2.1:free",
      "cohere/north-mini-code:free",
      "inclusionai/ling-3.0-flash:free",
    ],
  },
  {
    name: "nvidia",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyEnv: "NVIDIA_API_KEY",
    keyEnvAlt: "NVIDIA_API_KEYS",
    auth: "bearer",
    adapter: "openai",
    seeds: [
      "nvidia/nemotron-3-super-120b-a12b",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      "nvidia/nemotron-3-nano-30b-a3b",
      "meta/llama-3.1-70b-instruct",
      "qwen/qwen3.5-397b-a17b",
      "qwen/qwen3.5-122b-a10b",
      "deepseek-ai/deepseek-v4-flash",
      "deepseek-ai/deepseek-v4-pro",
      "mistralai/mistral-large-3-675b-instruct-2512",
      "google/gemma-4-31b-it",
      "z-ai/glm-5.2",
      "thinkingmachines/inkling",
    ],
  },
  {
    name: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: [
      "llama-3.3-70b-versatile",
      "qwen/qwen3-32b",
      "qwen/qwen3.6-27b",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "meta-llama/llama-4-scout-17b-16e-instruct",
    ],
  },
  {
    name: "cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    keyEnv: "CEREBRAS_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: [],
  },
  {
    name: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GOOGLE_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: [
      "models/gemini-2.5-flash",
      "models/gemini-2.5-flash-lite",
      "models/gemini-2.0-flash",
      "models/gemma-4-31b-it",
    ],
  },
  {
    name: "mistral",
    baseUrl: "https://api.mistral.ai",
    keyEnv: "MISTRAL_API_KEY",
    auth: "bearer",
    adapter: "mistral",
    seeds: [
      "mistral-small-latest",
      "codestral-latest",
      "mistral-large-latest",
      "mistral-medium-latest",
    ],
  },
  {
    name: "openai",
    baseUrl: "https://api.openai.com/v1",
    keyEnv: "OPENAI_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["gpt-5.5", "gpt-5.5-mini", "gpt-5.4", "daybreak-blue-latest"],
  },
  {
    name: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    keyEnv: "ANTHROPIC_API_KEY",
    auth: "x-api-key",
    headerName: "x-api-key",
    adapter: "openai",
    seeds: ["claude-opus-5-5", "claude-sonnet-5", "claude-fable-5"],
  },
  {
    name: "deepseek",
    baseUrl: "https://api.deepseek.com",
    keyEnv: "DEEPSEEK_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["deepseek-v4-pro", "deepseek-v4-flash"],
  },
  {
    name: "xai",
    baseUrl: "https://api.x.ai/v1",
    keyEnv: "XAI_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["grok-4.6", "grok-4.5"],
  },
  {
    name: "together",
    baseUrl: "https://api.together.xyz/v1",
    keyEnv: "TOGETHER_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["moonshotai/Kimi-K2.7-Code", "deepseek-ai/DeepSeek-V4-Flash"],
  },
  {
    name: "fireworks",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    keyEnv: "FIREWORKS_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["kimi-k2.7-code", "accounts/fireworks/models/glm-5.2-fast"],
  },
  {
    name: "deepinfra",
    baseUrl: "https://api.deepinfra.com/v1/openai",
    keyEnv: "DEEPINFRA_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["deepseek-ai/DeepSeek-V4-Flash-0731", "deepseek-ai/DeepSeek-V4.1-Flash"],
  },
  {
    name: "moonshot",
    baseUrl: "https://api.moonshot.ai/v1",
    keyEnv: "MOONSHOT_API_KEY",
    keyEnvAlt: "KIMI_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["kimi-k2.7-code", "kimi-k2.6"],
  },
  {
    name: "siliconflow",
    baseUrl: "https://api.siliconflow.com/v1",
    keyEnv: "SILICONFLOW_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["zai-org/GLM-5.1", "deepseek-ai/DeepSeek-V4-Flash"],
  },
  {
    name: "siliconflow-cn",
    baseUrl: "https://api.siliconflow.cn/v1",
    keyEnv: "SILICONFLOW_CN_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: [],
  },
  {
    name: "novita",
    baseUrl: "https://api.novita.ai/openai/v1",
    keyEnv: "NOVITA_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["moonshotai/kimi-k2.7-code"],
  },
  {
    name: "venice",
    baseUrl: "https://api.venice.ai/api/v1",
    keyEnv: "VENICE_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["llama-3.3-70b"],
  },
  {
    name: "nanogpt",
    baseUrl: "https://nano-gpt.com/api/v1",
    keyEnv: "NANO_GPT_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["openai/gpt-5.5"],
  },
  {
    name: "aimlapi",
    baseUrl: "https://api.aimlapi.com/v1",
    keyEnv: "AIMLAPI_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["gpt-5.5-2026-04-23"],
  },
  {
    name: "huggingface",
    baseUrl: "https://router.huggingface.co/v1",
    keyEnv: "HUGGINGFACE_HUB_TOKEN",
    keyEnvAlt: "HF_TOKEN",
    auth: "bearer",
    adapter: "openai",
    seeds: ["deepseek-ai/DeepSeek-R1"],
  },
  {
    name: "baseten",
    baseUrl: "https://inference.baseten.co/v1",
    keyEnv: "BASETEN_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["moonshotai/Kimi-K2.7-Code"],
  },
  {
    name: "coreweave",
    baseUrl: "https://api.inference.wandb.ai/v1",
    keyEnv: "COREWEAVE_API_KEY",
    keyEnvAlt: "WANDB_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["openai/gpt-oss-120b"],
  },
  {
    name: "zai",
    baseUrl: "https://api.z.ai/api/coding/paas/v4",
    keyEnv: "ZAI_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["glm-5.3", "glm-5.2"],
  },
  {
    name: "zenmux",
    baseUrl: "https://zenmux.ai/api/v1",
    keyEnv: "ZENMUX_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["anthropic/claude-opus-5"],
  },
  {
    name: "synthetic",
    baseUrl: "https://api.synthetic.new/openai/v1",
    keyEnv: "SYNTHETIC_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["hf:zai-org/GLM-5.3-Flash"],
  },
  {
    name: "typesafe",
    baseUrl: "https://api.typesafe.ai",
    keyEnv: "TYPESAFE_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["jev-latest"],
  },
  {
    name: "wafer-serverless",
    baseUrl: "https://pass.wafer.ai/v1",
    keyEnv: "WAFER_SERVERLESS_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["GLM-5.1"],
  },
  {
    name: "xiaomi",
    baseUrl: "https://api.xiaomimimo.com/v1",
    keyEnv: "XIAOMI_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["mimo-v2.5"],
  },
  {
    name: "qianfan",
    baseUrl: "https://qianfan.baidubce.com/v2",
    keyEnv: "QIANFAN_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["deepseek-v3.2"],
  },
  {
    name: "minimax",
    baseUrl: "https://api.minimax.io/v1",
    keyEnv: "MINIMAX_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["MiniMax-M3"],
  },
  {
    name: "gmi-cloud",
    baseUrl: "https://api.gmi-serving.com/v1",
    keyEnv: "GMI_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["deepseek-ai/DeepSeek-V4-Flash"],
  },
  {
    name: "meta",
    displayName: "Meta Model API",
    baseUrl: "https://api.meta.ai/v1",
    keyEnv: "MODEL_API_KEY",
    keyEnvAlt: "META_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["muse-spark-1.1"],
  },
  {
    name: "sakana",
    displayName: "Sakana AI",
    baseUrl: "https://api.sakana.ai/v1",
    keyEnv: "SAKANA_API_KEY",
    keyEnvAlt: "FUGU_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["fugu", "fugu-ultra"],
  },
  {
    name: "stepfun",
    displayName: "StepFun",
    baseUrl: "https://api.stepfun.ai/v1",
    keyEnv: "STEPFUN_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["step-5-preview"],
  },
  {
    name: "abliteration",
    displayName: "Abliteration",
    baseUrl: "https://api.abliteration.ai/v1",
    keyEnv: "ABLITERATION_API_KEY",
    keyEnvAlt: "ABLIT_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["abliterated-model"],
  },
  {
    name: "aiand",
    displayName: "ai&",
    baseUrl: "https://api.aiand.com/v1",
    keyEnv: "AIAND_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["moonshotai/kimi-k2.7-code"],
  },
  {
    name: "cloudflare-ai-gateway",
    displayName: "Cloudflare AI Gateway",
    baseUrl: "https://gateway.ai.cloudflare.com/v1/<account>/<gateway>",
    keyEnv: "CLOUDFLARE_AI_GATEWAY_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: [],
  },
  {
    name: "bedrock-mantle",
    displayName: "Bedrock Mantle",
    baseUrl: "https://bedrock-mantle.{region}.api.aws/openai/v1",
    keyEnv: "AWS_BEARER_TOKEN_BEDROCK",
    auth: "bearer",
    adapter: "openai",
    seeds: ["openai.gpt-5.6-terra"],
  },
  {
    name: "vercel-ai-gateway",
    displayName: "Vercel AI Gateway",
    baseUrl: "https://ai-gateway.vercel.sh",
    keyEnv: "AI_GATEWAY_API_KEY",
    keyEnvAlt: "VERCEL_AI_GATEWAY_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["anthropic/claude-opus-5"],
  },
  {
    name: "ollama-cloud",
    displayName: "Ollama Cloud",
    baseUrl: "https://ollama.com/v1",
    keyEnv: "OLLAMA_CLOUD_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["gpt-oss:120b"],
  },
  {
    name: "charm-hyper",
    displayName: "Charm Hyper",
    baseUrl: "https://hyper.charm.land/v1",
    keyEnv: "CHARM_HYPER_API_KEY",
    keyEnvAlt: "HYPER_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["glm-5.3"],
  },
  {
    name: "commandcode",
    displayName: "Command Code",
    baseUrl: "https://api.commandcode.ai/provider",
    keyEnv: "COMMAND_CODE_API_KEY",
    keyEnvAlt: "COMMANDCODE_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["claude-sonnet-5"],
  },
];

/**
 * MODEL_ALIASES — friendly alias → [provider, model] (UX layer).
 *
 * Union of sovereign-router-ts CODING and herd codingAlias (see header for
 * the exclusion rules). Strategy directives and runtime-dynamic local-role
 * aliases stay router-local overlays.
 */
export const MODEL_ALIASES: Record<string, ModelAlias> = {
  ling: ["openrouter", "inclusionai/ling-3.0-flash-fin:free"],
  "ling-flash": ["openrouter", "inclusionai/ling-3.0-flash:free"],
  "laguna-xs": ["openrouter", "poolside/laguna-xs-2.1:free"],
  "laguna-s": ["openrouter", "poolside/laguna-s-2.1:free"],
  "gemma4-31b": ["openrouter", "google/gemma-4-31b-it:free"],
  "gemma4-26b": ["openrouter", "google/gemma-4-26b-a4b-it:free"],
  "nemotron-super": ["openrouter", "nvidia/nemotron-3-super-120b-a12b:free"],
  "nemotron-nano": ["nvidia", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"],
  "nemotron-ultra": ["openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free"],
  "nemotron-omni": [
    "openrouter",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  ],
  "north-mini": ["openrouter", "cohere/north-mini-code:free"],
  "nim-nemotron-super": ["nvidia", "nvidia/nemotron-3-super-120b-a12b"],
  "nim-nemotron-omni": [
    "nvidia",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  ],
  "nim-nemotron-nano": [
    "nvidia",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  ],
  "nim-llama-3.1-70b": ["nvidia", "meta/llama-3.1-70b-instruct"],
  "nim-qwen3.5-397b": ["nvidia", "qwen/qwen3.5-397b-a17b"],
  "nim-qwen3.5-122b": ["nvidia", "qwen/qwen3.5-122b-a10b"],
  "nim-deepseek-v4-flash": ["nvidia", "deepseek-ai/deepseek-v4-flash"],
  "nim-deepseek-v4-pro": ["nvidia", "deepseek-ai/deepseek-v4-pro"],
  "nim-mistral-large-3": [
    "nvidia",
    "mistralai/mistral-large-3-675b-instruct-2512",
  ],
  "nim-gemma4-31b": ["nvidia", "google/gemma-4-31b-it"],
  "nim-glm5.2": ["nvidia", "z-ai/glm-5.2"],
  "nim-inkling": ["nvidia", "thinkingmachines/inkling"],
  "gemini-2.5-flash": ["google", "models/gemini-2.5-flash"],
  "gemini-2.5-flash-lite": ["google", "models/gemini-2.5-flash-lite"],
  "gemini-2.0-flash": ["google", "models/gemini-2.0-flash"],
  "gemma4-31b-google": ["google", "models/gemma-4-31b-it"],
  "mistral-small": ["mistral", "mistral-small-latest"],
  codestral: ["mistral", "codestral-latest"],
  "mistral-large": ["mistral", "mistral-large-latest"],
  "mistral-medium": ["mistral", "mistral-medium-latest"],
  "groq-llama-3.3-70b": ["groq", "llama-3.3-70b-versatile"],
  "groq-qwen3-32b": ["groq", "qwen/qwen3-32b"],
  "groq-qwen3.6-27b": ["groq", "qwen/qwen3.6-27b"],
  "groq-gpt-oss-120b": ["groq", "openai/gpt-oss-120b"],
  "groq-gpt-oss-20b": ["groq", "openai/gpt-oss-20b"],
  "groq-llama-4-scout": ["groq", "meta-llama/llama-4-scout-17b-16e-instruct"],
};

/**
 * DEAD_MODEL_IDS — permanent EOL tier. Never served, never re-admitted.
 *
 * - NVIDIA 410-retired (EOL dates from the retirement notices, 2026-09-21).
 * - OpenRouter-delisted (verified against the public /models list 2026-09-21).
 * - Groq 404-verified (live re-verification 2026-09-30).
 */
export const DEAD_MODEL_IDS: string[] = [
  // NVIDIA-retired (410).
  "moonshotai/kimi-k2-instruct", // EOL 2026-05-12
  "meta/llama-3.1-8b-instruct", // EOL 2026-08-26
  "meta-llama/llama-3.1-8b-instruct", // EOL 2026-08-26 (openrouter form)
  "meta/llama-3.3-70b-instruct", // EOL 2026-08-26
  "meta-llama/llama-3.3-70b-instruct", // EOL 2026-08-26 (openrouter form)
  "meta-llama/llama-3.3-70b-instruct:free", // EOL 2026-08-26 (:free form)
  // OpenRouter-delisted (2026-09-21).
  "tencent/hy3:free",
  "poolside/laguna-m.1:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "qwen/qwen3-coder:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "openai/gpt-oss-20b:free",
  // Groq 404-verified (2026-09-30).
  "llama-3.3-70b-versatile",
  "qwen/qwen3-32b",
  "qwen/qwen3.6-27b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];
