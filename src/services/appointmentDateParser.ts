/**
 * MoraJaws Deterministic Appointment Date Engine
 *
 * Strict parsing and validation for Appointment Date:
 * - Dynamic Asia/Jakarta (WIB) timezone calculation for "Hari Ini" and "Besok"
 * - Zero timezone shift for pure calendar date comparisons
 * - Supports:
 *   - Firestore Timestamp ({ seconds, nanoseconds } or .toDate())
 *   - JavaScript Date objects
 *   - Full ISO string with UTC timezone (e.g. 2026-10-28T17:00:00Z -> accurately converted to Jakarta date)
 *   - YYYY-MM-DD (ISO date-only)
 *   - DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (standard Indonesian FTTH format)
 *   - MM/DD/YYYY, MM-DD-YYYY
 *   - Excel / Google Sheets serial date numbers (e.g. 45583)
 * - Safe handling of null/empty/invalid dates (never assumes today)
 * - Single source of truth for date filters and indicators
 */

export interface DateParseResult {
  date: string | null; // Standardized "YYYY-MM-DD" or null
  rawValue: string;
  isValid: boolean;
  isEmpty: boolean;
  error?: string;
  formatDetected?: string;
}

export interface JakartaDateInfo {
  dateStr: string; // "YYYY-MM-DD"
  year: number;
  month: number;
  day: number;
  monthShort: string; // "Jan", "Feb", "Okt", ...
  monthFull: string; // "Januari", "Februari", ...
  labelShort: string; // "29 Okt"
  labelFull: string; // "29 Oktober 2026"
}

const INDONESIAN_MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const INDONESIAN_MONTH_FULL = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

/**
 * Gets dynamic calendar date string (YYYY-MM-DD) in Asia/Jakarta timezone (WIB).
 * offsetDays = 0 for today (Hari Ini)
 * offsetDays = 1 for tomorrow (Besok)
 * offsetDays = -1 for yesterday (Kemarin)
 */
export function getJakartaDateString(offsetDays = 0, baseDate: Date = new Date()): string {
  try {
    const dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    if (offsetDays === 0) {
      return dtf.format(baseDate);
    }

    const parts = dtf.formatToParts(baseDate);
    const y = parseInt(parts.find(p => p.type === 'year')?.value || '1970', 10);
    const m = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10) - 1;
    const d = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10);

    const shifted = new Date(Date.UTC(y, m, d + offsetDays, 12, 0, 0));
    return dtf.format(shifted);
  } catch {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

/**
 * Gets comprehensive date parts in Asia/Jakarta timezone (WIB) with human-readable Indonesian labels.
 */
export function getJakartaDateParts(offsetDays = 0, baseDate: Date = new Date()): JakartaDateInfo {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  let parts = dtf.formatToParts(baseDate);
  let y = parseInt(parts.find(p => p.type === 'year')?.value || '1970', 10);
  let m = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10) - 1;
  let d = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10);

  if (offsetDays !== 0) {
    const shifted = new Date(Date.UTC(y, m, d + offsetDays, 12, 0, 0));
    parts = dtf.formatToParts(shifted);
    y = parseInt(parts.find(p => p.type === 'year')?.value || '1970', 10);
    m = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10) - 1;
    d = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10);
  }

  const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const monthShort = INDONESIAN_MONTH_SHORT[m] || '';
  const monthFull = INDONESIAN_MONTH_FULL[m] || '';

  return {
    dateStr,
    year: y,
    month: m + 1,
    day: d,
    monthShort,
    monthFull,
    labelShort: `${d} ${monthShort}`,
    labelFull: `${d} ${monthFull} ${y}`
  };
}

/**
 * Deterministically parses an appointment date value without unwanted timezone shifts.
 * Supports Firestore Timestamp, Date, ISO timestamp, Indonesian dates, and Excel numbers.
 */
export function parseAppointmentDate(input: unknown): DateParseResult {
  if (input === null || input === undefined) {
    return {
      date: null,
      rawValue: '',
      isValid: true,
      isEmpty: true
    };
  }

  // 1. Firebase Firestore Timestamp or JavaScript Date object
  if (typeof input === 'object') {
    let dateObj: Date | null = null;
    if (typeof (input as any).toDate === 'function') {
      try {
        dateObj = (input as any).toDate();
      } catch {}
    } else if (typeof (input as any).seconds === 'number') {
      dateObj = new Date((input as any).seconds * 1000);
    } else if (input instanceof Date) {
      dateObj = input;
    }

    if (dateObj && !isNaN(dateObj.getTime())) {
      const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const formatted = dtf.format(dateObj);
      return {
        date: formatted,
        rawValue: dateObj.toISOString(),
        isValid: true,
        isEmpty: false,
        formatDetected: 'firestore_timestamp_or_date'
      };
    }
  }

  const rawStr = String(input).trim();
  if (rawStr === '' || rawStr === '-' || rawStr === 'null' || rawStr === 'undefined') {
    return {
      date: null,
      rawValue: rawStr,
      isValid: true,
      isEmpty: true
    };
  }

  // 2. Excel / Google Sheets Serial Date Number (e.g., 45583, 46324)
  const numericVal = typeof input === 'number' ? input : (!isNaN(Number(rawStr)) ? Number(rawStr) : NaN);
  if (!isNaN(numericVal) && numericVal >= 30000 && numericVal <= 70000) {
    try {
      const serialInt = Math.floor(numericVal);
      const utcMs = (serialInt - 25569) * 86400000;
      const d = new Date(utcMs);
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      const day = d.getUTCDate();

      if (year >= 2000 && year <= 2099) {
        const formatted = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return {
          date: formatted,
          rawValue: rawStr,
          isValid: true,
          isEmpty: false,
          formatDetected: 'excel_serial_number'
        };
      }
    } catch {}
  }

  // 3. Full ISO timestamp with UTC timezone (e.g. 2026-10-28T17:00:00.000Z or +07:00)
  if (rawStr.includes('T') && (rawStr.endsWith('Z') || rawStr.includes('+') || rawStr.match(/-\d{2}:\d{2}$/))) {
    const d = new Date(rawStr);
    if (!isNaN(d.getTime())) {
      const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return {
        date: dtf.format(d),
        rawValue: rawStr,
        isValid: true,
        isEmpty: false,
        formatDetected: 'iso_timestamp_with_tz'
      };
    }
  }

  // 4. ISO format YYYY-MM-DD or YYYY-MM-DD HH:mm:ss
  const isoMatch = rawStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);

    if (year >= 2000 && year <= 2099 && month >= 1 && month <= 12) {
      const maxDays = getDaysInMonth(year, month);
      if (day >= 1 && day <= maxDays) {
        const formatted = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return {
          date: formatted,
          rawValue: rawStr,
          isValid: true,
          isEmpty: false,
          formatDetected: 'iso_yyyy_mm_dd'
        };
      }
    }
  }

  // 5. Delimited Date: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const delimitedMatch = rawStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (delimitedMatch) {
    const firstPart = parseInt(delimitedMatch[1], 10);
    const secondPart = parseInt(delimitedMatch[2], 10);
    const year = parseInt(delimitedMatch[3], 10);

    if (year >= 2000 && year <= 2099) {
      let day: number;
      let month: number;

      if (firstPart > 12 && secondPart <= 12) {
        day = firstPart;
        month = secondPart;
      } else if (secondPart > 12 && firstPart <= 12) {
        month = firstPart;
        day = secondPart;
      } else {
        // Standard Indonesian telecom convention: DD/MM/YYYY
        day = firstPart;
        month = secondPart;
      }

      if (month >= 1 && month <= 12) {
        const maxDays = getDaysInMonth(year, month);
        if (day >= 1 && day <= maxDays) {
          const formatted = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return {
            date: formatted,
            rawValue: rawStr,
            isValid: true,
            isEmpty: false,
            formatDetected: 'dd_mm_yyyy_standard'
          };
        }
      }
    }
  }

  return {
    date: null,
    rawValue: rawStr,
    isValid: false,
    isEmpty: false,
    error: `Format appointment date "${rawStr}" tidak dikenali.`
  };
}

/**
 * Safely extracts standardized YYYY-MM-DD appointment date from a Ticket object.
 * Checks candidate fields in priority order. Returns null if missing or invalid.
 * Work Orders without valid appointment date will return null (NEVER fallback to today).
 */
export function getTicketAppointmentDate(ticket: any): string | null {
  if (!ticket || typeof ticket !== 'object') return null;

  const candidates = [
    ticket.appointmentDate,
    ticket.scheduleAppointment,
    ticket.scheduleAppointmentDate,
    ticket.scheduleDate,
    ticket.scheduledDate,
    ticket.appointment_date,
    ticket.schedule_date,
    ticket.date,
    ticket.ticketDate
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== '') {
      const parsed = parseAppointmentDate(candidate);
      if (parsed.isValid && parsed.date) {
        return parsed.date;
      }
    }
  }

  return null;
}

/**
 * Formats a stored YYYY-MM-DD date for human display in Indonesian locale.
 */
export function formatAppointmentDateDisplay(dateStr?: string | null): string {
  if (!dateStr || !dateStr.trim()) {
    return 'Tanggal appointment belum tersedia';
  }
  const clean = dateStr.trim();
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const res = parseAppointmentDate(clean);
    if (res.date) {
      return formatAppointmentDateDisplay(res.date);
    }
    return clean;
  }

  const [_, yyyy, mm, dd] = match;
  const mIndex = parseInt(mm, 10) - 1;
  const monthName = INDONESIAN_MONTH_FULL[mIndex] || mm;
  return `${parseInt(dd, 10)} ${monthName} ${yyyy}`;
}

export type ScheduleDateFilterMode = 'all' | 'today' | 'tomorrow' | 'previous' | 'upcoming' | 'custom' | 'selected_date';

/**
 * Calculates current operational date string (YYYY-MM-DD) in Asia/Jakarta timezone (WIB).
 */
export function getOperationalTodayDate(overrideDate?: string): string {
  if (overrideDate && /^\d{4}-\d{2}-\d{2}$/.test(overrideDate.trim())) {
    return overrideDate.trim();
  }
  return getJakartaDateString(0);
}

/**
 * Checks if a ticket's appointment date matches schedule filter.
 */
export function matchesScheduleDateFilter(
  ticketOrDate: unknown,
  mode: ScheduleDateFilterMode,
  referenceDate?: string,
  customRange?: { start?: string; end?: string }
): boolean {
  if (mode === 'all') return true;

  let ticketDate: string | null = null;
  if (typeof ticketOrDate === 'object' && ticketOrDate !== null) {
    ticketDate = getTicketAppointmentDate(ticketOrDate);
  } else {
    ticketDate = parseAppointmentDate(ticketOrDate).date;
  }

  // Work Orders without valid appointment date only match 'all'
  if (!ticketDate) {
    return false;
  }

  const targetDate = referenceDate || getJakartaDateString(0);

  if (mode === 'today') {
    return ticketDate === getJakartaDateString(0);
  }

  if (mode === 'tomorrow') {
    return ticketDate === getJakartaDateString(1);
  }

  if (mode === 'selected_date') {
    return ticketDate === targetDate;
  }

  if (mode === 'previous') {
    return ticketDate < targetDate;
  }

  if (mode === 'upcoming') {
    return ticketDate > targetDate;
  }

  if (mode === 'custom' && customRange) {
    if (customRange.start && ticketDate < customRange.start) return false;
    if (customRange.end && ticketDate > customRange.end) return false;
    return true;
  }

  return true;
}
