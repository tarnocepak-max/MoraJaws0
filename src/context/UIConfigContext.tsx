import React, { createContext, useContext, useState, useEffect } from 'react';
import { UIConfiguration, ColumnConfig, ToolbarButtonConfig, SectionDetailConfig, TablePreset } from '../types';
import { DEFAULT_UI_CONFIG } from '../constants/defaultConfig';
import {
  saveUIConfigurationToFirestore,
  loadUIConfigurationFromFirestore,
  subscribeToUIConfiguration
} from '../services/firestoreDb';

interface UIConfigContextType {
  config: UIConfiguration;
  draftConfig: UIConfiguration | null;
  isDrafting: boolean;
  startDrafting: () => void;
  updateDraft: (updater: (prev: UIConfiguration) => UIConfiguration) => void;
  saveDraft: () => void;
  cancelDraft: () => void;
  resetToDefaults: () => void;
  
  // Quick Direct Actions (applied directly)
  setGlobalTheme: (updates: Partial<UIConfiguration['global']>) => void;
  setColumnVisibility: (columnKey: string, visible: boolean) => void;
  setColumnOrder: (sourceIndex: number, destinationIndex: number) => void;
  updateColumnConfig: (columnKey: string, updates: Partial<ColumnConfig>) => void;
  applyPreset: (presetId: string) => void;
  saveCurrentAsPreset: (name: string, description: string) => void;
  deletePreset: (presetId: string) => void;
  
  // Toolbar settings
  updateToolbarButton: (buttonId: string, updates: Partial<ToolbarButtonConfig>) => void;
  toggleToolbarOption: (key: keyof UIConfiguration['toolbar'], value: boolean) => void;

  // Ticket Detail settings
  toggleDetailSection: (sectionId: string, visible: boolean) => void;
  reorderDetailSections: (sourceIndex: number, destinationIndex: number) => void;
  updateDetailField: (sectionId: string, fieldKey: string, updates: any) => void;
  setShowEmptyFields: (show: boolean) => void;

  // Device profile & ergonomic settings (Android vs PC)
  isMobileView: boolean;
  setDeviceMode: (mode: 'auto' | 'pc' | 'android') => void;
  updateAndroidSettings: (updates: Partial<UIConfiguration['device']['android']>) => void;
  updatePCSettings: (updates: Partial<UIConfiguration['device']['pc']>) => void;
  applyDevicePreset: (preset: 'comfortable_android' | 'high_productivity_pc' | 'auto') => void;

  // Sidebar controls
  setSidebarState: (state: 'expanded' | 'minimized' | 'closed') => void;

  // Menu Category & Layout settings
  navigationItems: NavigationMenuItem[];
  menuCategories: string[];
  updateNavigationItem: (id: string, updates: Partial<NavigationMenuItem>) => void;
  moveNavigationItem: (id: string, direction: 'up' | 'down') => void;
  setMenuCategories: (categories: string[]) => void;
  resetNavigationMenu: () => void;

  // Import / Export JSON
  exportConfigJson: () => string;
  importConfigJson: (jsonString: string) => boolean;

  // Cloud Database Configuration (Firestore)
  saveConfigToFirestore: (operatorName?: string) => Promise<{ success: boolean; error?: string; updatedAt?: string }>;
  loadConfigFromFirestore: () => Promise<{ success: boolean; error?: string }>;
  isCloudSyncing: boolean;
  lastCloudSyncTime: string | null;
  cloudSyncStatus: 'synced' | 'local_only' | 'syncing' | 'error';
}

export interface NavigationMenuItem {
  id: string;
  label: string;
  category: string;
  order: number;
  visible: boolean;
}

export const DEFAULT_MENU_CATEGORIES = [
  'Dispatch Management',
  'Menu Leader',
  'Portal Teknisi',
  'Menu Tambahan'
];

export const DEFAULT_NAVIGATION_ITEMS: NavigationMenuItem[] = [
  // Dispatch Management
  { id: 'tickets', label: 'TICKET MYREPUBLIC', category: 'Dispatch Management', order: 1, visible: true },
  { id: 'form_sameday', label: 'Form Sameday', category: 'Dispatch Management', order: 2, visible: true },
  { id: 'report_data_wo', label: 'Report Data WO', category: 'Dispatch Management', order: 3, visible: true },
  { id: 'schedule', label: 'Schedule', category: 'Dispatch Management', order: 4, visible: true },
  { id: 'login_logs', label: 'Login Log', category: 'Dispatch Management', order: 5, visible: true },
  { id: 'setting_droplist', label: 'Setting Droplist', category: 'Dispatch Management', order: 6, visible: true },

  // Menu Leader
  { id: 'leader_portal', label: 'Dashboard Leader', category: 'Menu Leader', order: 7, visible: true },
  { id: 'location_basecamp', label: 'Kontraktor & Basecamp', category: 'Menu Leader', order: 8, visible: true },

  // Portal Teknisi
  { id: 'installer_portal', label: 'Tugas Saya & Laporan', category: 'Portal Teknisi', order: 9, visible: true },

  // Menu Tambahan
  { id: 'dashboard', label: 'Dashboard Monitoring', category: 'Menu Tambahan', order: 10, visible: true },
  { id: 'contact_centre', label: 'Contact Centre', category: 'Menu Tambahan', order: 11, visible: true },
  { id: 'database_management', label: 'Database Application', category: 'Menu Tambahan', order: 12, visible: true },
  { id: 'management_data_portal', label: 'Management Data Portal', category: 'Menu Tambahan', order: 13, visible: true },
  { id: 'database_sync', label: 'Monitoring Sinkronisasi', category: 'Menu Tambahan', order: 14, visible: true },
  { id: 'import', label: 'Import Data WO', category: 'Menu Tambahan', order: 15, visible: true },
  { id: 'users', label: 'Management User', category: 'Menu Tambahan', order: 16, visible: true },
  { id: 'management_role', label: 'Management Role', category: 'Menu Tambahan', order: 17, visible: true },
  { id: 'settings', label: 'Field Mapping', category: 'Menu Tambahan', order: 18, visible: true },
  { id: 'sheets_sync', label: 'Google Sheets Sync', category: 'Menu Tambahan', order: 19, visible: true },
  { id: 'ui_builder', label: 'UI Configuration Builder', category: 'Menu Tambahan', order: 20, visible: true },
  { id: 'audit_logs', label: 'Audit Log & History', category: 'Menu Tambahan', order: 21, visible: true },
  { id: 'system_health', label: 'System Health', category: 'Menu Tambahan', order: 22, visible: true }
];

const STORAGE_KEY = 'dispatch_system_ui_config_v4';
const NAV_STORAGE_KEY = 'morajaws_navigation_items_v4';
const CAT_STORAGE_KEY = 'morajaws_navigation_categories_v4';

const UIConfigContext = createContext<UIConfigContextType | undefined>(undefined);

export const UIConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [windowWidth, setWindowWidth] = useState<number>(() => {
    return typeof window !== 'undefined' ? window.innerWidth : 1200;
  });

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [config, setConfig] = useState<UIConfiguration>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure structure completeness
        const globalMerged = { ...DEFAULT_UI_CONFIG.global, ...parsed.global };
        if (!globalMerged.sidebarState) {
          globalMerged.sidebarState = globalMerged.sidebarCollapsed ? 'minimized' : 'expanded';
        }
        return {
          ...DEFAULT_UI_CONFIG,
          ...parsed,
          global: globalMerged,
          device: {
            ...DEFAULT_UI_CONFIG.device,
            ...(parsed.device || {}),
            android: { ...DEFAULT_UI_CONFIG.device.android, ...(parsed.device?.android || {}) },
            pc: { ...DEFAULT_UI_CONFIG.device.pc, ...(parsed.device?.pc || {}) }
          },
          ticketsTable: { ...DEFAULT_UI_CONFIG.ticketsTable, ...parsed.ticketsTable },
          toolbar: { ...DEFAULT_UI_CONFIG.toolbar, ...parsed.toolbar },
          ticketDetail: { ...DEFAULT_UI_CONFIG.ticketDetail, ...parsed.ticketDetail }
        };
      }
    } catch (e) {
      console.warn('Failed to parse saved UI config, using defaults', e);
    }
    return DEFAULT_UI_CONFIG;
  });

  const [draftConfig, setDraftConfig] = useState<UIConfiguration | null>(null);

  // Load global configuration from backend server on mount
  useEffect(() => {
    fetch('/api/config/global')
      .then(res => res.json())
      .then(data => {
        if (data && data.success && data.config) {
          setConfig(prev => ({
            ...prev,
            ...data.config,
            global: { ...prev.global, ...(data.config.global || {}) },
            device: {
              ...prev.device,
              ...(data.config.device || {}),
              android: { ...prev.device.android, ...(data.config.device?.android || {}) },
              pc: { ...prev.device.pc, ...(data.config.device?.pc || {}) }
            }
          }));
        }
      })
      .catch(() => {});
  }, []);

  // Sync to localStorage and backend
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save UI configuration to localStorage', e);
    }

    // Persist to backend server API
    fetch('/api/config/global', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    }).catch(() => {});

    // Apply document theme class if dark mode
    if (config.global.themeMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [config]);

  // Navigation menu & categories state
  const [menuCategories, setMenuCategoriesState] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(CAT_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse saved menu categories', e);
    }
    return DEFAULT_MENU_CATEGORIES;
  });

  const [navigationItems, setNavigationItemsState] = useState<NavigationMenuItem[]>(() => {
    try {
      const saved = localStorage.getItem(NAV_STORAGE_KEY);
      if (saved) {
        const parsed: NavigationMenuItem[] = JSON.parse(saved);
        const filtered = parsed
          .filter(i => !['assign_wo_fat', 'import_excel', 'contractors'].includes(i.id))
          .map(i => {
            if (i.id === 'leader_portal' && i.label === 'Dashboard Area') return { ...i, label: 'Dashboard Leader' };
            if (i.id === 'tickets') return { ...i, label: 'TICKET MYREPUBLIC' };
            return i;
          });
        const existingIds = new Set(filtered.map(i => i.id));
        const merged = [...filtered];
        for (const def of DEFAULT_NAVIGATION_ITEMS) {
          if (!existingIds.has(def.id)) {
            merged.push(def);
          }
        }
        return merged;
      }
    } catch (e) {
      console.warn('Failed to parse saved navigation items', e);
    }
    return DEFAULT_NAVIGATION_ITEMS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(CAT_STORAGE_KEY, JSON.stringify(menuCategories));
    } catch (e) {
      console.error('Failed to save menu categories', e);
    }
  }, [menuCategories]);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(navigationItems));
    } catch (e) {
      console.error('Failed to save navigation items', e);
    }
  }, [navigationItems]);

  const updateNavigationItem = (id: string, updates: Partial<NavigationMenuItem>) => {
    setNavigationItemsState(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const moveNavigationItem = (id: string, direction: 'up' | 'down') => {
    setNavigationItemsState(prev => {
      const list = [...prev].sort((a, b) => a.order - b.order);
      const index = list.findIndex(i => i.id === id);
      if (index === -1) return prev;
      if (direction === 'up' && index > 0) {
        const tempOrder = list[index].order;
        list[index].order = list[index - 1].order;
        list[index - 1].order = tempOrder;
      } else if (direction === 'down' && index < list.length - 1) {
        const tempOrder = list[index].order;
        list[index].order = list[index + 1].order;
        list[index + 1].order = tempOrder;
      }
      return [...list].sort((a, b) => a.order - b.order);
    });
  };

  const setMenuCategories = (categories: string[]) => {
    setMenuCategoriesState(categories);
  };

  const resetNavigationMenu = () => {
    setMenuCategoriesState(DEFAULT_MENU_CATEGORIES);
    setNavigationItemsState(DEFAULT_NAVIGATION_ITEMS);
    try {
      localStorage.removeItem(CAT_STORAGE_KEY);
      localStorage.removeItem(NAV_STORAGE_KEY);
    } catch (e) {
      console.error(e);
    }
  };

  // Cloud Firestore Sync State
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [lastCloudSyncTime, setLastCloudSyncTime] = useState<string | null>(() => {
    try {
      return localStorage.getItem('morajaws_ui_cloud_sync_time');
    } catch {
      return null;
    }
  });
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'local_only' | 'syncing' | 'error'>('local_only');

  // Load from Cloud Firestore on mount & subscribe to real-time updates
  useEffect(() => {
    let isMounted = true;
    let unsub: (() => void) | null = null;

    async function initCloudConfig() {
      try {
        const cloudData = await loadUIConfigurationFromFirestore();
        if (cloudData && isMounted) {
          if (cloudData.config) {
            setConfig(prev => ({
              ...prev,
              ...cloudData.config,
              global: { ...prev.global, ...(cloudData.config.global || {}) },
              device: {
                ...prev.device,
                ...(cloudData.config.device || {}),
                android: { ...prev.device.android, ...(cloudData.config.device?.android || {}) },
                pc: { ...prev.device.pc, ...(cloudData.config.device?.pc || {}) }
              }
            }));
          }
          if (Array.isArray(cloudData.navigationItems) && cloudData.navigationItems.length > 0) {
            setNavigationItemsState(cloudData.navigationItems);
          }
          if (Array.isArray(cloudData.menuCategories) && cloudData.menuCategories.length > 0) {
            setMenuCategoriesState(cloudData.menuCategories);
          }
          if (cloudData.updatedAt) {
            setLastCloudSyncTime(cloudData.updatedAt);
            try {
              localStorage.setItem('morajaws_ui_cloud_sync_time', cloudData.updatedAt);
            } catch {}
          }
          setCloudSyncStatus('synced');
        }

        // Attach real-time listener so changes made on other sessions/devices sync immediately
        unsub = subscribeToUIConfiguration((data) => {
          if (!isMounted || !data) return;
          if (data.config) {
            setConfig(prev => ({
              ...prev,
              ...data.config,
              global: { ...prev.global, ...(data.config.global || {}) },
              device: {
                ...prev.device,
                ...(data.config.device || {}),
                android: { ...prev.device.android, ...(data.config.device?.android || {}) },
                pc: { ...prev.device.pc, ...(data.config.device?.pc || {}) }
              }
            }));
          }
          if (Array.isArray(data.navigationItems) && data.navigationItems.length > 0) {
            setNavigationItemsState(data.navigationItems);
          }
          if (Array.isArray(data.menuCategories) && data.menuCategories.length > 0) {
            setMenuCategoriesState(data.menuCategories);
          }
          if (data.updatedAt) {
            setLastCloudSyncTime(data.updatedAt);
          }
          setCloudSyncStatus('synced');
        });
      } catch (err) {
        console.warn('[UIConfig] Could not sync initial cloud config:', err);
      }
    }

    initCloudConfig();

    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, []);

  const saveConfigToFirestore = async (operatorName?: string): Promise<{ success: boolean; error?: string; updatedAt?: string }> => {
    setIsCloudSyncing(true);
    setCloudSyncStatus('syncing');
    try {
      const activeCfg = draftConfig || config;
      const res = await saveUIConfigurationToFirestore({
        config: activeCfg,
        navigationItems,
        menuCategories,
        updatedBy: operatorName || 'Super Admin'
      });
      setLastCloudSyncTime(res.updatedAt);
      setCloudSyncStatus('synced');
      try {
        localStorage.setItem('morajaws_ui_cloud_sync_time', res.updatedAt);
      } catch {}
      return { success: true, updatedAt: res.updatedAt };
    } catch (err: any) {
      setCloudSyncStatus('error');
      return { success: false, error: err?.message || 'Gagal menyimpan ke Firestore' };
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const loadConfigFromFirestore = async (): Promise<{ success: boolean; error?: string }> => {
    setIsCloudSyncing(true);
    setCloudSyncStatus('syncing');
    try {
      const cloudData = await loadUIConfigurationFromFirestore();
      if (!cloudData) {
        setCloudSyncStatus('local_only');
        return { success: false, error: 'Belum ada data konfigurasi tersimpan di Cloud Firestore.' };
      }
      if (cloudData.config) {
        setConfig(prev => ({
          ...prev,
          ...cloudData.config,
          global: { ...prev.global, ...(cloudData.config.global || {}) },
          device: {
            ...prev.device,
            ...(cloudData.config.device || {}),
            android: { ...prev.device.android, ...(cloudData.config.device?.android || {}) },
            pc: { ...prev.device.pc, ...(cloudData.config.device?.pc || {}) }
          }
        }));
      }
      if (Array.isArray(cloudData.navigationItems) && cloudData.navigationItems.length > 0) {
        setNavigationItemsState(cloudData.navigationItems);
      }
      if (Array.isArray(cloudData.menuCategories) && cloudData.menuCategories.length > 0) {
        setMenuCategoriesState(cloudData.menuCategories);
      }
      if (cloudData.updatedAt) {
        setLastCloudSyncTime(cloudData.updatedAt);
        try {
          localStorage.setItem('morajaws_ui_cloud_sync_time', cloudData.updatedAt);
        } catch {}
      }
      setCloudSyncStatus('synced');
      return { success: true };
    } catch (err: any) {
      setCloudSyncStatus('error');
      return { success: false, error: err?.message || 'Gagal membaca konfigurasi dari Firestore.' };
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const activeConfig = draftConfig || config;

  const startDrafting = () => {
    setDraftConfig(JSON.parse(JSON.stringify(config)));
  };

  const updateDraft = (updater: (prev: UIConfiguration) => UIConfiguration) => {
    setDraftConfig(prev => {
      const base = prev || config;
      return updater(JSON.parse(JSON.stringify(base)));
    });
  };

  const saveDraft = () => {
    if (draftConfig) {
      const finalized = {
        ...draftConfig,
        version: (draftConfig.version || 1) + 1,
        updatedAt: new Date().toISOString()
      };
      setConfig(finalized);
      setDraftConfig(null);
    }
  };

  const cancelDraft = () => {
    setDraftConfig(null);
  };

  const resetToDefaults = () => {
    setConfig(DEFAULT_UI_CONFIG);
    setDraftConfig(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const setGlobalTheme = (updates: Partial<UIConfiguration['global']>) => {
    setConfig(prev => ({
      ...prev,
      global: { ...prev.global, ...updates },
      updatedAt: new Date().toISOString()
    }));
  };

  const setSidebarState = (state: 'expanded' | 'minimized' | 'closed') => {
    setConfig(prev => ({
      ...prev,
      global: {
        ...prev.global,
        sidebarState: state,
        sidebarCollapsed: state === 'minimized'
      },
      updatedAt: new Date().toISOString()
    }));
  };

  const setColumnVisibility = (columnKey: string, visible: boolean) => {
    setConfig(prev => ({
      ...prev,
      ticketsTable: {
        ...prev.ticketsTable,
        columns: prev.ticketsTable.columns.map(col =>
          col.key === columnKey ? { ...col, visible } : col
        )
      }
    }));
  };

  const setColumnOrder = (sourceIndex: number, destinationIndex: number) => {
    setConfig(prev => {
      const cols = [...prev.ticketsTable.columns];
      const [moved] = cols.splice(sourceIndex, 1);
      cols.splice(destinationIndex, 0, moved);
      const reordered = cols.map((col, idx) => ({ ...col, order: idx + 1 }));
      return {
        ...prev,
        ticketsTable: {
          ...prev.ticketsTable,
          columns: reordered
        }
      };
    });
  };

  const updateColumnConfig = (columnKey: string, updates: Partial<ColumnConfig>) => {
    setConfig(prev => ({
      ...prev,
      ticketsTable: {
        ...prev.ticketsTable,
        columns: prev.ticketsTable.columns.map(col =>
          col.key === columnKey ? { ...col, ...updates } : col
        )
      }
    }));
  };

  const applyPreset = (presetId: string) => {
    setConfig(prev => {
      const preset = prev.ticketsTable.presets.find(p => p.id === presetId);
      if (!preset) return prev;
      return {
        ...prev,
        ticketsTable: {
          ...prev.ticketsTable,
          activePresetId: presetId,
          columns: preset.columns,
          density: preset.density,
          rowsPerPage: preset.rowsPerPage
        }
      };
    });
  };

  const saveCurrentAsPreset = (name: string, description: string) => {
    const newPreset: TablePreset = {
      id: 'preset_custom_' + Date.now(),
      name,
      description,
      columns: config.ticketsTable.columns,
      density: config.ticketsTable.density,
      rowsPerPage: config.ticketsTable.rowsPerPage
    };
    setConfig(prev => ({
      ...prev,
      ticketsTable: {
        ...prev.ticketsTable,
        presets: [...prev.ticketsTable.presets, newPreset],
        activePresetId: newPreset.id
      }
    }));
  };

  const deletePreset = (presetId: string) => {
    setConfig(prev => ({
      ...prev,
      ticketsTable: {
        ...prev.ticketsTable,
        presets: prev.ticketsTable.presets.filter(p => p.id !== presetId)
      }
    }));
  };

  const updateToolbarButton = (buttonId: string, updates: Partial<ToolbarButtonConfig>) => {
    setConfig(prev => ({
      ...prev,
      toolbar: {
        ...prev.toolbar,
        buttons: prev.toolbar.buttons.map(btn =>
          btn.id === buttonId ? { ...btn, ...updates } : btn
        )
      }
    }));
  };

  const toggleToolbarOption = (key: keyof UIConfiguration['toolbar'], value: boolean) => {
    setConfig(prev => ({
      ...prev,
      toolbar: {
        ...prev.toolbar,
        [key]: value
      }
    }));
  };

  const toggleDetailSection = (sectionId: string, visible: boolean) => {
    setConfig(prev => ({
      ...prev,
      ticketDetail: {
        ...prev.ticketDetail,
        sections: prev.ticketDetail.sections.map(sec =>
          sec.id === sectionId ? { ...sec, visible } : sec
        )
      }
    }));
  };

  const reorderDetailSections = (sourceIndex: number, destinationIndex: number) => {
    setConfig(prev => {
      const sections = [...prev.ticketDetail.sections];
      const [moved] = sections.splice(sourceIndex, 1);
      sections.splice(destinationIndex, 0, moved);
      const reordered = sections.map((sec, idx) => ({ ...sec, order: idx + 1 }));
      return {
        ...prev,
        ticketDetail: {
          ...prev.ticketDetail,
          sections: reordered
        }
      };
    });
  };

  const updateDetailField = (sectionId: string, fieldKey: string, updates: any) => {
    setConfig(prev => ({
      ...prev,
      ticketDetail: {
        ...prev.ticketDetail,
        sections: prev.ticketDetail.sections.map(sec => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            fields: sec.fields.map(f => f.key === fieldKey ? { ...f, ...updates } : f)
          };
        })
      }
    }));
  };

  const setShowEmptyFields = (show: boolean) => {
    setConfig(prev => ({
      ...prev,
      ticketDetail: {
        ...prev.ticketDetail,
        showEmptyFields: show
      }
    }));
  };

  // Device mode & ergonomic adjustments
  const isMobileView = config.device?.mode === 'android' 
    ? true 
    : config.device?.mode === 'pc' 
    ? false 
    : windowWidth < 768;

  const setDeviceMode = (mode: 'auto' | 'pc' | 'android') => {
    setConfig(prev => ({
      ...prev,
      device: {
        ...prev.device,
        mode
      }
    }));
  };

  const updateAndroidSettings = (updates: Partial<UIConfiguration['device']['android']>) => {
    setConfig(prev => ({
      ...prev,
      device: {
        ...prev.device,
        android: {
          ...prev.device.android,
          ...updates
        }
      }
    }));
  };

  const updatePCSettings = (updates: Partial<UIConfiguration['device']['pc']>) => {
    setConfig(prev => ({
      ...prev,
      device: {
        ...prev.device,
        pc: {
          ...prev.device.pc,
          ...updates
        }
      }
    }));
  };

  const applyDevicePreset = (preset: 'comfortable_android' | 'high_productivity_pc' | 'auto') => {
    setConfig(prev => {
      if (preset === 'comfortable_android') {
        return {
          ...prev,
          global: {
            ...prev.global,
            contentWidth: 'full',
            density: 'comfortable',
            sidebarState: 'closed',
            sidebarCollapsed: true
          },
          device: {
            ...prev.device,
            mode: 'android',
            android: {
              ...prev.device.android,
              layoutType: 'cards',
              touchTargetSize: 'comfortable',
              showBottomNavigation: true,
              cardDensity: 'comfortable',
              highContrastBadges: true,
              showQuickCall: true,
              showQuickWhatsApp: true,
              showQuickDetail: true,
              autoCloseSidebarOnNavigate: true
            }
          },
          ticketsTable: {
            ...prev.ticketsTable,
            rowsPerPage: 10,
            density: 'comfortable'
          }
        };
      } else if (preset === 'high_productivity_pc') {
        return {
          ...prev,
          global: {
            ...prev.global,
            contentWidth: 'full',
            density: 'compact',
            sidebarState: 'expanded',
            sidebarCollapsed: false
          },
          device: {
            ...prev.device,
            mode: 'pc',
            pc: {
              ...prev.device.pc,
              tableDensity: 'compact',
              stickyColumns: true,
              wideScreenFullWidth: true,
              showInlineFilters: true,
              showBulkToolbar: true,
              multiColumnDetail: true
            }
          },
          ticketsTable: {
            ...prev.ticketsTable,
            rowsPerPage: 20,
            density: 'compact'
          }
        };
      } else {
        // Auto mode
        return {
          ...prev,
          device: {
            ...prev.device,
            mode: 'auto'
          }
        };
      }
    });
  };

  const exportConfigJson = () => {
    return JSON.stringify(config, null, 2);
  };

  const importConfigJson = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.global && parsed.ticketsTable) {
        setConfig({
          ...DEFAULT_UI_CONFIG,
          ...parsed,
          version: (parsed.version || 1) + 1,
          updatedAt: new Date().toISOString()
        });
        return true;
      }
    } catch (e) {
      console.error('Invalid configuration JSON', e);
    }
    return false;
  };

  return (
    <UIConfigContext.Provider
      value={{
        config: activeConfig,
        draftConfig,
        isDrafting: Boolean(draftConfig),
        isMobileView,
        startDrafting,
        updateDraft,
        saveDraft,
        cancelDraft,
        resetToDefaults,
        setGlobalTheme,
        setSidebarState,
        setDeviceMode,
        updateAndroidSettings,
        updatePCSettings,
        applyDevicePreset,
        setColumnVisibility,
        setColumnOrder,
        updateColumnConfig,
        applyPreset,
        saveCurrentAsPreset,
        deletePreset,
        updateToolbarButton,
        toggleToolbarOption,
        toggleDetailSection,
        reorderDetailSections,
        updateDetailField,
        setShowEmptyFields,
        navigationItems,
        menuCategories,
        updateNavigationItem,
        moveNavigationItem,
        setMenuCategories,
        resetNavigationMenu,
        exportConfigJson,
        importConfigJson,
        saveConfigToFirestore,
        loadConfigFromFirestore,
        isCloudSyncing,
        lastCloudSyncTime,
        cloudSyncStatus
      }}
    >
      {children}
    </UIConfigContext.Provider>
  );
};

export const useUIConfig = () => {
  const context = useContext(UIConfigContext);
  if (!context) {
    throw new Error('useUIConfig must be used within a UIConfigProvider');
  }
  return context;
};
