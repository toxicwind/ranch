/**
 * Drover Utilities & Helper Functions
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

/**
 * Normalizes tool messages for OpenAI-compatible providers that do not
 * natively support the tool role.
 */
export function normalizeToolMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(msg => {
    const copy = { ...msg };
    if (copy.role === 'tool') {
      copy.role = 'user';
      copy.content = `[Tool Output for "${copy.name || 'tool'}"]:\n${copy.content}`;
      copy.tool_call_id = undefined;
      copy.name = undefined;
    } else if (copy.role === 'assistant') {
      if (copy.tool_calls && copy.tool_calls.length > 0) {
        let tag = '';
        for (const call of copy.tool_calls) {
          tag += `\n\n<use_tool>\n<name>${call.function?.name}</name>\n<arguments>\n${call.function?.arguments}\n</arguments>\n</use_tool>`;
        }
        if (copy.content) {
          if (!copy.content.includes('<use_tool>')) {
            copy.content += tag;
          }
        } else {
          copy.content = tag.trim();
        }
      }
      copy.tool_calls = undefined;
    }
    return copy;
  });
}

/**
 * Parses duration strings like 10s, 5m, 1h into seconds.
 */
export function parseDurationSeconds(val: string): number {
  const s = val.trim().toLowerCase();
  const match = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?$/);
  if (match && (match[1] || match[2] || match[3] || match[4])) {
    let secs = 0;
    if (match[1]) secs += parseInt(match[1], 10) * 3600;
    if (match[2]) secs += parseInt(match[2], 10) * 60;
    if (match[3]) secs += parseFloat(match[3]);
    if (match[4]) secs += parseFloat(match[4]) / 1000;
    return Math.ceil(secs);
  }
  const f = parseFloat(s);
  return Number.isNaN(f) ? 0 : Math.ceil(f);
}

/**
 * Estimates token count based on typical character length heuristic (~4 chars/token).
 */
export function estimateTokens(messages: ChatMessage[]): number {
  let charCount = 0;
  for (const m of messages) {
    charCount += (m.content || '').length;
  }
  return Math.ceil(charCount / 4);
}

/**
 * Trims context messages to fit within maximum allowed safe input tokens.
 */
export function trimContext(
  messages: ChatMessage[],
  maxTokens: number
): ChatMessage[] {
  const systemMsgs = messages.filter(m => m.role === 'system');
  const otherMsgs = messages.filter(m => m.role !== 'system');
  const res: ChatMessage[] = [];
  let currentTokens = estimateTokens(systemMsgs);

  for (let i = otherMsgs.length - 1; i >= 0; i--) {
    const msg = otherMsgs[i];
    const tok = estimateTokens([msg]);
    if (currentTokens + tok > maxTokens && res.length > 0) {
      break;
    }
    res.unshift(msg);
    currentTokens += tok;
  }

  return [...systemMsgs, ...res];
}
