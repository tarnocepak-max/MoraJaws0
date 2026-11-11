import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const includeRoots = ['src', 'server'];
const includeFiles = ['server.ts', 'package.json'];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.json']);
const patterns = {
  firebaseFirestore: /firestore|firebase\/firestore|firebase\/auth|firebase-admin|firebaseUid|loginWithFirebase/gi,
  googleSheets: /google\s*sheets|googleSheets|sheetsConfig|spreadsheetId|sheets\.googleapis\.com/gi,
  supabase: /supabase/gi,
  localFallback: /localStorage|local_json|localJson|fallback/gi,
};
const files = new Set(includeFiles);
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', '.git'].includes(entry.name)) walk(full);
    } else if (extensions.has(path.extname(entry.name))) files.add(path.relative(root, full));
  }
}
for (const dir of includeRoots) walk(path.join(root, dir));

const inventories = {};
for (const [name, regex] of Object.entries(patterns)) {
  const matches = [];
  let total = 0;
  for (const file of [...files].sort()) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split(/\r?\n/);
    const found = [];
    lines.forEach((line, index) => {
      regex.lastIndex = 0;
      const count = [...line.matchAll(regex)].length;
      if (count) {
        total += count;
        found.push({ line: index + 1, count, excerpt: line.trim().slice(0, 220) });
      }
    });
    if (found.length) matches.push({ file, occurrences: found.reduce((sum, item) => sum + item.count, 0), lines: found });
  }
  inventories[name] = { occurrenceCount: total, fileCount: matches.length, files: matches };
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
const firebasePackages = Object.keys(allDeps).filter(name => /firebase/i.test(name));
const contextFile = fs.readFileSync(path.join(root, 'src/context/AppContext.tsx'), 'utf8');
const serverFile = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const checks = [
  { id: 'firebase_packages_present', pass: firebasePackages.length > 0, severity: 'BLOCKER', detail: firebasePackages.length ? `Firebase packages remain: ${firebasePackages.join(', ')}` : 'No Firebase packages found.' },
  { id: 'appcontext_firestore_import_present', pass: /from ['"].*firestoreDb/.test(contextFile), severity: 'BLOCKER', detail: /from ['"].*firestoreDb/.test(contextFile) ? 'AppContext still imports Firestore persistence adapters.' : 'No Firestore adapter import found in AppContext.' },
  { id: 'appcontext_firebase_auth_import_present', pass: /from ['"].*lib\/firebase/.test(contextFile), severity: 'BLOCKER', detail: /from ['"].*lib\/firebase/.test(contextFile) ? 'AppContext still imports Firebase auth/connectivity helpers.' : 'No Firebase helper import found in AppContext.' },
  { id: 'google_sheets_surface_present', pass: inventories.googleSheets.occurrenceCount > 0, severity: 'BLOCKER', detail: `Google Sheets identifiers remain in ${inventories.googleSheets.fileCount} scanned source files.` },
  { id: 'server_firebase_compatibility_present', pass: /firebaseAdmin|firebase-login|firebaseUid|firebaseCompatibility/.test(serverFile), severity: 'HIGH', detail: 'Server retains Firebase compatibility/auth/health identifiers; inspect each route before removal.' },
  { id: 'supabase_adapter_present', pass: fs.existsSync(path.join(root, 'server/supabaseAdapter.ts')), severity: 'INFO', detail: 'Supabase adapter source exists.' },
  { id: 'no_database_write_performed', pass: true, severity: 'INFO', detail: 'This audit script only reads project files; it does not connect to or mutate any database.' },
];
const blockerCount = checks.filter(item => item.severity === 'BLOCKER' && item.pass).length;
const report = {
  phase: '2.4.6',
  title: 'Supabase Single Source of Truth Pre-Cutover Audit',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_SOURCE_AUDIT',
  scannedFileCount: files.size,
  firebasePackages,
  inventories,
  checks,
  summary: {
    blockerCount,
    cutoverReady: blockerCount === 0,
    verdict: blockerCount === 0 ? 'READY_FOR_SEPARATE_CUTOVER_REVIEW' : 'NOT_READY_FIREBASE_OR_SHEETS_PATHS_REMAIN',
  },
};
fs.mkdirSync(path.join(root, 'scripts/evidence'), { recursive: true });
fs.writeFileSync(path.join(root, 'scripts/evidence/phase2_4_6_pre_cutover_audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  phase: report.phase,
  scannedFileCount: report.scannedFileCount,
  firebasePackages,
  firebaseFirestore: { files: inventories.firebaseFirestore.fileCount, occurrences: inventories.firebaseFirestore.occurrenceCount },
  googleSheets: { files: inventories.googleSheets.fileCount, occurrences: inventories.googleSheets.occurrenceCount },
  supabase: { files: inventories.supabase.fileCount, occurrences: inventories.supabase.occurrenceCount },
  checks: checks.map(({ id, pass, severity }) => ({ id, pass, severity })),
  verdict: report.summary.verdict,
}, null, 2));
