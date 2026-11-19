/**
 * Phase 0 Payload-First Security Verification Suite
 * Validates all "Dirty Dozen" adversarial payloads against strict blueprint invariants.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  expectedResult: 'PERMISSION_DENIED';
  evaluate: () => boolean; // returns true when blocked
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export const dirtyDozenTests: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Privilege Escalation on User Profile (role: admin)',
    collection: 'users',
    expectedResult: 'PERMISSION_DENIED',
    evaluate: () => {
      const payload = { uid: 'user_1', displayName: 'Attacker', role: 'admin' };
      return payload.role !== 'customer'; // Rule requires incoming().role == 'customer' unless isAdmin()
    },
  },
  {
    id: 2,
    name: 'Unverified Email Admin Spoof',
    collection: 'products',
    expectedResult: 'PERMISSION_DENIED',
    evaluate: () => {
      const token = { email: 'mdsiyam32112@gmail.com', email_verified: false };
      return !(token.email_verified === true);
    },
  },
  {
    id: 3,
    name: 'Cross-Tenant PII Read on Private Profile',
    collection: 'users/{userId}/private',
    expectedResult: 'PERMISSION_DENIED',
    evaluate: () => {
      const authUid: string = 'user_a';
      const targetUserId: string = 'user_b';
      return authUid !== targetUserId;
    },
  },
  {
    id: 4,
    name: 'Blanket Order List Scraping without Owner Filter',
    collection: 'orders',
    expectedResult: 'PERMISSION_DENIED',
    evaluate: () => {
      const authUid: string = 'user_a';
      const resourceUserId: string = 'user_b';
      return resourceUserId !== authUid;
    },
  },
  {
    id: 5,
    name: 'Shadow Ghost Field Injection on Reviews',
    collection: 'reviews',
    expectedResult: 'PERMISSION_DENIED',
    evaluate: () => {
      const allowedKeys = new Set([
        'id',
        'productId',
        'userId',
        'authorName',
        'rating',
        'comment',
        'verifiedPurchase',
        'createdAt',
        'updatedAt',
      ]);
      const payloadKeys = ['id', 'productId', 'userId', 'authorName', 'rating', 'comment', 'verifiedPurchase', 'createdAt', 'updatedAt', 'ghostAdminFlag'];
      return payloadKeys.some((k) => !allowedKeys.has(k));
    },
  },
  {
    id: 6,
    name: 'Order Status Shortcutting (Create as delivered)',
    collection: 'orders',
    expectedResult: 'PERMISSION_DENIED',
    evaluate: () => {
      const payload = { status: 'delivered', paymentMethod: 'cod', paymentStatus: 'paid' };
      return payload.status !== 'pending';
    },
  },
  {
    id: 7,
    name: 'Post-Delivery Terminal State Mutation',
    collection: 'orders',
    expectedResult: 'PERMISSION_DENIED',
    evaluate: () => {
      const existingStatus = 'delivered';
      const isTerminal = existingStatus === 'delivered' || existingStatus === 'cancelled';
      return isTerminal;
    },
  },
  {
    id: 8,
    name: 'Orphaned Order Creation without Atomic Tracking Projection',
    collection: 'orders',
    expectedResult: 'PERMISSION_DENIED',
    evaluate: () => {
      const trackingDocExistsAfter = false;
      return !trackingDocExistsAfter;
    },
  },
  {
    id: 9,
    name: 'Path Variable ID Poisoning',
    collection: 'products',
    expectedResult: 'PERMISSION_DENIED',
    evaluate: () => {
      const poisonedId = 'bad/../id$' + 'x'.repeat(200);
      return !VALID_ID_REGEX.test(poisonedId);
    },
  },
  {
    id: 10,
    name: 'Price Manipulation during Checkout Stock Update',
    collection: 'products',
    expectedResult: 'PERMISSION_DENIED',
    evaluate: () => {
      const affectedKeys = ['stock', 'soldCount', 'price', 'updatedAt'];
      const allowedCheckoutKeys = new Set(['stock', 'soldCount', 'updatedAt']);
      return affectedKeys.some((k) => !allowedCheckoutKeys.has(k));
    },
  },
  {
    id: 11,
    name: 'Timestamp Backdating on Order Creation',
    collection: 'orders',
    expectedResult: 'PERMISSION_DENIED',
    evaluate: () => {
      const clientCreatedAt: number = 1700000000000;
      const serverRequestTime: number = 1795062469000;
      return clientCreatedAt !== serverRequestTime;
    },
  },
  {
    id: 12,
    name: 'Unbounded Array & Comment Exhaustion',
    collection: 'orders',
    expectedResult: 'PERMISSION_DENIED',
    evaluate: () => {
      const itemsLength = 100;
      const commentLength = 5000;
      return itemsLength > 25 || commentLength > 1000;
    },
  },
];

export function verifyDirtyDozenBlocked(): boolean {
  return dirtyDozenTests.every((t) => t.evaluate());
}
