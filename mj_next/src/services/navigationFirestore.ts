/**
 * Legacy filename retained for compatibility. Navigation persistence is now
 * backed by Supabase app_settings through the Express API; Firebase is not used.
 */
import { getAuthHeaders } from './authService';
import { NavigationConfig, NavigationCategory, NavigationStandaloneMenu, NavigationSubmenuItem } from '../types/navigation';
import { DEFAULT_NAVIGATION_CONFIG } from '../constants/defaultNavigationConfig';

const NAV_KEY = 'navigation_config';
export type Unsubscribe = () => void;

export function normalizeNavigationConfig(raw: any): NavigationConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_NAVIGATION_CONFIG;
  const cats = Array.isArray(raw.categories) && raw.categories.length ? raw.categories : DEFAULT_NAVIGATION_CONFIG.categories;
  const standalone = Array.isArray(raw.standaloneMenus) && raw.standaloneMenus.length ? raw.standaloneMenus : DEFAULT_NAVIGATION_CONFIG.standaloneMenus;
  const submenus = Array.isArray(raw.submenuItems) && raw.submenuItems.length ? raw.submenuItems : DEFAULT_NAVIGATION_CONFIG.submenuItems;
  const categories: NavigationCategory[] = cats.map((c:any,i:number)=>{const name=c.name||c.title||c.label||`Kategori ${i+1}`;const visible=c.visible!==undefined?Boolean(c.visible):c.active!==undefined?Boolean(c.active):true;const mode=c.mode||(c.isAccordion===false?'static':'accordion');return {...c,id:c.id||`cat_${i+1}`,name,title:name,visible,active:visible,mode,isAccordion:mode==='accordion'};});
  const standaloneMenus: NavigationStandaloneMenu[] = standalone.map((m:any,i:number)=>{const name=m.name||m.label||m.title||`Menu ${i+1}`;const visible=m.visible!==undefined?Boolean(m.visible):m.active!==undefined?Boolean(m.active):true;return {...m,id:m.id||`menu_${i+1}`,name,label:name,visible,active:visible};});
  const submenuItems: NavigationSubmenuItem[] = submenus.map((m:any,i:number)=>{const name=m.name||m.label||m.title||`Submenu ${i+1}`;const visible=m.visible!==undefined?Boolean(m.visible):m.active!==undefined?Boolean(m.active):true;const categoryId=m.categoryId||m.parentCategoryId||categories[0]?.id||'cat_tambahan';return {...m,id:m.id||`sub_${i+1}`,name,label:name,categoryId,parentCategoryId:categoryId,visible,active:visible};});
  return {...raw,categories,standaloneMenus,submenuItems,accordionSettings:{...DEFAULT_NAVIGATION_CONFIG.accordionSettings,...(raw.accordionSettings||{})}} as NavigationConfig;
}

async function load():Promise<NavigationConfig|null>{const r=await fetch(`/api/supabase/settings/${NAV_KEY}`,{headers:getAuthHeaders()});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b?.error?.message||b?.error||`HTTP ${r.status}`);return b?.data?normalizeNavigationConfig(b.data):null;}
async function save(config:NavigationConfig,operatorName='Super Admin'){const normalized=normalizeNavigationConfig(config);const payload={...normalized,updatedAt:new Date().toISOString(),updatedBy:operatorName,navigationVersion:(normalized.navigationVersion||1)+1};const r=await fetch(`/api/supabase/settings/${NAV_KEY}`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({value:payload,description:'MoraJaws Canonical Navigation Configuration'})});const b=await r.json().catch(()=>({}));if(!r.ok||!b.success)throw new Error(b?.error?.message||b?.error||`HTTP ${r.status}`);return {success:true,updatedAt:payload.updatedAt};}

export async function saveNavigationConfigToFirestore(config:NavigationConfig,operatorName='Super Admin'){return save(config,operatorName);}
export async function loadNavigationConfigFromFirestore(){return load();}
export function subscribeToNavigationConfig(callback:(config:NavigationConfig)=>void,onError?:(err:any)=>void):Unsubscribe{let active=true;const poll=async()=>{try{const v=await load();if(active&&v)callback(v);}catch(e){onError?.(e);}};poll();const timer=setInterval(poll,30000);return()=>{active=false;clearInterval(timer);};}
