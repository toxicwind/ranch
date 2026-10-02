/**
 * Manifest Proxy — intercepts AIOStreams manifest, injects SEL filters,
 * Unicode formatter, and SubMaker subtitle proxy endpoints.
 */

const MANIFEST_VERSION = "1.0.0-alpha";
const DEFAULT_TIMEOUT = 5000;

export class ManifestProxy {
  constructor(baseUrl, secretKey) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.secretKey = secretKey;
    this.cache = new Map();
    this.hooks = [];
  }

  addHook(fn) {
    this.hooks.push(fn);
  }

  async fetchManifest(userId = "default") {
    const cacheKey = `manifest:${userId}`;
    if (this.cache.has(cacheKey)) {
      const { ts, data } = this.cache.get(cacheKey);
      if (Date.now() - ts < 30000) return data;
    }

    const url = `${this.baseUrl}/stremio/${userId}/manifest.json`;
    const res = await fetch(url, {
      headers: { "X-Secret": this.secretKey },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });
    if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
    let manifest = await res.json();

    // Run hooks (SEL injection, formatter, subtitle proxy)
    for (const hook of this.hooks) {
      manifest = await hook(manifest, userId);
    }

    this.cache.set(cacheKey, { ts: Date.now(), data: manifest });
    return manifest;
  }

  async fetchStream(meta, userId = "default") {
    const url = `${this.baseUrl}/stremio/${userId}/stream/${meta.type}/${meta.id}.json`;
    const res = await fetch(url, {
      headers: { "X-Secret": this.secretKey },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });
    if (!res.ok) throw new Error(`Stream fetch failed: ${res.status}`);
    return res.json();
  }

  clearCache() {
    this.cache.clear();
  }
}

export function injectSubtitleProxy(manifest, proxyUrl) {
  if (!manifest.subtitles) manifest.subtitles = [];
  manifest.subtitles.push({
    id: "toxicwind-submaker",
    url: `${proxyUrl}/subtitles/{id}`,
    type: "subtitles",
  });
  return manifest;
}

export function injectP2PTracker(manifest, trackerUrl) {
  if (!manifest.behaviorHints) manifest.behaviorHints = {};
  manifest.behaviorHints.p2pTracker = trackerUrl;
  return manifest;
}
