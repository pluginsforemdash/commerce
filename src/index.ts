/**
 * Commerce Plugin for EmDash CMS
 *
 * Run a full online store from your EmDash site.
 *
 * Features:
 * - Product catalog with variants, images, and categories
 * - Shopping cart with session management
 * - Stripe-powered checkout (own keys or managed via Pro)
 * - Order management with status tracking
 * - Inventory tracking with low-stock alerts
 * - Customer records from orders
 * - Discount codes (percentage or fixed amount)
 * - Tax and shipping configuration
 * - Order notification emails
 * - Dashboard with revenue stats
 *
 * Standard format — works in both trusted and sandboxed modes.
 *
 * ## Pricing Tiers
 *
 * - **Free**: Bring your own Stripe API keys. 0% transaction fee.
 * - **Pro ($10/mo)**: Managed Stripe via pluginsforemdash.com. Includes
 *   order notification emails. No transaction fee.
 *
 * @example
 * ```typescript
 * // astro.config.mjs
 * import { commercePlugin } from "emdash-plugin-commerce";
 *
 * export default defineConfig({
 *   integrations: [
 *     emdash({
 *       plugins: [commercePlugin()],
 *     }),
 *   ],
 * });
 * ```
 */

import type { PluginDescriptor } from "emdash";

export interface CommercePluginOptions {
	/** Currency code (default: "usd") */
	currency?: string;
}

export function commercePlugin(
	options: CommercePluginOptions = {},
): PluginDescriptor<CommercePluginOptions> {
	return {
		id: "commerce",
		version: "0.1.0",
		format: "standard",
		entrypoint: "emdash-plugin-commerce/sandbox",
		options,
		capabilities: ["network:fetch", "email:send", "read:users"],
		allowedHosts: ["api.stripe.com", "api.pluginsforemdash.com"],
		storage: {
			products: {
				indexes: ["slug", "status", "categoryId", "createdAt", "price"],
			},
			categories: {
				indexes: ["slug", "parentId", "sortOrder"],
			},
			orders: {
				indexes: ["status", "customerEmail", "createdAt", "stripePaymentId"],
			},
			orderItems: {
				indexes: ["orderId", "productId"],
			},
			customers: {
				indexes: ["email", "createdAt"],
				uniqueIndexes: ["email"],
			},
			carts: {
				indexes: ["sessionId", "updatedAt"],
			},
			discounts: {
				indexes: ["code", "status", "expiresAt"],
				uniqueIndexes: ["code"],
			},
		},
		adminPages: [
			{ path: "/", label: "Dashboard", icon: "chart" },
			{ path: "/products", label: "Products", icon: "list" },
			{ path: "/orders", label: "Orders", icon: "inbox" },
			{ path: "/customers", label: "Customers", icon: "users" },
			{ path: "/discounts", label: "Discounts", icon: "tag" },
			{ path: "/settings", label: "Settings", icon: "gear" },
		],
		adminWidgets: [
			{ id: "revenue-overview", title: "Revenue", size: "half" },
			{ id: "recent-orders", title: "Recent Orders", size: "half" },
		],
	};
}
