# Security Specification — Shoili Store (`firebase-blueprint.json`)

## 1. Core Data Invariants
1. **Strict PII Isolation (Pillar 6)**: User contact and shipping details (`email`, `phone`, `address`, `city`, `postalCode`) reside strictly in `/users/{userId}/private/{docId}` and `/orders/{orderId}`. Neither path allows public reads or non-owner queries.
2. **Sanitized Tracking Projection (Pillar 7)**: Public order status lookup uses `/orderTracking/{trackingCode}` containing zero PII (only `trackingCode`, `status`, `deliverySpeed`, `city`, `itemCount`, `courierNote`, `estimatedWindow`, timestamps). Created atomically in the same batch as `/orders/{orderId}` via `existsAfter()` / `getAfter()`.
3. **Immutable Ownership & Timestamps**: `userId`, `id`, and `createdAt` cannot be modified after creation. All `createdAt` and `updatedAt` writes are enforced equal to `request.time`.
4. **Role-Based Access Control (RBAC)**: Only `isAdmin()` (verified bootstrapped admin email or `/admins/{uid}` membership) can create/update/delete categories, create/delete products, edit product prices, update order fulfillment statuses, or modify store settings.
5. **Verified Identity & Zero-Trust Queries**: All mutations require `request.auth != null && request.auth.token.email_verified == true`. All `list` rules evaluate `resource.data` directly without `get()`/`exists()`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return `PERMISSION_DENIED`)
1. **Privilege Escalation on User Profile**: Authenticated customer creates `/users/{uid}` with `role: "admin"`.
2. **Unverified Email Spoof**: User with `email: "mdsiyam32112@gmail.com"` and `email_verified: false` attempts to create a product or read all orders.
3. **Cross-Tenant PII Read**: Customer A attempts `get` on `/users/{customerB}/private/profile` or `/orders/{customerBOrderId}`.
4. **Blanket Order List Scraping**: Customer A runs a collection list query on `/orders` without `where('userId', '==', customerA.uid)`.
5. **Shadow / Ghost Field Injection**: User creates `/reviews/{id}` with all required fields plus `isVerified: true` or `adminApproved: true`.
6. **Order Status Shortcutting**: Customer creates `/orders/{id}` with `status: "delivered"` or `paymentStatus: "paid"` when `paymentMethod: "cod"`.
7. **Post-Delivery Order Mutation**: Customer attempts to update an order after `status` reaches `"delivered"` or `"cancelled"`.
8. **Orphaned Order Without Tracking**: Customer attempts to create `/orders/{id}` without atomically creating `/orderTracking/{trackingCode}` in the same batch.
9. **ID Poisoning / Path Exhaustion**: Attacker writes to `/products/invalid$id..with..chars` or a 500-character document ID.
10. **Price Manipulation via Stock Update**: Customer attempts to update `price: 1` alongside `stock` during checkout on `/products/{productId}`.
11. **Timestamp Backdating**: Attacker submits `createdAt` set to a past client timestamp instead of `request.time`.
12. **Unbounded Array / Denial of Wallet**: Attacker submits an `/orders/{id}` payload with `items` containing 100 entries (exceeding `<= 25` bound) or a 5,000-char comment in `/reviews/{id}`.
