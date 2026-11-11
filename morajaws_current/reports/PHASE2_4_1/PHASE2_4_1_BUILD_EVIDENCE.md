# MORAJAWS PHASE 2.4.1 — BUILD EVIDENCE
**Document Version:** 1.0.0  
**Phase:** Phase 2.4.1  
**Build Tool:** Vite v6.4.6  
**Node.js Runtime:** v20.x Linux x86_64  
**Date:** 2026-11-11  
**Status:** **BUILD SUCCESSFUL**

---

## 1. Production Build Output Logs

```
> react-example@0.0.0 build
> vite build

vite v6.4.6 building for production...
transforming...
✓ 1695 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     1.12 kB │ gzip:   0.50 kB
dist/assets/index-BC_jlUZO.css    217.68 kB │ gzip:  27.76 kB
dist/assets/index-DrQBM986.js   3,926.51 kB │ gzip: 778.92 kB
✓ built in 16.53s

[Security Plugin] Purged sensitive file from dist: morajaws0-nov-5-2026-10-46-20-pm_b249e691.zip
[Security Plugin] Purged sensitive file from dist: morajawssv5_645d528d.zip
[Security Plugin] Purged sensitive file from dist: remix-flexilayout_e63ea482.zip
[Security Plugin] Purged sensitive file from dist: morajaws_phase15a4.zip
```

---

## 2. Automated Asset & Security Verification

- **HTML Entry Point:** `dist/index.html` generated cleanly with synchronized page meta tags.
- **CSS Bundle:** `dist/assets/index-BC_jlUZO.css` (217.68 kB, gzip: 27.76 kB).
- **JS Bundle:** `dist/assets/index-DrQBM986.js` (3,926.51 kB, gzip: 778.92 kB).
- **Security Purge Execution:** The Vite security plugin scanned the distribution target directory and proactively purged four legacy zip files containing backup assets, ensuring zero administrative or developer archives leaked into production distribution.
- **Client Bundle Secret Leak Scan:** Executed static regex scan for `service_role`, `SUPABASE_SERVICE_KEY`, and raw JWTs; returned 0 matches.
