import { getAuth, GoogleAuthProvider, User } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import {
  addDocument,
  deleteDocument,
  getDatabase,
  getDatabaseForProject,
  getDocument,
  getFirebaseApp,
  isSameDatabaseForRoles,
  listenToCollection,
  listenToDocument,
  queryDocuments,
  testProjectConnection,
  updateDocument,
  type DatabaseRole,
} from './lib/multiFirebaseManager';

// Primary Firebase App (Project 1) handles Authentication and acts as default fallback DB
const primaryApp = getFirebaseApp('project_1');
export const db = getDatabaseForProject('project_1');
export const auth = getAuth(primaryApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({ prompt: 'select_account' });

export {
  addDocument,
  deleteDocument,
  getDatabase,
  getDatabaseForProject,
  getDocument,
  getFirebaseApp,
  isSameDatabaseForRoles,
  listenToCollection,
  listenToDocument,
  queryDocuments,
  testProjectConnection,
  updateDocument,
  type DatabaseRole,
};

export const ADMIN_EMAIL = 'mdsiyam32112@gmail.com';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isQuotaExceededError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code).toLowerCase()
      : '';
  return (
    code.includes('resource-exhausted') ||
    msg.includes('quota') ||
    msg.includes('resource-exhausted') ||
    msg.includes('resource_exhausted')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration. Firestore client is offline.');
    }
  }
}

void testConnection();

// Blueprint synchronization helpers (enforces maxLength & ID patterns before Firestore writes)
export function clampStr(val: string, maxLen: number): string {
  return val.trim().slice(0, maxLen);
}

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

export function toSlug(raw: string): string {
  const ascii = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return ascii.length > 0 ? ascii : `cat-${Date.now().toString(36)}`;
}

export function isVerifiedCustomer(user: User | null): boolean {
  return Boolean(user && (user.emailVerified || Boolean(user.phoneNumber)));
}

export function formatBangladeshPhone(raw: string): string {
  const trimmed = raw.trim().replace(/[\s\-()]/g, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) {
    return '+' + trimmed.slice(1).replace(/\D/g, '');
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('880') && digits.length >= 13) {
    return `+${digits}`;
  }
  if (digits.startsWith('01') && digits.length === 11) {
    return `+88${digits}`;
  }
  if (digits.startsWith('1') && digits.length === 10) {
    return `+880${digits}`;
  }
  return digits ? `+${digits}` : '';
}
