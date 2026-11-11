/**
 * MoraJaws Centralized Work Order Date Filtering & Cross-Date Search Engine
 *
 * Implements deterministic Asia/Jakarta (WIB) date evaluation based on APPOINTMENT DATE:
 * - Appointment Date is the SOLE primary reference for WO date
 * - Strictly excludes import date, upload date, createdAt, or assignment date
 * - Asia/Jakarta (WIB) timezone with 00:00 midnight auto-rollover
 * - Zero UTC shift to prevent date jumping
 * - Work Orders without valid Appointment Date are NEVER considered today's WO
 * - Default view for ALL ROLES (Superadmin, Dispatch, Leader, Installer, Staff) displays ONLY today's WO
 * - Special privilege for Superadmin & Dispatch:
 *   - Can track past WO dates
 *   - Can search upcoming scheduled WO
 *   - Cross-date search enabled strictly by WO Number or Customer ID across all dates
 *   - Search does not alter the underlying default today's filter
 * - Leader, Installer, and other staff remain strictly restricted to today's Appointment Date
 */

import { Ticket, User, UserRole } from '../types/index.ts';

export type WODateTag = 'today' | 'tomorrow' | 'previous' | 'upcoming' | 'invalid';

export interface JakartaDateRange {
  today: string;      // YYYY-MM-DD in WIB
  tomorrow: string;   // YYYY-MM-DD in WIB
  yesterday: string;  // YYYY-MM-DD in WIB
  currentJakartaHour: number;
  currentJakartaMinute: number;
}

export interface LeaderWORange {
  today: string;
  tomorrow: string;
  dates: string[];
}

export interface CrossDateSearchResult {
  ticket: Ticket;
  dateTag: 'previous' | 'today' | 'upcoming';
  dateLabel: string;
  matchedBy: 'woNumber' | 'idCustomer';
  matchedValue: string;
  isCrossDate: boolean; // true if date != today
}

/**
 * Parses any date-like string or object into standard YYYY-MM-DD strictly within Asia/Jakarta timezone.
 */
export function normalizeDateToJakarta(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str || str === '-' || str === 'null' || str === 'undefined') return null;

  // 1. Direct ISO YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // 2. Delimited DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (Standard Indonesian telecommunication format)
  const delMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (delMatch) {
    const first = parseInt(delMatch[1], 10);
    const second = parseInt(delMatch[2], 10);
    const y = parseInt(delMatch[3], 10);
    let d = first;
    let m = second;
    if (second > 12 && first <= 12) {
      m = first;
      d = second;
    }
    if (y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // 3. Numeric Excel serial number (e.g. 46325)
  const num = Number(str);
  if (!isNaN(num) && num >= 30000 && num <= 70000) {
    try {
      const serialInt = Math.floor(num);
      const utcMs = (serialInt - 25569) * 86400000;
      const dt = new Date(utcMs);
      const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return dtf.format(dt);
    } catch {
      // Fallback
    }
  }

  // 4. ISO Date instance string (e.g. 2026-10-30T14:44:18.217Z)
  if (str.includes('T') || str.includes('Z')) {
    try {
      const dt = new Date(str);
      if (!isNaN(dt.getTime())) {
        const dtf = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        return dtf.format(dt);
      }
    } catch {}
  }

  return null;
}

/**
 * 1. getTicketWODate(ticket)
 * Extracts authentic Appointment Date from Ticket as the sole reference.
 * Work Orders without valid Appointment Date return null (never assumed today).
 */
export function getTicketWODate(ticket: unknown): string | null {
  if (!ticket || typeof ticket !== 'object') return null;

  const t = ticket as Record<string, unknown>;

  // Strict priority order of legitimate Appointment Date candidates
  const candidates = [
    t.appointmentDate,
    t.scheduleAppointment,
    t.scheduleAppointmentDate,
    t.scheduleDate,
    t.scheduledDate,
    t.appointment_date,
    t.schedule_date,
    t.date
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== '') {
      const parsed = normalizeDateToJakarta(candidate);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * 2. getJakartaDateRange(baseDate?)
 * Computes today, tomorrow, yesterday in Asia/Jakarta (WIB) timezone dynamically.
 */
export function getJakartaDateRange(baseDate: Date = new Date()): JakartaDateRange {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const hourDtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });

  const parts = dtf.formatToParts(baseDate);
  const y = parseInt(parts.find(p => p.type === 'year')?.value || '1970', 10);
  const m = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10) - 1;
  const d = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10);

  const timeParts = hourDtf.formatToParts(baseDate);
  const hour = parseInt(timeParts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(timeParts.find(p => p.type === 'minute')?.value || '0', 10);

  const todayStr = dtf.format(baseDate);

  const tmrDt = new Date(Date.UTC(y, m, d + 1, 12, 0, 0));
  const tomorrowStr = dtf.format(tmrDt);

  const yestDt = new Date(Date.UTC(y, m, d - 1, 12, 0, 0));
  const yesterdayStr = dtf.format(yestDt);

  return {
    today: todayStr,
    tomorrow: tomorrowStr,
    yesterday: yesterdayStr,
    currentJakartaHour: hour,
    currentJakartaMinute: minute
  };
}

/**
 * 3. getTodayWORange(baseDate?)
 * Returns standard today's calendar date string (YYYY-MM-DD) in Asia/Jakarta (WIB).
 */
export function getTodayWORange(baseDate: Date = new Date()): string {
  return getJakartaDateRange(baseDate).today;
}

/**
 * 4. getLeaderWORange(baseDate?)
 * Returns today and tomorrow in Asia/Jakarta (WIB) for Leader view.
 */
export function getLeaderWORange(baseDate: Date = new Date()): LeaderWORange {
  const { today, tomorrow } = getJakartaDateRange(baseDate);
  return {
    today,
    tomorrow,
    dates: [today, tomorrow]
  };
}

/**
 * Classifies a ticket's WO date relative to today's date in Asia/Jakarta.
 */
export function classifyTicketWODateTag(ticket: unknown, referenceToday?: string): 'today' | 'previous' | 'upcoming' | 'invalid' {
  const woDate = getTicketWODate(ticket);
  if (!woDate) return 'invalid';

  const today = referenceToday || getTodayWORange();

  if (woDate === today) return 'today';
  if (woDate < today) return 'previous';
  return 'upcoming';
}

/**
 * Human readable label for WO Date Tag
 */
export function getWODateTagLabel(tag: 'today' | 'previous' | 'upcoming' | 'invalid'): string {
  switch (tag) {
    case 'today':
      return 'WO Hari Ini';
    case 'previous':
      return 'WO Sebelumnya';
    case 'upcoming':
      return 'WO Berikutnya';
    case 'invalid':
    default:
      return 'WO Tanpa Tanggal Valid';
  }
}

/**
 * Formats a YYYY-MM-DD string into Indonesian calendar format (e.g. "30 Oktober 2026").
 */
export function formatIndonesianWODate(dateStr: string | null): string {
  if (!dateStr) return 'Tanggal WO tidak tersedia';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;

  const MONTHS = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const y = match[1];
  const mIndex = parseInt(match[2], 10) - 1;
  const d = parseInt(match[3], 10);

  return `${d} ${MONTHS[mIndex] || match[2]} ${y}`;
}

/**
 * 5. searchWOByNumber(woNumberQuery, ticketsPool)
 * Searches tickets strictly by WO Number across all dates.
 * Normalizes input: trims whitespace and ignores case.
 */
export function searchWOByNumber(woNumberQuery: string, ticketsPool: Ticket[]): CrossDateSearchResult[] {
  const clean = (woNumberQuery || '').trim().toLowerCase();
  if (!clean) return [];

  const today = getTodayWORange();
  const results: CrossDateSearchResult[] = [];

  for (const t of ticketsPool) {
    if (!t || t.isDeleted) continue;

    const wo = (t.woNumber || t.workOrderNumber || '').trim().toLowerCase();
    if (wo.includes(clean)) {
      const woDate = getTicketWODate(t);
      let dateTag: 'today' | 'previous' | 'upcoming' = 'today';
      if (woDate) {
        if (woDate < today) dateTag = 'previous';
        else if (woDate > today) dateTag = 'upcoming';
      }

      results.push({
        ticket: t,
        dateTag,
        dateLabel: getWODateTagLabel(dateTag),
        matchedBy: 'woNumber',
        matchedValue: t.woNumber || (t.workOrderNumber as string) || '',
        isCrossDate: woDate !== today
      });
    }
  }

  return results;
}

/**
 * 6. searchWOByCustomerId(customerIdQuery, ticketsPool)
 * Searches tickets strictly by Customer ID across all dates.
 * Normalizes input: trims whitespace and ignores case.
 */
export function searchWOByCustomerId(customerIdQuery: string, ticketsPool: Ticket[]): CrossDateSearchResult[] {
  const clean = (customerIdQuery || '').trim().toLowerCase();
  if (!clean) return [];

  const today = getTodayWORange();
  const results: CrossDateSearchResult[] = [];

  for (const t of ticketsPool) {
    if (!t || t.isDeleted) continue;

    const cid = (t.idCustomer || t.customerId || '').trim().toLowerCase();
    if (cid.includes(clean)) {
      const woDate = getTicketWODate(t);
      let dateTag: 'today' | 'previous' | 'upcoming' = 'today';
      if (woDate) {
        if (woDate < today) dateTag = 'previous';
        else if (woDate > today) dateTag = 'upcoming';
      }

      results.push({
        ticket: t,
        dateTag,
        dateLabel: getWODateTagLabel(dateTag),
        matchedBy: 'idCustomer',
        matchedValue: t.idCustomer || (t.customerId as string) || '',
        isCrossDate: woDate !== today
      });
    }
  }

  return results;
}

/**
 * Unified cross-date search for Superadmin and Dispatch.
 * Strict constraint: ONLY matches WO Number or Customer ID.
 * Ignores customer name, phone, address, installer name, or appointment date!
 */
export function executeSuperadminDispatchSearch(
  query: string,
  ticketsPool: Ticket[]
): {
  isSearchActive: boolean;
  results: CrossDateSearchResult[];
  resultTickets: Ticket[];
  crossDateCount: number;
} {
  const clean = (query || '').trim();
  if (!clean) {
    return {
      isSearchActive: false,
      results: [],
      resultTickets: [],
      crossDateCount: 0
    };
  }

  const cleanLower = clean.toLowerCase();
  const today = getTodayWORange();
  const matchedMap = new Map<string, CrossDateSearchResult>();

  // Check tickets matching woNumber or idCustomer ONLY
  for (const t of ticketsPool) {
    if (!t || t.isDeleted) continue;

    const wo = (t.woNumber || t.workOrderNumber || '').trim().toLowerCase();
    const cid = (t.idCustomer || t.customerId || '').trim().toLowerCase();

    let matchedBy: 'woNumber' | 'idCustomer' | null = null;
    let matchedValue = '';

    if (wo.includes(cleanLower)) {
      matchedBy = 'woNumber';
      matchedValue = t.woNumber || (t.workOrderNumber as string) || '';
    } else if (cid.includes(cleanLower)) {
      matchedBy = 'idCustomer';
      matchedValue = t.idCustomer || (t.customerId as string) || '';
    }

    if (matchedBy) {
      const woDate = getTicketWODate(t);
      let dateTag: 'today' | 'previous' | 'upcoming' = 'today';
      if (woDate) {
        if (woDate < today) dateTag = 'previous';
        else if (woDate > today) dateTag = 'upcoming';
      }

      matchedMap.set(t.id, {
        ticket: t,
        dateTag,
        dateLabel: getWODateTagLabel(dateTag),
        matchedBy,
        matchedValue,
        isCrossDate: woDate !== today
      });
    }
  }

  const results = Array.from(matchedMap.values());
  const crossDateCount = results.filter(r => r.isCrossDate).length;

  return {
    isSearchActive: true,
    results,
    resultTickets: results.map(r => r.ticket),
    crossDateCount
  };
}

/**
 * Calculates milliseconds remaining until next 00:00:02 WIB midnight rollover.
 */
export function getMsUntilNextJakartaMidnight(): number {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });

  const parts = dtf.formatToParts(now);
  const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const s = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10);

  const secondsPassedToday = h * 3600 + m * 60 + s;
  const secondsInDay = 86400;
  const secondsRemaining = secondsInDay - secondsPassedToday + 2; // +2s buffer past midnight

  return Math.max(1000, secondsRemaining * 1000);
}
