import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { SortDirection, SortDataType } from '../../utils/tableSorting';

export interface SortableColumnHeaderProps {
  label: string;
  fieldKey?: string;
  columnKey?: string;
  currentSortField?: string | null;
  currentSortColumn?: string | null;
  currentSortDirection?: SortDirection;
  currentDirection?: SortDirection;
  dataType?: SortDataType;
  onSort: (key: string) => void;
  className?: string;
  align?: 'left' | 'center' | 'right';
  children?: React.ReactNode;
}

export const SortableColumnHeader: React.FC<SortableColumnHeaderProps> = ({
  label,
  fieldKey,
  columnKey,
  currentSortField,
  currentSortColumn,
  currentSortDirection,
  currentDirection,
  dataType = 'auto',
  onSort,
  className = '',
  align = 'left',
  children
}) => {
  const effectiveKey = columnKey || fieldKey || '';
  const activeCol = currentSortColumn !== undefined ? currentSortColumn : currentSortField;
  const activeDir = currentDirection !== undefined ? currentDirection : currentSortDirection;

  const isSorted = activeCol === effectiveKey && Boolean(activeDir);
  const isAsc = isSorted && activeDir === 'asc';
  const isDesc = isSorted && activeDir === 'desc';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSort(effectiveKey);
  };

  const alignClass =
    align === 'center'
      ? 'justify-center text-center'
      : align === 'right'
      ? 'justify-end text-right'
      : 'justify-start text-left';

  const tooltipText = !isSorted
    ? `Urutkan ${label} (Ascending ↑)`
    : isAsc
    ? `Urutkan ${label} (Descending ↓)`
    : `Kembalikan urutan default`;

  return (
    <button
      type="button"
      onClick={handleClick}
      title={tooltipText}
      aria-label={tooltipText}
      className={`group/sort inline-flex items-center gap-1.5 font-bold transition-all select-none cursor-pointer hover:text-[#7135B5] dark:hover:text-[#D8B4FE] ${alignClass} ${className} ${
        isSorted ? 'text-[#7135B5] dark:text-[#D8B4FE]' : ''
      }`}
    >
      <span className="truncate">{children || label}</span>
      <span
        className={`inline-flex items-center justify-center p-0.5 rounded transition-colors ${
          isSorted
            ? 'bg-[#7135B5]/15 dark:bg-[#D8B4FE]/20 text-[#7135B5] dark:text-[#E9D5FF]'
            : 'text-slate-400 group-hover/sort:text-slate-600 dark:group-hover/sort:text-slate-300'
        }`}
      >
        {isAsc ? (
          <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
        ) : isDesc ? (
          <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-60 group-hover/sort:opacity-100" />
        )}
      </span>
    </button>
  );
};
