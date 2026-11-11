/**
 * MoraJaws canonical data compatibility layer.
 *
 * Historical name retained to avoid a broad UI refactor, but this module MUST
 * NOT access Firebase/Firestore. All persistence is routed through the
 * authenticated Express API backed by Supabase PostgreSQL.
 */
import type {
  Ticket,
  WhatsAppTemplate,
  AuditLog,
  User,
  Contractor,
  CoverageArea,
  TicketMessage,
  ReportDropdownCategory,
  ChatCategoryConfig,
  HierarchicalStatus,
  CanonicalFieldConfig,
} from '../types/index.ts';
import { getAuthHeaders } from './authService';
import { DEFAULT_NAVIGATION_CONFIG } from '../constants/defaultNavigationConfig';
import { DEFAULT_UI_CONFIG } from '../constants/defaultConfig';

export type Unsubscribe = () => void;
export const COLLECTIONS = {
  TICKETS: 'work_orders', CONTRACTORS: 'contractors', COVERAGE_AREAS: 'coverage_areas',
  USERS: 'users', WA_TEMPLATES: 'wa_templates', TICKET_MESSAGES: 'ticket_messages',
  AUDIT_LOGS: 'audit_logs', APP_SETTINGS: 'app_settings'
} as const;

/** Firebase is permanently disabled for the application runtime. */
export function isFirestoreActiveForEnvironment(): boolean { return false; }

async function request<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const err:any = new Error(body?.error?.message || body?.error || `HTTP ${res.status}`); err.status = res.status; throw err; }
  return body as T;
}

async function settingGet<T = any>(key: string): Promise<T | null> {
  const body = await request<{success?: boolean; data?: T}>(`/api/supabase/settings/${encodeURIComponent(key)}`);
  return body?.success ? (body.data ?? null) : null;
}
async function settingPut<T = any>(key: string, value: T, description?: string): Promise<void> {
  await request(`/api/supabase/settings/${encodeURIComponent(key)}`, { method: 'POST', body: JSON.stringify({ value, description }) });
}

export interface FirestoreSubscriptionCallbacks {
  onTicketsChange?: (tickets: Ticket[]) => void;
  onContractorsChange?: (items: Contractor[]) => void;
  onCoverageAreasChange?: (items: CoverageArea[]) => void;
  onMessagesChange?: (items: TicketMessage[]) => void;
  onTemplatesChange?: (items: WhatsAppTemplate[]) => void;
  onUsersChange?: (items: User[]) => void;
  onReportDropdownCategoriesChange?: (items: ReportDropdownCategory[]) => void;
  onChatCategoriesChange?: (items: ChatCategoryConfig[]) => void;
  onHierarchicalDroplistsChange?: (items: HierarchicalStatus[]) => void;
  onError?: (error: any) => void;
}

/** Uses the existing Supabase SSE stream instead of Firestore listeners. */
export function subscribeToMoraJawsFirestore(callbacks: FirestoreSubscriptionCallbacks): Unsubscribe {
  let closed = false;
  const controller = new AbortController();
  const headers = getAuthHeaders();
  fetch('/api/supabase/realtime/stream', { headers, signal: controller.signal }).then(async response => {
    if (!response.ok || !response.body) throw new Error(`Realtime stream unavailable (${response.status})`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (!closed) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        const dataLine = chunk.split('\n').find(line => line.startsWith('data:'));
        if (!dataLine) continue;
        try {
          const payload = JSON.parse(dataLine.slice(5).trim());
          const table = payload?.table || payload?.record?.table;
          const row = payload?.new || payload?.record || payload?.data;
          if (table === 'work_orders' && row) callbacks.onTicketsChange?.([row as Ticket]);
        } catch {}
      }
    }
  }).catch(err => { if (!closed && err?.name !== 'AbortError') callbacks.onError?.(err); });
  return () => { closed = true; controller.abort(); };
}

export function subscribeToAuditLogs(callback: (data: AuditLog[]) => void, onError?: (error: any) => void): Unsubscribe {
  let timer: ReturnType<typeof setInterval> | undefined;
  const load = async () => {
    try { const r = await request<{success?: boolean; data?: AuditLog[]}>('/api/supabase/audit-logs?limit=100'); if (r.success) callback(r.data || []); }
    catch (e) { onError?.(e); }
  };
  load(); timer = setInterval(load, 30000);
  return () => { if (timer) clearInterval(timer); };
}

export async function saveTicketToFirestore(ticket: Ticket): Promise<void> {
  const id = encodeURIComponent(ticket.id);
  await request(`/api/supabase/work-orders/${id}`, { method: 'PATCH', body: JSON.stringify(ticket) });
}
export async function batchSaveTicketsToFirestore(tickets: Ticket[]): Promise<{saved:number;failed:number}> {
  let saved = 0, failed = 0;
  for (const ticket of tickets) { try { await saveTicketToFirestore(ticket); saved++; } catch (err:any) { if (err?.status !== 404) { failed++; continue; } try { await request('/api/supabase/work-orders', { method:'POST', body:JSON.stringify(ticket) }); saved++; } catch { failed++; } } }
  return { saved, failed };
}
export async function batchDeleteTicketsFromFirestore(ids: string[]): Promise<void> { await Promise.all(ids.map(id => deleteTicketFromFirestore(id))); }
export async function deleteTicketFromFirestore(id: string): Promise<void> { await request(`/api/supabase/work-orders/${encodeURIComponent(id)}`, {method:'DELETE', body:JSON.stringify({reason:'Deleted by authorized MoraJaws operation'})}); }
export async function softDeleteTicketInFirestore(id:string, deletedBy:string, reason:string):Promise<void>{ await request(`/api/supabase/work-orders/${encodeURIComponent(id)}`,{method:'DELETE',body:JSON.stringify({deletedBy,reason})}); }
export async function archiveTicketInFirestore(id:string, archivedBy:string):Promise<void>{ await request(`/api/supabase/work-orders/${encodeURIComponent(id)}/archive`,{method:'POST',body:JSON.stringify({archivedBy})}); }
export async function restoreTicketInFirestore(id:string, restoredBy:string):Promise<void>{ await request(`/api/supabase/work-orders/${encodeURIComponent(id)}/restore`,{method:'POST',body:JSON.stringify({restoredBy})}); }

export async function saveGlobalAppSettingsToFirestore(settings: Record<string, any>): Promise<void> { await settingPut('global_config', settings, 'MoraJaws global configuration'); }
export async function loadGlobalAppSettingsFromFirestore(): Promise<Record<string, any>|null> { return settingGet('global_config'); }
export async function saveUserPreferencesToFirestore(userId:string, preferences:Record<string,any>):Promise<void>{ await settingPut(`user_preferences_${userId}`, preferences, 'MoraJaws user preferences'); }
export async function loadUserPreferencesFromFirestore(userId:string):Promise<Record<string,any>|null>{ return settingGet(`user_preferences_${userId}`); }
export async function saveUIConfigurationToFirestore(payload:any):Promise<{success:boolean;updatedAt:string}>{ const updatedAt=new Date().toISOString(); await settingPut('ui_configuration',{...payload,updatedAt},'MoraJaws UI configuration'); return {success:true,updatedAt}; }
export async function loadUIConfigurationFromFirestore():Promise<any|null>{ return settingGet('ui_configuration'); }
export function subscribeToUIConfiguration(callback:(data:any)=>void):Unsubscribe{ const stop=subscribeToSettings('ui_configuration',callback); return stop; }

export async function saveNavigationSettingsToFirestore(payload:any):Promise<{success:boolean;updatedAt:string}>{ const updatedAt=new Date().toISOString(); await settingPut('navigation_config',{...payload,updatedAt},'MoraJaws navigation configuration'); return {success:true,updatedAt}; }
export async function saveNavigationDocToFirestore(payload:any):Promise<{success:boolean;updatedAt:string}>{ const updatedAt=new Date().toISOString(); await settingPut('navigation_config',{...payload,updatedAt},'MoraJaws navigation configuration'); return {success:true,updatedAt}; }
export async function loadNavigationDocFromFirestore():Promise<any|null>{ return settingGet('navigation_config'); }
export function subscribeToNavigationDoc(callback:(data:any)=>void):Unsubscribe{ return subscribeToSettings('navigation_config',callback); }

function subscribeToSettings(key:string, callback:(data:any)=>void):Unsubscribe { let active=true; const load=async()=>{try{const v=await settingGet(key);if(active&&v!==null)callback(v);}catch{}};load();const timer=setInterval(load,30000);return()=>{active=false;clearInterval(timer);}; }

export async function saveContractorToFirestore(contractor:Contractor):Promise<void>{
  const existing = contractor.id ? await request(`/api/supabase/contractors`,{method:'GET'}).catch(()=>null) : null;
  const exists = Array.isArray(existing?.data) && existing.data.some((x:any)=>x.id===contractor.id);
  await request(exists ? `/api/supabase/contractors/${encodeURIComponent(contractor.id)}` : '/api/supabase/contractors',{method:exists?'PATCH':'POST',body:JSON.stringify(contractor)});
}
export async function deleteContractorFromFirestore(id:string):Promise<void>{ await request(`/api/supabase/contractors/${encodeURIComponent(id)}`,{method:'DELETE'}); }
export async function saveCoverageAreaToFirestore(area:CoverageArea):Promise<void>{ const existing=area.id?await request<{success?:boolean;data?:CoverageArea[]}>(`/api/supabase/coverage-areas`).catch(()=>null):null; const exists=Array.isArray(existing?.data)&&existing.data.some(x=>x.id===area.id); await request(exists?`/api/supabase/coverage-areas/${encodeURIComponent(area.id)}`:'/api/supabase/coverage-areas',{method:exists?'PATCH':'POST',body:JSON.stringify(area)}); }
export async function deleteCoverageAreaFromFirestore(id:string):Promise<void>{ await request(`/api/supabase/coverage-areas/${encodeURIComponent(id)}`,{method:'DELETE'}); }
export async function sendChatMessageToFirestore(msg:TicketMessage):Promise<void>{ await request(`/api/tickets/${encodeURIComponent(msg.ticketId || msg.woNumber || '')}/messages`,{method:'POST',body:JSON.stringify({text:msg.messageText || (msg as any).text || '',attachments:msg.attachments || []})}); }
export async function addAuditLogToFirestore(_log:AuditLog):Promise<void>{ /* Trusted server operations are the only audit writer. */ }

export async function saveTemplateToFirestore(template:WhatsAppTemplate):Promise<void>{ try { await request(`/api/supabase/wa-templates/${encodeURIComponent(template.id)}`,{method:'PATCH',body:JSON.stringify(template)}); } catch { await request('/api/supabase/wa-templates',{method:'POST',body:JSON.stringify(template)}); } }
export async function deleteTemplateFromFirestore(id:string):Promise<void>{ await request(`/api/supabase/wa-templates/${encodeURIComponent(id)}`,{method:'DELETE'}); }
export async function saveUserToFirestore(user:User):Promise<void>{ const existing=await request<{success?:boolean;data?:User[]}>(`/api/supabase/users?includeDeleted=true`); const exists=existing.data?.some(x=>x.id===user.id); await request(exists?`/api/supabase/users/${encodeURIComponent(user.id)}`:'/api/supabase/users',{method:exists?'PATCH':'POST',body:JSON.stringify(user)}); }
export async function deleteUserFromFirestore(id:string):Promise<void>{ await request(`/api/supabase/users/${encodeURIComponent(id)}`,{method:'DELETE',body:JSON.stringify({reason:'Deleted by authorized MoraJaws operation'})}); }
export async function softDeleteUserInFirestore(id:string,deletedBy:string,reason:string):Promise<void>{ await request(`/api/supabase/users/${encodeURIComponent(id)}`,{method:'DELETE',body:JSON.stringify({reason,deletedBy})}); }

export async function saveGeneralDroplistsToFirestore(items:any[]):Promise<void>{ await settingPut('general_droplists',items,'MoraJaws general droplists'); }
export async function loadGeneralDroplistsFromFirestore():Promise<any[]|null>{ return settingGet('general_droplists'); }
export function subscribeToGeneralDroplists(callback:(items:any[])=>void,onError?:(error:any)=>void):Unsubscribe{return subscribeToSettings('general_droplists',callback);}

export const INITIAL_REPORT_DROPDOWN_CATEGORIES: ReportDropdownCategory[] = [];
export async function saveAllReportDropdownCategoriesToFirestore(categories:ReportDropdownCategory[]):Promise<void>{await settingPut('report_dropdown_categories',categories,'MoraJaws report dropdown categories');}
export async function saveReportDropdownCategoryToFirestore(category:ReportDropdownCategory):Promise<void>{const all=await settingGet<ReportDropdownCategory[]>('report_dropdown_categories')||[];const next=all.filter(x=>x.id!==category.id);next.push(category);await saveAllReportDropdownCategoriesToFirestore(next);}
export async function deleteReportDropdownCategoryFromFirestore(id:string):Promise<void>{const all=await settingGet<ReportDropdownCategory[]>('report_dropdown_categories')||[];await saveAllReportDropdownCategoriesToFirestore(all.filter(x=>x.id!==id));}
export async function softDeleteReportDropdownCategoryInFirestore(id:string,updatedBy?:string):Promise<void>{const all=await settingGet<ReportDropdownCategory[]>('report_dropdown_categories')||[];await saveAllReportDropdownCategoriesToFirestore(all.map(x=>x.id===id?{...x,active:false,updatedBy}:x));}
export async function seedReportDropdownCategoriesIfEmpty():Promise<number>{return 0;}
export async function fetchAllTicketsFromFirestore():Promise<Ticket[]>{const r=await request<{success?:boolean;data?:Ticket[]}>('/api/supabase/work-orders');return r.data||[];}
export async function findUserInFirestore(identifier:string):Promise<User|null>{const r=await request<{success?:boolean;data?:User[]}>('/api/supabase/users?includeDeleted=false');return (r.data||[]).find(u=>u.id===identifier||u.username?.toLowerCase()===identifier.toLowerCase()||u.email?.toLowerCase()===identifier.toLowerCase())||null;}

export const INITIAL_CHAT_CATEGORIES: ChatCategoryConfig[] = [];
export async function saveChatCategoriesToFirestore(categories:ChatCategoryConfig[]):Promise<void>{await settingPut('chat_categories',categories,'MoraJaws chat categories');}
export async function loadChatCategoriesFromFirestore():Promise<ChatCategoryConfig[]|null>{return settingGet('chat_categories');}
export function subscribeToChatCategories(callback:(items:ChatCategoryConfig[])=>void):Unsubscribe{return subscribeToSettings('chat_categories',callback);}

export const INITIAL_HIERARCHICAL_DROPLISTS: HierarchicalStatus[] = [];
export function reconcileDroplistData(statuses:HierarchicalStatus[], categories:ReportDropdownCategory[]){return {reconciled:statuses,changedCount:0};}
export async function saveHierarchicalDroplistsToFirestore(statuses:HierarchicalStatus[]):Promise<void>{await settingPut('hierarchical_droplists',statuses,'MoraJaws hierarchical droplists');}
export async function loadHierarchicalDroplistsFromFirestore():Promise<HierarchicalStatus[]|null>{return settingGet('hierarchical_droplists');}
export function subscribeToHierarchicalDroplists(callback:(items:HierarchicalStatus[])=>void):Unsubscribe{return subscribeToSettings('hierarchical_droplists',callback);}

export async function seedFirestoreIfEmpty(_initialData:any):Promise<{seeded:boolean;counts:Record<string,number>}>{return {seeded:false,counts:{}};}
