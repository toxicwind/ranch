/**
 * tack — sovereign provider wire-data authority.
 *
 * Single source of truth for provider wire data across the estate:
 * base URLs, key env vars, auth schemes, /models endpoint adapters.
 * Tau's catalog consumes PROVIDER_DEFS via packages/catalog/src/compat/tack.ts.
 *
 * Contract: ranch-tack/live-catalog/v1
 */

export interface TackProviderDef {
	name: string;
	keyEnv: string;
	keyEnvAlt?: string;
	auth?: string;
	baseUrl?: string;
}

export const PROVIDER_DEFS: readonly TackProviderDef[] = [
	{ name: "cerebras", keyEnv: "CEREBRAS_API_KEY" },
	{ name: "google", keyEnv: "GEMINI_API_KEY", keyEnvAlt: "GOOGLE_API_KEY" },
	{ name: "groq", keyEnv: "GROQ_API_KEY" },
	{ name: "mistral", keyEnv: "MISTRAL_API_KEY" },
	{ name: "nvidia", keyEnv: "NVIDIA_API_KEY" },
	{ name: "openrouter", keyEnv: "OPENROUTER_API_KEY" },
	{ name: "abliteration", keyEnv: "ABLITERATION_API_KEY" },
	{ name: "aiand", keyEnv: "AIAND_API_KEY" },
	{ name: "aimlapi", keyEnv: "AIMLAPI_API_KEY" },
	{ name: "anthropic", keyEnv: "ANTHROPIC_API_KEY" },
	{ name: "baseten", keyEnv: "BASETEN_API_KEY" },
	{ name: "commandcode", keyEnv: "COMMANDCODE_API_KEY" },
	{ name: "coreweave", keyEnv: "COREWEAVE_API_KEY" },
	{ name: "deepinfra", keyEnv: "DEEPINFRA_API_KEY" },
	{ name: "deepseek", keyEnv: "DEEPSEEK_API_KEY" },
	{ name: "firepass", keyEnv: "FIREPASS_API_KEY" },
	{ name: "fireworks", keyEnv: "FIREWORKS_API_KEY" },
	{ name: "huggingface", keyEnv: "HF_TOKEN", keyEnvAlt: "HUGGINGFACE_API_KEY" },
	{ name: "meta", keyEnv: "META_API_KEY" },
	{ name: "minimax", keyEnv: "MINIMAX_API_KEY" },
	{ name: "moonshot", keyEnv: "MOONSHOT_API_KEY" },
	{ name: "nanogpt", keyEnv: "NANOGPT_API_KEY" },
	{ name: "novita", keyEnv: "NOVITA_API_KEY" },
	{ name: "openai", keyEnv: "OPENAI_API_KEY" },
	{ name: "qianfan", keyEnv: "QIANFAN_API_KEY" },
	{ name: "sakana", keyEnv: "SAKANA_API_KEY" },
	{ name: "siliconflow", keyEnv: "SILICONFLOW_API_KEY" },
	{ name: "stepfun", keyEnv: "STEPFUN_API_KEY" },
	{ name: "synthetic", keyEnv: "SYNTHETIC_API_KEY" },
	{ name: "together", keyEnv: "TOGETHER_API_KEY" },
	{ name: "typesafe", keyEnv: "TYPESAFE_API_KEY" },
	{ name: "venice", keyEnv: "VENICE_API_KEY" },
	{ name: "xai", keyEnv: "XAI_API_KEY" },
	{ name: "xiaomi", keyEnv: "XIAOMI_API_KEY" },
	{ name: "zai", keyEnv: "ZAI_API_KEY" },
	{ name: "zenmux", keyEnv: "ZENMUX_API_KEY" },
];
