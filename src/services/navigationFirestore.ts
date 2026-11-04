import { doc, getDoc, setDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { COLLECTIONS } from './firestoreDb';
import { NavigationConfig, NavigationCategory, NavigationStandaloneMenu, NavigationSubmenuItem } from '../types/navigation';
import { DEFAULT_NAVIGATION_CONFIG } from '../constants/defaultNavigationConfig';

const NAV_DOC_ID = 'navigation';

function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();

  if (Array.isArray(obj)) {
    return obj
      .filter(item => item !== undefined)
      .map(item => sanitizeForFirestore(item));
  }

  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    if (val instanceof Date) {
      result[key] = val.toISOString();
    } else if (val !== null && typeof val === 'object') {
      result[key] = sanitizeForFirestore(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

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

/**
 * Save Navigation Configuration to Cloud Firestore (appSettings/navigation)
 */
export async function saveNavigationConfigToFirestore(
  config: NavigationConfig,
  operatorName: string = 'Super Admin'
): Promise<{ success: boolean; updatedAt: string }> {
  const path = `${COLLECTIONS.APP_SETTINGS}/${NAV_DOC_ID}`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, NAV_DOC_ID);
    const updatedAt = new Date().toISOString();

    const normalized = normalizeNavigationConfig(config);

    // Save with both schema fields to guarantee complete backwards & forwards compatibility
    const payloadToSave = {
      categories: normalized.categories.map(c => ({
        ...c,
        title: c.name,
        active: c.visible,
        isAccordion: c.mode === 'accordion'
      })),
      standaloneMenus: normalized.standaloneMenus.map(m => ({
        ...m,
        label: m.name,
        active: m.visible
      })),
      submenuItems: normalized.submenuItems.map(s => ({
        ...s,
        label: s.name,
        active: s.visible,
        parentCategoryId: s.categoryId
      })),
      accordionSettings: {
        ...normalized.accordionSettings,
        allowMultipleOpenGroups: normalized.accordionSettings.allowMultipleOpen
      },
      navigationVersion: (config.navigationVersion || 1) + 1,
      updatedAt,
      updatedBy: operatorName
    };

    await setDoc(docRef, sanitizeForFirestore(payloadToSave), { merge: true });

    return { success: true, updatedAt };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

/**
 * Load Navigation Configuration from Cloud Firestore
 */
export async function loadNavigationConfigFromFirestore(): Promise<NavigationConfig | null> {
  const path = `${COLLECTIONS.APP_SETTINGS}/${NAV_DOC_ID}`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, NAV_DOC_ID);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      return normalizeNavigationConfig(data);
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

/**
 * Real-time listener for navigation configuration changes
 */
export function subscribeToNavigationConfig(
  callback: (config: NavigationConfig) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const docRef = doc(db, COLLECTIONS.APP_SETTINGS, NAV_DOC_ID);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        callback(normalizeNavigationConfig(data));
      }
    },
    (err) => {
      console.warn('[Firestore] Navigation config real-time subscription error:', err);
      if (onError) onError(err);
    }
  );
}
