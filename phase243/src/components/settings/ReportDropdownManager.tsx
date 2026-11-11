import React from 'react';
import { DroplistManagementView } from './DroplistManagementView';
import { DropdownCategoryType } from '../../types';

export interface ReportDropdownManagerProps {
  initialCategoryType?: DropdownCategoryType;
}

/**
 * Consolidated Report Dropdown Manager
 * Forwards to the unified DROPLIST MANAGEMENT view, ensuring one single source of truth in Firestore.
 */
export const ReportDropdownManager: React.FC<ReportDropdownManagerProps> = () => {
  return <DroplistManagementView />;
};

export default ReportDropdownManager;
