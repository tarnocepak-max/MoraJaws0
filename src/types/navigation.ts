import { UserRole } from './index';

export type CategoryMode = 'accordion' | 'static';

export interface NavigationCategory {
  id: string; // Stable ID, e.g. 'cat_contractor_area', 'contractor_area', etc.
  name: string; // e.g. 'Contractor & Area', 'Installer', 'Menu Tambahan'
  title?: string; // Legacy alias for name
  icon?: string; // Lucide icon name, e.g. 'Building2', 'Wrench', 'Layers'
  order: number;
  visible: boolean;
  active?: boolean; // Legacy alias for visible
  mode: CategoryMode; // 'accordion' (collapsible) or 'static' (always expanded)
  isAccordion?: boolean; // Legacy alias for mode === 'accordion'
  allowMultipleOpen?: boolean; // Can be open concurrently with other categories (default: true)
}

export interface NavigationStandaloneMenu {
  id: string; // Stable route/tab ID, e.g. 'dashboard', 'tickets', 'report_data_wo', 'import', 'contact_centre', 'schedule', 'users'
  name: string;
  label?: string; // Legacy alias for name
  icon?: string; // Lucide icon name
  order: number;
  visible: boolean;
  active?: boolean; // Legacy alias for visible
  roles?: UserRole[]; // Roles allowed to access
  badgeKey?: 'totalTickets' | 'unassignedTickets' | 'live' | 'auto';
  badgeColor?: 'purple' | 'amber' | 'emerald';
}

export interface NavigationSubmenuItem {
  id: string; // Stable route/tab ID, e.g. 'leader_portal', 'location_basecamp', 'installer_portal', etc.
  name: string;
  label?: string; // Legacy alias for name
  icon?: string; // Lucide icon name
  categoryId: string; // Parent category ID
  parentCategoryId?: string; // Legacy alias for categoryId
  order: number;
  visible: boolean;
  active?: boolean; // Legacy alias for visible
  roles?: UserRole[]; // Roles allowed to access
  badgeKey?: 'totalTickets' | 'unassignedTickets' | 'express' | 'live' | 'auto';
  badgeColor?: 'purple' | 'amber' | 'emerald';
  highlight?: boolean;
}

export interface AccordionSettings {
  allowMultipleOpen: boolean; // Support multi-submenu collapse simultaneously
  allowMultipleOpenGroups?: boolean; // Legacy alias
  defaultExpandedCategoryIds: string[]; // Categories expanded by default
  defaultExpanded?: boolean; // Legacy alias
  smoothAnimation: boolean;
}

export interface NavigationConfig {
  categories: NavigationCategory[];
  standaloneMenus: NavigationStandaloneMenu[];
  submenuItems: NavigationSubmenuItem[];
  accordionSettings: AccordionSettings;
  navigationVersion: number;
  updatedAt: string;
  updatedBy: string;
}
