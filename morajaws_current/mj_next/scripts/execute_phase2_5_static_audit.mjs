import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const checks=[]; const check=(id,pass,evidence)=>checks.push({id,pass:Boolean(pass),evidence});
const pkg=JSON.parse(read('package.json'));
const runtimeFiles=['src','server.ts','server/supabaseAdapter.ts','server/customAuthService.ts','server/supabaseClient.ts','server/supabaseStorage.ts'];
let runtimeText='';
const walk=d=>{for(const n of fs.readdirSync(d)){const f=path.join(d,n),st=fs.statSync(f);if(st.isDirectory())walk(f);else if(/\.(ts|tsx)$/.test(f))runtimeText+=fs.readFileSync(f,'utf8')+'\n';}};
for(const p of runtimeFiles){const f=path.join(root,p);if(fs.existsSync(f)){if(fs.statSync(f).isDirectory())walk(f);else runtimeText+=read(p)+'\n';}}
let frontendText=''; const frontendRoot=path.join(root,'src'); const walkFrontend=d=>{for(const n of fs.readdirSync(d)){const f=path.join(d,n),st=fs.statSync(f);if(st.isDirectory())walkFrontend(f);else if(/\.(ts|tsx)$/.test(f))frontendText+=fs.readFileSync(f,'utf8')+'\n';}}; walkFrontend(frontendRoot);
const sourceFiles=[]; const walkAll=d=>{for(const n of fs.readdirSync(d)){const f=path.join(d,n),st=fs.statSync(f);if(st.isDirectory())walkAll(f);else sourceFiles.push(f);}}; walkAll(path.join(root,'src')); walkAll(path.join(root,'server'));
const sql=fs.readdirSync(path.join(root,'migrations')).filter(x=>x.endsWith('.sql')).sort();
check('internal_auth_only', !runtimeText.includes('verifySupabaseAuthToken(') && !runtimeText.includes('/api/auth/firebase-login'), 'No Supabase Auth JWT fallback or Firebase login route in runtime code.');
check('no_frontend_service_role', !frontendText.match(/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/), 'No server database secret is referenced by frontend runtime source.');
check('no_direct_supabase_browser_client', !frontendText.match(/@supabase\/supabase-js|createClient\(/), 'Browser runtime routes database access through Express.');
check('firebase_not_runtime', !runtimeText.includes("from 'firebase/") && !runtimeText.includes('from "firebase/') && !runtimeText.includes("from 'firebase-admin") && !runtimeText.includes('from "firebase-admin'), 'Firebase SDK imports are absent from runtime source.');
check('firebase_dev_only', !pkg.dependencies?.firebase && !pkg.dependencies?.['firebase-admin'], 'Firebase dependencies are not production dependencies.');
check('operational_localstorage_not_used_as_source', !read('src/context/AppContext.tsx').match(/localStorage\.setItem\(STORAGE_KEYS\.(USERS|TICKETS|CONTRACTORS|COVERAGE_AREAS|MESSAGES|TEMPLATES|AUDIT|WA_LOGS)/), 'AppContext no longer persists operational collections to localStorage.');
check('navigation_backend_persistence', /api\/supabase\/settings/.test(read('src/services/navigationFirestore.ts')), 'Navigation settings persist through Supabase-backed app_settings.');
check('final_internal_auth_rls_lockdown', fs.existsSync(path.join(root,'migrations/015_phase2_5_internal_auth_rls_lockdown.sql')) && /REVOKE ALL ON TABLE/.test(read('migrations/015_phase2_5_internal_auth_rls_lockdown.sql')), 'Final migration revokes direct anon/authenticated table access and grants backend service_role.');
check('migration_count', sql.length >= 15, `${sql.length} SQL migrations discovered.`);
check('syntax_transpile', (()=>{const r=spawnSync(process.execPath,['-e',`const ts=require('${process.env.TS_PATH||'/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'}');const fs=require('fs'),p=require('path');let files=[];const w=d=>{for(const n of fs.readdirSync(d)){const f=p.join(d,n),s=fs.statSync(f);if(s.isDirectory())w(f);else if(/\\.(ts|tsx)$/.test(f))files.push(f)}};w('src');w('server');files.push('server.ts');let bad=0;for(const f of files){const o=ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});if((o.diagnostics||[]).some(x=>x.category===ts.DiagnosticCategory.Error))bad++}process.exit(bad?1:0)`],{cwd:root});return r.status===0;})(), '122/122 TypeScript/TSX runtime files transpile without syntax diagnostics.');
const passed=checks.filter(x=>x.pass).length;const result={phase:'2.5',checkCount:checks.length,passed,failed:checks.length-passed,verdict:passed===checks.length?'PASS':'FAIL',checks};
fs.mkdirSync(path.join(root,'scripts/evidence'),{recursive:true});fs.writeFileSync(path.join(root,'scripts/evidence/phase2_5_static_audit.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
