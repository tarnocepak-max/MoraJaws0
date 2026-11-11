# MoraJaws — Provision Primary Superadmin

The archive has been updated to prepare the primary application account.

- Email: `rayhanafirzanx@gmail.com`
- Role: `super_admin` (displayed as Super Admin)
- Username: `rays`
- Initial password: `mora2026`
- `must_change_password` is enabled, so the account should be required to change its initial password after first login.

## What changed
1. Updated the local JSON user record for the existing primary account (`u-ray`) rather than adding a duplicate.
2. Updated the server's initial seed identity and startup existence check to use `rays` / `rayhanafirzanx@gmail.com`.
3. Added `migrations/007_provision_primary_superadmin.sql` to provision/update the account in the authoritative Supabase PostgreSQL database.
4. Password is stored as a PBKDF2-SHA256 hash, not plaintext. The custom authentication service supports this legacy hash format and upgrades it to bcrypt after successful login.
5. The migration increments the session version to invalidate previously issued sessions for the account.

## Required deployment step
The Supabase database cannot be modified from this archive alone. Apply migrations `001` through `007` in order (if `001`–`006` are not already applied), then redeploy/restart the application. Do not expose the Supabase service-role key in the frontend or commit it to the repository.

## Verification
After migration and deployment, test login using username `rays` (or email above) and the initial password. Confirm that the application enforces password change and that the account appears as Superadmin in Management User. Change the initial password immediately after first login.
