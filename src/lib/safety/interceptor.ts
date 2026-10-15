import { MacroAction } from '../llm/types';

export type ActionSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SafetyCheckResult {
  isDestructive: boolean;
  severity: ActionSeverity;
  reason?: string;
  actionDescription?: string;
}

const DESTRUCTIVE_PATTERNS = [
  // Deletion
  /\b(delete|remove|erase|clear all|destroy|drop)\b/i,
  // Financial / Purchasing
  /\b(buy now|purchase|pay|place order|order now|checkout|charge|subscribe|transfer)\b/i,
  // Form Submission / Communication
  /\b(send message|send email|submit payment|confirm order|post comment|publish)\b/i,
];

export function classifyActionSafety(
  action: MacroAction,
  elementText = '',
  elementType = ''
): SafetyCheckResult {
  const combinedContext = `${elementText} ${elementType} ${action.value ?? ''}`.trim();

  // 1. Check for Financial / Purchasing (Critical severity)
  if (/\b(buy now|purchase|pay|place order|checkout|charge|confirm order)\b/i.test(combinedContext)) {
    return {
      isDestructive: true,
      severity: 'critical',
      reason: `Financial transaction detected: "${combinedContext.slice(0, 50)}"`,
      actionDescription: `Execute payment or checkout action: ${action.type} [${action.id ?? 'target'}]`,
    };
  }

  // 2. Check for Deletion (High severity)
  if (/\b(delete|remove|erase|clear all|destroy|drop)\b/i.test(combinedContext)) {
    return {
      isDestructive: true,
      severity: 'high',
      reason: `Destructive deletion action detected: "${combinedContext.slice(0, 50)}"`,
      actionDescription: `Permanently delete or remove resource: ${action.type} [${action.id ?? 'target'}]`,
    };
  }

  // 3. Check for Outgoing Communication / Publish (Medium severity)
  if (/\b(send message|send email|post comment|publish|confirm transfer)\b/i.test(combinedContext)) {
    return {
      isDestructive: true,
      severity: 'medium',
      reason: `External communication or publishing action detected: "${combinedContext.slice(0, 50)}"`,
      actionDescription: `Publish or send external message: ${action.type} [${action.id ?? 'target'}]`,
    };
  }

  // 4. Check for Form Submits if explicitly labeled submit
  if (
    elementType === 'submit' ||
    (/\bsubmit\b/i.test(elementText) && action.type === 'click')
  ) {
    return {
      isDestructive: true,
      severity: 'low',
      reason: `Form submission detected: "${elementText.slice(0, 40)}"`,
      actionDescription: `Submit form via ${action.type}`,
    };
  }

  return {
    isDestructive: false,
    severity: 'low',
  };
}
