import { AgentPlanResponse, MacroAction, ActionType } from './types';

const VALID_ACTION_TYPES: ReadonlySet<ActionType> = new Set([
  'click',
  'fill',
  'select',
  'press',
  'scroll',
  'wait',
  'request_vision_crop',
  'navigate',
  'go_back',
]);

/**
 * Cleans and repairs common LLM JSON formatting flaws:
 * - Trailing commas before } or ]
 * - Smart quotes / curly quotes
 * - JavaScript comments
 */
function cleanJsonString(str: string): string {
  return str
    // Normalize unicode smart quotes to ASCII
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    // Remove single-line comments // ... without breaking URLs (e.g. http://, https://)
    .replace(/(?<!:)\/\/[^\n\r]*/g, '')
    // Remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

export function parseAgentPlanResponse(rawText: string): AgentPlanResponse {
  const trimmedRaw = (rawText ?? '').trim();
  if (!trimmedRaw) {
    return {
      thought: 'Empty response received from model.',
      actions: [],
      complete: false,
      rawResponse: rawText,
    };
  }

  // 1. Try markdown fenced code block extraction anywhere in the text
  let jsonCandidate = '';
  const codeBlockMatch = trimmedRaw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    jsonCandidate = codeBlockMatch[1].trim();
  } else {
    jsonCandidate = trimmedRaw;
  }

  // 2. Find first { and last } to isolate the JSON object from surrounding commentary
  const startIdx = jsonCandidate.indexOf('{');
  const endIdx = jsonCandidate.lastIndexOf('}');

  // 3. Fallback: If no JSON braces exist, the model responded in plain text (e.g. safety notice, policy, or direct answer)
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return {
      thought: trimmedRaw,
      actions: [],
      complete: true, // Treat direct conversational text or safety notice as completed outcome
      rawResponse: rawText,
    };
  }

  // Isolate substring
  const isolated = jsonCandidate.substring(startIdx, endIdx + 1);

  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(isolated);
    } catch {
      const cleaned = cleanJsonString(isolated);
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Secondary attempt: try repairing unclosed braces if truncated
        const repaired = cleaned.endsWith('}') ? cleaned : cleaned + '}';
        parsed = JSON.parse(cleanJsonString(repaired));
      }
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Response is not an object');
    }

    const obj = parsed as Record<string, unknown>;
    const thought = typeof obj.thought === 'string' ? obj.thought : '';
    let complete = false;

    if (typeof obj.complete === 'boolean') {
      complete = obj.complete;
    } else if (typeof obj.complete === 'string') {
      complete = obj.complete.trim().toLowerCase() === 'true';
    } else if (typeof (obj as any).done === 'boolean') {
      complete = (obj as any).done;
    } else if (typeof (obj as any).done === 'string') {
      complete = (obj as any).done.trim().toLowerCase() === 'true';
    } else if (typeof (obj as any).finished === 'boolean') {
      complete = (obj as any).finished;
    } else if (typeof (obj as any).status === 'string') {
      const s = (obj as any).status.toLowerCase();
      complete = s === 'completed' || s === 'complete' || s === 'done';
    }

    const actionsRaw = Array.isArray(obj.actions) ? obj.actions : [];
    const actions: MacroAction[] = [];

    for (const item of actionsRaw) {
      if (typeof item !== 'object' || item === null) continue;
      const rec = item as Record<string, unknown>;
      const rawType = String(rec.type ?? '').trim().toLowerCase();
      if (!VALID_ACTION_TYPES.has(rawType as ActionType)) continue;

      const act: MacroAction = {
        type: rawType as ActionType,
      };

      if (typeof rec.id === 'number') {
        act.id = rec.id;
      } else if (typeof rec.id === 'string' && !isNaN(Number(rec.id))) {
        act.id = Number(rec.id);
      }

      if (typeof rec.value === 'string') {
        act.value = rec.value;
      }

      if (typeof rec.stop_if_url_changes === 'boolean') {
        act.stop_if_url_changes = rec.stop_if_url_changes;
      }

      actions.push(act);
    }

    // Heuristic: If model provided 0 actions and thought explicitly states completion, treat as complete
    if (!complete && actions.length === 0 && thought.length > 0) {
      const lowerThought = thought.toLowerCase();
      const completionKeywords = [
        'task complete',
        'task is complete',
        'goal achieved',
        'goal is achieved',
        'goal completed',
        'completed the task',
        'finished the task',
        'found the answer',
        'here is the answer',
        'successfully finished',
        'no further action',
        'all steps completed',
      ];
      if (completionKeywords.some((kw) => lowerThought.includes(kw))) {
        complete = true;
      }
    }

    return {
      thought,
      actions,
      complete,
      rawResponse: rawText,
    };
  } catch {
    // Graceful recovery: If JSON parsing failed despite containing braces,
    // extract any thought string via regex or return trimmed text directly rather than crashing
    const thoughtMatch = rawText.match(/"thought"\s*:\s*"([^"]+)"/i);
    const recoveredThought = thoughtMatch ? thoughtMatch[1] : trimmedRaw;

    return {
      thought: recoveredThought,
      actions: [],
      complete: true,
      rawResponse: rawText,
    };
  }
}
