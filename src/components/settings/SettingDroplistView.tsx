import React from 'react';
import { DroplistManagementView } from './DroplistManagementView';
import { DropdownCategoryType } from '../../types';

export interface SettingDroplistViewProps {
  initialCategoryType?: DropdownCategoryType;
}

/**
 * Consolidated Droplist Settings View
 * Routes directly to the unified DroplistManagementView (DROPLIST MANAGEMENT)
 */
export const SettingDroplistView: React.FC<SettingDroplistViewProps> = () => {
  return <DroplistManagementView />;
};

export default SettingDroplistView;
