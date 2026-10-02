/**
 * Deduplicator — aggressive multi-group dedup with smartDetect.
 * Ported from AIOStreams deduplicator config.
 */

export class Deduplicator {
  constructor(config = {}) {
    this.keys = config.keys || ["filename", "infoHash", "smartDetect"];
    this.multiGroupBehaviour = config.multiGroupBehaviour || "aggressive";
    this.smartDetectAttributes = config.smartDetectAttributes || [
      "size",
      "resolution",
      "quality",
      "visualTags",
      "audioTags",
      "audioChannels",
      "languages",
      "encode",
      "edition",
      "network",
      "remastered",
      "bitrate",
      "releaseGroup",
    ];
    this.smartDetectRounding = config.smartDetectRounding || 10;
    this.libraryBehaviour = config.libraryBehaviour || "prefer";
  }

  deduplicate(streams) {
    const groups = new Map();
    for (const stream of streams) {
      const key = this._makeKey(stream);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(stream);
    }

    const result = [];
    for (const [, group] of groups) {
      if (group.length === 1) {
        result.push(group[0]);
        continue;
      }
      const picked = this._pickFromGroup(group);
      result.push(picked);
    }
    return result;
  }

  _makeKey(stream) {
    const parts = [];
    for (const key of this.keys) {
      if (key === "filename") parts.push(stream.filename || stream.title || "");
      else if (key === "infoHash") parts.push(stream.infoHash || "");
      else if (key === "smartDetect") parts.push(this._smartKey(stream));
    }
    return parts.join("::");
  }

  _smartKey(stream) {
    const attrs = [];
    for (const attr of this.smartDetectAttributes) {
      let val = stream[attr];
      if (val === undefined || val === null) val = "";
      if (typeof val === "number" && attr === "size") {
        val =
          Math.round(val / this.smartDetectRounding) * this.smartDetectRounding;
      }
      attrs.push(`${attr}=${val}`);
    }
    return attrs.join("|");
  }

  _pickFromGroup(group) {
    // Prefer library sources
    const library = group.find((s) => s.source === "library" || s.fromLibrary);
    if (library && this.libraryBehaviour === "prefer") return library;

    // Prefer cached debrid
    const cached = group.find((s) => s.cached && s.type === "debrid");
    if (cached) return cached;

    // Prefer highest resolution
    const resOrder = ["2160p", "1080p", "720p", "480p"];
    for (const res of resOrder) {
      const match = group.find((s) => s.resolution === res);
      if (match) return match;
    }

    return group[0];
  }
}

export function createDefaultDeduplicator() {
  return new Deduplicator({
    keys: ["filename", "infoHash", "smartDetect"],
    multiGroupBehaviour: "aggressive",
    smartDetectAttributes: [
      "size",
      "resolution",
      "quality",
      "visualTags",
      "audioTags",
      "audioChannels",
      "languages",
      "encode",
      "edition",
      "network",
      "remastered",
      "bitrate",
      "releaseGroup",
    ],
    smartDetectRounding: 10,
    libraryBehaviour: "prefer",
  });
}
