import { FirebaseApp, FirebaseOptions, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  limit,
  memoryLocalCache,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  QueryConstraint,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
  WhereFilterOp,
} from 'firebase/firestore';
import primaryConfigJson from '../../firebase-applet-config.json';

export type DatabaseRole = 'users' | 'catalog' | 'transactions' | 'engagement' | 'admin';

export const DATABASE_ROLE_META: Record<
  DatabaseRole,
  { label: string; labelBn: string; descriptionBn: string; defaultSlotLabel: string }
> = {
  users: {
    label: 'Users & Profiles',
    labelBn: 'ব্যবহারকারী ও প্রোফাইল (Firebase 1)',
    descriptionBn: 'মূল ইউজার প্রোফাইল, প্রাইভেট ডেলিভারি ঠিকানা এবং নোটিফিকেশন ডেটা।',
    defaultSlotLabel: 'Firebase 1',
  },
  catalog: {
    label: 'Products & Categories',
    labelBn: 'পণ্য ও ক্যাটালগ (Firebase 1)',
    descriptionBn: 'স্টোরের পণ্য, ইনভেন্টরি স্টক ও ক্যাটাগরি ডেটা।',
    defaultSlotLabel: 'Firebase 1',
  },
  transactions: {
    label: 'Transactions & Orders',
    labelBn: 'অর্ডার, পেমেন্ট ও লেনদেন (Firebase 2)',
    descriptionBn: 'অর্ডার রেকর্ড, লাইভ ট্র্যাকিং, ডিপোজিট/উইথড্রয়াল এবং পেমেন্ট হিস্ট্রি।',
    defaultSlotLabel: 'Firebase 2',
  },
  engagement: {
    label: 'Ads, Tasks & Rewards',
    labelBn: 'রিভিউ, রিওয়ার্ড ও এনগেজমেন্ট (Firebase 3)',
    descriptionBn: 'বিজ্ঞাপন, টাস্ক, রিওয়ার্ডস, আর্নিং রেকর্ড ও গ্রাহক রিভিউ।',
    defaultSlotLabel: 'Firebase 3',
  },
  admin: {
    label: 'Admin Settings & Reports',
    labelBn: 'অ্যাডমিন সেটিংস ও রিপোর্ট (Firebase 4)',
    descriptionBn: 'অ্যাডমিন কনফিগারেশন, ডেলিভারি চার্জ, সোশ্যাল লিংক ও প্রতিবেদন।',
    defaultSlotLabel: 'Firebase 4',
  },
};

export interface FirebaseProjectConfig {
  id: string; // stable registry key e.g. 'project_1', 'project_2', 'project_custom_...'
  label: string;
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId: string;
  enabled: boolean;
  source: 'primary' | 'env' | 'runtime';
}

export type ConnectionStatusCode =
  | 'idle'
  | 'testing'
  | 'connected'
  | 'unconfigured'
  | 'disabled'
  | 'quota_exceeded'
  | 'permission_denied'
  | 'offline'
  | 'error';

export interface ProjectConnectionState {
  status: ConnectionStatusCode;
  message: string;
  rawError?: string;
  latencyMs?: number;
  lastCheckedAt?: string;
}

export interface QueryConditionInput {
  field: string;
  op: WhereFilterOp;
  value: unknown;
}

const RUNTIME_PROJECTS_STORAGE_KEY = 'fashion_shop_multi_fb_projects_v1';
const ROLE_MAP_STORAGE_KEY = 'fashion_shop_multi_fb_roles_v1';
const DEFAULT_PRIMARY_PROJECT_KEY = 'project_1';

const firestoreInstances = new Map<string, Firestore>();
const authInstances = new Map<string, Auth>();
const projectAuthUsers = new Map<string, User | null>();
const authSubscribedKeys = new Set<string>();
const connectionStates = new Map<string, ProjectConnectionState>();
const managerListeners = new Set<() => void>();
const routingListeners = new Set<() => void>();

function notifyManagerListeners(includeRouting = true): void {
  managerListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore listener callback error
    }
  });
  if (includeRouting) {
    routingListeners.forEach((cb) => {
      try {
        cb();
      } catch {
        // ignore listener callback error
      }
    });
  }
}

export function subscribeManagerUpdates(listener: () => void): () => void {
  managerListeners.add(listener);
  return () => {
    managerListeners.delete(listener);
  };
}

export function subscribeRoutingUpdates(listener: () => void): () => void {
  routingListeners.add(listener);
  return () => {
    routingListeners.delete(listener);
  };
}

const SECRET_FIELD_PATTERNS = [
  'private_key',
  'private_key_id',
  'client_email',
  'service_account',
  'token_uri',
  'auth_provider_x509_cert_url',
  'begin private key',
  'begin rsa private key',
];

export function containsSensitiveSecret(raw: unknown): boolean {
  const serialized = (typeof raw === 'string' ? raw : JSON.stringify(raw || {})).toLowerCase();
  return SECRET_FIELD_PATTERNS.some((pattern) => serialized.includes(pattern));
}

export function isPlaceholderValue(val: string | undefined): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  const upper = trimmed.toUpperCase();
  return (
    upper.startsWith('YOUR_') ||
    upper.startsWith('MY_') ||
    upper.startsWith('REPLACE_') ||
    upper.includes('PLACEHOLDER') ||
    upper === 'UNDEFINED'
  );
}

export function isValidFirestoreDatabaseId(raw: string | undefined): boolean {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed === '(default)') return true;
  if (trimmed.includes('://') || trimmed.includes('firebaseio.com') || trimmed.includes('/')) {
    return false;
  }
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(trimmed);
}

export function sanitizeFirestoreDatabaseId(raw: string | undefined): string {
  const trimmed = (raw || '').trim();
  if (!trimmed || !isValidFirestoreDatabaseId(trimmed)) {
    return '(default)';
  }
  return trimmed;
}

export function isConfiguredProject(cfg: FirebaseProjectConfig): boolean {
  return (
    !isPlaceholderValue(cfg.apiKey) &&
    !isPlaceholderValue(cfg.projectId) &&
    !isPlaceholderValue(cfg.appId)
  );
}

function getEnvValue(key: string): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.[key]?.trim() ?? '';
  } catch {
    return '';
  }
}

function getAllEnvProjectIndices(): number[] {
  const indices = new Set<number>([1, 2, 3, 4]);
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
    Object.keys(env).forEach((key) => {
      const match = key.match(/^VITE_FIREBASE_PROJECT_(\d+)_(API_KEY|PROJECT_ID)$/);
      if (match) {
        const num = Number(match[1]);
        if (Number.isInteger(num) && num >= 1) {
          indices.add(num);
        }
      }
    });
  } catch {
    // ignore env scan error
  }
  return Array.from(indices).sort((a, b) => a - b);
}

function loadEnvProjects(): FirebaseProjectConfig[] {
  const result: FirebaseProjectConfig[] = [];
  const defaultRoleLabels: Record<number, string> = {
    1: 'Firebase 1 (Primary Users & Catalog)',
    2: 'Firebase 2 (Transactions & Payments)',
    3: 'Firebase 3 (Ads, Tasks & Rewards)',
    4: 'Firebase 4 (Admin Settings & Reports)',
  };

  const indices = getAllEnvProjectIndices();
  for (const idx of indices) {
    const prefix = `VITE_FIREBASE_PROJECT_${idx}_`;
    const apiKey = getEnvValue(`${prefix}API_KEY`);
    const projectId = getEnvValue(`${prefix}PROJECT_ID`);
    const authDomain = getEnvValue(`${prefix}AUTH_DOMAIN`);
    const storageBucket = getEnvValue(`${prefix}STORAGE_BUCKET`);
    const messagingSenderId = getEnvValue(`${prefix}MESSAGING_SENDER_ID`);
    const appId = getEnvValue(`${prefix}APP_ID`);
    const firestoreDatabaseId = getEnvValue(`${prefix}DATABASE_ID`) || '(default)';
    const label = getEnvValue(`${prefix}LABEL`) || defaultRoleLabels[idx] || `Firebase ${idx}`;
    const enabledRaw = getEnvValue(`${prefix}ENABLED`);

    if (idx === 1) {
      const useEnvPrimary =
        !isPlaceholderValue(apiKey) && !isPlaceholderValue(projectId) && !isPlaceholderValue(appId);
      result.push({
        id: DEFAULT_PRIMARY_PROJECT_KEY,
        label: useEnvPrimary ? label : `Firebase 1 (${primaryConfigJson.projectId})`,
        apiKey: useEnvPrimary ? apiKey : primaryConfigJson.apiKey,
        authDomain: useEnvPrimary ? authDomain || `${projectId}.firebaseapp.com` : primaryConfigJson.authDomain,
        projectId: useEnvPrimary ? projectId : primaryConfigJson.projectId,
        storageBucket: useEnvPrimary ? storageBucket : primaryConfigJson.storageBucket,
        messagingSenderId: useEnvPrimary ? messagingSenderId : primaryConfigJson.messagingSenderId,
        appId: useEnvPrimary ? appId : primaryConfigJson.appId,
        firestoreDatabaseId: useEnvPrimary
          ? firestoreDatabaseId
          : primaryConfigJson.firestoreDatabaseId || '(default)',
        enabled: true,
        source: useEnvPrimary ? 'env' : 'primary',
      });
    } else {
      const hasAnyValue = !isPlaceholderValue(apiKey) || !isPlaceholderValue(projectId);
      const isValid =
        !isPlaceholderValue(apiKey) && !isPlaceholderValue(projectId) && !isPlaceholderValue(appId);
      result.push({
        id: `project_${idx}`,
        label,
        apiKey: hasAnyValue ? apiKey : '',
        authDomain: hasAnyValue ? authDomain : '',
        projectId: hasAnyValue ? projectId : '',
        storageBucket: hasAnyValue ? storageBucket : '',
        messagingSenderId: hasAnyValue ? messagingSenderId : '',
        appId: hasAnyValue ? appId : '',
        firestoreDatabaseId,
        enabled: isValid && enabledRaw.toLowerCase() !== 'false',
        source: 'env',
      });
    }
  }
  return result;
}

function loadRuntimeProjectOverrides(): FirebaseProjectConfig[] {
  try {
    const raw = localStorage.getItem(RUNTIME_PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    if (containsSensitiveSecret(raw)) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    let healedAny = false;
    const cleaned = parsed
      .filter((item): item is FirebaseProjectConfig => Boolean(item && typeof item.id === 'string'))
      .map((item) => {
        const sanitizedDbId = sanitizeFirestoreDatabaseId(item.firestoreDatabaseId);
        if ((item.firestoreDatabaseId?.trim() || '(default)') !== sanitizedDbId) {
          healedAny = true;
        }
        return {
          ...item,
          firestoreDatabaseId: sanitizedDbId,
          source: item.id === DEFAULT_PRIMARY_PROJECT_KEY ? item.source || 'primary' : 'runtime',
        };
      });
    if (healedAny) {
      saveRuntimeProjectOverrides(cleaned);
    }
    return cleaned;
  } catch {
    return [];
  }
}

function saveRuntimeProjectOverrides(projects: FirebaseProjectConfig[]): void {
  try {
    const clean = projects.map((p) => ({
      id: p.id,
      label: p.label,
      apiKey: p.apiKey,
      authDomain: p.authDomain,
      projectId: p.projectId,
      storageBucket: p.storageBucket,
      messagingSenderId: p.messagingSenderId,
      appId: p.appId,
      firestoreDatabaseId: p.firestoreDatabaseId || '(default)',
      enabled: Boolean(p.enabled),
      source: p.source,
    }));
    if (containsSensitiveSecret(clean)) {
      throw new Error('Private credentials cannot be stored in browser configuration.');
    }
    localStorage.setItem(RUNTIME_PROJECTS_STORAGE_KEY, JSON.stringify(clean));
  } catch (err) {
    console.error('Failed to save runtime Firebase project overrides:', err);
  }
}

export function getAllFirebaseProjects(): FirebaseProjectConfig[] {
  const envList = loadEnvProjects();
  const runtimeList = loadRuntimeProjectOverrides();
  const mergedMap = new Map<string, FirebaseProjectConfig>();

  envList.forEach((p) => mergedMap.set(p.id, p));
  runtimeList.forEach((override) => {
    if (override.id === DEFAULT_PRIMARY_PROJECT_KEY) {
      // Keep primary project active & valid
      const base = mergedMap.get(DEFAULT_PRIMARY_PROJECT_KEY);
      if (base) {
        mergedMap.set(DEFAULT_PRIMARY_PROJECT_KEY, {
          ...base,
          label: override.label || base.label,
          enabled: true,
        });
      }
      return;
    }
    const existing = mergedMap.get(override.id);
    mergedMap.set(override.id, existing ? { ...existing, ...override } : override);
  });

  return Array.from(mergedMap.values());
}

export function getRoleAssignments(): Record<DatabaseRole, string> {
  const projects = getAllFirebaseProjects();
  const validIds = new Set(projects.map((p) => p.id));
  const isEnvReady = (id: string): boolean => {
    const found = projects.find((p) => p.id === id);
    return Boolean(found && found.source === 'env' && found.enabled && isConfiguredProject(found));
  };

  // Safe default: only auto-assign .env preconfigured projects; runtime-added Firebase 2/3/4/5+ stay
  // friction-free until verified & explicitly assigned (matching Firebase 5 behavior).
  const defaults: Record<DatabaseRole, string> = {
    users: DEFAULT_PRIMARY_PROJECT_KEY,
    catalog: DEFAULT_PRIMARY_PROJECT_KEY,
    transactions: isEnvReady('project_2') ? 'project_2' : DEFAULT_PRIMARY_PROJECT_KEY,
    engagement: isEnvReady('project_3') ? 'project_3' : DEFAULT_PRIMARY_PROJECT_KEY,
    admin: isEnvReady('project_4') ? 'project_4' : DEFAULT_PRIMARY_PROJECT_KEY,
  };

  // Env overrides
  const envRoleMap: Partial<Record<DatabaseRole, string>> = {
    users: getEnvValue('VITE_FIREBASE_ROLE_USERS'),
    catalog: getEnvValue('VITE_FIREBASE_ROLE_CATALOG'),
    transactions: getEnvValue('VITE_FIREBASE_ROLE_TRANSACTIONS'),
    engagement: getEnvValue('VITE_FIREBASE_ROLE_ENGAGEMENT'),
    admin: getEnvValue('VITE_FIREBASE_ROLE_ADMIN'),
  };

  (Object.keys(envRoleMap) as DatabaseRole[]).forEach((role) => {
    const val = envRoleMap[role];
    if (val && validIds.has(val)) {
      defaults[role] = val;
    }
  });

  // Runtime admin overrides
  try {
    const raw = localStorage.getItem(ROLE_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<DatabaseRole, string>>;
      (Object.keys(parsed) as DatabaseRole[]).forEach((role) => {
        const val = parsed[role];
        if (val && validIds.has(val)) {
          defaults[role] = val;
        }
      });
    }
  } catch {
    // ignore storage read error
  }

  return defaults;
}

export function setRoleAssignment(role: DatabaseRole, projectKey: string): void {
  const projects = getAllFirebaseProjects();
  const target = projects.find((p) => p.id === projectKey || p.projectId === projectKey);
  if (!target) {
    throw new Error(`Firebase project "${projectKey}" not found.`);
  }
  const current = getRoleAssignments();
  current[role] = target.id;
  try {
    localStorage.setItem(ROLE_MAP_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore storage error
  }
  notifyManagerListeners();
}

export function getProjectForRole(role: DatabaseRole): FirebaseProjectConfig {
  const assignments = getRoleAssignments();
  const assignedKey = assignments[role] || DEFAULT_PRIMARY_PROJECT_KEY;
  const projects = getAllFirebaseProjects();
  const found = projects.find((p) => p.id === assignedKey);
  if (found) return found;
  return projects.find((p) => p.id === DEFAULT_PRIMARY_PROJECT_KEY) || projects[0];
}

export function getPrimaryProjectId(): string {
  const primary = getAllFirebaseProjects().find((p) => p.id === DEFAULT_PRIMARY_PROJECT_KEY);
  return primary?.projectId || primaryConfigJson.projectId;
}

function shortConfigHash(cfg: FirebaseProjectConfig): string {
  const src = `${cfg.apiKey}|${cfg.projectId}|${cfg.appId}|${cfg.authDomain}|${cfg.firestoreDatabaseId}`;
  let h = 5381;
  for (let i = 0; i < src.length; i += 1) {
    h = ((h << 5) + h) ^ src.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function getUniqueAppName(cfg: FirebaseProjectConfig): string {
  if (cfg.id === DEFAULT_PRIMARY_PROJECT_KEY) {
    return '[DEFAULT]';
  }
  return `fb_app_${cfg.id}_${cfg.projectId}_${shortConfigHash(cfg)}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function resolveProjectConfig(projectKeyOrId: string): FirebaseProjectConfig {
  const projects = getAllFirebaseProjects();
  const found = projects.find(
    (p) => p.id === projectKeyOrId || p.projectId === projectKeyOrId
  );
  if (!found) {
    throw new Error(`Firebase project configuration not found for "${projectKeyOrId}".`);
  }
  if (!found.enabled) {
    throw new Error(`Firebase project "${found.label}" (${found.projectId || found.id}) is currently disabled.`);
  }
  if (!isConfiguredProject(found)) {
    throw new Error(`Firebase project "${found.label}" is missing public client configuration.`);
  }
  return found;
}

export function getFirebaseApp(projectKeyOrId: string = DEFAULT_PRIMARY_PROJECT_KEY): FirebaseApp {
  const cfg = resolveProjectConfig(projectKeyOrId);
  const appName = getUniqueAppName(cfg);
  const existingApps = getApps();

  const existing = existingApps.find((app) => app.name === appName);
  if (existing) {
    return getApp(appName);
  }

  const options: FirebaseOptions = {
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain || `${cfg.projectId}.firebaseapp.com`,
    projectId: cfg.projectId,
    storageBucket: cfg.storageBucket || undefined,
    messagingSenderId: cfg.messagingSenderId || undefined,
    appId: cfg.appId,
  };

  return cfg.id === DEFAULT_PRIMARY_PROJECT_KEY
    ? initializeApp(options)
    : initializeApp(options, appName);
}

export function getDatabaseForProject(projectKeyOrId: string): Firestore {
  const cfg = resolveProjectConfig(projectKeyOrId);
  const safeDbId = sanitizeFirestoreDatabaseId(cfg.firestoreDatabaseId);
  const cacheKey = `${getUniqueAppName(cfg)}::${safeDbId}`;
  const cached = firestoreInstances.get(cacheKey);
  if (cached) return cached;

  const app = getFirebaseApp(cfg.id);
  const dbId = safeDbId !== '(default)' ? safeDbId : undefined;
  const isPrimary = cfg.id === DEFAULT_PRIMARY_PROJECT_KEY;

  let instance: Firestore;
  try {
    instance = initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        localCache: isPrimary
          ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
          : memoryLocalCache(),
      },
      dbId
    );
  } catch {
    try {
      instance = initializeFirestore(
        app,
        { experimentalAutoDetectLongPolling: true, localCache: memoryLocalCache() },
        dbId
      );
    } catch {
      instance = dbId ? getFirestore(app, dbId) : getFirestore(app);
    }
  }

  firestoreInstances.set(cacheKey, instance);
  return instance;
}

export function getDatabase(role: DatabaseRole): Firestore {
  const cfg = getProjectForRole(role);
  return getDatabaseForProject(cfg.id);
}

export function isSameDatabaseForRoles(roleA: DatabaseRole, roleB: DatabaseRole): boolean {
  const cfgA = getProjectForRole(roleA);
  const cfgB = getProjectForRole(roleB);
  return (
    cfgA.id === cfgB.id &&
    (cfgA.firestoreDatabaseId || '(default)') === (cfgB.firestoreDatabaseId || '(default)')
  );
}

export function getAuthForProject(projectKeyOrId: string): Auth {
  const cfg = resolveProjectConfig(projectKeyOrId);
  const existing = authInstances.get(cfg.id);
  if (existing) return existing;

  const app = getFirebaseApp(cfg.id);
  const projectAuth = getAuth(app);
  authInstances.set(cfg.id, projectAuth);
  projectAuthUsers.set(cfg.id, projectAuth.currentUser);

  if (!authSubscribedKeys.has(cfg.id)) {
    authSubscribedKeys.add(cfg.id);
    onAuthStateChanged(projectAuth, (user) => {
      projectAuthUsers.set(cfg.id, user);
      notifyManagerListeners();
    });
  }

  return projectAuth;
}

export function getUserDisplayEmail(user: User | null): string {
  if (!user) return '';
  if (user.email && user.email.trim()) return user.email.trim();
  const providerEmail = user.providerData?.find((p) => p?.email)?.email;
  return providerEmail?.trim() || '';
}

export function getProjectAuthUser(projectKeyOrId: string): User | null {
  try {
    const cfg = resolveProjectConfig(projectKeyOrId);
    const projectAuth = getAuthForProject(cfg.id);
    return projectAuth.currentUser ?? projectAuthUsers.get(cfg.id) ?? null;
  } catch {
    return null;
  }
}

export function getSecondaryConfiguredProjects(): FirebaseProjectConfig[] {
  return getAllFirebaseProjects().filter(
    (p) => p.id !== DEFAULT_PRIMARY_PROJECT_KEY && p.enabled && isConfiguredProject(p)
  );
}

export function getUnsignedActiveRoleProjects(): FirebaseProjectConfig[] {
  const roleMap = getRoleAssignments();
  const activeProjectIds = new Set(Object.values(roleMap));
  return getSecondaryConfiguredProjects().filter(
    (p) => activeProjectIds.has(p.id) && !getProjectAuthUser(p.id)
  );
}

export function parseFirebaseSdkSnippet(raw: string): {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
} {
  if (!raw || !raw.trim()) {
    throw new Error('কনফিগ কোড ফাঁকা রয়েছে।');
  }
  if (containsSensitiveSecret(raw)) {
    throw new Error(
      'নিরাপত্তার কারণে Service Account JSON বা Private Key এখানে পেস্ট করা নিষিদ্ধ।'
    );
  }
  const extract = (key: string): string | undefined => {
    const regex = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`, 'i');
    const match = raw.match(regex);
    return match?.[1]?.trim();
  };
  const parsed = {
    apiKey: extract('apiKey'),
    authDomain: extract('authDomain'),
    projectId: extract('projectId'),
    storageBucket: extract('storageBucket'),
    messagingSenderId: extract('messagingSenderId'),
    appId: extract('appId'),
  };
  if (!parsed.apiKey && !parsed.projectId && !parsed.appId) {
    throw new Error('বৈধ Firebase Web SDK Config পাওয়া যায়নি।');
  }
  return parsed;
}

export async function signInToProject(projectKeyOrId: string): Promise<User> {
  const cfg = resolveProjectConfig(projectKeyOrId);
  const projectAuth = getAuthForProject(cfg.id);
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(projectAuth, provider);
  projectAuthUsers.set(cfg.id, cred.user);
  notifyManagerListeners(true);
  await testProjectConnection(cfg.id);
  return cred.user;
}

export async function signOutFromProject(projectKeyOrId: string): Promise<void> {
  const cfg = resolveProjectConfig(projectKeyOrId);
  if (cfg.id === DEFAULT_PRIMARY_PROJECT_KEY) {
    throw new Error('প্রাইমারি প্রজেক্ট থেকে সাইন-আউট করতে মূল প্রোফাইল ব্যবহার করুন।');
  }
  const projectAuth = getAuthForProject(cfg.id);
  await signOut(projectAuth);
  projectAuthUsers.set(cfg.id, null);
  notifyManagerListeners(true);
}

export function reassignProjectRolesToPrimary(projectKey: string): DatabaseRole[] {
  const current = getRoleAssignments();
  const moved: DatabaseRole[] = [];
  (Object.keys(current) as DatabaseRole[]).forEach((role) => {
    if (current[role] === projectKey) {
      current[role] = DEFAULT_PRIMARY_PROJECT_KEY;
      moved.push(role);
    }
  });
  if (moved.length > 0) {
    try {
      localStorage.setItem(ROLE_MAP_STORAGE_KEY, JSON.stringify(current));
    } catch {
      // ignore storage error
    }
    notifyManagerListeners();
  }
  return moved;
}

export function generateRulesTemplateForProject(
  assignedRoles: DatabaseRole[],
  adminEmail = 'mdsiyam32112@gmail.com'
): string {
  const lowerEmail = adminEmail.trim().toLowerCase() || 'mdsiyam32112@gmail.com';
  const blocks: string[] = [];

  if (assignedRoles.includes('transactions')) {
    blocks.push(`    match /orders/{orderId} {
      allow get: if isAdmin() || (isSignedIn() && (resource == null || resource.data.userId == request.auth.uid));
      allow list: if isAdmin() || (isSignedIn() && resource.data.userId == request.auth.uid);
      allow create: if isSignedIn()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.id == orderId
        && request.resource.data.status == 'pending'
        && request.resource.data.createdAt == request.time
        && request.resource.data.updatedAt == request.time;
      allow update: if isAdmin()
        || (isSignedIn()
            && resource.data.userId == request.auth.uid
            && resource.data.status == 'pending'
            && request.resource.data.status == 'cancelled'
            && request.resource.data.updatedAt == request.time
            && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'updatedAt']));
      allow delete: if isAdmin();
    }

    match /orderTracking/{trackingCode} {
      allow get: if trackingCode is string && trackingCode.size() <= 32;
      allow list: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      allow create: if isSignedIn()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.trackingCode == trackingCode
        && request.resource.data.status == 'pending';
      allow update: if isAdmin()
        || (isSignedIn()
            && resource.data.userId == request.auth.uid
            && resource.data.status == 'pending'
            && request.resource.data.status == 'cancelled'
            && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'updatedAt']));
      allow delete: if isAdmin();
    }`);
  }

  if (assignedRoles.includes('engagement')) {
    blocks.push(`    match /reviews/{reviewId} {
      allow get, list: if true;
      allow create: if isSignedIn()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.rating is number
        && request.resource.data.rating >= 1 && request.resource.data.rating <= 5;
      allow update, delete: if isAdmin() || (isSignedIn() && resource.data.userId == request.auth.uid);
    }`);
  }

  if (assignedRoles.includes('admin')) {
    blocks.push(`    match /settings/{settingId} {
      allow get: if true;
      allow list: if false;
      allow create, update, delete: if isAdmin();
    }`);
  }

  if (assignedRoles.includes('catalog')) {
    blocks.push(`    match /categories/{categoryId} {
      allow get, list: if true;
      allow create, update, delete: if isAdmin();
    }

    match /products/{productId} {
      allow get, list: if true;
      allow create, update, delete: if isAdmin();
    }`);
  }

  if (assignedRoles.includes('users')) {
    blocks.push(`    match /users/{userId} {
      allow get: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      allow list: if isAdmin();
      allow create, update: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      match /private/{docId} {
        allow read, write: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      }
    }

    match /notifications/{notificationId} {
      allow get, list: if isSignedIn() && (resource.data.recipientId == request.auth.uid || isAdmin());
      allow create: if isSignedIn();
      allow update, delete: if isAdmin() || (isSignedIn() && resource.data.recipientId == request.auth.uid);
    }`);
  }

  return `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function isSignedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return isSignedIn()
        && 'email_verified' in request.auth.token
        && request.auth.token.email_verified == true
        && 'email' in request.auth.token
        && request.auth.token.email.lower() == '${lowerEmail}';
    }

    // অ্যাডমিন প্যানেলের কানেকশন টেস্ট ("টেস্ট করুন")
    match /test/connection {
      allow get: if true;
      allow list, write: if false;
    }

${blocks.join('\n\n')}
  }
}
`;
}

export function getProjectConnectionState(projectKey: string): ProjectConnectionState {
  const projects = getAllFirebaseProjects();
  const cfg = projects.find((p) => p.id === projectKey);
  if (!cfg) {
    return { status: 'error', message: 'প্রজেক্ট কনফিগারেশন পাওয়া যায়নি।' };
  }
  if (!isConfiguredProject(cfg)) {
    return { status: 'unconfigured', message: 'Firebase কনফিগারেশন এখনো যুক্ত করা হয়নি।' };
  }
  if (!cfg.enabled) {
    return { status: 'disabled', message: 'এই প্রজেক্টটি বর্তমানে নিষ্ক্রিয় করা আছে।' };
  }
  return (
    connectionStates.get(projectKey) ?? {
      status: 'idle',
      message: 'সংযোগ পরীক্ষার জন্য প্রস্তুত।',
    }
  );
}

function classifyConnectionError(
  error: unknown,
  isSecondaryProject = false,
  cfg?: FirebaseProjectConfig
): {
  status: ConnectionStatusCode;
  message: string;
  rawError: string;
} {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const msg = rawMessage.toLowerCase();
  const rawCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  const code = rawCode.toLowerCase();
  const rawError = rawCode ? `${rawCode}: ${rawMessage}` : rawMessage;

  if (code.includes('resource-exhausted') || msg.includes('quota') || msg.includes('resource-exhausted')) {
    return {
      status: 'quota_exceeded',
      message: 'দৈনিক ফ্রি রিড কোটা শেষ হয়েছে (Quota Exceeded)।',
      rawError,
    };
  }
  if (msg.includes('firestore.googleapis.com') && (msg.includes('disabled') || msg.includes('has not been used'))) {
    return {
      status: 'error',
      message: `${cfg?.projectId || 'এই প্রজেক্টে'} Cloud Firestore API বা Database চালু করা হয়নি। Firebase Console → Firestore Database → Create database চালু করুন।`,
      rawError,
    };
  }
  if (msg.includes('referer') && msg.includes('blocked')) {
    return {
      status: 'error',
      message: 'Web API Key-তে HTTP Referrer সীমাবদ্ধতা থাকায় এই ডোমেইন ব্লক হয়েছে। Google Cloud Console → APIs & Services → Credentials-এ ডোমেইন অনুমতি দিন।',
      rawError,
    };
  }
  if (code.includes('not-found') || msg.includes('database') && msg.includes('does not exist')) {
    return {
      status: 'error',
      message: `Database ID "${cfg?.firestoreDatabaseId || '(default)'}" পাওয়া যায়নি। প্রজেক্টে Firestore Database তৈরি আছে কিনা এবং Database ID সঠিক কিনা যাচাই করুন।`,
      rawError,
    };
  }
  if (code.includes('permission-denied') || msg.includes('permission') || msg.includes('insufficient')) {
    return {
      status: 'permission_denied',
      message: isSecondaryProject
        ? `${cfg?.projectId || 'এই প্রজেক্টের'} Firestore Database "${cfg?.firestoreDatabaseId || '(default)'}"-এর Security Rules এখনো /test/connection পড়ার অনুমতি দেয়নি।`
        : 'Firestore Security Rules অনুমতি দেয়নি (Permission Denied)।',
      rawError,
    };
  }
  if (msg.includes('indexeddb') || msg.includes('aborterror') || msg.includes('idbtransaction')) {
    return {
      status: 'error',
      message:
        'Database ID ভুল বা ব্রাউজার IndexedDB ক্যাশ লক হয়েছে। সম্পাদনা থেকে Database ID "(default)" সেট করে পেজটি রিলোড করুন।',
      rawError,
    };
  }
  if (msg.includes('offline') || code.includes('unavailable')) {
    return {
      status: 'offline',
      message: 'Firestore সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি (Offline / Unavailable)।',
      rawError,
    };
  }
  return {
    status: 'error',
    message: rawMessage || 'সংযোগ পরীক্ষা ব্যর্থ হয়েছে।',
    rawError,
  };
}

function setProjectStatus(projectKey: string, state: ProjectConnectionState): void {
  const prev = connectionStates.get(projectKey);
  connectionStates.set(projectKey, state);
  const changed =
    !prev ||
    prev.status !== state.status ||
    prev.message !== state.message ||
    prev.rawError !== state.rawError;
  if (changed) {
    // Status changes must NOT re-trigger App.tsx listenerEpoch teardown/resubscribe!
    notifyManagerListeners(false);
  }
}

export async function testProjectConnection(projectKeyOrId: string): Promise<ProjectConnectionState> {
  const projects = getAllFirebaseProjects();
  const cfg = projects.find((p) => p.id === projectKeyOrId || p.projectId === projectKeyOrId);
  if (!cfg) {
    return { status: 'error', message: 'প্রজেক্ট খুঁজে পাওয়া যায়নি।' };
  }
  if (!isConfiguredProject(cfg)) {
    const st: ProjectConnectionState = {
      status: 'unconfigured',
      message: 'API Key, Project ID এবং App ID যুক্ত করুন।',
      lastCheckedAt: new Date().toISOString(),
    };
    setProjectStatus(cfg.id, st);
    return st;
  }
  if (!cfg.enabled) {
    const st: ProjectConnectionState = {
      status: 'disabled',
      message: 'প্রজেক্টটি নিষ্ক্রিয় আছে — টেস্ট করার আগে Enable করুন।',
      lastCheckedAt: new Date().toISOString(),
    };
    setProjectStatus(cfg.id, st);
    return st;
  }

  setProjectStatus(cfg.id, { status: 'testing', message: 'সংযোগ যাচাই হচ্ছে...' });
  const started = performance.now();
  const isSecondary = cfg.id !== DEFAULT_PRIMARY_PROJECT_KEY;
  try {
    const firestore = getDatabaseForProject(cfg.id);
    let verifiedViaFallbackRole = false;
    try {
      await getDocFromServer(doc(firestore, 'test', 'connection'));
    } catch (testErr) {
      const classifiedTest = classifyConnectionError(testErr, isSecondary, cfg);
      const secUser = isSecondary ? getProjectAuthUser(cfg.id) : null;
      const roleMap = getRoleAssignments();
      const assignedRoles = (Object.keys(roleMap) as DatabaseRole[]).filter(
        (r) => roleMap[r] === cfg.id
      );

      // If /test/connection is denied on a secondary project, probe assigned role collections if possible
      if (classifiedTest.status === 'permission_denied' && isSecondary) {
        if (assignedRoles.includes('transactions') && secUser) {
          await getDocs(
            query(
              collection(firestore, 'orders'),
              where('userId', '==', secUser.uid),
              limit(1)
            )
          );
          verifiedViaFallbackRole = true;
        } else if (assignedRoles.includes('catalog')) {
          await getDocs(query(collection(firestore, 'categories'), limit(1)));
          verifiedViaFallbackRole = true;
        } else if (assignedRoles.includes('engagement')) {
          await getDocs(query(collection(firestore, 'reviews'), limit(1)));
          verifiedViaFallbackRole = true;
        } else if (assignedRoles.includes('admin')) {
          await getDocFromServer(doc(firestore, 'settings', 'store'));
          verifiedViaFallbackRole = true;
        } else {
          throw testErr;
        }
      } else {
        throw testErr;
      }
    }

    // Also probe transactions orders read when secondary project handles transactions & user is signed in
    let txProbeNote = '';
    if (isSecondary) {
      const roleMap = getRoleAssignments();
      if (roleMap.transactions === cfg.id) {
        const secUser = getProjectAuthUser(cfg.id);
        if (secUser) {
          try {
            await getDocs(
              query(
                collection(firestore, 'orders'),
                where('userId', '==', secUser.uid),
                limit(1)
              )
            );
            txProbeNote = ' • Orders পড়া যাচাইকৃত';
          } catch (orderErr) {
            const ordCls = classifyConnectionError(orderErr, true, cfg);
            const st: ProjectConnectionState = {
              status: ordCls.status,
              message: `কানেকশন ঠিক আছে, তবে ${cfg.projectId}-এর /orders কালেকশন পড়তে Rules অনুমতি দেয়নি।`,
              rawError: ordCls.rawError,
              latencyMs: Math.round(performance.now() - started),
              lastCheckedAt: new Date().toISOString(),
            };
            setProjectStatus(cfg.id, st);
            return st;
          }
        } else {
          txProbeNote = ' • অর্ডারের জন্য Google সাইন-ইন প্রয়োজন';
        }
      }
    }

    const latencyMs = Math.round(performance.now() - started);
    const st: ProjectConnectionState = {
      status: 'connected',
      message: verifiedViaFallbackRole
        ? `সংযুক্ত ও রোল ডেটা সচল (${latencyMs} ms)`
        : `সংযুক্ত (${latencyMs} ms)${txProbeNote}`,
      latencyMs,
      lastCheckedAt: new Date().toISOString(),
    };
    setProjectStatus(cfg.id, st);
    return st;
  } catch (error) {
    const classified = classifyConnectionError(error, isSecondary, cfg);
    const st: ProjectConnectionState = {
      status: classified.status,
      message: classified.message,
      rawError: classified.rawError,
      latencyMs: Math.round(performance.now() - started),
      lastCheckedAt: new Date().toISOString(),
    };
    setProjectStatus(cfg.id, st);
    return st;
  }
}

export async function testAllProjectConnections(): Promise<void> {
  const projects = getAllFirebaseProjects();
  await Promise.allSettled(
    projects.filter((p) => p.enabled && isConfiguredProject(p)).map((p) => testProjectConnection(p.id))
  );
}

// Runtime Admin CRUD for Firebase project connections (public client config only)
export function upsertRuntimeFirebaseProject(
  input: Omit<FirebaseProjectConfig, 'source'>
): FirebaseProjectConfig {
  if (containsSensitiveSecret(input)) {
    throw new Error(
      'নিরাপত্তার কারণে প্রাইভেট সার্ভিস অ্যাকাউন্ট বা Admin SDK সিক্রেট ফ্রন্টএন্ডে প্রবেশ করানো নিষিদ্ধ।'
    );
  }
  const cleanId = input.id.trim() || `project_${Date.now()}`;
  const rawDbId = input.firestoreDatabaseId.trim() || '(default)';
  if (!isValidFirestoreDatabaseId(rawDbId)) {
    throw new Error(
      'Firestore Database ID সঠিক নয়। Realtime Database URL (firebaseio.com) দেবেন না — সাধারণত এটি "(default)" রাখতে হয়।'
    );
  }
  const cleanConfig: FirebaseProjectConfig = {
    id: cleanId,
    label: input.label.trim() || input.projectId.trim() || cleanId,
    apiKey: input.apiKey.trim(),
    authDomain: input.authDomain.trim() || `${input.projectId.trim()}.firebaseapp.com`,
    projectId: input.projectId.trim(),
    storageBucket: input.storageBucket.trim(),
    messagingSenderId: input.messagingSenderId.trim(),
    appId: input.appId.trim(),
    firestoreDatabaseId: sanitizeFirestoreDatabaseId(rawDbId),
    enabled: cleanId === DEFAULT_PRIMARY_PROJECT_KEY ? true : Boolean(input.enabled),
    source: cleanId === DEFAULT_PRIMARY_PROJECT_KEY ? 'primary' : 'runtime',
  };

  const currentOverrides = loadRuntimeProjectOverrides();
  const filtered = currentOverrides.filter((p) => p.id !== cleanId);
  saveRuntimeProjectOverrides([...filtered, cleanConfig]);
  firestoreInstances.delete(
    `${getUniqueAppName(cleanConfig)}::${cleanConfig.firestoreDatabaseId || '(default)'}`
  );
  if (cleanId !== DEFAULT_PRIMARY_PROJECT_KEY) {
    authInstances.delete(cleanId);
    projectAuthUsers.delete(cleanId);
    authSubscribedKeys.delete(cleanId);
  }
  notifyManagerListeners(true);
  return cleanConfig;
}

export function toggleFirebaseProjectEnabled(projectKey: string, enabled: boolean): void {
  if (projectKey === DEFAULT_PRIMARY_PROJECT_KEY) {
    throw new Error('মূল প্রাইমারি প্রজেক্টটি নিষ্ক্রিয় করা যাবে না।');
  }
  const all = getAllFirebaseProjects();
  const target = all.find((p) => p.id === projectKey);
  if (!target) throw new Error('প্রজেক্ট পাওয়া যায়নি।');

  upsertRuntimeFirebaseProject({
    ...target,
    enabled,
  });

  if (!enabled) {
    // Reassign any roles pointing to disabled project safely? Keep assignment visible or warn; status updated
    setProjectStatus(projectKey, {
      status: 'disabled',
      message: 'অ্যাডমিন দ্বারা নিষ্ক্রিয় করা হয়েছে।',
      lastCheckedAt: new Date().toISOString(),
    });
  }
}

export function removeRuntimeFirebaseProject(projectKey: string): void {
  if (projectKey === DEFAULT_PRIMARY_PROJECT_KEY) {
    throw new Error('মূল প্রাইমারি প্রজেক্টটি মুছে ফেলা যাবে না।');
  }
  const currentOverrides = loadRuntimeProjectOverrides();
  saveRuntimeProjectOverrides(currentOverrides.filter((p) => p.id !== projectKey));

  // Reassign any roles mapped to this deleted runtime project back to primary
  const roles = getRoleAssignments();
  let rolesChanged = false;
  (Object.keys(roles) as DatabaseRole[]).forEach((role) => {
    if (roles[role] === projectKey) {
      roles[role] = DEFAULT_PRIMARY_PROJECT_KEY;
      rolesChanged = true;
    }
  });
  if (rolesChanged) {
    try {
      localStorage.setItem(ROLE_MAP_STORAGE_KEY, JSON.stringify(roles));
    } catch {
      // ignore
    }
  }
  authInstances.delete(projectKey);
  projectAuthUsers.delete(projectKey);
  authSubscribedKeys.delete(projectKey);
  connectionStates.delete(projectKey);
  notifyManagerListeners(true);
}

// Transient network retry helper (never retries permission or quota failures)
async function withTransientRetry<T>(
  projectKey: string,
  operation: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await operation();
      return res;
    } catch (err) {
      lastError = err;
      const classified = classifyConnectionError(err);
      if (classified.status === 'permission_denied' || classified.status === 'quota_exceeded') {
        setProjectStatus(projectKey, {
          status: classified.status,
          message: classified.message,
          lastCheckedAt: new Date().toISOString(),
        });
        throw err;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      } else {
        setProjectStatus(projectKey, {
          status: classified.status,
          message: classified.message,
          lastCheckedAt: new Date().toISOString(),
        });
      }
    }
  }
  throw lastError;
}

// ============================================================================
// Centralized Role-Based Database Access API
// ============================================================================

export async function getDocument<T = Record<string, unknown>>(
  role: DatabaseRole,
  collectionName: string,
  documentId: string
): Promise<T | null> {
  const cfg = getProjectForRole(role);
  const firestore = getDatabase(role);
  return withTransientRetry(cfg.id, async () => {
    const snap = await getDoc(doc(firestore, collectionName, documentId));
    if (!snap.exists()) return null;
    return snap.data() as T;
  });
}

export async function addDocument<T extends Record<string, unknown>>(
  role: DatabaseRole,
  collectionName: string,
  data: T,
  options?: {
    documentId?: string;
    idempotencyKey?: string;
    includeId?: boolean;
    includeUpdatedAt?: boolean;
  }
): Promise<string> {
  const cfg = getProjectForRole(role);
  const firestore = getDatabase(role);
  const docId =
    options?.documentId ||
    options?.idempotencyKey ||
    (typeof data.id === 'string' && data.id) ||
    `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return withTransientRetry(cfg.id, async () => {
    const payload: Record<string, unknown> = {
      ...data,
      createdAt: data.createdAt ?? serverTimestamp(),
    };
    if (options?.includeId || data.id !== undefined) {
      payload.id = data.id ?? docId;
    }
    if (options?.includeUpdatedAt !== false) {
      payload.updatedAt = data.updatedAt ?? serverTimestamp();
    }
    if (options?.idempotencyKey) {
      payload.idempotencyKey = options.idempotencyKey;
    }
    await setDoc(doc(firestore, collectionName, docId), payload);
    return docId;
  });
}

export async function updateDocument(
  role: DatabaseRole,
  collectionName: string,
  documentId: string,
  data: Record<string, unknown>,
  options?: { includeUpdatedAt?: boolean }
): Promise<void> {
  const cfg = getProjectForRole(role);
  const firestore = getDatabase(role);
  return withTransientRetry(cfg.id, async () => {
    const payload: Record<string, unknown> = { ...data };
    if (options?.includeUpdatedAt !== false) {
      payload.updatedAt = data.updatedAt ?? serverTimestamp();
    }
    await updateDoc(doc(firestore, collectionName, documentId), payload);
  });
}

export async function deleteDocument(
  role: DatabaseRole,
  collectionName: string,
  documentId: string
): Promise<void> {
  const cfg = getProjectForRole(role);
  const firestore = getDatabase(role);
  return withTransientRetry(cfg.id, async () => {
    await deleteDoc(doc(firestore, collectionName, documentId));
  });
}

export async function queryDocuments<T = Record<string, unknown>>(
  role: DatabaseRole,
  collectionName: string,
  conditions: QueryConditionInput[] = [],
  orderByConfig?: { field: string; direction?: 'asc' | 'desc' },
  maxResults?: number
): Promise<T[]> {
  const cfg = getProjectForRole(role);
  const firestore = getDatabase(role);
  return withTransientRetry(cfg.id, async () => {
    const constraints: QueryConstraint[] = conditions.map((c) =>
      where(c.field, c.op, c.value)
    );
    if (orderByConfig) {
      constraints.push(orderBy(orderByConfig.field, orderByConfig.direction ?? 'asc'));
    }
    if (typeof maxResults === 'number' && maxResults > 0) {
      constraints.push(limit(maxResults));
    }
    const q = query(collection(firestore, collectionName), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as T);
  });
}

export function listenToDocument<T = Record<string, unknown>>(
  role: DatabaseRole,
  collectionName: string,
  documentId: string,
  callback: (data: T | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  try {
    const cfg = getProjectForRole(role);
    const firestore = getDatabase(role);
    return onSnapshot(
      doc(firestore, collectionName, documentId),
      (snap) => {
        setProjectStatus(cfg.id, {
          status: 'connected',
          message: 'সংযুক্ত',
          lastCheckedAt: new Date().toISOString(),
        });
        callback(snap.exists() ? (snap.data() as T) : null);
      },
      (err) => {
        const classified = classifyConnectionError(err);
        setProjectStatus(cfg.id, {
          status: classified.status,
          message: classified.message,
          lastCheckedAt: new Date().toISOString(),
        });
        onError?.(err);
      }
    );
  } catch (err) {
    onError?.(err);
    return () => {};
  }
}

export function listenToCollection<T = Record<string, unknown>>(
  role: DatabaseRole,
  collectionName: string,
  callback: (items: T[]) => void,
  options?: {
    conditions?: QueryConditionInput[];
    orderByField?: string;
    orderDirection?: 'asc' | 'desc';
    onError?: (err: unknown) => void;
  }
): Unsubscribe {
  try {
    const cfg = getProjectForRole(role);
    const firestore = getDatabase(role);
    const constraints: QueryConstraint[] = (options?.conditions ?? []).map((c) =>
      where(c.field, c.op, c.value)
    );
    if (options?.orderByField) {
      constraints.push(orderBy(options.orderByField, options.orderDirection ?? 'asc'));
    }
    const ref =
      constraints.length > 0
        ? query(collection(firestore, collectionName), ...constraints)
        : collection(firestore, collectionName);

    return onSnapshot(
      ref,
      (snap) => {
        setProjectStatus(cfg.id, {
          status: 'connected',
          message: 'সংযুক্ত',
          lastCheckedAt: new Date().toISOString(),
        });
        callback(snap.docs.map((d) => d.data() as T));
      },
      (err) => {
        const classified = classifyConnectionError(err);
        setProjectStatus(cfg.id, {
          status: classified.status,
          message: classified.message,
          lastCheckedAt: new Date().toISOString(),
        });
        options?.onError?.(err);
      }
    );
  } catch (err) {
    options?.onError?.(err);
    return () => {};
  }
}
