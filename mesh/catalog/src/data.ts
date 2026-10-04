/**
 * Canonical provider data — the single source of truth for the estate.
 *
 * Reconciled 2026-09-30 from:
 * - ranch/mesh/router/sovereign-router/sovereign-router-ts/router_config.ts
 *   (PROVIDERS, PROVIDER_MODELS, CODING, DEAD_MODEL_IDS)
 * - ranch/mesh/router/herd/internal/astmatrix/providers.go
 *   (defaultProviders, codingAlias)
 *
 * Reconciliation notes (newer audit wins on conflict):
 * - openrouter seeds: TS 2026-09-21 sweep (4 verified) ∪ herd 2026-07-28
 *   list minus openai/gpt-oss-20b:free (delisted 2026-09-21 → deadIds).
 * - nvidia seeds: TS 12 (superset of herd's minus meta/llama-3.3-70b-instruct,
 *   EOL 2026-08-26 → deadIds). Herd gains nemotron-3-nano-omni-30b-a3b-reasoning.
 * - groq seeds: identical in both (6); the 4 verified-dead 2026-09-30 stay
 *   in seeds but are filtered by deadIds everywhere (cold start included).
 * - herd seeds: the canonical stable role names. The TS router
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
    name: "herd",
    displayName: "herd (local)",
    baseUrl: "http://127.0.0.1:25100/v1",
    keyEnv: "HERD_API_KEY",
    auth: "none",
    adapter: "openai",
    seeds: ["local-fast", "local-quality", "local-longctx"],
  },
  {
    name: "nebius",
    displayName: "Nebius",
    baseUrl: "https://api.studio.nebius.com/v1",
    keyEnv: "NEBIUS_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models 401s without a key (verified live 2026-09-30) — GPU cloud
    // token API. Model list unknowable without a key; seeds empty.
    seeds: [],
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
    // 2026-10-02: :25105 is mesh-front/prometheus, not kimi-auto -- the kimi-auto alias-shim is :25153 (200 on /v1/models).
    baseUrl: "http://127.0.0.1:25153/v1",
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
      "qwen/qwen3.8-27b:free",
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
    contextLengths: {
      "cohere/north-mini-code:free": 128000,
      "google/gemma-4-26b-a4b-it:free": 1000000,
      "google/gemma-4-31b-it:free": 1000000,
      "inclusionai/ling-3.0-flash-fin:free": 256000,
      "inclusionai/ling-3.0-flash:free": 256000,
      "nvidia/nemotron-3-nano-30b-a3b:free": 256000,
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": 256000,
      "nvidia/nemotron-3-super-120b-a12b:free": 500000,
      "nvidia/nemotron-3-ultra-550b-a55b:free": 1000000,
      "nvidia/nemotron-nano-12b-v2-vl:free": 256000,
      "nvidia/nemotron-nano-9b-v2:free": 256000,
      "poolside/laguna-s-2.1:free": 256000,
      "poolside/laguna-xs-2.1:free": 256000
    },
  },
  {
    name: "nvidia",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyEnv: "NVIDIA_API_KEY",
    keyEnvAlt: "NVIDIA_API_KEYS",
    auth: "bearer",
    adapter: "openai",
    // Seeds are the entitlement-verified working set (2026-10-03
    // audit of integrate.api.nvidia.com: 81 catalog models probed
    // across all account keys, 7 return real completions). The
    // removed seeds are entitlement-gated (404 "Function not found
    // for account") or dead/hanging on every key.
    seeds: [
      "nvidia/nemotron-3-super-120b-a12b",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "z-ai/glm-5.3-flash",
      "deepseek-ai/deepseek-v4.1-flash",
      "openai/gpt-oss-20b",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      "z-ai/glm-5.3",
    ],
    contextLengths: {
      "deepseek-ai/deepseek-v4.1-flash": 256000,
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": 256000,
      "nvidia/nemotron-3-super-120b-a12b": 500000,
      "nvidia/nemotron-3-ultra-550b-a55b": 1000000,
      "openai/gpt-oss-20b": 128000,
      "z-ai/glm-5.3": 200000,
      "z-ai/glm-5.3-flash": 200000
    },
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
    contextLengths: {
      "llama-3.3-70b-versatile": 128000,
      "meta-llama/llama-4-scout-17b-16e-instruct": 1000000,
      "openai/gpt-oss-120b": 128000,
      "openai/gpt-oss-20b": 128000,
      "qwen/qwen3-32b": 128000,
      "qwen/qwen3.6-27b": 128000
    },
  },
  {
    name: "bitdeer",
    displayName: "Bitdeer AI",
    baseUrl: "https://api-inference.bitdeer.ai/v1",
    keyEnv: "BITDEER_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models 401s without a key (verified live 2026-09-30) — real endpoint.
    // Seeds from Bitdeer's own docs (developers.bitdeer.ai) + community spot
    // checks. Catalog: GLM, Kimi, Qwen, MiniMax, Nemotron, DeepSeek, MiMo.
    seeds: [
      "zai-org/GLM-5.3-Flash",
      "deepseek-ai/DeepSeek-V4.1-Flash",
      "deepseek-ai/DeepSeek-V4-Flash",
      "Qwen/Qwen3.8-27B",
      "moonshotai/Kimi-K3",
      "moonshotai/Kimi-K2.5",
      "zai-org/GLM-5.3",
      "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B",
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
    // keypool injects one of the six gen-lang-client-0111199472 EAP keys per
    // request and rewrites OpenAI bodies onto the Interactions API, so there is
    // no client credential and no /models endpoint to read. auth "none" +
    // staticModels is the honest shape; the previous keyEnv: GOOGLE_API_KEY
    // named a secret that no longer exists and 401'd every request.
    baseUrl: "http://127.0.0.1:25109/gemini-eap-interactions",
    keyEnv: "",
    auth: "none",
    adapter: "static",
    staticModels: [
      "models/gemini-flash-tool-retrieval",
      "models/gemini-3.8-flash",
      "models/gemini-3.7-flash",
      "models/gemini-3.6-flash",
      "models/gemini-3.5-flash",
      "models/gemini-3.1-pro-preview",
      "models/gemini-3-flash-preview",
      "models/gemini-2.5-flash",
    ],
    seeds: [],
    contextLengths: {
      "models/gemini-flash-tool-retrieval": 1000000,
      "models/gemini-3.8-flash": 1000000,
      "models/gemini-3.7-flash": 1000000,
      "models/gemini-3.6-flash": 1000000,
      "models/gemini-3.5-flash": 1000000,
      "models/gemini-3.1-pro-preview": 1000000,
      "models/gemini-3-flash-preview": 1000000,
      "models/gemini-2.5-flash": 1000000,
    },
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
    contextLengths: {
      "mistral-large-latest": 256000,
      "mistral-medium-latest": 128000,
      "mistral-small-latest": 128000
    },
  },
  {
    name: "openai",
    baseUrl: "https://api.openai.com/v1",
    keyEnv: "OPENAI_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["gpt-5.5", "gpt-5.5-mini", "gpt-5.4", "daybreak-blue-latest", "gpt-5.2-codex", "gpt-5.1-codex-max"],
    contextLengths: {
      "daybreak-blue-latest": 400000,
      "gpt-5.4": 400000,
      "gpt-5.5": 400000,
      "gpt-5.5-mini": 400000,
      "gpt-5.2-codex": 400000,
      "gpt-5.1-codex-max": 400000
    },
  },
  {
    name: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    keyEnv: "ANTHROPIC_API_KEY",
    auth: "x-api-key",
    headerName: "x-api-key",
    adapter: "openai",
    seeds: ["claude-opus-5-5", "claude-sonnet-5", "claude-fable-5", "claude-opus-4-5-20251101", "claude-sonnet-4-5-20250929"],
    contextLengths: {
      "claude-fable-5": 500000,
      "claude-opus-5-5": 1000000,
      "claude-sonnet-5": 1000000,
      "claude-opus-4-5-20251101": 200000,
      "claude-sonnet-4-5-20250929": 200000
    },
  },
  {
    name: "deepseek",
    baseUrl: "https://api.deepseek.com",
    keyEnv: "DEEPSEEK_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: [
      "deepseek-v4.1-flash","deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v3.2-chat"],
    contextLengths: {
      "deepseek-v4-flash": 256000,
      "deepseek-v4-pro": 256000,
      "deepseek-v3.2-chat": 256000
    },
  },
  {
    name: "wandb",
    displayName: "W&B Inference",
    baseUrl: "https://api.inference.wandb.ai/v1",
    keyEnv: "WANDB_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models 401s without a key (verified live 2026-09-30) — serverless
    // inference, $100/mo free-credit tier per free-llm-api-hub. Seeds empty.
    seeds: [],
  },
  {
    name: "xai",
    baseUrl: "https://api.x.ai/v1",
    keyEnv: "XAI_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["grok-4.6", "grok-4.5"],
    contextLengths: {
      "grok-4.5": 2000000,
      "grok-4.6": 2000000
    },
  },
  {
    name: "together",
    baseUrl: "https://api.together.xyz/v1",
    keyEnv: "TOGETHER_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["moonshotai/Kimi-K2.7-Code", "deepseek-ai/DeepSeek-V4-Flash"],
    contextLengths: {
      "deepseek-ai/DeepSeek-V4-Flash": 256000,
      "moonshotai/Kimi-K2.7-Code": 256000
    },
  },
  {
    name: "fireworks",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    keyEnv: "FIREWORKS_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["kimi-k2.7-code", "accounts/fireworks/models/glm-5.2-fast"],
    contextLengths: {
      "accounts/fireworks/models/glm-5.2-fast": 200000,
      "kimi-k2.7-code": 256000
    },
  },
  {
    name: "deepinfra",
    baseUrl: "https://api.deepinfra.com/v1/openai",
    keyEnv: "DEEPINFRA_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["deepseek-ai/DeepSeek-V4-Flash-0731", "deepseek-ai/DeepSeek-V4.1-Flash"],
    contextLengths: {
      "deepseek-ai/DeepSeek-V4-Flash-0731": 256000,
      "deepseek-ai/DeepSeek-V4.1-Flash": 256000
    },
  },
  {
    name: "moonshot",
    baseUrl: "https://api.moonshot.ai/v1",
    keyEnv: "MOONSHOT_API_KEY",
    keyEnvAlt: "KIMI_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["kimi-k2.7-code", "kimi-k2.6", "kimi-k2-thinking"],
    contextLengths: {
      "kimi-k2.6": 256000,
      "kimi-k2.7-code": 256000,
      "kimi-k2-thinking": 256000
    },
  },
  {
    name: "sambanova",
    displayName: "SambaNova",
    baseUrl: "https://api.sambanova.ai/v1",
    keyEnv: "SAMBANOVA_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models lists WITHOUT a key (verified live 2026-09-30); completions
    // need a key. Seeds are the live no-auth listing.
    seeds: [
      "DeepSeek-V3.2",
      "DeepSeek-V3.1",
      "MiniMax-M3",
      "MiniMax-M2.7",
      "Meta-Llama-3.3-70B-Instruct",
      "gemma-4-31B-it",
      "gpt-oss-120b",
    ],
  },
  {
    name: "siliconflow",
    baseUrl: "https://api.siliconflow.com/v1",
    keyEnv: "SILICONFLOW_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["zai-org/GLM-5.1", "deepseek-ai/DeepSeek-V4-Flash"],
    contextLengths: {
      "deepseek-ai/DeepSeek-V4-Flash": 256000,
      "zai-org/GLM-5.1": 200000
    },
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
    name: "typhoon",
    displayName: "Typhoon (SCB 10X)",
    baseUrl: "https://api.opentyphoon.ai/v1",
    keyEnv: "TYPHOON_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models lists WITHOUT a key (verified live 2026-09-30); completions
    // need a key. Free research showcase (Thai LLMs + OCR/ASR). Seeds are the
    // live no-auth listing's chat/OCR models.
    seeds: [
      "typhoon-v2.5-30b-a3b-instruct",
      "typhoon-ocr-v1.5",
      "typhoon-ocr",
      "typhoon-ocr-preview",
    ],
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
    keyEnvAlt: "NANOGPT_API_KEY",
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
    seeds: [
      "glm-5.3-flash","glm-5.3", "glm-5.2"],
  },
  {
    // OpenCode Zen free tier (opencode.ai/zen/v1). Client-identity headers
    // (opencode UA + x-opencode-*) are injected by the strategy layer;
    // see cuttinggate/src/strategy/router_strategy.ts and
    // sovereign-router-ts/router_strategy.ts. Anonymous quota is gated on
    // those headers; Chris-provided OPENCODE_API_KEY via secrets.
    name: "zen",
    baseUrl: "https://opencode.ai/zen/v1",
    keyEnv: "OPENCODE_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["mimo-v2.5-free"],
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
    // 2026-10-02: /models 404s; /v1/models 403s (alive, auth-gated) -- baseUrl needed the /v1.
    baseUrl: "https://api.typesafe.ai/v1",
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
    seeds: [
      "mimo-v2.6-flash","mimo-v2.5"],
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
    name: "chutes",
    displayName: "Chutes",
    baseUrl: "https://inference.chutes.ai/v1",
    keyEnv: "CHUTES_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models 401s without a key (verified live 2026-09-30) — decentralized
    // GPU compute (Bittensor), OpenAI-compatible. Seeds empty until keyed.
    seeds: [],
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
    // 2026-10-02: /models 404s; /v1/models 200s with 406-model open listing -- baseUrl needed the /v1.
    baseUrl: "https://ai-gateway.vercel.sh/v1",
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
    name: "cohere",
    displayName: "Cohere",
    baseUrl: "https://api.cohere.com/compatibility/v1",
    keyEnv: "COHERE_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /compatibility/v1/models 401s without a key (verified live 2026-09-30).
    // Command model IDs are Cohere's stable OpenAI-compat slugs.
    seeds: [
      "command-a",
      "command-r-plus",
      "command-r7b",
    ],
  },
  {
    name: "commandcode",
    displayName: "Command Code",
    // 2026-10-02: /provider/models 404s; /provider/v1/models 200s with 85-model open listing.
    baseUrl: "https://api.commandcode.ai/provider/v1",
    keyEnv: "COMMAND_CODE_API_KEY",
    keyEnvAlt: "COMMANDCODE_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["claude-sonnet-5"],
  },
  {
    name: "firepass",
    displayName: "Fire Pass",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    keyEnv: "FIREPASS_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["glm-5.2-fast"],
  },
  {
    name: "singularityapi-dev",
    displayName: "SingularityAPI",
    baseUrl: "https://api.singularityapi.dev/v1",
    keyEnv: "SINGULARITYAPI_DEV_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["deepseek-v4-flash"],
  },
  {
    name: "singularityapi-tech",
    displayName: "SingularityAPI Tech",
    baseUrl: "https://api.singularityapi.tech/v1",
    keyEnv: "SINGULARITYAPI_TECH_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["deepseek-ai/DeepSeek-V4.1-Flash"],
  },
  {
    name: "hetzner",
    displayName: "Hetzner Inference",
    baseUrl: "https://inference.hetzner.com/api/v1",
    keyEnv: "HETZNER_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /api/v1/models 401s without a key (verified live 2026-09-30) — free
    // experimental endpoint (announced 2026-07-24, experiments.hetzner.com).
    // Model list unknowable without a key; seeds empty per cold-start contract.
    seeds: [],
  },
  {
    name: "hyperbolic",
    displayName: "Hyperbolic",
    baseUrl: "https://api.hyperbolic.xyz/v1",
    keyEnv: "HYPERBOLIC_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["hyperbolic/llama-3.1-70b"],
    contextLengths: {
      "hyperbolic/llama-3.1-70b": 128000
    },
  },
  {
    name: "github",
    displayName: "GitHub Models",
    // 2026-10-02: models.inference.ai.azure.com is DNS-dead; GitHub Models moved to models.github.ai.
    baseUrl: "https://models.github.ai/inference",
    keyEnv: "GITHUB_TOKEN",
    auth: "bearer",
    adapter: "openai",
    seeds: ["github/Phi-4", "github/gpt-4o-mini"],
    contextLengths: {
      "github/Phi-4": 128000,
      "github/gpt-4o-mini": 128000
    },
  },
  {
    name: "ovhcloud",
    displayName: "OVHcloud AI Endpoints",
    baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    keyEnv: "OVHCLOUD_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models lists WITHOUT a key (verified live 2026-09-30). Seeds are
    // the live listing's chat models (TTS/embeddings/STT omitted).
    seeds: [
      "Qwen3.8-27B",
      "Qwen3.6-27B",
      "Qwen3.5-397B-A17B",
      "Qwen3.5-9B",
      "Qwen3-Coder-30B-A3B-Instruct",
      "Meta-Llama-3_3-70B-Instruct",
      "Mistral-7B-Instruct-v0.3",
      "Mistral-Nemo-Instruct-2407",
      "Mistral-Small-3.2-24B-Instruct-2506",
      "gpt-oss-120b",
      "gpt-oss-20b",
      "Qwen2.5-VL-72B-Instruct",
    ],
  },
  {
    name: "parasail",
    displayName: "Parasail",
    baseUrl: "https://api.parasail.io/v1",
    keyEnv: "PARASAIL_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models 401s without a key (verified live 2026-09-30) — serverless
    // GPU deployments, OpenAI-compatible. Seeds empty until keyed.
    seeds: [],
  },
  {
    name: "perplexity",
    displayName: "Perplexity",
    // 2026-10-02: /models 404s; /v1/models 401s (alive, auth-gated) -- baseUrl needed the /v1.
    baseUrl: "https://api.perplexity.ai/v1",
    keyEnv: "PERPLEXITY_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["perplexity/sonar"],
    contextLengths: {
      "perplexity/sonar": 200000
    },
  },
  {
    name: "dashscope",
    displayName: "Alibaba DashScope",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    keyEnv: "DASHSCOPE_API_KEY",
    auth: "bearer",
    adapter: "openai",
    seeds: ["qwen3-coder-plus", "qwen3-coder-flash"],
    contextLengths: {
      "qwen3-coder-plus": 256000,
      "qwen3-coder-flash": 256000
    },
  },
  {
    name: "pzero",
    displayName: "PZERO",
    baseUrl: "https://api.pzero.studio/v1",
    keyEnv: "PZERO_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models lists WITHOUT a key (verified live 2026-10-02, 343 models);
    // completions need a key. Seeds are the live no-auth listing.
    seeds: [
      "kimi-k2-6",
      "kimi-k2-5",
      "llama-3.2-3b",
      "llama-3.3-70b",
      "deepseek-v3.2",
      "deepseek-v4-flash",
      "claude-opus-4-8",
    ],
  },
  {
    name: "sference",
    displayName: "sference",
    baseUrl: "https://api.sference.com/v1",
    keyEnv: "SFERENCE_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models lists WITHOUT a key (verified live 2026-10-02); EU-hosted,
    // three latency tiers. Seeds are the live no-auth listing.
    seeds: [
      "moonshotai/Kimi-K3",
      "zai-org/GLM-5.2",
      "zai-org/GLM-5.3-Flash",
      "zai-org/GLM-5.3",
      "deepseek-ai/DeepSeek-V4-Flash",
    ],
  },
  {
    name: "minara",
    displayName: "Minara Cloud",
    baseUrl: "https://api.minara.ai/v1",
    keyEnv: "MINARA_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models lists WITHOUT a key (verified live 2026-10-02, 125 models);
    // aggregator-style gateway with gateway-side failover.
    seeds: [
      "anthropic/claude-opus-5.5",
      "anthropic/claude-sonnet-5.5",
      "anthropic/claude-fable-5.1",
    ],
  },
  {
    name: "cometapi",
    displayName: "CometAPI",
    baseUrl: "https://api.cometapi.com/v1",
    keyEnv: "COMETAPI_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models 401s without a key (verified live 2026-10-02); 500+ models
    // claimed. Seeds empty until keyed.
    seeds: [],
  },
  {
    name: "inferx",
    displayName: "InferX",
    baseUrl: "https://model.inferx.net/v1",
    keyEnv: "INFERX_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models 401s without a key (verified live 2026-10-02); tenant-scoped
    // keys — adapter must handle tenant context. Seeds empty until keyed.
    seeds: [],
  },
  {
    name: "gpuai",
    displayName: "GPU.ai",
    baseUrl: "https://api.gpu.ai/v1",
    keyEnv: "GPUAI_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models 401s without a key (verified live 2026-10-02); multimodal
    // serverless (chat+image+video+embeddings). Seeds empty until keyed.
    seeds: [],
  },
  {
    name: "corvex",
    displayName: "Corvex Token Factory",
    baseUrl: "https://api.tokenfactory.corvex.cloud/v1",
    keyEnv: "CORVEX_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models lists WITHOUT a key (verified live 2026-10-02, 2 models);
    // completions need a key. Seeds are the live no-auth listing.
    seeds: [
      "deepseek-ai/DeepSeek-V4-Flash-0731",
      "zai-org/GLM-5.3",
    ],
  },
  {
    name: "inferbase",
    displayName: "Inferbase",
    baseUrl: "https://api.inferbase.ai/v1",
    keyEnv: "INFERBASE_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models lists WITHOUT a key (verified live 2026-10-02, 137 models);
    // AI gateway with LLM routing. Seeds are flagship chat IDs from the live listing.
    seeds: [
      "auto",
      "deepseek-v4-flash",
      "deepseek-v4-flash-0731",
      "deepseek-v3-2",
      "zai-glm-5",
      "zai-glm-5-2",
    ],
  },
  {
    name: "onde",
    displayName: "Onde Cloud",
    baseUrl: "https://cloud.ondeinference.com/v1",
    keyEnv: "ONDE_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models lists WITHOUT a key (verified live 2026-10-02, 15 proprietary onde-* models).
    seeds: [
      "onde-large",
      "onde-pro",
      "onde-balanced",
      "onde-fast",
    ],
  },
  {
    name: "inferen",
    displayName: "Inferen",
    baseUrl: "https://inferen.dev/v1",
    keyEnv: "INFEREN_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models 401s without a key (verified live 2026-10-02). Seeds empty until keyed.
    seeds: [],
  },
  {
    name: "runware",
    displayName: "Runware",
    baseUrl: "https://api.runware.ai/v1",
    keyEnv: "RUNWARE_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // /v1/models 401s without a key (verified live 2026-10-02). Seeds empty until keyed.
    seeds: [],
  },
  {
    name: "inception",
    displayName: "Inception Labs",
    baseUrl: "https://api.inceptionlabs.ai/v1",
    keyEnv: "INCEPTION_API_KEY",
    auth: "bearer",
    adapter: "openai",
    // Catch-up flagged by sweep-2: predates the window but verified alive 2026-10-02;
    // /v1/models lists WITHOUT a key (mercury-2, mercury-2.5).
    seeds: [
      "mercury-2",
      "mercury-2.5",
    ],
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
  // google routes to the EAP interactions pool; gemini-2.0-flash,
  // gemini-2.5-flash-lite and gemma-4-31b-it are NOT in that project's model
  // list (verified 2026-10-02 against GET /v1beta/models) and were dropped.
  "gemini-eap": ["google", "models/gemini-flash-tool-retrieval"],
  "gemini-3.8-flash": ["google", "models/gemini-3.8-flash"],
  "gemini-3.7-flash": ["google", "models/gemini-3.7-flash"],
  "gemini-3.6-flash": ["google", "models/gemini-3.6-flash"],
  "gemini-3.5-flash": ["google", "models/gemini-3.5-flash"],
  "gemini-3.1-pro": ["google", "models/gemini-3.1-pro-preview"],
  "gemini-3-flash": ["google", "models/gemini-3-flash-preview"],
  "gemini-2.5-flash": ["google", "models/gemini-2.5-flash"],
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
