# Google Play Store Release Checklist

**Application:** IPOVault (`com.ipovault.app`) | **Version:** 2.3.0 (`versionCode: 2`)  
**Audit Date:** October 17, 2026

Status Legend:
- **PASS**: Verified in codebase and confirmed by automated tests.
- **FAIL**: Verified failure or blocker in codebase.
- **NOT VERIFIED**: Requires physical device or external live environment testing.
- **OWNER ACTION REQUIRED**: Requires action in Google Play Console, Firebase Console, or AdMob Console.

---

## 1. Android Manifest, Permissions & Target SDK

| Item | Requirement | Status | Evidence / Notes |
| :--- | :--- | :---: | :--- |
| **Target SDK 36** | Android 16 (API 36) target SDK for August 2026 Play Store requirement | **PASS** | `android.targetSdkVersion=36` in [android/gradle.properties](file:///d:/Projects/IPOVault-Offline/android/gradle.properties). |
| **Compile SDK 36** | Compile against Android 36 SDK with Build Tools 36.0.0 | **PASS** | `android.compileSdkVersion=36` and `36.0.0` build tools verified. |
| **Min SDK 24** | Support Android 7.0 (API 24) and above | **PASS** | Configured in [android/app/build.gradle](file:///d:/Projects/IPOVault-Offline/android/app/build.gradle). |
| **No Dangerous Overlays** | No `SYSTEM_ALERT_WINDOW` permission in release build | **PASS** | Removed from [AndroidManifest.xml](file:///d:/Projects/IPOVault-Offline/android/app/src/main/AndroidManifest.xml). |
| **Scoped Storage** | No deprecated `READ_EXTERNAL_STORAGE` or `WRITE_EXTERNAL_STORAGE` | **PASS** | Removed. `expo-sharing` uses FileProvider; `expo-document-picker` uses SAF. |
| **Boot Rescheduling** | `RECEIVE_BOOT_COMPLETED` declared for local notifications | **PASS** | Declared in [AndroidManifest.xml](file:///d:/Projects/IPOVault-Offline/android/app/src/main/AndroidManifest.xml) and [app.json](file:///d:/Projects/IPOVault-Offline/app.json). |
| **Backup Protection** | `android:allowBackup="false"` to prevent adb dump of SQLite database | **PASS** | Configured in [app.json](file:///d:/Projects/IPOVault-Offline/app.json) and [AndroidManifest.xml](file:///d:/Projects/IPOVault-Offline/android/app/src/main/AndroidManifest.xml). |
| **64-bit Architecture** | Supports `arm64-v8a` and `x86_64` | **PASS** | `reactNativeArchitectures` includes `arm64-v8a,x86_64` in [gradle.properties](file:///d:/Projects/IPOVault-Offline/android/gradle.properties). |

---

## 2. Authentication, Entitlements & Account Lifecycle

| Item | Requirement | Status | Evidence / Notes |
| :--- | :--- | :---: | :--- |
| **In-App Account Deletion** | Discoverable in-app account deletion flow that purges backend, cloud, and local data | **PASS** | Implemented in [services/auth/firebaseAuthService.ts](file:///d:/Projects/IPOVault-Offline/services/auth/firebaseAuthService.ts), [context/AuthContext.tsx](file:///d:/Projects/IPOVault-Offline/context/AuthContext.tsx), [context/DBContext.tsx](file:///d:/Projects/IPOVault-Offline/context/DBContext.tsx), [app/settings-account.tsx](file:///d:/Projects/IPOVault-Offline/app/settings-account.tsx), and backend [user.service.ts](file:///d:/Projects/IPOVault-Backend/src/modules/user/user.service.ts). Hardened with crash recovery marker (`@ipovault_pending_account_deletion_uid`) and scoped SQLite deletion (`clearAllData(targetUid)`). Verified by 15 automated regression tests in [accountDeletionLifecycle.test.ts](file:///d:/Projects/IPOVault-Offline/__tests__/accountDeletionLifecycle.test.ts). |
| **Server-Authoritative Entitlements** | Pro status validated on server; client local storage cannot grant Pro | **PASS** | Verified via [UserEntitlementService](file:///d:/Projects/IPOVault-Backend/src/modules/user/user-entitlement.service.ts). |
| **Hook Order Invariance** | Switching between Pro and Non-Pro never crashes React hooks | **PASS** | Verified by 18-case regression suite in [hookOrderAndRadarSnapshot.test.ts](file:///d:/Projects/IPOVault-Offline/__tests__/hookOrderAndRadarSnapshot.test.ts). |
| **Database Closed Resource Safety** | SQLite operations handle closed connections gracefully without crashing | **PASS** | Verified by tests [3.1-3.9] in [hookOrderAndRadarSnapshot.test.ts](file:///d:/Projects/IPOVault-Offline/__tests__/hookOrderAndRadarSnapshot.test.ts). |
| **Web Account Deletion Portal** | Public web URL for account deletion requests outside the app | **PASS (Codebase)**<br>**OWNER ACTION (DNS & Email Transport)** | Implemented at `public/delete-account/index.html` and served at `/delete-account`. Backend hardened: GET preview only (link prefetch / scanner immune), explicit POST execution, persistent deletion state machine (`consumed_deletion_tokens`: `PENDING`, `COMPLETED`, `FAILED`) with safe retry semantics surviving restarts and multi-instance fleet, startup fail-closed secret validation, process-local rate limiting, decoupled audit retention (`anon-${uuid}`). Verified by 41 backend unit tests. Domain `getipovault.in` is parked on GoDaddy; production email and public URL are explicitly blocked until owner installs provider transport and routes DNS. |

---

## 3. Privacy Policy & Data Safety Disclosures

| Item | Requirement | Status | Evidence / Notes |
| :--- | :--- | :---: | :--- |
| **In-App Privacy Policy** | Accessible within the app at all times | **PASS** | Present in [app/privacy-policy.tsx](file:///d:/Projects/IPOVault-Offline/app/privacy-policy.tsx) and accessible from Settings. |
| **Accurate AdMob Disclosure** | Disclose use of Google AdMob and strict financial data isolation | **PASS** | Section 4 of [app/privacy-policy.tsx](file:///d:/Projects/IPOVault-Offline/app/privacy-policy.tsx) updated and verified. |
| **Accurate Account Deletion Disclosure** | Disclose user rights and deletion mechanism in policy | **PASS** | Section 5 of [app/privacy-policy.tsx](file:///d:/Projects/IPOVault-Offline/app/privacy-policy.tsx) updated and verified. |
| **Public Privacy Policy URL** | Non-geofenced, active public web URL | **OWNER ACTION REQUIRED** | Host privacy policy at `https://getipovault.in/privacy-policy` and enter into Play Console. |
| **Data Safety Questionnaire** | Match actual app behavior and third-party SDKs | **OWNER ACTION REQUIRED** | Complete Play Console form using [PLAY_STORE_DATA_SAFETY_INVENTORY.md](file:///d:/Projects/IPOVault-Offline/docs/PLAY_STORE_DATA_SAFETY_INVENTORY.md). |

---

## 4. Google AdMob Monetization Safety

| Item | Requirement | Status | Evidence / Notes |
| :--- | :--- | :---: | :--- |
| **Production Ad Units Gated** | Live ads only served in true production release builds (`USE_PROD_ADS=true`) | **PASS** | Enforced by [services/ads/adConfig.ts](file:///d:/Projects/IPOVault-Offline/services/ads/adConfig.ts). |
| **Dev / Test Safety** | Test ad unit IDs strictly used in Expo Go, dev mode, and test runners | **PASS** | Verified by automated tests in [adMonetizationFoundation.test.ts](file:///d:/Projects/IPOVault-Offline/__tests__/adMonetizationFoundation.test.ts). |
| **Zero Sensitive Data in Ad Requests** | No PANs, Demat accounts, banks, or balances passed to AdMob | **PASS** | `buildSanitizedAdRequestOptions()` strictly enforces keyword-only requests. |
| **Consent Management (UMP)** | GDPR/TCF consent form integration for EEA/UK users | **PASS** | Implemented in [services/ads/adConsentService.ts](file:///d:/Projects/IPOVault-Offline/services/ads/adConsentService.ts). |
| **app-ads.txt** | Authorized digital sellers declaration on developer website | **OWNER ACTION REQUIRED** | Add `google.com, pub-3768316467682663, DIRECT, f08c47fec0942fa0` to developer root domain. |
| **Play Console Ads Declaration** | Mark "Yes, my app contains ads" in Play Console App Content | **OWNER ACTION REQUIRED** | Required in Google Play Console dashboard. |

---

## 5. Build, Signing & Submission Readiness

| Item | Requirement | Status | Evidence / Notes |
| :--- | :--- | :---: | :--- |
| **Android App Bundle (.aab)** | EAS production profile configured for `app-bundle` | **PASS** | Configured in [eas.json](file:///d:/Projects/IPOVault-Offline/eas.json#L34-L36). |
| **Version Alignment** | `versionCode: 2` and `version: 2.3.0` synchronized across all configs | **PASS** | Verified in `app.json`, `package.json`, and `build.gradle`. |
| **Play App Signing** | App signing key enrolled in Google Play App Signing | **OWNER ACTION REQUIRED** | Complete during initial upload in Google Play Console. |
| **Physical Device Verification** | Verify on physical Android 14/15/16 devices before promotion | **NOT VERIFIED** | Requires execution of [PLAY_STORE_MANUAL_TEST_PLAN.md](file:///d:/Projects/IPOVault-Offline/docs/PLAY_STORE_MANUAL_TEST_PLAN.md). |
