/**
 * Drover Expert Profiles
 */
import { ModelDefinition, ModelRegistry } from '../models/registry';

export interface ExpertProfile {
  id: string;
  label: string;
  icon: string;
  description: string;
  color: string;
  scoringWeights: {
    coding?: number;
    reasoning?: number;
    writing?: number;
    learning?: number;
    security?: number;
    speed?: number;
    [key: string]: number | undefined;
  };
  systemPrompt: string;
  autoDetectKeywords: string[];
}

export const EXPERT_PROFILES: ExpertProfile[] = [
  {
    id: 'general',
    label: 'General Assistant',
    icon: '💬',
    description: 'Fast, responsive assistant for daily programming tasks',
    color: '#64748b',
    scoringWeights: { speed: 0.6, learning: 0.2, writing: 0.2 },
    systemPrompt: 'You are Drover, a high-performance autonomous AI coding companion.',
    autoDetectKeywords: []
  },
  {
    id: 'coding',
    label: 'Coding & Architecture',
    icon: '💻',
    description: 'Deep software engineering, refactoring, and AST analysis',
    color: '#2563eb',
    scoringWeights: { coding: 0.5, reasoning: 0.35, speed: 0.15 },
    systemPrompt: 'You are an elite software architect and senior systems engineer.',
    autoDetectKeywords: ['refactor', 'function', 'class', 'bug', 'typescript', 'rust', 'c++', 'algorithm']
  },
  {
    id: 'security',
    label: 'Security & Forensics',
    icon: '🛡️',
    description: 'Vulnerability assessment, exploit analysis, and secure code review',
    color: '#e11d48',
    scoringWeights: { security: 0.5, reasoning: 0.35, coding: 0.15 },
    systemPrompt: 'You are a principal application security engineer and binary analyst.',
    autoDetectKeywords: ['vulnerability', 'exploit', 'injection', 'cve', 'buffer overflow', 'audit']
  },
  {
    id: 'learning',
    label: 'Education & Walkthrough',
    icon: '📚',
    description: 'Clear analogies, interactive tutorials, and concept breakdowns',
    color: '#10b981',
    scoringWeights: { learning: 0.5, writing: 0.3, reasoning: 0.2 },
    systemPrompt: 'You are a skilled technical mentor making complex topics accessible.',
    autoDetectKeywords: ['explain', 'teach me', 'tutorial', 'how does', 'eli5', 'overview']
  }
];

export interface ModelRecommendation {
  model: ModelDefinition;
  rank: number;
  score: number;
  reason: string;
}

export class ExpertEngine {
  constructor(private registry: ModelRegistry) {}

  getProfile(id: string): ExpertProfile | undefined {
    return EXPERT_PROFILES.find(p => p.id === id);
  }

  detectProfile(prompt: string): ExpertProfile {
    const lower = prompt.toLowerCase();
    for (const p of EXPERT_PROFILES) {
      if (p.autoDetectKeywords.some(kw => lower.includes(kw))) {
        return p;
      }
    }
    return EXPERT_PROFILES[0]; // General default
  }

  recommend(expertId: string, limit: number = 3): ModelRecommendation[] {
    const profile = this.getProfile(expertId) || EXPERT_PROFILES[0];
    const available = this.registry.getAvailable();

    const scored = available.map(model => {
      let score = 0;
      for (const [k, weight] of Object.entries(profile.scoringWeights)) {
        const val = model.capabilities[k] ?? 5;
        score += val * (weight ?? 0);
      }
      return { model, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s, idx) => ({
      model: s.model,
      rank: idx + 1,
      score: Math.round(s.score * 100) / 100,
      reason: `Matched ${profile.label} profile capabilities with score ${s.score.toFixed(2)}`
    }));
  }
}
