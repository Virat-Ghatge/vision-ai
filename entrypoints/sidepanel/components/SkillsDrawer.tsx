import React, { useState, useEffect } from 'react';
import { globalSkillStore, SiteSkill } from '../../../src/lib/skills/skillStore';
import { Sparkles, Trash2, Play, ExternalLink } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRunSkill: (skill: SiteSkill) => void;
}

export function SkillsDrawer({ isOpen, onClose, onRunSkill }: Props): React.JSX.Element | null {
  const [skills, setSkills] = useState<SiteSkill[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const list = await globalSkillStore.listSkills();
      setSkills(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSkills();
    }
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    await globalSkillStore.deleteSkill(id);
    await loadSkills();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-3">
      <div className="bg-orbit-panel border border-orbit-border rounded-xl w-full max-w-sm p-4 text-slate-100 shadow-2xl flex flex-col gap-3 max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-orbit-border pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold">Saved 0-Token Domain Skills</h2>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-100 px-2 py-0.5"
          >
            ✕
          </button>
        </div>

        <p className="text-[11px] text-slate-400">
          Deterministic workflows compiled by Tier-2 LLM and cached in IndexedDB. Running a skill consumes <strong className="text-emerald-400">0 API tokens</strong>.
        </p>

        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
          {loading ? (
            <div className="text-xs text-slate-400 text-center py-6">Loading skills...</div>
          ) : skills.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No compiled skills yet. Complete tasks to auto-compile reusable 0-token skills!
            </div>
          ) : (
            skills.map((skill) => (
              <div
                key={skill.id}
                className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1.5 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3 text-orbit-accent" />
                    {skill.hostname}
                  </span>
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded font-mono">
                    ~{skill.tokenSavings} tok saved
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 truncate">
                  Goal: &quot;{skill.goalPattern}&quot;
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] text-slate-500">
                  <span>Executed {skill.timesExecuted}x</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDelete(skill.id)}
                      className="text-slate-400 hover:text-rose-400 p-1"
                      title="Delete skill"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        onRunSkill(skill);
                        onClose();
                      }}
                      className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-semibold transition-colors"
                    >
                      <Play className="w-2.5 h-2.5 fill-white" /> Run (0 Tokens)
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
