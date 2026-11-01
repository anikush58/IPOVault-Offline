# Google Play Store Manual Test Plan & Device Verification Guide

**Application:** IPOVault (`com.ipovault.app`) | **Version:** 2.3.0 (`versionCode: 2`)  
**Target Android Version:** Android 7.0 (API 24) to Android 16 (API 36)  
**Devices Recommended for Verification:**  
1. Physical device on Android 15 / 16 (Google Pixel 8/9 or Samsung Galaxy S23/S24).  
2. Physical or emulator device on Android 10-12 (legacy baseline).

---

## Test Suite 1: Authentication & Account Lifecycle

### TC-AUTH-01: Email/Password Sign Up & Sign In
- **Steps:**
  1. Launch app, navigate to Auth screen.
  2. Select "Create Account", enter new test email and password. Tap Sign Up.
  3. Verify successful registration and redirect to IPO Hub / Dashboard.
  4. Navigate to Settings > Account > Log Out.
  5. Sign back in using the created credentials.
- **Expected Outcome:** User session restored cleanly. Display name and email match.
- **Pass Criteria:** No unhandled promise rejections, tokens stored securely in AsyncStorage.

### TC-AUTH-02: Google Sign-In Native Flow
- **Steps:**
  1. On Auth screen, tap "Continue with Google".
  2. Select Google account from Google Play Services dialog.
  3. Verify seamless authentication and profile sync.
- **Expected Outcome:** Google avatar and display name hydrate into Settings > Account.

### TC-AUTH-03: In-App Account Deletion (Google Play Mandatory)
- **Steps:**
  1. Sign in with a test account.
  2. Add a sample IPO application, family member PAN, and bank account.
  3. Navigate to **Settings > Edit Profile**.
  4. Scroll to Danger Zone and tap **Delete Account**.
  5. Verify red confirmation modal appears with explicit explanation of permanent consequences.
  6. Tap "Delete Account".
- **Expected Outcome:**
  - Device push token unregistered before session invalidation.
  - Backend `DELETE /api/v1/user/account` executes, purging PostgreSQL tables (`UserSavedPan`, `BrokerAccount`, `UserPushToken`, `Notification`, `UserEntitlement`) and anonymizing operational tier audit logs with uncorrelatable surrogate UUIDs (`anon-${uuid}`).
  - Cloud Firestore user document purged.
  - Firebase Authentication user record deleted.
  - Local SQLite database cleared (`clearAllData()`).
  - Local auth caches (`@ipovault_username`, `@ipovault_avatar_uri`, `@ipovault_cached_user`) removed.
  - App navigates cleanly to `/auth` with success notification.
  - Attempting to log in with deleted credentials reports "User not found".
  - If a partial failure occurs before all external systems complete, retrying deletion executes idempotently.

### TC-AUTH-04: Re-Authentication Guard on Stale Session Deletion
- **Steps:**
  1. Sign in with an account whose token was issued > 1 hour ago (or simulate token expiry / password change on another device).
  2. Attempt to tap "Delete Account".
- **Expected Outcome:** Firebase raises `auth/requires-recent-login`. App halts deletion safely without deleting the account, presents an informative dialog asking the user to sign out and log back in to verify identity.

### TC-AUTH-05: Server Failure & Network Resilience During Deletion
- **Steps:**
  1. Enable Airplane Mode or point app to an unreachable backend mock server.
  2. Tap "Delete Account" and confirm.
- **Expected Outcome:**
  - Backend request fails with network error.
  - Deletion workflow cleanly aborts.
  - Firebase Auth user is **NOT** deleted.
  - Local SQLite data is **NOT** wiped.
  - User receives clear error: *"Unable to communicate with the server to delete your account records. Account deletion was aborted."*
  - Re-enabling connectivity allows user to retry and succeed.

### TC-AUTH-06: Web Account Deletion Portal Verification (Hardened GET/POST Separation)
- **Steps:**
  1. Open browser and navigate to `http://localhost:3000/delete-account` (or `https://getipovault.in/delete-account` once DNS is active).
  2. Verify page layout: responsive, accessible, explains data deleted vs. retained, specifies 48-hour/instant timeframe.
  3. Enter unregistered email `fake-user@example.com` and submit.
  4. Verify generic success message is displayed without confirming or denying account existence (no account enumeration).
  5. In test environment, navigate via browser to the verification URL: `http://localhost:3000/api/v1/user/confirm-deletion?token=...`.
  6. **Verify Non-Destructive Preview (GET):** Page renders confirmation card with masked email (`u***@domain.com`), details irreversible consequences, and includes a "Permanently Delete My Account" button. Verify account is NOT deleted by simply visiting the page (email link prefetch bots & security scanners cannot trigger deletion). Verify security headers (`Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`).
  7. **Verify Execution (POST):** Click "Permanently Delete My Account" button to submit the form via POST.
  8. Verify deletion executes: HTML confirmation card renders with "Account Deleted Successfully" and permanent deletion badge.
  9. **Verify Replay Protection:** Re-submitting the POST or refreshing the link displays the "Invalid or Expired Link" page (HTTP 401), proving consumed tokens cannot be replayed.
  10. **Verify Multi-Instance & Restart Resilience:** Restart the backend process (or target an alternate load-balanced backend instance) and re-submit the token. Verify the token is persistently rejected as consumed via the PostgreSQL `consumed_deletion_tokens` record.

### TC-AUTH-07: Mobile App Termination / Crash Resilience During Deletion
- **Steps:**
  1. Sign in with a test account and create applications and bank accounts.
  2. Initiate account deletion and simulate process termination immediately following Firebase credential destruction (or simulate `@ipovault_pending_account_deletion_uid` marker present).
  3. Relaunch the application.
- **Expected Outcome:**
  - App detects `@ipovault_pending_account_deletion_uid` during startup reconciliation in `DBContext.reconcileStartupState()`.
  - All orphaned SQLite rows for the deleted user (`ipo_applications`, `users_table`, `bank_accounts`, `ipo_listings`, `ipo_allotments`) are automatically cleaned up.
  - The pending deletion flag is removed.
  - User cannot log in with the deleted credentials.

### TC-AUTH-08: Web Deletion Recovery After Identity Provider Partial Failure
- **Steps:**
  1. Generate a deletion confirmation link for a test user.
  2. Temporarily mock or disconnect Firebase Auth service so that `deleteUser` fails.
  3. Submit the POST confirmation from the deletion page.
- **Expected Outcome:**
  - Database purge transaction commits, but Firebase deletion fails.
  - Job status in `consumed_deletion_tokens` is updated to `FAILED`.
  - HTTP 500 error page renders explaining that database records were purged, but credentials could not be removed yet, prompting user to click confirm again to retry.
  - Token is **NOT** marked as completed.
  - Re-enabling Firebase Auth and submitting the form again with the **SAME token** succeeds, transitions job to `COMPLETED`, and renders the success confirmation card.

### TC-AUTH-09: Concurrent Confirmation Requests Rejection
- **Steps:**
  1. Generate a deletion confirmation link.
  2. Issue two concurrent POST requests with the identical confirmation token simultaneously.
- **Expected Outcome:**
  - One request proceeds to process deletion.
  - The secondary concurrent request receives HTTP 409 Conflict (*"Account deletion is currently in progress. Please wait a moment."*).
  - No database deadlocks or inconsistent states occur.

---

## Test Suite 2: Entitlement Tiering & Invariant Navigation

### TC-TIER-01: Non-Pro Tab Bar Layout & Restrictions
- **Steps:**
  1. Sign in with a standard Non-Pro account (or fresh install).
  2. Inspect floating bottom navigation bar.
- **Expected Outcome:**
  - Exactly 4 primary tabs rendered: **IPO Hub**, **Allotment**, **Users**, and **Settings**.
  - Pro features (Bulk Apply FAB, Advanced Analytics) are suppressed or routed appropriately.
  - Banner ads display on IPO Hub and allotment lists (Test ads in dev/preview; production ads in release).

### TC-TIER-02: Pro Upgrade Transition (Hook Order & Invariance)
- **Steps:**
  1. Upgrade user tier to Pro via backend admin API (`POST /api/v1/admin/users/:uid/tier`).
  2. Perform pull-to-refresh on Settings or reopen app.
  3. Observe transition to Pro interface.
- **Expected Outcome:**
  - Floating tab bar switches seamlessly to Pro configuration (Home, IPO Hub, Applications, Settings) with central "+" FAB.
  - Zero React hooks crashes (`Rendered fewer hooks than expected` never occurs).
  - All banner and native ads are suppressed immediately.

### TC-TIER-03: Pro-to-Non-Pro Revocation & Invariant Navigation
- **Steps:**
  1. With user on Pro, revoke entitlement to Non-Pro via backend.
  2. Trigger entitlement refresh.
- **Expected Outcome:**
  - Floating tab bar adapts smoothly back to Non-Pro layout.
  - Fluid liquid capsule animation adjusts to 4 tabs.
  - Existing local SQLite IPOs, bids, and family members remain 100% intact. Zero data loss.

---

## Test Suite 3: Offline-First SQLite Resilience

### TC-OFFLINE-01: Cold Launch in Airplane Mode
- **Steps:**
  1. Enable Airplane Mode (disable Wi-Fi and Cellular data).
  2. Force quit app from recent apps.
  3. Cold launch IPOVault.
- **Expected Outcome:**
  - App launches instantly without blank screen or splash lockup.
  - Local IPO catalogue, existing applications, bank accounts, and family profiles render from SQLite cache.
  - Centralized sync gracefully schedules retry without crash.

### TC-OFFLINE-02: SQLite Closed-Resource Resilience
- **Steps:**
  1. Initiate heavy pull-to-refresh sync on IPO Hub while rapidly navigating between tabs.
  2. Trigger app backgrounding and foregrounding during batch write.
- **Expected Outcome:**
  - SQLite closed handle errors (`Access to closed resource`) are caught cleanly by `isClosedResourceError()` guard.
  - Zero unhandled red screens or native transaction abort crashes.

---

## Test Suite 4: Multi-PAN Allotment Checker & Registrars

### TC-ALLOT-01: Multi-PAN Allotment Query
- **Steps:**
  1. Open Allotment tab.
  2. Select an active IPO (e.g., KFintech or Link Intime registrar).
  3. Select 2 or more family member PANs.
  4. Tap "Check Allotment".
- **Expected Outcome:**
  - Query executes over HTTPS directly to official registrar endpoints.
  - Loading indicators display per PAN.
  - Results show allotment status (Allotted with share count, or Not Allotted) with haptic feedback.
  - PAN is masked as `ABCDE****F` on UI.

---

## Test Suite 5: Google AdMob Monetization Safety

### TC-ADMOB-01: Test Ad Serving in Non-Production Builds
- **Steps:**
  1. Build development or preview APK.
  2. Launch app and open IPO Hub.
- **Expected Outcome:**
  - Banner ads display Google's official "Test Ad" black badge.
  - Native card displays "Test Ad" attribution.
  - Zero live ad impressions or live ad clicks recorded in AdMob console.

### TC-ADMOB-02: Production Ad Serving Isolation
- **Steps:**
  1. Inspect network traffic using an HTTP proxy (e.g., Charles Proxy) on a debug build.
- **Expected Outcome:**
  - AdMob requests contain only keywords (`finance, market, stocks, ipo`).
  - Verify that NO payload contains PAN strings, Demat IDs, bank names, or user email addresses.

---

## Test Suite 6: Edge-to-Edge UI & Device Compatibility

### TC-UI-01: Android 15/16 Edge-to-Edge Display
- **Steps:**
  1. Run app on an Android 15/16 device with gesture navigation enabled.
  2. Inspect top status bar and bottom floating capsule bar.
- **Expected Outcome:**
  - Status bar icons adapt to dark/light backgrounds with correct contrast.
  - Floating tab bar floats properly above the Android gesture bar without overlapping or clipping.
  - Keyboard avoidance functions properly when filling forms in Add User or Add Bank modal.
