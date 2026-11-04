import { NavigationConfig } from '../types/navigation';

export const DEFAULT_NAVIGATION_CONFIG: NavigationConfig = {
  navigationVersion: 2,
  updatedAt: new Date().toISOString(),
  updatedBy: 'System Default',
  accordionSettings: {
    allowMultipleOpen: true, // Independent accordion collapse: multiple categories can be open concurrently
    defaultExpandedCategoryIds: ['cat_contractor_area', 'cat_installer', 'cat_tambahan'],
    smoothAnimation: true
  },
  // Exact 3 Kategori Accordion
  categories: [
    {
      id: 'cat_contractor_area',
      name: 'Contractor & Area',
      icon: 'Building2',
      order: 1,
      visible: true,
      mode: 'accordion',
      allowMultipleOpen: true
    },
    {
      id: 'cat_installer',
      name: 'Installer',
      icon: 'Wrench',
      order: 2,
      visible: true,
      mode: 'accordion',
      allowMultipleOpen: true
    },
    {
      id: 'cat_tambahan',
      name: 'Menu Tambahan',
      icon: 'Layers',
      order: 3,
      visible: true,
      mode: 'accordion',
      allowMultipleOpen: true
    }
  ],
  // Exact 7 Menu Mandiri (Standalone Menu)
  standaloneMenus: [
    {
      id: 'dashboard',
      name: 'Dashboard Monitoring',
      icon: 'LayoutDashboard',
      order: 1,
      visible: true,
      roles: ['super_admin', 'dispatch', 'leader', 'management_data']
    },
    {
      id: 'tickets',
      name: 'Ticket MyRepublic',
      icon: 'Ticket',
      order: 2,
      visible: true,
      roles: ['super_admin', 'dispatch'],
      badgeKey: 'totalTickets',
      badgeColor: 'purple'
    },
    {
      id: 'report_data_wo',
      name: 'Report Data WO',
      icon: 'BarChart3',
      order: 3,
      visible: true,
      roles: ['super_admin', 'dispatch']
    },
    {
      id: 'import',
      name: 'Import Data WO',
      icon: 'FileSpreadsheet',
      order: 4,
      visible: true,
      roles: ['super_admin', 'dispatch', 'management_data']
    },
    {
      id: 'contact_centre',
      name: 'Contact Centre',
      icon: 'MessageSquare',
      order: 5,
      visible: true,
      roles: ['super_admin', 'dispatch', 'leader', 'installer']
    },
    {
      id: 'schedule',
      name: 'Schedule',
      icon: 'Calendar',
      order: 6,
      visible: true,
      roles: ['super_admin', 'dispatch', 'leader']
    },
    {
      id: 'users',
      name: 'Management User',
      icon: 'Users',
      order: 7,
      visible: true,
      roles: ['super_admin']
    }
  ],
  // Submenu Items organized inside the 3 categories
  submenuItems: [
    // 1. Contractor & Area submenus
    {
      id: 'leader_portal',
      name: 'Dashboard Leader',
      icon: 'Users2',
      categoryId: 'cat_contractor_area',
      order: 1,
      visible: true,
      roles: ['super_admin', 'leader'],
      badgeKey: 'unassignedTickets',
      badgeColor: 'amber'
    },
    {
      id: 'location_basecamp',
      name: 'Kontraktor & Basecamp',
      icon: 'Building2',
      categoryId: 'cat_contractor_area',
      order: 2,
      visible: true,
      roles: ['super_admin', 'leader']
    },

    // 2. Installer submenus
    {
      id: 'installer_portal',
      name: 'Tugas Saya & Laporan',
      icon: 'Wrench',
      categoryId: 'cat_installer',
      order: 1,
      visible: true,
      roles: ['super_admin', 'installer']
    },

    // 3. Menu Tambahan submenus
    {
      id: 'form_sameday',
      name: 'Form Sameday',
      icon: 'Zap',
      categoryId: 'cat_tambahan',
      order: 1,
      visible: true,
      roles: ['dispatch'],
      badgeKey: 'express',
      badgeColor: 'amber'
    },
    {
      id: 'login_logs',
      name: 'Login Log',
      icon: 'KeyRound',
      categoryId: 'cat_tambahan',
      order: 2,
      visible: true,
      roles: ['super_admin', 'dispatch', 'it_support']
    },
    {
      id: 'setting_droplist',
      name: 'Setting Droplist',
      icon: 'ListFilter',
      categoryId: 'cat_tambahan',
      order: 3,
      visible: true,
      roles: ['super_admin', 'dispatch', 'it_support']
    },
    {
      id: 'management_data_portal',
      name: 'Management Data Portal',
      icon: 'Database',
      categoryId: 'cat_tambahan',
      order: 4,
      visible: true,
      roles: ['super_admin', 'management_data'],
      highlight: true
    },
    {
      id: 'database_sync',
      name: 'Monitoring Sinkronisasi',
      icon: 'RefreshCw',
      categoryId: 'cat_tambahan',
      order: 5,
      visible: true,
      roles: ['super_admin', 'management_data'],
      badgeKey: 'live',
      badgeColor: 'emerald'
    },
    {
      id: 'database_management',
      name: 'Database Application',
      icon: 'Server',
      categoryId: 'cat_tambahan',
      order: 6,
      visible: true,
      roles: ['super_admin', 'management_data']
    },
    {
      id: 'sheets_sync',
      name: 'Google Sheets Sync',
      icon: 'RefreshCw',
      categoryId: 'cat_tambahan',
      order: 7,
      visible: true,
      roles: ['super_admin'],
      badgeKey: 'auto',
      badgeColor: 'emerald'
    },
    {
      id: 'management_role',
      name: 'Management Role',
      icon: 'ShieldCheck',
      categoryId: 'cat_tambahan',
      order: 8,
      visible: true,
      roles: ['super_admin']
    },
    {
      id: 'settings',
      name: 'Field Mapping',
      icon: 'FileSpreadsheet',
      categoryId: 'cat_tambahan',
      order: 9,
      visible: true,
      roles: ['super_admin', 'it_support']
    },
    {
      id: 'ui_builder',
      name: 'UI Configuration Builder',
      icon: 'Sliders',
      categoryId: 'cat_tambahan',
      order: 10,
      visible: true,
      roles: ['super_admin', 'it_support'],
      highlight: true
    },
    {
      id: 'audit_logs',
      name: 'Audit Log & History',
      icon: 'History',
      categoryId: 'cat_tambahan',
      order: 11,
      visible: true,
      roles: ['super_admin', 'it_support']
    },
    {
      id: 'system_health',
      name: 'System Health',
      icon: 'Activity',
      categoryId: 'cat_tambahan',
      order: 12,
      visible: true,
      roles: ['super_admin', 'it_support'],
      badgeKey: 'live',
      badgeColor: 'emerald'
    },
    {
      id: 'templates',
      name: 'WhatsApp Templates',
      icon: 'MessageSquareQuote',
      categoryId: 'cat_tambahan',
      order: 13,
      visible: true,
      roles: ['super_admin', 'dispatch', 'leader']
    },
    {
      id: 'workflows',
      name: 'Workflow Automation',
      icon: 'GitBranch',
      categoryId: 'cat_tambahan',
      order: 14,
      visible: true,
      roles: ['super_admin', 'dispatch']
    },
    {
      id: 'offline_sync',
      name: 'Sinkronisasi Offline',
      icon: 'Database',
      categoryId: 'cat_tambahan',
      order: 15,
      visible: true,
      roles: ['super_admin', 'dispatch', 'leader', 'installer']
    }
  ]
};
