import { Ticket, WhatsAppTemplate } from '../types/index.ts';

/**
 * Normalizes phone numbers to Indonesian international format (E.164 without '+').
 * Examples:
 * - '081234567890' -> '6281234567890'
 * - '+62 812-3456-7890' -> '6281234567890'
 * - '6281234567890' -> '6281234567890'
 * - '81234567890' -> '6281234567890'
 */
export function normalizePhoneNumber(phone: string | undefined | null): string {
  if (!phone) return '';
  // Strip everything except digits
  let digits = String(phone).replace(/\D/g, '');

  if (digits.startsWith('0')) {
    digits = '62' + digits.substring(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  } else if (!digits.startsWith('62') && digits.length >= 8) {
    // If entered without country code but looks like ID mobile
    digits = '62' + digits;
  }

  return digits;
}

export function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  // Indonesian numbers usually 628... and total 10 to 14 digits
  return /^62[2-9]\d{7,12}$/.test(normalized);
}

export interface RenderTemplateResult {
  renderedText: string;
  missingVariables: string[];
  hasWarnings: boolean;
}

/**
 * Replaces {{variable}} placeholders with ticket values.
 * Never outputs 'null', 'undefined', or 'N/A'.
 */
export function renderWhatsAppMessage(templateBody: string, ticket: Partial<Ticket>): RenderTemplateResult {
  const missingVariables: string[] = [];

  // Map possible placeholder variations
  const varMap: Record<string, string> = {
    customer_name: ticket.customerName || '',
    customer_id: ticket.idCustomer || '',
    customer_phone: ticket.customerPhone || '',
    wo_number: ticket.woNumber || '',
    ticket_number: ticket.ticketNumber || ticket.woNumber || '',
    ticket_category: ticket.ticketCategory || '',
    slot_time: ticket.slotTime || '',
    street_name: ticket.streetName || '',
    street_alternatif: ticket.streetAlternatif || '',
    cluster_name: ticket.clusterName || '',
    area: ticket.area || '',
    contractor_name: ticket.contactorName || '',
    contactor_name: ticket.contactorName || '',
    installer_name: ticket.installerName || '',
    installer_phone: (ticket as any).installerContact || (ticket as any).installerPhone || '',
    leader_name: ticket.leaderName || '',
    date: ticket.date || '',
    appointment_date: ticket.appointmentDate || ticket.date || '',
    fdt_code: ticket.fdtCode || '',
    fat_code: ticket.fatCode || ''
  };

  // Add any custom fields
  if (ticket.additionalFields) {
    Object.entries(ticket.additionalFields).forEach(([k, v]) => {
      varMap[k.toLowerCase()] = v;
    });
  }

  const rendered = templateBody.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, varName) => {
    const key = varName.toLowerCase();
    const val = varMap[key];
    if (val === undefined || val === null || val.trim() === '') {
      missingVariables.push(varName);
      // Clean fallback: empty string instead of undefined/null
      return '';
    }
    return val;
  });

  return {
    renderedText: rendered,
    missingVariables: Array.from(new Set(missingVariables)),
    hasWarnings: missingVariables.length > 0
  };
}

/**
 * Generates official click-to-chat WhatsApp URL
 * https://wa.me/628xxxxxxxxxx?text=...
 */
export function buildWhatsAppClickToChatUrl(phone: string, messageText: string): { url: string; error?: string } {
  const normalizedPhone = normalizePhoneNumber(phone);

  if (!isValidPhoneNumber(normalizedPhone)) {
    return {
      url: '',
      error: `Nomor telepon tidak valid untuk WhatsApp Indonesia (${phone || 'Kosong'}). Pastikan diawali 08/628 dan minimal 10 digit.`
    };
  }

  const encodedMessage = encodeURIComponent(messageText);
  const url = `https://wa.me/${normalizedPhone}?text=${encodedMessage}`;
  return { url };
}
