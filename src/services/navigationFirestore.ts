import { getAuthHeaders } from './authService';
import { NavigationConfig, NavigationCategory, NavigationStandaloneMenu, NavigationSubmenuItem } from '../types/navigation';
import { DEFAULT_NAVIGATION_CONFIG } from '../constants/defaultNavigationConfig';

/**
 * Normalizes navigation data from Firestore or LocalStorage to ensure full compatibility
 * with both `name`/`label`/`title`, `visible`/`active`, `categoryId`/`parentCategoryId`,
 * and `mode`/`isAccordion`.
 */
export function normalizeNavigationConfig(raw: any): NavigationConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_NAVIGATION_CONFIG;

  const rawCats = Array.isArray(raw.categories) && raw.categories.length > 0
    ? raw.categories
    : DEFAULT_NAVIGATION_CONFIG.categories;

  const categories: NavigationCategory[] = rawCats.map((c: any, idx: number) => {
    const name = c.name || c.title || c.label || `Kategori ${idx + 1}`;
    const visible = c.visible !== undefined ? Boolean(c.visible) : (c.active !== undefined ? Boolean(c.active) : true);
    const mode = c.mode || (c.isAccordion === false ? 'static' : 'accordion');

    return {
      id: c.id || `cat_${idx + 1}`,
      name,
      title: name,
      icon: c.icon || 'FolderTree',
      order: typeof c.order === 'number' ? c.order : idx + 1,
      visible,
      active: visible,
      mode,
      isAccordion: mode === 'accordion',
      allowMultipleOpen: c.allowMultipleOpen !== undefined ? Boolean(c.allowMultipleOpen) : true
    };
  });

  const rawStandalone = Array.isArray(raw.standaloneMenus) && raw.standaloneMenus.length > 0
    ? raw.standaloneMenus
    : DEFAULT_NAVIGATION_CONFIG.standaloneMenus;

  const standaloneMenus: NavigationStandaloneMenu[] = rawStandalone.map((m: any, idx: number) => {
    const name = m.name || m.label || m.title || `Menu ${idx + 1}`;
    const visible = m.visible !== undefined ? Boolean(m.visible) : (m.active !== undefined ? Boolean(m.active) : true);

    return {
      id: m.id || `menu_${idx + 1}`,
      name,
      label: name,
      icon: m.icon || 'LayoutDashboard',
      order: typeof m.order === 'number' ? m.order : idx + 1,
      visible,
      active: visible,
      roles: Array.isArray(m.roles) && m.roles.length > 0 ? m.roles : ['super_admin', 'dispatch', 'leader', 'management_data', 'it_support', 'installer'],
      badgeKey: m.badgeKey,
      badgeColor: m.badgeColor
    };
  });

  const rawSubmenus = Array.isArray(raw.submenuItems) && raw.submenuItems.length > 0
    ? raw.submenuItems
    : DEFAULT_NAVIGATION_CONFIG.submenuItems;

  const submenuItems: NavigationSubmenuItem[] = rawSubmenus.map((s: any, idx: number) => {
    const name = s.name || s.label || s.title || `Submenu ${idx + 1}`;
    const visible = s.visible !== undefined ? Boolean(s.visible) : (s.active !== undefined ? Boolean(s.active) : true);
    const categoryId = s.categoryId || s.parentCategoryId || categories[0]?.id || 'cat_tambahan';

    return {
      id: s.id || `sub_${idx + 1}`,
      name,
      label: name,
      icon: s.icon || 'FileSpreadsheet',
      categoryId,
      parentCategoryId: categoryId,
      order: typeof s.order === 'number' ? s.order : idx + 1,
      visible,
      active: visible,
      roles: Array.isArray(s.roles) && s.roles.length > 0 ? s.roles : ['super_admin', 'dispatch', 'leader', 'management_data', 'it_support', 'installer'],
      badgeKey: s.badgeKey,
      badgeColor: s.badgeColor,
      highlight: s.highlight
    };
  });

  const allowMultiple = raw.accordionSettings?.allowMultipleOpen ?? raw.accordionSettings?.allowMultipleOpenGroups ?? true;

  return {
    categories,
    standaloneMenus,
    submenuItems,
    accordionSettings: {
      allowMultipleOpen: allowMultiple,
      allowMultipleOpenGroups: allowMultiple,
      defaultExpandedCategoryIds: Array.isArray(raw.accordionSettings?.defaultExpandedCategoryIds)
        ? raw.accordionSettings.defaultExpandedCategoryIds
        : categories.map(c => c.id),
      smoothAnimation: raw.accordionSettings?.smoothAnimation ?? true
    },
    navigationVersion: raw.navigationVersion || 1,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    updatedBy: raw.updatedBy || 'System'
  };
}

/** Persist canonical navigation through the authenticated Express API. */
export async function saveNavigationConfigToFirestore(config: NavigationConfig, operatorName: string = 'Super Admin'): Promise<{ success: boolean; updatedAt: string }> {
  const normalized = normalizeNavigationConfig(config);
  const updatedAt = new Date().toISOString();
  const payloadToSave = {
    categories: normalized.categories.map(c => ({ ...c, title: c.name, active: c.visible, isAccordion: c.mode === 'accordion' })),
    standaloneMenus: normalized.standaloneMenus.map(m => ({ ...m, label: m.name, active: m.visible })),
    submenuItems: normalized.submenuItems.map(s => ({ ...s, label: s.name, active: s.visible, parentCategoryId: s.categoryId })),
    accordionSettings: { ...normalized.accordionSettings, allowMultipleOpenGroups: normalized.accordionSettings.allowMultipleOpen },
    navigationVersion: (config.navigationVersion || 1) + 1, updatedAt, updatedBy: operatorName
  };
  const response = await fetch('/api/supabase/settings/navigation_config', { method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ value: payloadToSave, description: 'MoraJaws Canonical Navigation Configuration' }) });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new Error(result?.error?.message || 'Gagal menyimpan konfigurasi navigasi ke Supabase.');
  return { success: true, updatedAt };
}

export async function loadNavigationConfigFromFirestore(): Promise<NavigationConfig | null> {
  const response = await fetch('/api/supabase/settings/navigation_config', { headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, credentials: 'include' });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error?.message || 'Gagal memuat konfigurasi navigasi dari Supabase.');
  if (!result?.success || !result.data) return null;
  return normalizeNavigationConfig(result.data.value ?? result.data);
}

/** One-shot initial snapshot; Express settings currently has no realtime stream. */
export function subscribeToNavigationConfig(callback: (config: NavigationConfig) => void, onError?: (err: Error) => void): () => void {
  let active = true;
  loadNavigationConfigFromFirestore().then(config => { if (active && config) callback(config); }).catch(err => { if (active) onError?.(err instanceof Error ? err : new Error(String(err))); });
  return () => { active = false; };
}
