import { AgentPlanResponse, MacroAction, ActionType } from './types';

const VALID_ACTION_TYPES: ReadonlySet<ActionType> = new Set([
  'click',
  'fill',
  'select',
  'press',
  'scroll',
  'wait',
  'request_vision_crop',
]);

export function parseAgentPlanResponse(rawText: string): AgentPlanResponse {
  let cleaned = rawText.trim();

  // Strip Markdown code blocks if present
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3).trim();
    }
  }

  // Find first { and last } to tolerate surrounding commentary
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Response is not an object');
    }

    const obj = parsed as Record<string, unknown>;
    const thought = typeof obj.thought === 'string' ? obj.thought : '';
    const complete = typeof obj.complete === 'boolean' ? obj.complete : false;
    const actionsRaw = Array.isArray(obj.actions) ? obj.actions : [];

    const actions: MacroAction[] = [];
    for (const item of actionsRaw) {
      if (typeof item !== 'object' || item === null) continue;
      const rec = item as Record<string, unknown>;
      const rawType = String(rec.type);
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

    return {
      thought,
      actions,
      complete,
      rawResponse: rawText,
    };
  } catch (err) {
    return {
      thought: `Failed to parse structured plan: ${err instanceof Error ? err.message : String(err)}`,
      actions: [],
      complete: false,
      rawResponse: rawText,
    };
  }
}
