import { Ticket, WorkflowRule, WhatsAppTemplate, TicketActivity } from '../types/index.ts';
import { renderWhatsAppMessage, buildWhatsAppClickToChatUrl } from './whatsappService';

export interface WorkflowExecutionResult {
  ruleName: string;
  triggered: boolean;
  actionsExecuted: string[];
  updatedTicket?: Ticket;
  activityCreated?: TicketActivity;
}

export function executeWorkflowsOnTicket(
  ticket: Ticket,
  trigger: WorkflowRule['trigger'],
  rules: WorkflowRule[],
  templates: WhatsAppTemplate[],
  performedBy: string,
  userRole: any
): { ticket: Ticket; logs: TicketActivity[]; executedRules: string[] } {
  let updated = { ...ticket };
  const logs: TicketActivity[] = [];
  const executedRules: string[] = [];

  const activeRules = rules.filter(r => r.enabled && r.trigger === trigger);

  for (const rule of activeRules) {
    // Check conditions
    let matches = true;
    for (const cond of rule.conditions) {
      const fieldVal = (updated as any)[cond.field || ''];
      if (cond.operator === 'is_not_empty') {
        if (!fieldVal || String(fieldVal).trim() === '') matches = false;
      } else if (cond.operator === 'equals') {
        if (String(fieldVal) !== String(cond.value)) matches = false;
      } else if (cond.operator === 'not_equals') {
        if (String(fieldVal) === String(cond.value)) matches = false;
      } else if (cond.operator === 'contains') {
        if (!String(fieldVal).includes(String(cond.value))) matches = false;
      }
    }

    if (!matches) continue;

    // Execute actions
    for (const action of rule.actions) {
      if (action.type === 'prepare_whatsapp') {
        const tpl = templates.find(t => t.id === action.templateId) || templates.find(t => t.isDefault) || templates[0];
        if (tpl && updated.customerPhone) {
          const { renderedText } = renderWhatsAppMessage(tpl.messageBody, updated);
          const { url } = buildWhatsAppClickToChatUrl(updated.customerPhone, renderedText);
          updated.waMessagePreview = renderedText;
          updated.waGeneratedUrl = url;
          if (updated.statusWhatsApp === 'not_prepared') {
            updated.statusWhatsApp = action.targetStatus || 'ready';
          }
        }
      } else if (action.type === 'update_wa_status' && action.targetStatus) {
        updated.statusWhatsApp = action.targetStatus;
      } else if (action.type === 'log_event') {
        logs.push({
          id: 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          ticketId: updated.id,
          woNumber: updated.woNumber,
          action: `Workflow Triggered: ${rule.name}`,
          description: `Rule "${rule.name}" triggered on event "${trigger}"`,
          performedBy,
          userRole,
          timestamp: new Date().toISOString()
        });
      }
    }

    rule.executionCount++;
    rule.lastExecutedAt = new Date().toISOString();
    executedRules.push(rule.name);
  }

  return { ticket: updated, logs, executedRules };
}
