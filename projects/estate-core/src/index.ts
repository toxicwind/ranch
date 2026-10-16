export interface EstateConfig {
  nimApiKey: string;
  brevoApiKey: string;
  brevoOrgId: string;
  nimBaseUrl: string;
}

export function loadConfig(): EstateConfig {
  return {
    nimApiKey: process.env.NIM_API_KEY ?? "",
    brevoApiKey: process.env.BREVO_API_KEY ?? "",
    brevoOrgId: process.env.BREVO_ORG_ID ?? "",
    nimBaseUrl: process.env.NIM_BASE_URL ?? "http://127.0.0.1:25193/v1",
  };
}

export function isConfigured(cfg: EstateConfig): boolean {
  return Boolean(cfg.nimApiKey && cfg.brevoApiKey && cfg.brevoOrgId);
}
