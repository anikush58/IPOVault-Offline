# Google Play Data Safety Inventory & Declarations Guide

**Application:** IPOVault (`com.ipovault.app`) | **Version:** 2.3.0  
**Audit Date:** October 17, 2026

This document specifies the exact answers to submit in the **Google Play Console Data Safety questionnaire**, reflecting the actual, verified codebase implementation of IPOVault and its third-party SDKs.

---

## 1. Global Data Safety Overview

| Question in Play Console | Answer | Verification / Explanation |
| :--- | :---: | :--- |
| **Does your app collect or share any of the required user data types?** | **Yes** | App collects account identifiers, local portfolio records, push tokens, and AdMob advertising IDs. |
| **Do you provide a way for users to request that their data be deleted?** | **Yes** | Users can delete their account in-app via **Settings > Edit Profile > Delete Account**, or submit a web deletion request at **`https://getipovault.in/delete-account`** (served by backend at `/delete-account`; public URL and production email delivery are explicitly blocked until GoDaddy DNS and SMTP transport are configured). Server records, cloud backups, and local SQLite data are permanently wiped. Multi-system non-atomic failure resilience allows safe retries with the original token if identity provider deletion fails. Internal operational tier audit logs are decoupled by stripping all direct identifiers (`userId`, `ipAddress`, `entitlementId`) and assigning unique uncorrelatable surrogate UUIDs (`anon-${uuid}`). No automated time-based retention pruning guarantee is claimed, as no scheduled background pruning job is active. |

---

## 2. Data Type Breakdown

### A. Personal Info

#### 1. Name
- **Collected:** Yes (Google Sign-In display name or user-customized profile name).
- **Shared:** No.
- **Ephemeral:** No. Stored in local SQLite and Firebase Auth / Firestore for user profile display.
- **Required or Optional:** Optional.
- **Purpose:** App functionality, Account management.
- **Deletion:** Deleted immediately upon account deletion or local data clear.

#### 2. Email Address
- **Collected:** Yes (Firebase Authentication via Email/Password or Google Sign-In).
- **Shared:** No.
- **Ephemeral:** No. Stored in Firebase Authentication for identity verification and password resets.
- **Required or Optional:** Required for cloud sync and authenticated features; optional for offline browsing.
- **Purpose:** Account management, Developer communications, Security & compliance.
- **Deletion:** Deleted upon account deletion.

#### 3. User IDs (Account Identifiers)
- **Collected:** Yes (Firebase UID).
- **Shared:** No.
- **Purpose:** Account management, Cloud sync ownership validation.
- **Deletion:** Deleted upon account deletion.

---

### B. Financial Info

#### 1. User Financial Info & Government Identifiers (PAN Numbers)
- **Collected:** Yes (User manually inputs family member PANs for IPO allotment queries).
- **Shared:**
  - **With Official Registrars:** Yes. Temporarily transmitted via HTTPS directly to official Indian registrars (Link Intime, KFintech, Bigshare, Purva, Skyline) solely to query allotment status.
  - **With Advertisers / AdMob:** **STRICTLY NO.** AdMob requests are isolated from financial data.
- **Storage:**
  - **On Device:** Saved in internal app sandbox SQLite database (`users_table`). Not accessible to other apps (`allowBackup="false"`).
  - **On Backend:** When synced to IPOVault backend for multi-PAN tracking, PANs are **hashed with SHA-256 (`panHash`)** and **encrypted using AES-256-GCM (`panEncrypted`)**. Raw plaintext PANs are NEVER stored on backend servers.
- **Purpose:** App functionality (IPO allotment status lookup and application tracking).
- **Required or Optional:** Optional.
- **Deletion:** Users can delete individual PANs or delete the entire account.

#### 2. Bank Account Details / UPI Identifiers
- **Collected:** Yes (Bank name, last digits of account, and UPI VPA entered by user).
- **Shared:** No.
- **Storage:** Stored locally in SQLite and encrypted in personal Firestore backup if user opts into cloud sync.
- **Purpose:** App functionality (tracking which UPI handle or bank was used for which bid).
- **Deletion:** Deleted on demand or upon account deletion.

#### 3. Other Financial Info (IPO Bids, Lot Sizes, Application Numbers)
- **Collected:** Yes (Bidding volume, issue price, application status: Applied, Allotted, Not Allotted, Sold).
- **Shared:** No.
- **Storage:** Local SQLite database and personal cloud backup.
- **Purpose:** App functionality, Analytics (personal portfolio profit/loss computation).
- **Deletion:** Deleted on demand or upon account deletion.

---

### C. App Activity & Performance

#### 1. App Interactions & Crash Reports
- **Collected:** Basic operational logs (Pino logger on backend, local console logs in development).
- **Shared:** No.
- **Purpose:** Analytics, App functionality, Fraud prevention.

---

### D. Device or Other Identifiers

#### 1. Device or Other IDs (Advertising ID)
- **Collected:** Yes (Google Advertising ID collected by `react-native-google-mobile-ads` / Google AdMob SDK on Non-Pro tiers).
- **Shared:** Yes (Transmitted directly to Google AdMob for ad delivery and frequency capping).
- **Purpose:** Advertising & marketing.
- **Required or Optional:** Required for free/Non-Pro tier; suppressed entirely for Pro / Ad-Free subscribers.
- **Deletion:** Managed by user via Android System Settings (Settings > Google > Ads > Reset or Delete Advertising ID).

#### 2. Push Notification Tokens
- **Collected:** Yes (Expo Push Token for delivering IPO deadline and allotment status alerts).
- **Shared:** Transmitted to Expo Push Service to route notifications to the device.
- **Purpose:** App functionality (notifications requested by user).
- **Deletion:** Token invalidated upon sign-out or account deletion.

---

## 3. Play Console Form Input Matrix (Quick Reference)

Use this table when filling out the Google Play Console form:

| Category | Data Type | Collected? | Shared? | Encrypted in Transit? | Deletion Request Available? | Purposes to Check |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Personal Info** | Name | YES | NO | YES | YES | App functionality, Account management |
| **Personal Info** | Email address | YES | NO | YES | YES | App functionality, Account management |
| **Personal Info** | User IDs | YES | NO | YES | YES | App functionality, Account management |
| **Financial Info** | Other Financial Info (Bids, PAN, Bank handles) | YES | YES *(Registrars only)* | YES | YES | App functionality |
| **Device / Other IDs** | Device or other IDs (Ad ID, Push Token) | YES | YES *(AdMob, Expo)* | YES | YES | Advertising/Marketing, App functionality |
