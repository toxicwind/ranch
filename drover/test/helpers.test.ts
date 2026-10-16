import { describe, it, expect } from 'bun:test';
import {
  normalizeToolMessages,
  parseDurationSeconds,
  estimateTokens,
  trimContext,
  ChatMessage
} from '../src/util/helpers';

describe('Helpers & Utilities', () => {
  it('should normalize tool messages for OpenAI compatibility', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'tool', name: 'search', content: 'results' },
      {
        role: 'assistant',
        content: 'I will use a tool',
        tool_calls: [
          { function: { name: 'calc', arguments: '{"x": 1}' } }
        ]
      }
    ];

    const normalized = normalizeToolMessages(messages);
    expect(normalized[1].role).toBe('user');
    expect(normalized[1].content).toContain('[Tool Output for "search"]');
    expect(normalized[2].content).toContain('<use_tool>');
    expect(normalized[2].content).toContain('<name>calc</name>');
    expect(normalized[2].tool_calls).toBeUndefined();
  });

  it('should parse duration strings properly', () => {
    expect(parseDurationSeconds('10s')).toBe(10);
    expect(parseDurationSeconds('2m')).toBe(120);
    expect(parseDurationSeconds('1h')).toBe(3600);
    expect(parseDurationSeconds('500ms')).toBe(1);
    expect(parseDurationSeconds('1m30s')).toBe(90);
    expect(parseDurationSeconds('42')).toBe(42);
    expect(parseDurationSeconds('invalid')).toBe(0);
  });

  it('should estimate tokens accurately', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: '12345678' } // 8 chars -> 2 tokens
    ];
    expect(estimateTokens(msgs)).toBe(2);
  });

  it('should trim context without dropping system messages', () => {
    const msgs: ChatMessage[] = [
      { role: 'system', content: 'SysPrompt' }, // 9 chars -> 3 tokens
      { role: 'user', content: 'Old message 1234567890' },
      { role: 'assistant', content: 'Old reply 1234567890' },
      { role: 'user', content: 'Recent prompt' }
    ];

    // Restrict max tokens so older non-system messages get trimmed
    const trimmed = trimContext(msgs, 10);
    expect(trimmed[0].role).toBe('system');
    expect(trimmed[trimmed.length - 1].content).toBe('Recent prompt');
    expect(trimmed.length).toBeLessThan(msgs.length);
  });
});
