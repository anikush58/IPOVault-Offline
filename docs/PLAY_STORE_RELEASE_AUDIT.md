# Google Play Production Readiness & Security Audit Report

**Application:** IPOVault (`com.ipovault.app`)  
**Version:** 2.3.0 (Version Code: 2)  
**Frameworks:** Expo SDK 54 (~54.0.35), React Native 0.81.5, Expo Router v6  
**Backend:** IPOVault Backend (NestJS 11, Prisma 6.15, PostgreSQL, Firebase Admin 14.5)  
**Audit Date:** October 17, 2026  
**Auditor:** Senior Android Release Engineer & Mobile Security Auditor  
**Overall Verdict:** **CONDITIONALLY READY**  
*(All codebase blockers have been remediated and verified with automated test suites. Final submission requires completion of owner-controlled Play Console and AdMob Console declarations).*

---

## 1. Executive Summary & Baseline Inventory

| Property | Value | Evidence / Verification |
| :--- | :--- | :--- |
| **Package ID** | `com.ipovault.app` | [app.json](file:///d:/Projects/IPOVault-Offline/app.json#L52), [AndroidManifest.xml](file:///d:/Projects/IPOVault-Offline/android/app/src/main/AndroidManifest.xml) |
| **App Version / Version Code** | `2.3.0` / `2` | [app.json](file:///d:/Projects/IPOVault-Offline/app.json), [package.json](file:///d:/Projects/IPOVault-Offline/package.json), [build.gradle](file:///d:/Projects/IPOVault-Offline/android/app/build.gradle) |
| **Target SDK / Compile SDK** | **Target: 36 (Android 16)**, **Compile: 36** | [android/gradle.properties](file:///d:/Projects/IPOVault-Offline/android/gradle.properties#L67-L70). Confirmed `android-36` platform installed in Android SDK. Meets August 31, 2026 Google Play policy. |
| **Min SDK** | `24` (Android 7.0) | [build.gradle](file:///d:/Projects/IPOVault-Offline/android/app/build.gradle) |
| **New Architecture** | Enabled (`newArchEnabled=true`) | [app.json](file:///d:/Projects/IPOVault-Offline/app.json#L10) |
| **Hermes Engine** | Enabled (`hermesEnabled=true`) | [android/gradle.properties](file:///d:/Projects/IPOVault-Offline/android/gradle.properties#L42) |
| **EAS Build Target** | Android App Bundle (`app-bundle` / `.aab`) | [eas.json](file:///d:/Projects/IPOVault-Offline/eas.json#L34-L36) |
| **AdMob Production App ID** | `ca-app-pub-3768316467682663~8023640805` | [app.json](file:///d:/Projects/IPOVault-Offline/app.json#L85), [services/ads/adConfig.ts](file:///d:/Projects/IPOVault-Offline/services/ads/adConfig.ts#L49) |
| **Production API Base** | `https://api.getipovault.in` (TLS 1.3 encrypted) | [eas.json](file:///d:/Projects/IPOVault-Offline/eas.json#L35), [services/api/Endpoints.ts](file:///d:/Projects/IPOVault-Offline/services/api/Endpoints.ts) |

---

## 2. Summary of Verified Blockers & Remediations

Prior to this audit, multiple critical issues would have triggered automatic rejection by Google Play Policy Review or posed data exposure risks. All codebase blockers have been remediated:

| # | Finding & Severity | Impact / Play Store Policy Violation | Status | Remediation Summary |
| :- | :--- | :--- | :--- | :--- |
| **1** | **Dangerous Permissions**<br>`HIGH` | `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` were present in [AndroidManifest.xml](file:///d:/Projects/IPOVault-Offline/android/app/src/main/AndroidManifest.xml). Google Play rejects financial apps declaring `SYSTEM_ALERT_WINDOW` without justification, and restricts deprecated broad storage. | **FIXED** | Purged `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, and `WRITE_EXTERNAL_STORAGE`. Declared `RECEIVE_BOOT_COMPLETED` for notification rescheduling. |
| **2** | **In-App & Web Account Deletion Lifecycle**<br>`HIGH` | Google Play User Data Policy mandates both in-app account deletion and an external web deletion-request URL. Previously, in-app deletion only deleted the Firebase Auth user without purging backend PostgreSQL records (encrypted PANs, broker accounts, push tokens, entitlements), and no external web portal existed. | **FIXED & VERIFIED** | 1. Implemented transactional server deletion in [user.service.ts](file:///d:/Projects/IPOVault-Backend/src/modules/user/user.service.ts) (`deleteUserAccount`) purging all PANs, broker accounts, tokens, and entitlements, while anonymizing statutory audit logs.<br>2. Updated mobile in-app deletion flow in [services/auth/firebaseAuthService.ts](file:///d:/Projects/IPOVault-Offline/services/auth/firebaseAuthService.ts) and [context/AuthContext.tsx](file:///d:/Projects/IPOVault-Offline/context/AuthContext.tsx) to execute backend deletion *before* Firebase Auth deletion, handling network errors and re-authentication safely.<br>3. Built public deletion web page at `public/delete-account/index.html` served at `/delete-account` with HMAC verification links.<br>4. Verified with 14 backend unit tests and 6 mobile regression tests. |
| **3** | **Contradictory Privacy Policy**<br>`HIGH` | [app/privacy-policy.tsx](file:///d:/Projects/IPOVault-Offline/app/privacy-policy.tsx) claimed: *"There are no tracking or advertising SDKs embedded in the app."* This contradicted the compiled Google AdMob SDK, causing immediate Play Store Data Safety rejection. | **FIXED** | Updated Privacy Policy Section 4 to transparently disclose Google AdMob integration, clarifying that no PAN, Demat, bank, or personal financial data is shared with ad networks. |
| **4** | **Unprotected Device Backup**<br>`MEDIUM` | `android:allowBackup="true"` without data extraction rules allowed unencrypted ADB device backups (`adb backup`) to extract local SQLite databases containing PANs and financial logs. | **FIXED** | Set `android:allowBackup="false"` in both [app.json](file:///d:/Projects/IPOVault-Offline/app.json) and [AndroidManifest.xml](file:///d:/Projects/IPOVault-Offline/android/app/src/main/AndroidManifest.xml). |
| **5** | **Target SDK Requirement**<br>`MEDIUM` | Google Play submissions on/after August 31, 2026 require Target API 36 (Android 16). The project defaulted to API 35. | **FIXED** | Set `android.targetSdkVersion=36`, `android.compileSdkVersion=36`, and `android.buildToolsVersion=36.0.0` in [android/gradle.properties](file:///d:/Projects/IPOVault-Offline/android/gradle.properties). |
| **6** | **Version Code & Name Alignment**<br>`LOW` | `versionCode` was omitted from [app.json](file:///d:/Projects/IPOVault-Offline/app.json) and hardcoded to 1 in Gradle, while UI referenced `v2.3.0`. | **FIXED** | Synchronized `versionCode: 2` and `version: 2.3.0` across `app.json`, `package.json`, and `android/app/build.gradle`. |

---

## 3. Detailed Security & Data Architecture Review

### 3.1 Secrets & Credential Storage
- **Mobile Project (`IPOVault-Offline`):**
  - Tracked configuration files ([app.json](file:///d:/Projects/IPOVault-Offline/app.json), [eas.json](file:///d:/Projects/IPOVault-Offline/eas.json), [.env](file:///d:/Projects/IPOVault-Offline/.env)) contain only public client identifiers (`EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, AdMob App IDs).
  - Git history check (`git log -S "PRIVATE KEY"`) verified zero private signing keys or service accounts committed.
- **Backend Project (`IPOVault-Backend`):**
  - Tracked files contain zero hardcoded secrets.
  - Environment template [backend/.env.example](file:///d:/Projects/IPOVault-Backend/.env.example) uses standard sanitized placeholders.
  - Actual `.env` is properly ignored in [.gitignore](file:///d:/Projects/IPOVault-Backend/.gitignore).

### 3.2 Authentication & Server-Authoritative Entitlements
- **Token Verification:**
  - Protected backend routes enforce [FirebaseAuthGuard](file:///d:/Projects/IPOVault-Backend/src/common/guards/firebase-auth.guard.ts), cryptographically verifying Firebase ID tokens via the Firebase Admin SDK.
- **Data Scoping:**
  - Controllers ([user.controller.ts](file:///d:/Projects/IPOVault-Backend/src/modules/user/user.controller.ts), [allotment.controller.ts](file:///d:/Projects/IPOVault-Backend/src/modules/allotment/allotment.controller.ts), [broker-account.controller.ts](file:///d:/Projects/IPOVault-Backend/src/modules/broker/broker-account.controller.ts)) strictly derive `userId` from `@CurrentUser('uid')`, preventing cross-tenant access.
- **Entitlement Tamper Resistance:**
  - Pro status is queried from PostgreSQL (`UserEntitlement` table). Client-side modification of local storage cannot elevate privileges on backend endpoints.

### 3.3 Sensitive Financial Data & PAN Masking
- **Backend Storage:**
  - In [src/modules/user/user.service.ts](file:///d:/Projects/IPOVault-Backend/src/modules/user/user.service.ts), PANs are never stored in plaintext. They are hashed using SHA-256 for duplicate lookup (`panHash`), encrypted via AES-256-GCM (`panEncrypted`), and masked for UI display (`panMasked` e.g., `ABCDE****F`).
- **Network Transport:**
  - All communication uses HTTPS (TLS 1.3). Zero cleartext HTTP traffic allowed.
- **AdMob Isolation:**
  - [services/ads/adConfig.ts](file:///d:/Projects/IPOVault-Offline/services/ads/adConfig.ts) explicitly guarantees that ad requests contain zero user IDs, PANs, broker accounts, or portfolio values.

### 3.4 Account Deletion Lifecycle, Retention & Web Verification

#### Multi-System Deletion Lifecycle & Non-Atomicity Reality:
PostgreSQL database transactions guarantee atomicity strictly within PostgreSQL. Firebase Authentication, Cloud Firestore, push notification registries, and client-side SQLite are independent distributed systems; **joint cross-system atomicity does not exist**. The deletion workflow is engineered for resilient eventual consistency, idempotent recovery, and explicit state tracking:

1. **Push Token Unregistration:** Client calls `unregisterDevicePushTokenAsync(uid)` to deregister device push mapping before session teardown.
2. **Pending Sync Abort:** `cancelDebouncedFirestoreSync()` immediately halts in-flight background writes.
3. **Server-Side Transaction (`DELETE /api/v1/user/account`):** Client executes authenticated request using Bearer ID token. Backend executes Prisma atomic database transaction:
   - Purges `UserSavedPan` (all encrypted and hashed PAN records).
   - Purges `BrokerAccount` (cascading to `BrokerConnection`, `BrokerToken` OAuth tokens, `BrokerHolding`, `BrokerTrade`, and `IpoInvestment`).
   - Purges `UserPushToken` (device push registration records).
   - Purges `Notification` (cascading to `NotificationDelivery`).
   - Purges `NotificationPreference`.
   - Purges `AllotmentCheckJob` (cascading to `AllotmentCheckJobItem`).
   - Purges `UserEntitlement` (active access tier record).
   - **Internal Operational Tier Audit Retention & Anonymization:** `UserEntitlementAuditLog` decouples user records by stripping direct identifiers:
     - `userId = 'anon-' + randomUUID()` (unique cryptographic surrogate UUID per event, avoiding shared cohort clustering).
     - `ipAddress = null` (client IP stripped).
     - `entitlementId = null` (foreign key linkage decoupled).
     - `reason = 'Account deleted'`.
     - *Retained Fields:* `id`, `previousTier`, `newTier`, `changedBy`, `createdAt`.
     - *Purpose:* Internal subscription tier accounting and billing dispute resolution.
     - *Legal Clarification:* Audit log retention is **not** claimed as a statutory legal requirement under SEBI or RBI laws without verified legal advice.
     - *Retention Guarantee Clarification:* No automated 180-day retention pruning job is currently scheduled in the backend; logs persist in this decoupled format until manually pruned or until a scheduled retention cleanup job is added.
4. **Cloud Firestore Document Removal:** Client deletes `users/{uid}` profile and snapshot document.
5. **Crash Recovery Marker:** Client writes `@ipovault_pending_account_deletion_uid` before invoking destructive credential removal.
6. **Firebase Authentication Deletion:** Client calls `deleteUser(user)`. If `auth/requires-recent-login` is raised, deletion is halted and user is informed cleanly without claiming success.
7. **Local SQLite & Cache Wipe:** Client executes `clearAllData(targetUid)` (explicitly passing the captured `targetUid` so that rows matching the deleted user are purged even if auth state transitions to null), clears `@ipovault_username`, `@ipovault_avatar_uri`, `@ipovault_cached_user`, removes `@ipovault_pending_account_deletion_uid`, and redirects cleanly to `/auth`.

#### Failure Resilience, Idempotent Recovery & Crash Recovery Guarantees:
- **Server Failure:** If backend deletion fails (network outage, 5xx), Firebase user deletion is **NOT** executed, SQLite data is preserved, and the client displays an explanatory error.
- **Idempotent Retries:** If a partial failure occurs (e.g., PostgreSQL transaction committed, but Firestore or Firebase Auth call timed out), the user is notified of the partial failure. When the user retries deletion, the backend transaction executes **idempotently**: queries against already-purged tables succeed safely with 0 rows affected, allowing the workflow to proceed directly to remaining external systems without locking or inconsistent state.
- **Abrupt Termination & Crash Resilience:** If the mobile app process is terminated between the moment Firebase Auth `deleteUser()` succeeds and local SQLite wipe finishes:
  - The user's session is already invalidated (`setUser(null)`), preventing login to the deleted account.
  - On subsequent app launch, `DBContext.reconcileStartupState()` inspects `@ipovault_pending_account_deletion_uid`, automatically purges all orphaned SQLite rows (`ipo_applications`, `users_table`, `bank_accounts`, `ipo_listings`, `ipo_allotments`) belonging to that deleted user, and clears the flag.
- **Scoped Local Deletion:** Passing `targetUid` to `clearAllData(targetUid)` ensures the deleted user's records are purged even when `authUser` has already transitioned to null during async teardown.
- All backend deletion operations are strictly scoped to the authenticated `userId` derived from the verified token, making cross-user deletion impossible.

#### Public Web Deletion Request Hardening (`https://getipovault.in/delete-account`):
- **Implementation Status:** Responsive, accessible web portal created at `public/delete-account/index.html` and served at `/delete-account` via Express static handler in [src/app.setup.ts](file:///d:/Projects/IPOVault-Backend/src/app.setup.ts).
- **Public Request Mechanism (`POST /api/v1/user/deletion-request`):**
  - Users submit their registered email address.
  - Rate limiting is enforced: maximum 3 requests per email per 15 minutes, maximum 10 requests per client IP per 15 minutes.
  - **Limitation Finding:** This rate limiter is currently **process-local** (in-memory sliding window) because the backend architecture does not include Redis or a distributed caching tier. It is not shared across multiple backend instances or persistent across server restarts.
  - Generic success response is always returned (`{"success": true, "message": "If an account exists with this email address, a confirmation email will be sent..."}`) to prevent account enumeration.
  - Confirmation token uses HMAC-SHA256, contains a random `jti` (UUID), email, and 15-minute expiry (`exp`).
  - Tokens are signed with `ACCOUNT_DELETION_TOKEN_SECRET` (minimum 32 characters).
  - **Fail-Closed Startup Validation:** Validated in [src/config/env.ts](file:///d:/Projects/IPOVault-Backend/src/config/env.ts). In production (`NODE_ENV === 'production'`), if the secret is missing or under 32 characters, the application **fails closed on startup** and refuses to boot.
  - **Key Rotation Implication:** Rotating `ACCOUNT_DELETION_TOKEN_SECRET` immediately invalidates all outstanding in-flight deletion tokens issued prior to rotation, safely forcing users to request a fresh link.
  - Raw confirmation tokens are **never logged** or included in analytics. In production and development modes, tokens are strictly excluded from API responses.
- **Link-Prefetch Bot & Email Scanner Immunity:**
  - Automated security scanners (e.g., Outlook Safe Links, Gmail bot, WhatsApp link unfurl) issue HTTP `GET` requests to URLs in incoming emails.
  - `GET /api/v1/user/confirm-deletion?token=...` is **strictly non-destructive**. It verifies token validity and unconsumed status, extracts and masks the email (`u***@domain.com`), and renders a secure HTML confirmation page. **It NEVER deletes an account.**
  - The confirmation page enforces strict security headers:
    - `Cache-Control: no-store, no-cache, must-revalidate`
    - `Referrer-Policy: no-referrer`
    - `X-Frame-Options: DENY`
    - `X-Content-Type-Options: nosniff`
  - All styles use system fonts and inline CSS without third-party external CDN requests, preventing token leakage in `Referer` headers.
- **Explicit Execution & Persistent Deletion Job State Machine:**
  - Deletion requires an explicit, user-initiated `POST /api/v1/user/confirm-deletion` with the token.
  - **Persistent State Model (`consumed_deletion_tokens` table):**
    - Tracks explicit states: `PENDING`, `COMPLETED`, `FAILED`, with `userId`, `attempts`, `lastError`, and `completedAt`.
    - Never stores raw tokens (only `jti_hash = sha256(jti)` is stored).
  - **Failure Boundaries & Recovery:**
    - If the PostgreSQL transaction fails, nothing is committed and Firebase is never called.
    - If PostgreSQL commits but Firebase Auth deletion fails: the job state is updated to `FAILED`, an HTTP 500 error is returned with clear instructions to retry, and the token is **NOT** marked as completed.
    - The user can safely retry with the **SAME confirmation token**: `verifyDeletionToken` permits verification for `FAILED` jobs, re-runs database purge idempotently, and retries Firebase deletion.
    - If Firebase deletion succeeds: the job state transitions to `COMPLETED` with `completedAt`, and `userId` is nullified (`userId = null`) to eliminate residual PII while preserving `jti_hash` single-use replay immunity.
    - Subsequent replay attempts with the same token are rejected with HTTP 401: explicit message confirming the account was already permanently deleted.
    - If the client loses network response after Firebase deletion completes: replaying the token safely informs the user with HTTP 401 that their account has already been permanently deleted.
  - **Concurrency Protection:**
    - Inserting `jti_hash` is protected by database `UNIQUE` constraint.
    - Two concurrent requests using the same token: the second request detects the active `PENDING` job and is rejected with HTTP 409 Conflict (`Account deletion is currently in progress. Please wait a moment.`), preventing race conditions.
  - **Server Restart Resilience:**
    - State is persisted in PostgreSQL; restarting backend instances or routing across multiple nodes safely preserves `COMPLETED` replay rejection and `FAILED` retry eligibility.
  - Opportunistic cleanup: Expired records in `consumed_deletion_tokens` are cleaned up during transactions.
- **Production Email Delivery Reality & Infrastructure Finding:**
  - The backend repository currently has **no email delivery library installed** (no nodemailer, SendGrid, Resend, or AWS SES package in `package.json`).
  - **Status:** Production email delivery is **explicitly BLOCKED**.
  - In `NODE_ENV === 'test'` mode only, the confirmation token is returned in the API response exclusively for automated test harness assertions.
  - In all other environments, tokens are not returned. **Email delivery is not functional** until the application owner installs an email provider transport.
- **Live HTTP Reachability Finding:** Direct HTTP query to `https://getipovault.in/delete-account` returns an HTML redirection to `/lander` (GoDaddy domain parking page: `window.LANDER_SYSTEM="PW"`). The domain `getipovault.in` DNS is currently parked and has not yet been routed by the owner to the backend server.
- **Action Required by Owner:** Update domain DNS A-record/CNAME to route traffic for `getipovault.in` to the IPOVault backend deployment, install an email provider library and configure credentials, and set `ACCOUNT_DELETION_TOKEN_SECRET` in production `.env`.

---

## 4. Verification Evidence & Test Execution

Every audit check and remediation was verified with automated test executions:

```
========================================================================
1. Account Deletion Lifecycle & Safety Regression Suite
   Command: npx.cmd tsx __tests__/accountDeletionLifecycle.test.ts
   Exit Status: 0 (ALL 15 PASSED)
   - Successful deletion: purges server records, Firebase user, push tokens, SQLite
   - Reauthentication guard: catches requires-recent-login, no false success
   - Backend unavailable: network error cleanly aborts without deleting Firebase user
   - Partial failure & safe retry: idempotent flow allows safe retry
   - Push-token cleanup: device push token unregistered before session invalidation
   - Error integrity: never emits success message when any deletion step fails
   - Link-prefetch immunity: GET request is strictly non-destructive (preview only)
   - Replay protection: confirmation tokens are strictly single-use and cannot be replayed
   - Multi-system non-atomic failure resilience: partial failure preserves local state
   - Persistent replay protection: tokens remain invalid across server restarts & multi-instance cluster
   - Partial failure window safety: session invalidation prevents stranded access to deleted accounts
   - Crash & termination resilience: startup reconciliation cleans up orphaned SQLite data after abrupt termination
   - Local data scoping: passing targetUid prevents skipping user data wipe when auth state is null
   - Lost network response safety: deletion remains irreversible even if client drops network before 200 OK
   - Account switching isolation: startup recovery purges crashed user data without touching new logged-in user data

2. Backend User & Account Deletion Unit Test Suite
   Command: node ./node_modules/jest/bin/jest.js src/modules/user/user.service.spec.ts --forceExit
   Exit Status: 0 (ALL 41 PASSED)
   - syncPans creates and updates UserSavedPan
   - deletePan strictly scoped to authenticated user, cross-user deletion rejected with 404
   - deleteAllPans deletes all PANs scoped to user
   - deleteUserAccount atomically purges all user tables and anonymizes audit logs
   - Audit logs anonymized with unique random surrogate UUIDs (no shared constant identity)
   - requestAccountDeletionByEmail returns safe generic response (no enumeration)
   - Sliding-window rate limiter blocks excessive requests per email (max 3 / 15m) and IP (max 10 / 15m)
   - Confirmation tokens are never logged or exposed in non-test environments
   - Missing or short token secret in production fails closed (HTTP 500)
   - verifyDeletionToken safely verifies token claims without deleting data (GET non-destructive)
   - confirmAccountDeletion verifies HMAC token and purges database + Firebase user on explicit POST
   - Consumed tokens cannot be replayed (HTTP 401 on second attempt)
   - Consumed tokens rejected across backend restarts via persistent database record
   - Concurrent replay attempts rejected via database unique constraint violation (P2002)
   - Opportunistic cleanup of expired tokens during confirmation
   - Failure boundaries: aborts cleanly on DB transaction failure without calling Firebase
   - Failure boundaries: no false success message when Firebase deletion fails, status set to FAILED
   - Failure boundaries: safe retry with same token after Firebase failure succeeds on second try
   - Failure boundaries: retry after backend restart when prior attempt was FAILED
   - Failure boundaries: rejects replay with 401 and confirms completed deletion if client lost response
   - Failure boundaries: rejects concurrent confirmation with 409 Conflict when job is actively PENDING
   - Failure boundaries: handles repeated deletion requests for already-deleted account idempotently
   - Failure boundaries: recovers when a PENDING record is stale (>30s) after crash
   - Failure boundaries: rejects retry with 429 when max retry attempts (5) are reached
   - Failure boundaries: handles Firebase timeout gracefully with 10s bounded timeout and sanitized FIREBASE_AUTH_TIMEOUT error code
   - Failure boundaries: treats auth/user-not-found as idempotent success during recovery
   - Failure boundaries: differentiates expired token responses between unstarted, completed, and failed jobs
   - Failure boundaries: reconciles late Firebase success after timeout and transitions record to COMPLETED
   - Failure boundaries: deduplicates in-flight Firebase deletion when concurrent request occurs for same user
   - Failure boundaries: rejects with 409 Conflict if a stale PENDING deletion (>30s) is still in-flight on the same process
   - Failure boundaries: rejects verifyDeletionToken with 429 when max retry attempts (5) are reached
   - Failure boundaries: rejects with 409 Conflict if another backend instance wins the atomic retry claim race (updated.count === 0)
   - Failure boundaries: rejects with 401 if another backend instance already completed the deletion during the retry race
   - Privacy verification: guarantees lastError stores sanitized codes and never leaks PII, PANs, or tokens
   - Rejects tampered tokens (401) and malformed tokens (400)
   - Rejects expired tokens (401)

3. Google Play Compliance & Security Audit Suite
   Command: npx.cmd tsx __tests__/googlePlayComplianceAudit.test.ts
   Exit Status: 0 (ALL 8 PASSED)
   - SYSTEM_ALERT_WINDOW removed from AndroidManifest.xml
   - Scoped Storage compliant (READ/WRITE_EXTERNAL_STORAGE removed)
   - android:allowBackup="false" verified
   - Target SDK 36 and Compile SDK 36 verified
   - In-app Account Deletion verified in AuthContext & UI
   - Privacy Policy AdMob disclosure verified
   - EAS production AAB buildType verified
   - Version 2.3.0 & versionCode 2 aligned

4. React Hook Order & SQLite Closed-Handle Resilience Suite
   Command: npx.cmd tsx __tests__/hookOrderAndRadarSnapshot.test.ts
   Exit Status: 0 (ALL 18 PASSED)
   - 14 hooks verified invariant across Pro <-> Non-Pro tier switches
   - Parameter sanitization prevents NativeDatabase.prepareAsync NaN crashes
   - SQLite closed-resource handles abort safely without unhandled crashes

5. TypeScript Static Typecheck (Mobile)
   Command: npx.cmd tsc --noEmit
   Exit Status: 0 (0 errors)

6. Expo Project Doctor
   Command: npx.cmd expo-doctor
   Exit Status: 0 (18/18 checks passed, no issues detected)

7. Backend TypeScript Typecheck
   Command: npm.cmd run typecheck (in D:\Projects\IPOVault-Backend)
   Exit Status: 0 (0 errors)
========================================================================
```

---

## 5. Owner Actions Required (External Consoles & Hosting)

The following items cannot be executed from source code and must be performed by the account owner prior to release:

1. **DNS & Reverse Proxy for Web Account Deletion URL:**
   - `getipovault.in` currently resolves to GoDaddy parking servers. Point the DNS A-record or CNAME to your backend deployment (or configure your reverse proxy) so that `https://getipovault.in/delete-account` serves the built `public/delete-account/index.html` page.
2. **Email Provider Transport Configuration:**
   - The backend codebase currently lacks an email delivery package (e.g., SendGrid, AWS SES, or nodemailer). To make the public web deletion flow functional for users, install a provider library, configure provider API credentials in `.env`, and dispatch the confirmation link containing the HMAC token.
3. **Production Signing Secret Configuration:**
   - Configure `ACCOUNT_DELETION_TOKEN_SECRET` with a cryptographically secure random string of at least 32 characters in production `.env`. The backend fails closed if this secret is missing or insufficient in production mode.
4. **Google Play Console — Web Account Deletion URL:**
   - Once DNS and email transport are live, provide `https://getipovault.in/delete-account` in Play Console App Content > Account Deletion.
5. **Google Play Console — Data Safety Form:**
   - Use [docs/PLAY_STORE_DATA_SAFETY_INVENTORY.md](file:///d:/Projects/IPOVault-Offline/docs/PLAY_STORE_DATA_SAFETY_INVENTORY.md) as the exact guide to fill out the Data Safety questionnaire.
6. **Google Play Console — Financial Features Declaration:**
   - Declare IPOVault as a personal financial management / portfolio tracking utility, NOT a loan provider, NBFC, or SEBI-registered broker.
7. **Google AdMob — app-ads.txt:**
   - Host the `app-ads.txt` file at the root of the app's official developer domain (`https://getipovault.in/app-ads.txt`) linking your AdMob publisher ID (`pub-3768316467682663`).
8. **Physical Device Smoke Test:**
   - Perform the manual verification steps in [docs/PLAY_STORE_MANUAL_TEST_PLAN.md](file:///d:/Projects/IPOVault-Offline/docs/PLAY_STORE_MANUAL_TEST_PLAN.md) on a physical Android 14/15/16 device.
