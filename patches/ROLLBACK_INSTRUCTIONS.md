# Rollback Instructions for Users & Banks Sync Optimization

If you ever wish to roll back the changes made during this optimization session, you have two quick options:

---

### Option 1: Restore Direct Backup File (Recommended & Instant)

A byte-for-byte backup of `context/DBContext.tsx` was saved prior to these optimizations at `context/DBContext.tsx.bak`.

To restore:
```powershell
# In PowerShell (from project root D:\Projects\IPOVault-Offline):
Copy-Item context\DBContext.tsx.bak context\DBContext.tsx -Force
```
or in Windows Command Prompt (`cmd`):
```cmd
copy /y context\DBContext.tsx.bak context\DBContext.tsx
```

---

### Option 2: Apply the Git Rollback Patch

A patch capturing the state prior to sync optimization is saved at:
`patches/rollback_sync_optimization.patch`

To inspect the patch:
```cmd
git apply --check patches/rollback_sync_optimization.patch
```

---

### What Was Optimized:
1. **Removed Redundant Full-DB Export Sync on Single CRUD**:
   - `addUser`, `updateUser`, `archiveUser`, `unarchiveUser`, `deleteUser`
   - `addBankAccount`, `updateBankBalance`, `deleteBankAccount`
   - `partialSellApplication`, `saveAllotmentResult`
   Previously, every single field change/save invoked `scheduleDebouncedFirestoreSync(exportJSON, ...)`, freezing the JS thread by querying every table into a massive JSON string.
2. **Targeted Live Cloud Upsert**:
   - Individual entity CRUD operations now only sync their individual changed document via `syncSingleDocUpsert` / `syncSingleDocDelete` silently in the background.
3. **Local SQLite Optimistic Snapshot Rollback**:
   - If a local SQLite write fails, UI state instantly rolls back to the pre-action snapshot and re-throws the error, ensuring the UI never gets out of sync with SQLite.
4. **Export JSON Retained Where Needed**:
   - `exportJSON` remains fully intact and available for manual User Backup in Settings and daily device sandbox backups.
