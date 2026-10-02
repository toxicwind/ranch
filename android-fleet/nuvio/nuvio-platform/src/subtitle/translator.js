/**
 * Subtitle Translator — OpenRouter-powered subtitle translation.
 * Integrates SubMaker pipeline into the webOS app.
 */

const DEFAULT_ENDPOINT = "http://localhost:8080/translate";
const DEFAULT_MODEL = "inclusionai/ling-3.0-flash:free";
const CHUNK_SIZE = 12000;
const TIMEOUT = 720000;

export class SubtitleTranslator {
  constructor(config = {}) {
    this.endpoint = config.endpoint || DEFAULT_ENDPOINT;
    this.apiKey = config.apiKey || "";
    this.model = config.model || DEFAULT_MODEL;
    this.sourceLangs = config.sourceLangs || ["chi", "ara", "cze"];
    this.targetLang = config.targetLang || "eng";
    this.cache = new Map();
  }

  async translate(srtContent, options = {}) {
    const cacheKey = this._hash(srtContent + options.targetLang);
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    const chunks = this._chunkSRT(srtContent, CHUNK_SIZE);
    const results = [];

    for (const chunk of chunks) {
      const translated = await this._translateChunk(chunk, options);
      results.push(translated);
    }

    const merged = this._mergeSRT(results);
    this.cache.set(cacheKey, merged);
    return merged;
  }

  async _translateChunk(chunk, options) {
    const body = {
      model: this.model,
      messages: [
        {
          role: "system",
          content: `You are a professional subtitle translator. Translate to ${options.targetLang || this.targetLang}. Preserve timestamps and formatting exactly.`
        },
        { role: "user", content: chunk }
      ],
      temperature: 0.4,
      max_tokens: 32768
    };

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "X-Source-Langs": this.sourceLangs.join(",")
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT)
    });

    if (!res.ok) throw new Error(`Translation failed: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  _chunkSRT(content, maxChars) {
    const blocks = content.split(/

/);
    const chunks = [];
    let current = "";
    for (const block of blocks) {
      if (current.length + block.length > maxChars) {
        chunks.push(current.trim());
        current = block;
      } else {
        current += "\n\n" + block;
      }
    }
    if (current) chunks.push(current.trim());
    return chunks;
  }

  _mergeSRT(chunks) {
    return chunks.join("\n\n");
  }

  _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return String(h);
  }
}
