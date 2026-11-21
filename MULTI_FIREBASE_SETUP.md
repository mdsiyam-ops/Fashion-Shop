# Multi-Firebase & Multi-Firestore Architecture Guide

This project supports connecting **3, 4, 5, or unlimited independent Firebase Projects and Cloud Firestore databases simultaneously**, while preserving the existing storefront, authentication flow, checkout, order tracking, reviews, and admin panel.

---

## 1. Architecture Overview

- **Central Manager (`src/lib/multiFirebaseManager.ts`)**:
  - Dynamically discovers all configured Firebase projects from:
    1. `firebase-applet-config.json` / `VITE_FIREBASE_PROJECT_1_*` (Primary `[DEFAULT]` app + Auth).
    2. Environment variables `VITE_FIREBASE_PROJECT_2_*`, `VITE_FIREBASE_PROJECT_3_*`, `VITE_FIREBASE_PROJECT_4_*`, `VITE_FIREBASE_PROJECT_5_*`, ... (unlimited numeric indices).
    3. Runtime configurations saved from **Admin Panel → ফায়ারবেস সংযোগ**.
  - Prevents duplicate app initialization using `getApps()`, `initializeApp()`, and `getApp()` with unique deterministic app names (`[DEFAULT]` for `project_1`, `fb_app_<id>_<projectId>` for additional projects).
  - Creates and caches an independent `Firestore` instance per project/database ID (`initializeFirestore` / `getFirestore` with `persistentLocalCache`).
  - Tracks connection health independently per project (`connected`, `idle`, `testing`, `unconfigured`, `disabled`, `quota_exceeded`, `permission_denied`, `offline`, `error`) so an issue in one project does not crash healthy databases.

- **Database Role Mapping**:
  - `users` → User public/private profiles & notifications *(default: Firebase 1)*
  - `catalog` → Products & categories *(default: Firebase 1)*
  - `transactions` → Orders, live tracking, payments, deposits & withdrawals *(default: Firebase 2 when configured, else Firebase 1)*
  - `engagement` → Reviews, ads, tasks, rewards & earning records *(default: Firebase 3 when configured, else Firebase 1)*
  - `admin` → Store settings, courier fees & admin reports *(default: Firebase 4 when configured, else Firebase 1)*

---

## 2. Reusable Centralized Database API

All functions are exported from `src/lib/multiFirebaseManager.ts` and re-exported from `src/firebase.ts`:

```ts
import {
  getDatabase,
  getFirebaseApp,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  queryDocuments,
  listenToDocument,
  listenToCollection,
} from './firebase';
```

- `getDatabase(role)` — Returns the independent `Firestore` instance mapped to `role`.
- `getFirebaseApp(projectKeyOrId)` — Returns (or safely initializes once) the named `FirebaseApp` instance.
- `getDocument(role, collection, documentId)` — Reads a single document with transient retry handling.
- `addDocument(role, collection, data, { documentId?, idempotencyKey? })` — Writes a document with server timestamps and optional deterministic idempotency key.
- `updateDocument(role, collection, documentId, data)` — Updates fields with `updatedAt: serverTimestamp()`.
- `deleteDocument(role, collection, documentId)` — Deletes a document cleanly on the role's database.
- `queryDocuments(role, collection, conditions, orderByConfig?, maxResults?)` — Executes `where`/`orderBy`/`limit` queries.
- `listenToDocument(role, collection, documentId, callback, onError?)` — Subscribes to live document snapshots and updates connection health state.
- `listenToCollection(role, collection, callback, options?)` — Subscribes to live collection snapshots with optional filters and ordering.

---

## 3. How to Connect Additional Firebase Projects (4, 5, or Unlimited)

### Option A: Environment Variables (Recommended for Production Builds)
1. Copy `.env.example` to `.env` (never commit `.env` to git).
2. In each Firebase Console (**Project Settings → Your apps → Web app**), copy only the **public Web SDK configuration**:
   - `API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`, and `DATABASE_ID` (usually `(default)`).
3. Populate `VITE_FIREBASE_PROJECT_2_*`, `VITE_FIREBASE_PROJECT_3_*`, `VITE_FIREBASE_PROJECT_4_*`.
4. To add a 5th or 6th project, add a new block with `_5_`, `_6_`, etc.:
   ```env
   VITE_FIREBASE_PROJECT_5_LABEL="Firebase 5 (Analytics)"
   VITE_FIREBASE_PROJECT_5_API_KEY="AIza..."
   VITE_FIREBASE_PROJECT_5_AUTH_DOMAIN="project-5.firebaseapp.com"
   VITE_FIREBASE_PROJECT_5_PROJECT_ID="project-5-id"
   VITE_FIREBASE_PROJECT_5_APP_ID="1:50000:web:abc"
   VITE_FIREBASE_PROJECT_5_DATABASE_ID="(default)"
   VITE_FIREBASE_PROJECT_5_ENABLED="true"
   ```
5. Optionally pin role defaults via `VITE_FIREBASE_ROLE_USERS`, `VITE_FIREBASE_ROLE_CATALOG`, `VITE_FIREBASE_ROLE_TRANSACTIONS`, `VITE_FIREBASE_ROLE_ENGAGEMENT`, `VITE_FIREBASE_ROLE_ADMIN`.

### Option B: Admin Panel Live Connection Manager
1. Sign in with the Admin Google Account and open **Admin Panel → ফায়ারবেস সংযোগ**.
2. Click **"নতুন Firebase প্রজেক্ট"**, paste the public Web App SDK fields (private Service Account JSON / private keys are automatically blocked), and save.
3. Click **"টেস্ট করুন"** to verify real server connectivity (`getDocFromServer`), enable/disable projects, and reassign any Database Role live without code edits.

---

## 4. Security Architecture & Independent Firestore Security Rules

> **CRITICAL RULES**:
> 1. Never hardcode private Service Account JSON, `private_key`, or Admin SDK secrets in frontend code or `VITE_*` env vars.
> 2. Never rely solely on client-side UI role checks for admin or financial permissions. Enforce identity and permissions inside each project's `firestore.rules` AND inside trusted backend / Cloud Functions endpoints.
> 3. **Cross-Project Auth Note**: Users sign in through Primary Project 1 (`auth`). Secondary Firebase Projects (`project_2`, `project_3`, `project_4`) do **not** automatically share Project 1's `request.auth` session token unless:
>    - A trusted backend / Cloud Function mints Firebase Custom Tokens on the secondary projects using the Admin SDK (`signInWithCustomToken(getAuth(secondaryApp), token)`), **OR**
>    - Sensitive cross-project writes (payments, withdrawals, reward payouts, cross-project audit logs) are executed server-side via HTTPS Cloud Functions verifying Project 1's Firebase ID Token (`admin.auth().verifyIdToken(idToken)`).

Deploy independent `firestore.rules` in each Firebase project:

### Firebase 1 (`users` & `catalog`)
Use the project's root `firestore.rules` file, which locks down:
- `/categories/{categoryId}` and `/products/{productId}`: Public read, Admin-only create/delete; validated schema checks.
- `/users/{userId}` and `/users/{userId}/private/{docId}`: Strict owner-or-admin access (`request.auth.uid == userId`), immutable `role` escalation prevention.
- `/notifications/{notificationId}`: Owner-or-admin read/mark-read; verified creation rules.

### Firebase 2 (`transactions`: Orders, Deposits, Withdrawals, Payments)
```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }

    function isSignedIn() { return request.auth != null; }
    function isVerifiedAdmin() {
      return isSignedIn()
        && request.auth.token.email_verified == true
        && request.auth.token.email.lower() == 'mdsiyam32112@gmail.com';
    }

    match /orders/{orderId} {
      allow get, list: if isSignedIn() && (resource.data.userId == request.auth.uid || isVerifiedAdmin());
      allow create: if isSignedIn()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.id == orderId
        && request.resource.data.status == 'pending'
        && request.resource.data.totalAmount is number
        && request.resource.data.totalAmount >= 0;
      allow update: if isVerifiedAdmin()
        || (isSignedIn()
            && resource.data.userId == request.auth.uid
            && resource.data.status == 'pending'
            && request.resource.data.status == 'cancelled'
            && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'updatedAt']));
      allow delete: if isVerifiedAdmin();
    }

    match /orderTracking/{trackingCode} {
      allow get: if true;
      allow list: if isSignedIn() && (resource.data.userId == request.auth.uid || isVerifiedAdmin());
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      allow update: if isVerifiedAdmin()
        || (isSignedIn() && resource.data.userId == request.auth.uid && request.resource.data.status == 'cancelled');
    }

    // Deposits, Withdrawals & Payment Ledger: NEVER allow client-side approval/balance mutation
    match /deposits/{txId} {
      allow get, list: if isSignedIn() && (resource.data.userId == request.auth.uid || isVerifiedAdmin());
      allow create: if isSignedIn()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.status == 'pending'
        && request.resource.data.idempotencyKey is string;
      allow update, delete: if false; // Trusted backend / Cloud Functions Admin SDK only
    }

    match /withdrawals/{txId} {
      allow get, list: if isSignedIn() && (resource.data.userId == request.auth.uid || isVerifiedAdmin());
      allow create: if isSignedIn()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.status == 'pending'
        && request.resource.data.idempotencyKey is string;
      allow update, delete: if false; // Trusted backend / Cloud Functions Admin SDK only
    }
  }
}
```

### Firebase 3 (`engagement`: Reviews, Ads, Tasks, Rewards & Earnings)
```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }

    function isSignedIn() { return request.auth != null; }
    function isVerifiedAdmin() {
      return isSignedIn()
        && request.auth.token.email_verified == true
        && request.auth.token.email.lower() == 'mdsiyam32112@gmail.com';
    }

    match /reviews/{reviewId} {
      allow read: if true;
      allow create: if isSignedIn()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.rating >= 1
        && request.resource.data.rating <= 5;
      allow update, delete: if isVerifiedAdmin() || (isSignedIn() && resource.data.userId == request.auth.uid);
    }

    match /ads/{adId} {
      allow read: if true;
      allow write: if isVerifiedAdmin();
    }

    match /tasks/{taskId} {
      allow read: if isSignedIn();
      allow write: if isVerifiedAdmin();
    }

    // Reward payouts & earning records must only be credited by a trusted backend
    match /rewards/{rewardId} {
      allow read: if isSignedIn() && (resource.data.userId == request.auth.uid || isVerifiedAdmin());
      allow write: if false; // Cloud Functions Admin SDK only
    }
  }
}
```

### Firebase 4 (`admin`: Store Settings, Reports & App Configuration)
```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }

    function isVerifiedAdmin() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email.lower() == 'mdsiyam32112@gmail.com';
    }

    match /settings/{settingId} {
      allow get: if true;
      allow list: if false;
      allow create, update, delete: if isVerifiedAdmin();
    }

    match /reports/{reportId} {
      allow read, write: if isVerifiedAdmin();
    }
  }
}
```

---

## 5. Data Consistency & Cross-Project Operations

1. **Firestore Transactions Cannot Span Multiple Projects**:
   - A `runTransaction` or `writeBatch` call in Firestore is strictly scoped to a single `Firestore` database instance. Calling `batch.set(...)` on documents belonging to two different Firebase projects throws a runtime SDK error.
   - This codebase explicitly checks `isSameDatabaseForRoles(roleA, roleB)` before batching writes. When roles reside on separate Firebase projects:
     - The authoritative `transactions` write commits first with a deterministic `idempotencyKey` (such as `orderId`).
     - Secondary updates (`catalog` stock adjustments, `users` notifications) run in isolated per-project operations so an unavailable secondary database never corrupts or reverses a confirmed transaction.
2. **Trusted Backend / Cloud Functions Pattern for Sensitive Cross-Project Workflows**:
   - For financial deposits, withdrawals, or reward payouts that must verify balances or mutate state across **Firebase 1 (Users)**, **Firebase 2 (Transactions)**, and **Firebase 3 (Rewards)**:
     1. Client obtains Project 1 ID token (`await auth.currentUser.getIdToken()`) and sends a unique `idempotencyKey` (`crypto.randomUUID()`) to an HTTPS Cloud Function or backend API.
     2. Server verifies the token using Project 1's Admin SDK and checks admin/user ownership claims server-side.
     3. Server uses a deterministic ledger doc ID (`idempotencyKeys/{key}`) in Project 2 (`create()` fails cleanly if already processed) so retries never double-credit or double-debit.
     4. Client **must not** show a payment, withdrawal, or reward as successful until the trusted backend returns HTTP 200 / confirmed status from Firestore.
3. **Health Diagnostics (`test/connection`)**:
   - Note that the Admin Panel **"টেস্ট করুন"** button executes `getDocFromServer(doc(db, 'test', 'connection'))` against the selected database. Ensure your project's rules permit authenticated admin reads on `/test/connection` (or note that a `Permission Denied` diagnostic still confirms live network reachability to that Firebase project while reminding you to deploy rules).
