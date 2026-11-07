# MoraJaws Login Repair — Start Here

This ZIP contains a targeted login repair based on the latest uploaded source. It fixes error classification and email resolution; it does not reset or alter accounts.

After upload to Google AI Studio:
1. Keep this as an update to the existing project, not a rebuild.
2. Review `LOGIN_REPAIR_REPORT.md`.
3. Install dependencies using the platform's supported workflow.
4. Run TypeScript check and production build.
5. Run a single authorized login test.
6. Report the returned error code accurately.

Never ask the user to paste passwords, Supabase service-role keys, access tokens, or refresh tokens into chat.
Do not change production database, users, Auth UID mapping, password, or work orders without explicit authorization.
