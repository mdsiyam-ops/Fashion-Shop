export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type DeliverySpeed = 'express' | 'standard';

export type PaymentMethod = 'bkash' | 'nagad' | 'card' | 'cod';

export type PaymentStatus = 'paid' | 'pending_cod' | 'refunded';

export type NotificationType = 'order_placed' | 'order_status' | 'stock_alert' | 'promo';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  sku: string;
  imageUrl: string;
  imageUrls?: string[];
  featured: boolean;
  expressEligible: boolean;
  ratingAvg: number;
  reviewCount: number;
  soldCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  authorName: string;
  rating: number;
  comment: string;
  verifiedPurchase: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPublic {
  uid: string;
  displayName: string;
  role: 'customer' | 'admin';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivateProfile {
  userId: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  preferredDelivery: DeliverySpeed;
  updatedAt?: unknown;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
}

export interface Order {
  id: string;
  trackingCode: string;
  userId: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  city: string;
  postalCode: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  deliverySpeed: DeliverySpeed;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentReference: string;
  status: OrderStatus;
  courierNote: string;
  source: 'web' | 'fb_shop_now';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OrderTracking {
  trackingCode: string;
  orderId: string;
  userId: string;
  status: OrderStatus;
  deliverySpeed: DeliverySpeed;
  city: string;
  itemCount: number;
  courierNote: string;
  estimatedWindow: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  title: string;
  message: string;
  type: NotificationType;
  relatedOrderId: string;
  read: boolean;
  createdAt?: unknown;
}

export interface StoreSettings {
  id: string;
  storeName: string;
  tagline: string;
  facebookUrl: string;
  messengerUrl: string;
  whatsappNumber: string;
  instagramUrl: string;
  freeDeliveryThreshold: number;
  standardDeliveryFee: number;
  expressDeliveryFee: number;
  updatedAt?: unknown;
}

export interface CartItem {
  product: Product;
  quantity: number;
}
