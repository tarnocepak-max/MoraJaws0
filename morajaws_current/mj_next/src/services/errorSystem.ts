/** Error reporting without Firebase. Sensitive values are sanitized before logging. */
export interface ErrorDetails { message:string; stack?:string; component?:string; action?:string; metadata?:Record<string,any>; }
export function sanitizeErrorMessage(error:any):string { const msg=error instanceof Error?error.message:String(error||'Unknown error'); return msg.replace(/(password|token|secret|api[_-]?key|service[_-]?role)[^,;\s]*/gi,'$1=[REDACTED]'); }
export async function logSystemErrorToFirestore(details:ErrorDetails):Promise<void>{
  try { await fetch('/api/system/error-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...details,message:sanitizeErrorMessage(details.message),stack:details.stack?.slice(0,5000)})}); } catch { /* error logging must never break the application */ }
}
