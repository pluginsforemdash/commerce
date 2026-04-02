/**
 * Commerce Plugin for EmDash CMS
 *
 * The WooCommerce alternative for EmDash. Run a full online store
 * with products, cart, checkout, orders, customers, and analytics.
 *
 * ## Tiers
 *
 * **Free ($0)** — Full store, your own Stripe keys, unlimited products & orders.
 *
 * **Pro ($29/mo)** — Own Stripe keys, 0% transaction fee, plus all Pro
 * features: customer emails, abandoned cart recovery, analytics, digital
 * downloads, WooCommerce import.
 *
 * **Pro Connect ($19/mo + 1.5%)** — Stripe Connect (managed checkout, no
 * key setup), plus all Pro features.
 *
 * @example
 * ```typescript
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
	/** Default currency code (default: "usd") */
	currency?: string;
}

export function commercePlugin(
	options: CommercePluginOptions = {},
): PluginDescriptor<CommercePluginOptions> {
	return {
		id: "commerce",
		version: "0.3.0",
		format: "standard",
		entrypoint: "emdash-plugin-commerce/sandbox",
		options,
		capabilities: ["network:fetch", "email:send", "read:users", "read:content"],
		allowedHosts: [
			"api.stripe.com",
			"api.pluginsforemdash.com",
			"connect.stripe.com",
		],
		storage: {
			products: {
				indexes: [
					"slug", "status", "categoryId", "createdAt", "price",
					"type", // physical, digital
					["categoryId", "createdAt"],
					["status", "createdAt"],
				],
			},
			categories: {
				indexes: ["slug", "parentId", "sortOrder"],
			},
			orders: {
				indexes: [
					"status", "customerEmail", "createdAt", "stripePaymentId",
					["status", "createdAt"],
					["customerEmail", "createdAt"],
				],
			},
			customers: {
				indexes: ["email", "createdAt", "totalSpent"],
				uniqueIndexes: ["email"],
			},
			carts: {
				indexes: ["sessionId", "updatedAt", "customerEmail"],
			},
			discounts: {
				indexes: ["code", "status", "expiresAt"],
				uniqueIndexes: ["code"],
			},
			downloads: {
				indexes: ["orderId", "productId", "token", "expiresAt"],
			},
			analytics: {
				indexes: ["date", "type"],
			},
		},
		adminPages: [
			{ path: "/", label: "Dashboard", icon: "chart" },
			{ path: "/products", label: "Products", icon: "list" },
			{ path: "/orders", label: "Orders", icon: "inbox" },
			{ path: "/customers", label: "Customers", icon: "users" },
			{ path: "/discounts", label: "Discounts", icon: "tag" },
			{ path: "/analytics", label: "Analytics", icon: "chart" },
			{ path: "/settings", label: "Settings", icon: "gear" },
		],
		adminWidgets: [],
	};
}
