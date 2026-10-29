import React from 'react';
import { WhatsAppConfirmationStatus, TicketStatusWOAgent, TicketStatusWOInstaller } from '../../types';

export const StatusAgentBadge: React.FC<{ status: TicketStatusWOAgent }> = ({ status }) => {
  const styles: Record<TicketStatusWOAgent, string> = {
    'Pending': 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    'Assigned': 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    'In Progress': 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
    'Resolved': 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    'Cancelled': 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    'Closed': 'text-slate-700 bg-slate-100 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded ${styles[status] || styles.Pending}`}>
      {status}
    </span>
  );
};

export const StatusInstallerBadge: React.FC<{ status: TicketStatusWOInstaller }> = ({ status }) => {
  const styles: Record<TicketStatusWOInstaller, string> = {
    'Unassigned': 'text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    'Assigned': 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    'En Route': 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    'On Site': 'text-purple-700 bg-purple-50 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
    'Installed': 'text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',
    'Pending Technical': 'text-orange-700 bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
    'Failed / Cancelled': 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    'Completed': 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded ${styles[status] || styles.Unassigned}`}>
      {status}
    </span>
  );
};

export const StatusWhatsAppBadge: React.FC<{ status: WhatsAppConfirmationStatus }> = ({ status }) => {
  const configs: Record<WhatsAppConfirmationStatus, { label: string; style: string }> = {
    'not_prepared': { label: 'Not Prepared', style: 'text-slate-500 bg-slate-50 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400' },
    'ready': { label: 'Ready to Contact', style: 'text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800' },
    'opened_in_whatsapp': { label: 'Opened in WA', style: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
    'awaiting_confirmation': { label: 'Awaiting Confirmation', style: 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800' },
    'confirmed': { label: 'Customer Confirmed', style: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
    'reschedule_requested': { label: 'Reschedule Needed', style: 'text-purple-700 bg-purple-50 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800' },
    'unreachable': { label: 'Unreachable', style: 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800' },
    'invalid_number': { label: 'Invalid Phone', style: 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800' },
    'cancelled': { label: 'Cancelled', style: 'text-neutral-600 bg-neutral-100 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-400' }
  };

  const item = configs[status] || configs.not_prepared;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded ${item.style}`}>
      {item.label}
    </span>
  );
};
