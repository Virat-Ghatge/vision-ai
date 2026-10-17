import React, { useState, useEffect, useCallback } from 'react';
import { PageInspectionSummary } from '../../../src/lib/agent/types';
import {
  Eye,
  RefreshCw,
  PlayCircle,
  CheckSquare,
  ArrowDownCircle,
  BookOpen,
  Sparkles,
  Layers,
} from 'lucide-react';

interface Props {
  tabId: number;
  onLaunchMacroGoal: (goal: string) => void;
}

export function PageInspectorPanel({ tabId, onLaunchMacroGoal }: Props): React.JSX.Element {
  const [inspection, setInspection] = useState<PageInspectionSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const inspectCurrentTab = useCallback(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    setLoading(true);
    chrome.runtime.sendMessage({ type: 'INSPECT_TAB_DOM', tabId }, (res) => {
      setLoading(false);
      if (chrome.runtime.lastError || !res || res.error) return;
      setInspection(res as PageInspectionSummary);
    });
  }, [tabId]);

  useEffect(() => {
    inspectCurrentTab();
  }, [inspectCurrentTab]);

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-0.5">
      {/* 1-Click Coursera / NetAcad / LMS Autopilot Macros */}
      <div className="bg-vision-panel border border-vision-border rounded-xl p-3 shadow-md flex flex-col gap-2.5">
        <div className="flex items-center justify-between border-b border-vision-border pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-vision-gold" />
            <h2 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              1-Click LMS & Course Autopilot
            </h2>
          </div>
          <span className="text-[10px] bg-vision-crimson/20 text-vision-crimsonLight border border-vision-crimson/40 px-2 py-0.5 rounded-full font-mono">
            Coursera • NetAcad
          </span>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          Instant multi-step directives tailored for dynamic course players, inner scrollable panes, and HTML5 lecture media.
        </p>

        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() =>
              onLaunchMacroGoal(
                'Complete the current video lecture using complete_media, click Mark as complete if present, and click Next to advance to the next item.'
              )
            }
            className="flex items-center justify-between p-2.5 rounded-xl bg-vision-card hover:bg-vision-border/80 border border-vision-border hover:border-vision-gold/50 text-left transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <PlayCircle className="w-4 h-4 text-vision-gold shrink-0" />
              <div>
                <div className="text-xs font-bold text-slate-100 group-hover:text-vision-gold">
                  Complete Video Lecture & Advance
                </div>
                <div className="text-[10px] text-slate-400">
                  Fast-forwards HTML5 video, triggers ended state & clicks Next/Complete
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onLaunchMacroGoal(
                'Scroll down the reading or study material container until Mark as complete is visible, click Mark as complete, and then click Next.'
              )
            }
            className="flex items-center justify-between p-2.5 rounded-xl bg-vision-card hover:bg-vision-border/80 border border-vision-border hover:border-vision-teal/50 text-left transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <CheckSquare className="w-4 h-4 text-vision-tealBright shrink-0" />
              <div>
                <div className="text-xs font-bold text-slate-100 group-hover:text-vision-tealBright">
                  Read Study Material & Mark Complete
                </div>
                <div className="text-[10px] text-slate-400">
                  Scrolls inner reading pane to the bottom and marks section completed
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onLaunchMacroGoal(
                'Expand the next uncompleted module or lesson in the course syllabus, open the study material or video lecture, and complete it.'
              )
            }
            className="flex items-center justify-between p-2.5 rounded-xl bg-vision-card hover:bg-vision-border/80 border border-vision-border hover:border-vision-crimsonLight/50 text-left transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-vision-crimsonLight shrink-0" />
              <div>
                <div className="text-xs font-bold text-slate-100 group-hover:text-vision-crimsonLight">
                  Open Next Unfinished Module/Lesson
                </div>
                <div className="text-[10px] text-slate-400">
                  Navigates course sidebar or NetAcad Shadow DOM tree
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onLaunchMacroGoal('Scroll down the current page and summarize the key points.')
            }
            className="flex items-center justify-between p-2.5 rounded-xl bg-vision-card hover:bg-vision-border/80 border border-vision-border text-left transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <ArrowDownCircle className="w-4 h-4 text-sky-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-slate-100">
                  Smart Scroll & Summarize Page
                </div>
                <div className="text-[10px] text-slate-400">
                  Scrolls inner containers and extracts a concise digest
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* LiveSynthezoid DOM X-Ray Inspector */}
      <div className="flex-1 bg-vision-panel border border-vision-border rounded-xl p-3 shadow-md flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center justify-between border-b border-vision-border pb-2">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-vision-tealBright" />
            <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              Live DOM X-Ray Scanner
            </span>
          </div>
          <button
            type="button"
            onClick={inspectCurrentTab}
            className="flex items-center gap-1 text-[10px] bg-vision-card hover:bg-vision-border text-slate-300 px-2 py-1 rounded-md border border-vision-border transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin text-vision-gold' : ''}`} />
            Rescan
          </button>
        </div>

        <div className="flex items-center justify-between text-[11px] bg-vision-card px-2.5 py-1.5 rounded-lg border border-vision-border">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-vision-gold" />
            Indexed Interactive Nodes:
          </span>
          <span className="font-mono font-bold text-vision-tealBright">
            {inspection?.interactiveCount ?? 0} [ID] badges ready
          </span>
        </div>

        <pre className="flex-1 bg-vision-bg border border-vision-border rounded-lg p-2.5 text-[10px] font-mono text-slate-300 overflow-auto whitespace-pre-wrap select-text leading-relaxed">
          {inspection?.distilledPreview ||
            'Click Rescan on any active webpage to preview the ultra-low-token distilled DOM tree.'}
        </pre>
      </div>
    </div>
  );
}

