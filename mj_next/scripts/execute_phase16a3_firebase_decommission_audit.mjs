import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const checks = [];
const check = (id, pass, severity, evidence) => checks.push({ id, pass: Boolean(pass), severity, evidence });
const app = read('src/context/AppContext.tsx');
const firebaseClient = read('src/lib/firebase.ts');
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

check('firebase_web_dependency_present', Boolean(pkg.dependencies?.firebase), 'BLOCKER', 'package.json still includes firebase');
check('firebase_admin_dependency_present', Boolean(pkg.dependencies?.['firebase-admin']), 'BLOCKER', 'package.json still includes firebase-admin');
check('firebase_client_initializes_app', /initializeApp\(/.test(firebaseClient), 'BLOCKER', 'src/lib/firebase.ts initializes Firebase App');
check('firestore_data_layer_imports_sdk', /from ['"]firebase\/firestore['"]/.test(firestore), 'BLOCKER', 'firestoreDb.ts imports Firebase Firestore SDK');
check('app_context_imports_firestore', /from ['"].*services\/firestoreDb/.test(app), 'BLOCKER', 'AppContext imports Firestore data methods');
check('app_context_has_supabase_production_branch', /SupabaseRepository\.getInstance\(\)\.subscribeToChanges/.test(app), 'INFO', 'AppContext has Supabase SSE branch in production');
check('navigation_service_imports_firestore', /from ['"]firebase\/firestore['"]/.test(navService), 'BLOCKER', 'navigationFirestore.ts imports Firestore SDK');
check('navigation_context_calls_firestore', /loadNavigationConfigFromFirestore|saveNavigationConfigToFirestore|subscribeToNavigationConfig/.test(navContext), 'BLOCKER', 'NavigationContext calls Firestore persistence');
check('ui_context_calls_firestore', /loadNavigationDocFromFirestore|saveNavigationDocToFirestore|loadUIConfigurationFromFirestore|saveUIConfigurationToFirestore/.test(uiContext), 'BLOCKER', 'UIConfigContext calls Firestore persistence');
check('error_system_writes_firestore', /firebase\/firestore|setDoc\(doc\(db/.test(errorSystem), 'HIGH', 'errorSystem.ts writes system errors to Firestore');
check('backup_service_has_firebase_token_fallback', /auth\.currentUser|getIdToken/.test(backup), 'HIGH', 'backupDownloadService.ts retains Firebase ID-token fallback');
check('server_imports_firebase_admin', /server\/firebaseAdmin/.test(server), 'BLOCKER', 'server.ts imports Firebase Admin');
check('server_has_firebase_auth_compat_route', /\/api\/auth\/firebase-login/.test(server), 'HIGH', 'server.ts contains Firebase login compatibility route');
check('server_has_supabase_auth_jwt_fallback', /verifySupabaseAuthToken\(token/.test(server), 'BLOCKER', 'resolveUserFromHeader accepts Supabase Auth JWT fallback; user requires custom login only');
check('custom_auth_uses_bcrypt', /bcrypt\.compare|verifyUserPasswordEx/.test(customAuth), 'INFO', 'customAuthService contains password verification');
check('custom_auth_uses_postgres_tables', /auth_sessions|refresh_tokens|login_attempts/.test(customAuth), 'INFO', 'customAuthService persists custom sessions/tokens/attempts');
check('supabase_backend_requires_server_secret', /SUPABASE_SERVICE_ROLE_KEY/.test(supaClient) && /isValidSupabaseSecretKey/.test(supaClient), 'INFO', 'Supabase backend client requires server secret key');
check('supabase_storage_private_bucket_target', /morajaws-reports/.test(storage), 'INFO', 'Supabase Storage target bucket is defined in server storage service');
check('firebase_storage_legacy_support_present', /firebase_storage|firebasestorage\.googleapis\.com/.test(storage) || /firebase_storage|firebasestorage\.googleapis\.com/.test(firestore), 'HIGH', 'Legacy Firebase Storage provider compatibility remains');
check('google_sheets_service_present', fs.existsSync(path.join(root, 'src/services/googleSheetsService.ts')), 'HIGH', 'Google Sheets service still exists and is coupled to Firebase Auth');
check('google_sheets_ui_present', fs.existsSync(path.join(root, 'src/components/sheets/GoogleSheetsSyncView.tsx')) && /googleSheetsService/.test(sheetsUI), 'HIGH', 'Google Sheets UI imports Firebase-coupled service');
check('firebase_project_config_present', fs.existsSync(path.join(root, 'firebase-applet-config.json')), 'HIGH', 'Firebase app config remains in repository');
check('custom_login_endpoint_is_primary', /\/api\/auth\/login/.test(app) && /loginWithCustomAuth/.test(server), 'INFO', 'AppContext calls internal login endpoint and server imports customAuthService');

const passed = checks.filter(x => x.pass).length;
const failed = checks.length - passed;
const result = {
  phase: '16A.3',
  auditType: 'static_source_audit_only',
  productionMutation: false,
  checkCount: checks.length,
  passed,
  failed,
  verdict: failed === 0 ? 'AUDIT_ASSERTIONS_PASS_BUT_FIREBASE_REMOVAL_NOT_READY' : 'AUDIT_SCRIPT_FAILED',
  checks
};
fs.mkdirSync(path.join(root, 'scripts/evidence'), { recursive: true });
fs.writeFileSync(path.join(root, 'scripts/evidence/phase16a3_firebase_decommission_audit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (failed > 0) process.exitCode = 1;
