import fs from 'node:fs';
import assert from 'node:assert/strict';

const adapter = fs.readFileSync('server/supabaseAuthAdapter.ts', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');

assert.match(adapter, /if \(!authoritativeUser\.authUserId\)\s*\{/);
assert.match(adapter, /MAPPING_DIRECTORY_UNAVAILABLE/);
assert.match(adapter, /MAPPING_VERIFICATION_FAILED/);
assert.match(server, /SUPABASE_PASSWORD_CHANGE_NOT_IMPLEMENTED/);
assert.match(server, /Do not call client\.auth\.signOut\(\) on a shared backend client/);
assert.doesNotMatch(server, /await signOutSupabaseAuth\(\);/);
console.log('Phase 15A.2 static security guards: PASS (6 assertions)');
