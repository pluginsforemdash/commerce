# emdash-plugin-commerce

Full e-commerce plugin for [EmDash CMS](https://github.com/emdash-cms/emdash). Run an online store from your EmDash site with products, cart, Stripe checkout, orders, customers, and discount codes.

Think WooCommerce, but for EmDash — serverless, sandboxed, and Stripe-native.

## Features

- **Product catalog** — Products with variants, images, categories, SKUs, and inventory tracking
- **Shopping cart** — Session-based cart with add, update, remove, and discount codes
- **Stripe Checkout** — Redirect customers to Stripe's hosted checkout page for payment
- **Order management** — Full lifecycle: pending, paid, processing, shipped, delivered, cancelled, refunded
- **Inventory tracking** — Automatically decremented on payment, per-product and per-variant
- **Customer records** — Auto-created from orders, tracks lifetime spend and order count
- **Discount codes** — Percentage or fixed-amount, with max usage limits and expiration dates
- **Tax & shipping** — Configurable tax rate, flat shipping, free shipping threshold
- **Email notifications** — Order confirmation emails to store owner
- **Admin dashboard** — Revenue stats, recent orders, product management, customer list, discount management
- **7 storage collections** — Products, categories, orders, order items, customers, carts, discounts

## Installation

```bash
npm install emdash-plugin-commerce
```

## Setup

```typescript
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { commercePlugin } from "emdash-plugin-commerce";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [commercePlugin()],
    }),
  ],
});
```

### Configure Stripe

1. Go to `/_emdash/admin` > Commerce > Settings
2. Add your **Stripe Secret Key** (`sk_live_...` or `sk_test_...`)
3. Set your **Site URL** (used for checkout redirects)
4. In your [Stripe Dashboard](https://dashboard.stripe.com/webhooks), create a webhook:
   - **Endpoint URL:** `https://yoursite.com/_emdash/api/plugins/commerce/storefront/webhook/stripe`
   - **Events:** `checkout.session.completed`
5. Copy the webhook signing secret (`whsec_...`) into Settings

### Configure Store

| Setting | Description | Default |
|---------|-------------|---------|
| Currency | ISO currency code | `usd` |
| Tax Rate | Percentage applied to subtotal | `0` |
| Flat Shipping | Fixed shipping cost in cents | `0` |
| Free Shipping Threshold | Free shipping above this amount (cents), 0 = disabled | `0` |
| Notification Email | Receive order alerts | (empty) |

## Storefront API

All storefront routes are public (no auth required) and available at `/_emdash/api/plugins/commerce/<route>`.

### Products

**List products:**

```
GET /storefront/products?limit=20&category=shirts
```

```json
{
  "items": [
    {
      "id": "prod_123",
      "name": "Classic T-Shirt",
      "slug": "classic-tee",
      "description": "Soft cotton tee",
      "price": 2999,
      "compareAtPrice": 3999,
      "images": ["https://..."],
      "variants": [
        { "id": "var_1", "name": "Small / Black", "price": 2999, "inventory": 50, "options": { "size": "S", "color": "Black" } }
      ],
      "categoryId": "cat_shirts",
      "inventory": 200
    }
  ],
  "cursor": "...",
  "hasMore": true
}
```

**Get single product:**

```
GET /storefront/product?slug=classic-tee
```

**List categories:**

```
GET /storefront/categories
```

### Cart

Cart is session-based. Generate a session ID client-side (e.g. UUID stored in localStorage).

**Get cart:**

```
GET /storefront/cart?sessionId=abc123
```

**Add to cart:**

```
POST /storefront/cart/add
{ "sessionId": "abc123", "productId": "prod_123", "variantId": "var_1", "quantity": 2 }
```

Validates inventory before adding. Returns error if out of stock.

**Update quantity:**

```
POST /storefront/cart/update
{ "sessionId": "abc123", "productId": "prod_123", "variantId": "var_1", "quantity": 0 }
```

Set `quantity: 0` to remove an item.

**Apply discount code:**

```
POST /storefront/cart/discount
{ "sessionId": "abc123", "code": "SUMMER20" }
```

### Checkout

```
POST /storefront/checkout
{
  "sessionId": "abc123",
  "customerEmail": "jane@example.com",
  "customerName": "Jane Smith",
  "shippingAddress": {
    "name": "Jane Smith",
    "line1": "123 Main St",
    "city": "Portland",
    "state": "OR",
    "postalCode": "97201",
    "country": "US"
  }
}
```

**Response:**

```json
{
  "success": true,
  "orderId": "1711929600000-a1b2c3d4",
  "orderNumber": "ORD-20260402-X7K9",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/...",
  "total": 6598,
  "currency": "usd"
}
```

Redirect the customer to `checkoutUrl`. On successful payment, Stripe fires a webhook and the plugin automatically:

1. Marks the order as **paid**
2. Decrements product/variant inventory
3. Creates or updates the customer record
4. Increments discount usage (if applicable)
5. Sends order notification email (if configured)

### Order Lookup

Customers can look up their orders:

```
GET /storefront/order?orderNumber=ORD-20260402-X7K9&email=jane@example.com
```

## Checkout Flow

```
Customer browses products (/storefront/products)
    |
    v
Adds items to cart (/storefront/cart/add)
    |
    v
Optionally applies discount (/storefront/cart/discount)
    |
    v
Submits checkout (/storefront/checkout)
    |
    v
Plugin creates pending order + Stripe Checkout Session
    |
    v
Customer redirected to Stripe's hosted checkout page
    |
    v
Customer pays on Stripe
    |
    v
Stripe sends webhook to /storefront/webhook/stripe
    |
    v
Plugin marks order paid, decrements inventory,
creates customer record, sends notification email
    |
    v
Customer redirected to success page
```

## Admin API

All admin routes require authentication.

### Products

| Route | Description |
|-------|-------------|
| `products/list` | List products (filterable by `status`) |
| `products/create` | Create a product |
| `products/update` | Update product fields |
| `products/delete` | Delete a product |

### Categories

| Route | Description |
|-------|-------------|
| `categories/list` | List all categories |
| `categories/create` | Create a category |
| `categories/delete` | Delete a category |

### Orders

| Route | Description |
|-------|-------------|
| `orders/list` | List orders (filterable by `status`) |
| `orders/get` | Get order details |
| `orders/update` | Update order status or notes |

### Customers

| Route | Description |
|-------|-------------|
| `customers/list` | List all customers |

### Discounts

| Route | Description |
|-------|-------------|
| `discounts/list` | List discount codes |
| `discounts/create` | Create a discount code |
| `discounts/delete` | Delete a discount code |

### Stats

| Route | Description |
|-------|-------------|
| `stats` | Revenue, order counts, product counts, customer count |

All routes are at `/_emdash/api/plugins/commerce/<route>`.

## Admin Panel

The plugin adds 6 pages to the EmDash admin:

| Page | What it does |
|------|-------------|
| **Dashboard** | Revenue stats, order count, product count, customer count, alerts for orders needing processing, recent orders table |
| **Products** | Product table with inline "Add Product" form (name, slug, price, inventory, status) |
| **Orders** | Order table with quick "Ship" and "Processing" buttons for paid orders |
| **Customers** | Auto-generated customer list with name, email, order count, lifetime spend |
| **Discounts** | Discount code table with inline creation form (code, type, value, max uses) |
| **Settings** | Stripe keys, site URL, currency, tax, shipping, notification email, webhook setup instructions |

Plus 2 dashboard widgets:
- **Revenue** — Total revenue, order count, average order value
- **Recent Orders** — Last 5 orders with status badges

## Data Model

### Products

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Product name |
| `slug` | string | URL slug (unique) |
| `description` | string | Product description |
| `price` | number | Price in cents |
| `compareAtPrice` | number? | Original price for "was $X" display |
| `status` | enum | `active`, `draft`, `archived` |
| `categoryId` | string? | Associated category |
| `images` | string[] | Image URLs |
| `variants` | Variant[] | Size/color/etc combinations |
| `sku` | string? | Stock keeping unit |
| `inventory` | number | Stock count (-1 = unlimited) |
| `weight` | number? | Weight in grams |

### Variants

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Variant identifier |
| `name` | string | Display name (e.g. "Large / Blue") |
| `sku` | string? | Variant-specific SKU |
| `price` | number? | Override product price |
| `inventory` | number | Stock count (-1 = unlimited) |
| `options` | object | Key-value options (e.g. `{ size: "L", color: "Blue" }`) |

### Orders

| Field | Type | Description |
|-------|------|-------------|
| `orderNumber` | string | Human-readable (e.g. `ORD-20260402-X7K9`) |
| `status` | enum | `pending`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded` |
| `customerEmail` | string | Buyer's email |
| `customerName` | string | Buyer's name |
| `shippingAddress` | Address | Ship-to address |
| `items` | OrderItem[] | Line items |
| `subtotal` | number | Pre-discount total (cents) |
| `discount` | number | Discount amount (cents) |
| `shipping` | number | Shipping cost (cents) |
| `tax` | number | Tax amount (cents) |
| `total` | number | Final charge (cents) |
| `currency` | string | ISO currency code |
| `stripePaymentId` | string? | Stripe payment intent ID |
| `discountCode` | string? | Applied discount code |

### Customers

| Field | Type | Description |
|-------|------|-------------|
| `email` | string | Unique email address |
| `name` | string | Customer name |
| `orderCount` | number | Lifetime order count |
| `totalSpent` | number | Lifetime spend (cents) |
| `lastOrderAt` | string? | Last order timestamp |

### Discounts

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | Uppercase code (unique) |
| `type` | enum | `percentage` or `fixed` (cents) |
| `value` | number | Discount value |
| `minOrderAmount` | number? | Minimum subtotal required (cents) |
| `maxUses` | number? | Usage limit |
| `usedCount` | number | Times used |
| `status` | enum | `active`, `expired`, `disabled` |
| `expiresAt` | string? | Expiration timestamp |

## Capabilities

| Capability | Purpose |
|-----------|---------|
| `network:fetch` | Stripe API calls, webhook verification |
| `email:send` | Order notification emails |
| `read:users` | Admin user lookups |

## Automation

- **Cron: Cart cleanup** — Daily job removes abandoned carts older than 7 days
- **Webhook: Inventory** — Stock automatically decremented when Stripe confirms payment
- **Webhook: Customer** — Customer record created/updated on each order
- **Webhook: Discounts** — Usage count incremented on each order

## Requirements

- EmDash CMS v0.1.0+
- Stripe account (free to create at [stripe.com](https://stripe.com))
- Works on Cloudflare Workers (trusted or sandboxed) and Node.js (trusted only)

## License

MIT
