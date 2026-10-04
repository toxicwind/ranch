import { TASK } from "./taskDefinition";

export async function callModel(model: string, apiKey: string): Promise<{ ok: boolean; ttftMs: number; totalMs: number; tokensPerS: number; text: string; err: string; promptTok: number; compTok: number }> {
  const t0 = Date.now();
  let ttft = -1;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/toxicwind/sovereign-projects",
      "X-Title": "realworld-bench",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: TASK }],
      stream: true,
      max_tokens: 512,
      temperature: 0.0,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, ttftMs: -1, totalMs: Date.now() - t0, tokensPerS: 0, text: "", err: `HTTP ${res.status} ${body.slice(0, 200)}`, promptTok: 0, compTok: 0 };
  }
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let promptTok = 0, compTok = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        const chunk = j.choices?.[0]?.delta?.content;
        if (chunk) text += chunk;
        if (j.usage) { promptTok = j.usage.prompt_tokens ?? 0; compTok = j.usage.completion_tokens ?? 0; }
      } catch { /* partial line */ }
    }
  }
  const totalMs = Date.now() - t0;
  const tokensPerS = compTok > 0 && totalMs > 0 ? (compTok / (totalMs / 1000)) : 0;
  return { ok: true, ttftMs: ttft, totalMs, tokensPerS, text, err: "", promptTok, compTok };
}
