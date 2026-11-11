import fs from 'node:fs';
import path from 'node:path';
let ts;
try { ts = await import('typescript'); } catch { ts = await import('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = ['server.ts','server/supabaseAdapter.ts','src/context/AppContext.tsx','src/types/index.ts','server/supabaseStorage.ts','src/components/portals/InstallerDashboardView.tsx','src/components/portals/InstallerPortal.tsx'];
const results=[];
for (const file of files) {
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const out=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
  const errors=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  results.push({file,status:errors.length?'FAIL':'PASS',diagnostics:errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' '))});
}
fs.writeFileSync(path.join(root,'scripts/evidence/phase2_4_3_syntax_evidence.json'),JSON.stringify({phase:'2.4.3',executedAt:new Date().toISOString(),method:'TypeScript transpileModule syntax diagnostics',results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
if(results.some(x=>x.status==='FAIL')) process.exit(1);
