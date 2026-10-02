/**
 * SEL Engine — Stream Expression Language evaluator.
 * Ported from AIOStreams SEL v2.6.1 Tamtaro config.
 */

const RESOLUTION_ORDER = [
  "2160p",
  "1440p",
  "1080p",
  "720p",
  "576p",
  "480p",
  "360p",
  "240p",
  "144p",
  "Unknown",
];
const QUALITY_ORDER = [
  "BluRay REMUX",
  "BluRay",
  "WEB-DL",
  "WEBRip",
  "HDRip",
  "HC HD-Rip",
  "DVDRip",
  "HDTV",
  "SCR",
  "TC",
  "TS",
  "CAM",
  "Unknown",
];
const VISUAL_TAG_ORDER = [
  "HDR+DV",
  "DV",
  "HDR10+",
  "HDR10",
  "HDR",
  "HLG",
  "10bit",
  "SDR",
  "IMAX",
  "AI",
];
const AUDIO_TAG_ORDER = [
  "Atmos",
  "DTS:X",
  "TrueHD",
  "DTS-HD MA",
  "FLAC",
  "DTS-HD",
  "DTS-ES",
  "DTS",
  "DD+",
  "DD",
  "OPUS",
  "AAC",
];

export class SELEngine {
  constructor(config = {}) {
    this.excludedResolutions = config.excludedResolutions || [];
    this.preferredResolutions = config.preferredResolutions || RESOLUTION_ORDER;
    this.excludedQualities = config.excludedQualities || [];
    this.preferredQualities = config.preferredQualities || QUALITY_ORDER;
    this.excludedVisualTags = config.excludedVisualTags || [];
    this.preferredVisualTags = config.preferredVisualTags || VISUAL_TAG_ORDER;
    this.excludedAudioTags = config.excludedAudioTags || [];
    this.preferredAudioTags = config.preferredAudioTags || AUDIO_TAG_ORDER;
    this.requiredLanguages = config.requiredLanguages || [
      "English",
      "Original",
      "Dual Audio",
      "Multi",
    ];
    this.excludedStreamExpressions = config.excludedStreamExpressions || [];
    this.requiredStreamExpressions = config.requiredStreamExpressions || [];
  }

  filter(streams) {
    return streams
      .filter((s) => this._passesResolution(s))
      .filter((s) => this._passesQuality(s))
      .filter((s) => this._passesVisualTags(s))
      .filter((s) => this._passesAudioTags(s))
      .filter((s) => this._passesLanguage(s))
      .filter((s) => this._passesExcludedExpressions(s))
      .filter((s) => this._passesRequiredExpressions(s));
  }

  sort(streams) {
    return streams.sort((a, b) => {
      const resA = this.preferredResolutions.indexOf(a.resolution);
      const resB = this.preferredResolutions.indexOf(b.resolution);
      if (resA !== resB) return resA - resB;

      const qualA = this.preferredQualities.indexOf(a.quality);
      const qualB = this.preferredQualities.indexOf(b.quality);
      if (qualA !== qualB) return qualA - qualB;

      const visA = this._visualTagScore(a);
      const visB = this._visualTagScore(b);
      if (visA !== visB) return visB - visA;

      const audA = this._audioTagScore(a);
      const audB = this._audioTagScore(b);
      if (audA !== audB) return audB - audA;

      return 0;
    });
  }

  _passesResolution(s) {
    return !this.excludedResolutions.includes(s.resolution);
  }

  _passesQuality(s) {
    return !this.excludedQualities.includes(s.quality);
  }

  _passesVisualTags(s) {
    const tags = s.visualTags || [];
    return !tags.some((t) => this.excludedVisualTags.includes(t));
  }

  _passesAudioTags(s) {
    const tags = s.audioTags || [];
    return !tags.some((t) => this.excludedAudioTags.includes(t));
  }

  _passesLanguage(s) {
    const langs = s.languages || [];
    return this.requiredLanguages.some(
      (rl) => langs.includes(rl) || langs.includes("Unknown"),
    );
  }

  _passesExcludedExpressions(s) {
    // Simplified: run excluded SEL expressions
    for (const expr of this.excludedStreamExpressions) {
      if (expr.enabled && this._evalExpression(expr.expression, s)) {
        return false;
      }
    }
    return true;
  }

  _passesRequiredExpressions(s) {
    for (const expr of this.requiredStreamExpressions) {
      if (expr.enabled && !this._evalExpression(expr.expression, s)) {
        return false;
      }
    }
    return true;
  }

  _evalExpression(expr, stream) {
    // Placeholder: full SEL parser would be recursive descent
    // For coverage, we handle common patterns
    if (expr.includes("isAnime") && !stream.isAnime) return false;
    if (
      expr.includes("originalLanguage == 'Japanese'") &&
      stream.originalLanguage !== "Japanese"
    )
      return false;
    return true;
  }

  _visualTagScore(s) {
    const tags = s.visualTags || [];
    return tags.reduce(
      (sum, t) =>
        sum +
        (this.preferredVisualTags.indexOf(t) !== -1
          ? this.preferredVisualTags.indexOf(t)
          : 0),
      0,
    );
  }

  _audioTagScore(s) {
    const tags = s.audioTags || [];
    return tags.reduce(
      (sum, t) =>
        sum +
        (this.preferredAudioTags.indexOf(t) !== -1
          ? this.preferredAudioTags.indexOf(t)
          : 0),
      0,
    );
  }
}

export function createDefaultEngine() {
  return new SELEngine({
    excludedResolutions: [],
    preferredResolutions: RESOLUTION_ORDER,
    excludedQualities: [],
    preferredQualities: QUALITY_ORDER,
    excludedVisualTags: ["3D", "H-OU", "H-SBS"],
    preferredVisualTags: VISUAL_TAG_ORDER,
    excludedAudioTags: [],
    preferredAudioTags: AUDIO_TAG_ORDER,
    requiredLanguages: [
      "English",
      "Original",
      "Dual Audio",
      "Multi",
      "Dubbed",
      "Unknown",
    ],
    excludedStreamExpressions: [
      {
        expression: "/*Bad 4k Anime*/ isAnime && resolution=='2160p'",
        enabled: true,
      },
      {
        expression:
          "/*Upscaled 4k*/ quality!='Bluray REMUX' && resolution=='2160p'",
        enabled: true,
      },
    ],
    requiredStreamExpressions: [],
  });
}
