import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const checks = [];
const check = (id, pass, severity, evidence) => checks.push({ id, pass: Boolean(pass), severity, evidence });
const app = read('src/context/AppContext.tsx');
const firestore = read('src/services/firestoreDb.ts');
const navService = read('src/services/navigationFirestore.ts');
const navContext = read('src/context/NavigationContext.tsx');
const uiContext = read('src/context/UIConfigContext.tsx');
const errorSystem = read('src/services/errorSystem.ts');
const backup = read('src/services/backupDownloadService.ts');
const server = read('server.ts');
const customAuth = read('server/customAuthService.ts');
const supaClient = read('server/supabaseClient.ts');
const storage = read('server/supabaseStorage.ts');
const googleSheets = read('src/services/googleSheetsService.ts');
const sheetsUI = read('src/components/sheets/GoogleSheetsSyncView.tsx');

const runtimeFiles = [
  'src', 'server.ts', 'server/supabaseAdapter.ts', 'server/customAuthService.ts', 'server/supabaseClient.ts', 'server/supabaseStorage.ts'
];
const runtimeText = runtimeFiles.flatMap(p => {
  const full = path.join(root, p);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [read(p)];
  const out = [];
  const walk = d => { for (const name of fs.readdirSync(d)) { const f=path.join(d,name); const st=fs.statSync(f); if(st.isDirectory()) walk(f); else if(/\.(ts|tsx)$/.test(f)) out.push(fs.readFileSync(f,'utf8')); } };
  walk(full); return out;
}).join('\n');

check('firebase_runtime_imports_removed', !runtimeText.includes("from 'firebase/") && !runtimeText.includes('from "firebase/') && !runtimeText.includes("from 'firebase-admin") && !runtimeText.includes('from "firebase-admin'), 'BLOCKER', 'No Firebase SDK import remains in the production runtime graph.');
check('firebase_packages_not_runtime_dependencies', !pkg.dependencies?.firebase && !pkg.dependencies?.['firebase-admin'] && Boolean(pkg.devDependencies?.firebase) && Boolean(pkg.devDependencies?.['firebase-admin']), 'BLOCKER', 'Firebase packages are retained only for archival/backup tooling.');
check('firestore_compat_layer_is_provider_neutral', !/firebase\/firestore|firebase\/auth/.test(firestore), 'BLOCKER', 'Legacy firestoreDb filename is now an Express/Supabase compatibility layer.');
check('navigation_provider_neutral', !/firebase\/firestore/.test(navService), 'BLOCKER', 'Navigation persistence uses Supabase-backed app_settings.');
check('error_logging_provider_neutral', !/firebase\/firestore|setDoc\(doc\(db/.test(errorSystem), 'HIGH', 'System error reporting no longer writes to Firestore.');
check('backup_has_no_firebase_token_fallback', !/auth\.currentUser|getIdToken/.test(backup), 'HIGH', 'Backup download uses MoraJaws session credentials only.');
check('server_has_no_firebase_admin_import', !/server\/firebaseAdmin/.test(server), 'BLOCKER', 'server.ts no longer imports Firebase Admin.');
check('server_has_no_firebase_auth_route', !/\/api\/auth\/firebase-login/.test(server), 'HIGH', 'Firebase login route removed.');
check('server_has_no_supabase_auth_jwt_fallback', !/verifySupabaseAuthToken\(token/.test(server), 'BLOCKER', 'Only MoraJaws internal session tokens are accepted.');
check('custom_auth_uses_bcrypt', /bcrypt\.compare|verifyUserPasswordEx/.test(customAuth), 'INFO', 'Custom auth verifies bcrypt/legacy hashes server-side.');
check('custom_auth_uses_postgres_tables', /auth_sessions|refresh_tokens|login_attempts/.test(customAuth), 'INFO', 'Custom auth persists sessions, refresh tokens and login attempts in PostgreSQL.');
check('supabase_backend_requires_server_secret', /SUPABASE_SERVICE_ROLE_KEY/.test(supaClient) && /isValidSupabaseSecretKey/.test(supaClient), 'INFO', 'Supabase backend client requires a server secret.');
check('supabase_storage_target_present', /morajaws-reports/.test(storage), 'INFO', 'Supabase Storage remains the application storage target.');
check('google_sheets_service_no_firebase', !googleSheets.includes("from 'firebase") && !googleSheets.includes('from \"firebase'), 'HIGH', 'Google Sheets OAuth uses Google Identity Services directly.');
check('google_sheets_ui_present', fs.existsSync(path.join(root, 'src/components/sheets/GoogleSheetsSyncView.tsx')) && /googleSheetsService/.test(sheetsUI), 'INFO', 'Google Sheets feature remains available.');
check('legacy_firebase_config_archived_only', fs.existsSync(path.join(root, 'firebase-applet-config.json')) && !runtimeText.includes('firebase-applet-config.json'), 'INFO', 'Legacy Firebase config remains for archival/backup tooling and is not imported by runtime code.');
check('custom_login_endpoint_is_primary', /\/api\/auth\/login/.test(app) && /loginWithCustomAuth/.test(server), 'INFO', 'Frontend and backend use MoraJaws internal authentication.');

const passed = checks.filter(x => x.pass).length;
const failed = checks.length - passed;
const result = { phase:'16A.3', auditType:'static_source_audit_only', productionMutation:false, checkCount:checks.length, passed, failed, verdict:failed===0?'PASS':'FAIL', checks };
fs.mkdirSync(path.join(root,'scripts/evidence'),{recursive:true});
fs.writeFileSync(path.join(root,'scripts/evidence/phase16a3_firebase_decommission_audit.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(failed>0)process.exitCode=1;
