import React from 'react';
import { useApp } from '../../context/AppContext';
import { GitBranch, Play, Power, Check, AlertCircle, Clock } from 'lucide-react';

export const WorkflowManager: React.FC = () => {
  const { workflowRules, toggleWorkflowRule } = useApp();

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <GitBranch className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Workflow & Dispatch Automation Rules
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Otomatisasi pemicu sistem: penyiapan URL WhatsApp, validasi nomor, notifikasi saat slot berubah, dan logging audit.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {workflowRules.map(rule => (
          <div
            key={rule.id}
            className={`p-5 bg-white dark:bg-slate-900 rounded-lg border transition-all shadow-2xs space-y-3 text-xs ${
              rule.enabled
                ? 'border-slate-200 dark:border-slate-800'
                : 'border-slate-200 dark:border-slate-800 opacity-60 bg-slate-50/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${rule.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                  {rule.name}
                </h4>
                <span className="font-mono text-[10px] px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded">
                  trigger: {rule.trigger}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleWorkflowRule(rule.id, !rule.enabled)}
                  className={`px-3 py-1 rounded font-medium text-xs flex items-center gap-1.5 transition-colors ${
                    rule.enabled
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}
                >
                  <Power className="w-3 h-3" />
                  <span>{rule.enabled ? 'ACTIVE' : 'DISABLED'}</span>
                </button>
              </div>
            </div>

            <p className="text-slate-600 dark:text-slate-400 text-xs">
              {rule.description}
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 font-mono">
              <div>
                Total Executed: <span className="font-semibold text-slate-700 dark:text-slate-300">{rule.executionCount}x</span>
              </div>
              <div>
                Last Run: {rule.lastExecutedAt ? new Date(rule.lastExecutedAt).toLocaleString() : 'Never'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
