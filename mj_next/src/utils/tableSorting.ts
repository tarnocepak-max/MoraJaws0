/**
 * Universal Global Table Sorting Utility for MoraJaws Enterprise
 * Supports 3-state cycling: 'asc' -> 'desc' -> null (unsorted / default)
 * Supports data types: 'text' | 'number' | 'date' | 'time' | 'wo_number' | 'status'
 */

export type SortDirection = 'asc' | 'desc' | null;

export type SortDataType = 'text' | 'number' | 'date' | 'time' | 'time_slot' | 'wo_number' | 'status' | 'auto';

export interface SortState {
  column: string | null;
  direction: SortDirection;
}

/**
 * Status priority weighting for operational telecom statuses
 */
const STATUS_PRIORITY: Record<string, number> = {
  // Installer statuses
  'completed': 100,
  'installed': 90,
  'on site': 80,
  'en route': 70,
  'assigned': 60,
  'pending technical': 50,
  'failed / cancelled': 40,
  'unassigned': 30,
  
  // Agent statuses
  'closed': 100,
  'resolved': 90,
  'in progress': 70,
  'pending': 50,
  'cancelled': 40,

  // WhatsApp statuses
  'confirmed': 100,
  'ready': 80,
  'opened_in_whatsapp': 70,
  'awaiting_confirmation': 60,
  'reschedule_requested': 50,
  'unreachable': 40,
  'invalid_number': 30,
  'not_prepared': 20
};

/**
 * Extract time in minutes from a time slot string like "09:00 - 11:00 WIB"
 */
export function extractMinutesFromTimeSlot(slotStr: string): number {
  if (!slotStr) return 999999;
  const match = slotStr.match(/(\d{1,2})[:.](\d{2})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }
  return 999999;
}

/**
 * Extract numeric and string tokens for natural alphanumeric WO number comparison
 * E.g. "WO-123" -> ["WO-", 123]
 */
export function compareNaturalWoNumbers(a: string, b: string): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  // Use Intl.Collator with numeric collation for high-performance natural sorting
  return a.localeCompare(b, 'id-ID', { numeric: true, sensitivity: 'base' });
}

/**
 * Parse any date representation into timestamp
 */
export function parseDateToTimestamp(val: any): number {
  if (!val) return 0;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return val;

  const str = String(val).trim();
  if (!str) return 0;

  // Check DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    return new Date(year, month, day).getTime();
  }

  // Check YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return new Date(year, month, day).getTime();
  }

  const parsed = Date.parse(str);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Core comparator function for two values given a data type
 */
export function compareTableValues(a: any, b: any, type: SortDataType = 'auto'): number {
  if (a === null || a === undefined) a = '';
  if (b === null || b === undefined) b = '';

  // Detect type if auto
  let effectiveType = type;
  if (effectiveType === 'auto') {
    if (typeof a === 'number' && typeof b === 'number') {
      effectiveType = 'number';
    } else {
      effectiveType = 'text';
    }
  }

  switch (effectiveType) {
    case 'number': {
      const numA = typeof a === 'number' ? a : parseFloat(String(a).replace(/[^0-9.-]/g, '')) || 0;
      const numB = typeof b === 'number' ? b : parseFloat(String(b).replace(/[^0-9.-]/g, '')) || 0;
      return numA - numB;
    }

    case 'wo_number': {
      return compareNaturalWoNumbers(String(a), String(b));
    }

    case 'date': {
      const timeA = parseDateToTimestamp(a);
      const timeB = parseDateToTimestamp(b);
      return timeA - timeB;
    }

    case 'time':
    case 'time_slot': {
      const minsA = extractMinutesFromTimeSlot(String(a));
      const minsB = extractMinutesFromTimeSlot(String(b));
      return minsA - minsB;
    }

    case 'status': {
      const normA = String(a).toLowerCase().trim();
      const normB = String(b).toLowerCase().trim();
      const prioA = STATUS_PRIORITY[normA] ?? 50;
      const prioB = STATUS_PRIORITY[normB] ?? 50;
      if (prioA !== prioB) return prioA - prioB;
      return normA.localeCompare(normB, 'id-ID', { sensitivity: 'base' });
    }

    case 'text':
    default: {
      const strA = String(a).trim();
      const strB = String(b).trim();
      return strA.localeCompare(strB, 'id-ID', { numeric: true, sensitivity: 'base' });
    }
  }
}

/**
 * Next sort direction cycle:
 * Supports:
 * 1. getNextSortDirection(currentDirection) -> 'asc' -> 'desc' -> null
 * 2. getNextSortDirection(prevColumn, prevDirection, nextColumn) ->
 *    if prevColumn !== nextColumn -> 'asc'
 *    else: 'asc' -> 'desc' -> null
 */
export function getNextSortDirection(
  colOrDir: string | null | SortDirection,
  currentDir?: SortDirection,
  targetCol?: string
): SortDirection {
  if (targetCol !== undefined) {
    const prevCol = colOrDir;
    const prevDir = currentDir;
    if (prevCol !== targetCol) return 'asc';
    if (prevDir === 'asc') return 'desc';
    if (prevDir === 'desc') return null;
    return 'asc';
  }
  const cur = colOrDir as SortDirection;
  if (cur === null || cur === undefined) return 'asc';
  if (cur === 'asc') return 'desc';
  return null;
}

/**
 * Universal flexible sortDataArray
 * Supports both function signatures:
 * 1. sortDataArray(data, sortState, customAccessor)
 * 2. sortDataArray(data, sortField, sortDirection, dataTypeMapOrAccessor)
 */
export function sortDataArray<T>(
  data: T[],
  sortFieldOrState: keyof T | string | null | SortState,
  sortDirectionOrAccessor?: SortDirection | ((item: T, col: string) => any),
  dataTypeMapOrAccessor?: Record<string, SortDataType> | ((item: T, col: string) => any)
): T[] {
  let sortColumn: string | null = null;
  let sortDirection: SortDirection = null;
  let accessor: ((item: T, col: string) => any) | null = null;
  let dataTypeMap: Record<string, SortDataType> | undefined = undefined;

  if (sortFieldOrState && typeof sortFieldOrState === 'object' && 'direction' in sortFieldOrState) {
    sortColumn = sortFieldOrState.column;
    sortDirection = sortFieldOrState.direction;
    if (typeof sortDirectionOrAccessor === 'function') {
      accessor = sortDirectionOrAccessor;
    }
  } else {
    sortColumn = (sortFieldOrState as string) || null;
    if (typeof sortDirectionOrAccessor === 'function') {
      accessor = sortDirectionOrAccessor;
      sortDirection = 'asc';
    } else {
      sortDirection = (sortDirectionOrAccessor as SortDirection) || null;
    }
    if (typeof dataTypeMapOrAccessor === 'function') {
      accessor = dataTypeMapOrAccessor;
    } else if (typeof dataTypeMapOrAccessor === 'object') {
      dataTypeMap = dataTypeMapOrAccessor;
    }
  }

  if (!sortColumn || !sortDirection) {
    return data;
  }

  const effectiveType = dataTypeMap?.[sortColumn] || 'auto';

  return [...data].sort((itemA, itemB) => {
    const valA = accessor ? accessor(itemA, sortColumn!) : (itemA as any)?.[sortColumn!];
    const valB = accessor ? accessor(itemB, sortColumn!) : (itemB as any)?.[sortColumn!];

    const cmp = compareTableValues(valA, valB, effectiveType);
    return sortDirection === 'asc' ? cmp : -cmp;
  });
}
