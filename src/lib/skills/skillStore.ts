import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ActionTrace } from '../executor/macroExecutor';
import { MacroAction } from '../llm/types';
import { LLMRouter } from '../llm/router';

export interface CompiledSkillStep {
  action: 'click' | 'fill' | 'select' | 'press' | 'scroll' | 'wait';
  selector?: string;
  value?: string;
  stop_if_url_changes?: boolean;
}

export interface SiteSkill {
  id: string;
  hostname: string;
  pathnamePattern: string;
  goalPattern: string;
  steps: CompiledSkillStep[];
  tokenSavings: number;
  timesExecuted: number;
  createdAt: number;
  updatedAt: number;
}

interface OrbitSkillDB extends DBSchema {
  skills: {
    key: string;
    value: SiteSkill;
    indexes: {
      'by-hostname': string;
    };
  };
}

const DB_NAME = 'orbit_agent_skills_db';
const DB_VERSION = 1;

export class SkillStore {
  private dbPromise: Promise<IDBPDatabase<OrbitSkillDB>> | null = null;

  private async getDB(): Promise<IDBPDatabase<OrbitSkillDB>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<OrbitSkillDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('skills')) {
            const store = db.createObjectStore('skills', { keyPath: 'id' });
            store.createIndex('by-hostname', 'hostname');
          }
        },
      });
    }
    return this.dbPromise;
  }

  async saveSkill(skill: SiteSkill): Promise<void> {
    const db = await this.getDB();
    await db.put('skills', skill);
  }

  async getSkill(id: string): Promise<SiteSkill | undefined> {
    const db = await this.getDB();
    return db.get('skills', id);
  }

  async listSkills(): Promise<SiteSkill[]> {
    const db = await this.getDB();
    return db.getAll('skills');
  }

  async deleteSkill(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete('skills', id);
  }

  async recordSkillExecution(id: string): Promise<void> {
    const db = await this.getDB();
    const skill = await db.get('skills', id);
    if (skill) {
      skill.timesExecuted += 1;
      skill.updatedAt = Date.now();
      await db.put('skills', skill);
    }
  }

  /**
   * Matches current tab URL and user goal against compiled skills in IndexedDB.
   * If matched, returns the skill for 0-token deterministic execution.
   */
  async findMatchingSkill(url: string, goal: string): Promise<SiteSkill | null> {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const pathname = parsedUrl.pathname.toLowerCase();
      const normalizedGoal = goal.toLowerCase().trim();

      const db = await this.getDB();
      const skills = await db.getAllFromIndex('skills', 'by-hostname', hostname);

      for (const skill of skills) {
        // Pathname pattern match (wildcard support)
        const pattern = skill.pathnamePattern.replace(/\*/g, '.*');
        const pathRegex = new RegExp(`^${pattern}$`, 'i');

        if (pathRegex.test(pathname)) {
          // Fuzzy word containment check for goal
          const goalKeywords = skill.goalPattern.toLowerCase().split(/\s+/).filter(Boolean);
          const allKeywordsMatch = goalKeywords.every((kw) => normalizedGoal.includes(kw));

          if (allKeywordsMatch) {
            return skill;
          }
        }
      }
    } catch {
      // In case of invalid URL strings
      return null;
    }

    return null;
  }
}

export const globalSkillStore = new SkillStore();

/**
 * Compiles a successful run trace into a persistent, reusable 0-token site skill.
 * If Tier-2 LLM is available, leverages it to infer resilient CSS/ARIA selectors.
 */
export async function compileTraceToSkill(
  url: string,
  goal: string,
  traces: ActionTrace[],
  router?: LLMRouter
): Promise<SiteSkill> {
  let hostname = 'unknown';
  let pathname = '/';
  try {
    const u = new URL(url);
    hostname = u.hostname;
    pathname = u.pathname;
  } catch {
    // fallback
  }

  const steps: CompiledSkillStep[] = [];

  // Deterministic selector extraction or LLM-assisted compilation
  if (router && router.getConfig().apiKeys.anthropic) {
    try {
      const prompt = `Convert this successful action trace into a list of resilient CSS/ARIA selectors for 0-token automation on ${hostname}:
Goal: ${goal}
Trace:
${JSON.stringify(traces, null, 2)}

Respond with JSON ONLY:
{
  "steps": [
    { "action": "click", "selector": "button[type='submit']" },
    { "action": "fill", "selector": "input[name='q']", "value": "param" }
  ]
}`;

      const { response } = await router.executeStep([
        { role: 'system', content: 'You are an expert browser automation selector compiler.' },
        { role: 'user', content: prompt },
      ], 2);

      if (response.actions.length > 0) {
        for (const act of response.actions) {
          steps.push({
            action: act.type as CompiledSkillStep['action'],
            selector: (act as any).selector,
            value: act.value,
            stop_if_url_changes: act.stop_if_url_changes,
          });
        }
      }
    } catch (err) {
      console.warn('[SkillCompiler] LLM compilation failed, falling back to deterministic:', err);
    }
  }

  // Fallback to direct trace translation if LLM steps are empty
  if (steps.length === 0) {
    for (const trace of traces) {
      steps.push({
        action: trace.action.type as CompiledSkillStep['action'],
        selector: trace.selector,
        value: trace.action.value,
        stop_if_url_changes: trace.action.stop_if_url_changes,
      });
    }
  }

  const skill: SiteSkill = {
    id: `skill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    hostname,
    pathnamePattern: pathname,
    goalPattern: goal.toLowerCase().trim(),
    steps,
    tokenSavings: traces.length * 650, // ~650 tokens saved per step
    timesExecuted: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await globalSkillStore.saveSkill(skill);
  return skill;
}
