/**
 * Sandbox Entry Point — Commerce Plugin
 *
 * Full e-commerce engine: products, cart, checkout, orders, customers.
 * Stripe for payments. Works in trusted and sandboxed modes.
 */

import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import { z } from "astro/zod";

// ── Types ──

interface Product {
	name: string;
	slug: string;
	description: string;
	price: number; // cents
	compareAtPrice?: number; // cents, for showing "was $X"
	status: "active" | "draft" | "archived";
	categoryId?: string;
	images: string[]; // media URLs
	variants: Variant[];
	sku?: string;
	inventory: number; // -1 = unlimited
	weight?: number; // grams
	metadata?: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

interface Variant {
	id: string;
	name: string; // e.g. "Large / Blue"
	sku?: string;
	price?: number; // override product price
	inventory: number; // -1 = unlimited
	options: Record<string, string>; // e.g. { size: "L", color: "Blue" }
}

interface Category {
	name: string;
	slug: string;
	description?: string;
	parentId?: string;
	image?: string;
	sortOrder: number;
	createdAt: string;
}

interface CartItem {
	productId: string;
	variantId?: string;
	name: string;
	price: number; // cents, resolved at add-time
	quantity: number;
	image?: string;
}

interface Cart {
	sessionId: string;
	items: CartItem[];
	discountCode?: string;
	discountAmount?: number; // cents
	updatedAt: string;
}

interface Order {
	orderNumber: string;
	status: "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
	customerEmail: string;
	customerName: string;
	shippingAddress: Address;
	billingAddress?: Address;
	items: OrderItem[];
	subtotal: number; // cents
	discount: number; // cents
	shipping: number; // cents
	tax: number; // cents
	total: number; // cents
	currency: string;
	stripePaymentId?: string;
	stripeSessionId?: string;
	discountCode?: string;
	notes?: string;
	createdAt: string;
	updatedAt: string;
}

interface OrderItem {
	productId: string;
	variantId?: string;
	name: string;
	sku?: string;
	price: number;
	quantity: number;
}

interface Address {
	name: string;
	line1: string;
	line2?: string;
	city: string;
	state: string;
	postalCode: string;
	country: string;
}

interface Customer {
	email: string;
	name: string;
	phone?: string;
	orderCount: number;
	totalSpent: number; // cents
	lastOrderAt?: string;
	createdAt: string;
}

interface Discount {
	code: string;
	type: "percentage" | "fixed"; // fixed = cents
	value: number;
	minOrderAmount?: number; // cents
	maxUses?: number;
	usedCount: number;
	status: "active" | "expired" | "disabled";
	expiresAt?: string;
	createdAt: string;
}

// ── Schemas ──

const productCreateSchema = z.object({
	name: z.string().min(1).max(200),
	slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
	description: z.string().max(10000).default(""),
	price: z.number().int().min(0), // cents
	compareAtPrice: z.number().int().min(0).optional(),
	status: z.enum(["active", "draft", "archived"]).default("draft"),
	categoryId: z.string().optional(),
	images: z.array(z.string()).default([]),
	variants: z.array(z.object({
		id: z.string(),
		name: z.string(),
		sku: z.string().optional(),
		price: z.number().int().min(0).optional(),
		inventory: z.number().int().default(-1),
		options: z.record(z.string()),
	})).default([]),
	sku: z.string().max(100).optional(),
	inventory: z.number().int().default(-1),
	weight: z.number().min(0).optional(),
});

const productUpdateSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(200).optional(),
	slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/).optional(),
	description: z.string().max(10000).optional(),
	price: z.number().int().min(0).optional(),
	compareAtPrice: z.number().int().min(0).optional(),
	status: z.enum(["active", "draft", "archived"]).optional(),
	categoryId: z.string().optional(),
	images: z.array(z.string()).optional(),
	variants: z.array(z.object({
		id: z.string(),
		name: z.string(),
		sku: z.string().optional(),
		price: z.number().int().min(0).optional(),
		inventory: z.number().int().default(-1),
		options: z.record(z.string()),
	})).optional(),
	sku: z.string().max(100).optional(),
	inventory: z.number().int().optional(),
	weight: z.number().min(0).optional(),
});

const categorySchema = z.object({
	name: z.string().min(1).max(100),
	slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
	description: z.string().max(2000).optional(),
	parentId: z.string().optional(),
	image: z.string().optional(),
	sortOrder: z.number().int().default(0),
});

const cartAddSchema = z.object({
	sessionId: z.string().min(1),
	productId: z.string().min(1),
	variantId: z.string().optional(),
	quantity: z.number().int().min(1).max(99).default(1),
});

const cartUpdateSchema = z.object({
	sessionId: z.string().min(1),
	productId: z.string().min(1),
	variantId: z.string().optional(),
	quantity: z.number().int().min(0).max(99), // 0 = remove
});

const cartDiscountSchema = z.object({
	sessionId: z.string().min(1),
	code: z.string().min(1),
});

const checkoutSchema = z.object({
	sessionId: z.string().min(1),
	customerEmail: z.string().email(),
	customerName: z.string().min(1).max(200),
	shippingAddress: z.object({
		name: z.string().min(1),
		line1: z.string().min(1),
		line2: z.string().optional(),
		city: z.string().min(1),
		state: z.string().min(1),
		postalCode: z.string().min(1),
		country: z.string().min(2).max(2),
	}),
	billingAddress: z.object({
		name: z.string().min(1),
		line1: z.string().min(1),
		line2: z.string().optional(),
		city: z.string().min(1),
		state: z.string().min(1),
		postalCode: z.string().min(1),
		country: z.string().min(2).max(2),
	}).optional(),
});

const orderUpdateSchema = z.object({
	id: z.string().min(1),
	status: z.enum(["processing", "shipped", "delivered", "cancelled", "refunded"]).optional(),
	notes: z.string().max(5000).optional(),
});

const discountCreateSchema = z.object({
	code: z.string().min(1).max(50).transform((v) => v.toUpperCase()),
	type: z.enum(["percentage", "fixed"]),
	value: z.number().min(0),
	minOrderAmount: z.number().int().min(0).optional(),
	maxUses: z.number().int().min(1).optional(),
	expiresAt: z.string().optional(),
});

const listSchema = z.object({
	limit: z.coerce.number().min(1).max(100).default(50),
	cursor: z.string().optional(),
	status: z.string().optional(),
});

const idSchema = z.object({ id: z.string().min(1) });

// ── Helpers ──

function genId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
	return new Date().toISOString();
}

function genOrderNumber(): string {
	const d = new Date();
	const prefix = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
	const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
	return `ORD-${prefix}-${rand}`;
}

function formatCents(cents: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(cents / 100);
}

function throw404(msg: string): never {
	throw new Response(JSON.stringify({ error: msg }), {
		status: 404,
		headers: { "Content-Type": "application/json" },
	});
}

function throw400(msg: string): never {
	throw new Response(JSON.stringify({ error: msg }), {
		status: 400,
		headers: { "Content-Type": "application/json" },
	});
}

// ── Stripe Helpers ──

async function stripeRequest(
	ctx: PluginContext,
	endpoint: string,
	params: Record<string, string>,
): Promise<Record<string, unknown>> {
	const secretKey = await ctx.kv.get<string>("settings:stripeSecretKey");
	if (!secretKey || !ctx.http) {
		throw new Error("Stripe is not configured");
	}

	const response = await ctx.http.fetch(`https://api.stripe.com/v1/${endpoint}`, {
		method: "POST",
		headers: {
			"Authorization": `Basic ${btoa(secretKey + ":")}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams(params).toString(),
	});

	const data = (await response.json()) as Record<string, unknown>;
	if (!response.ok) {
		const err = data.error as Record<string, unknown> | undefined;
		throw new Error(`Stripe error: ${err?.message ?? response.statusText}`);
	}
	return data;
}

// ── Email ──

async function sendOrderEmail(ctx: PluginContext, order: Order): Promise<void> {
	const notifyEmail = await ctx.kv.get<string>("settings:orderNotificationEmail");
	if (!notifyEmail || !ctx.email) return;

	const currency = await ctx.kv.get<string>("settings:currency") ?? "usd";

	const itemLines = order.items
		.map((i) => `  ${i.name} x${i.quantity} — ${formatCents(i.price * i.quantity, currency)}`)
		.join("\n");

	await ctx.email.send({
		to: notifyEmail,
		subject: `New order ${order.orderNumber} — ${formatCents(order.total, currency)}`,
		text: [
			`New order received!`,
			"",
			`Order: ${order.orderNumber}`,
			`Customer: ${order.customerName} (${order.customerEmail})`,
			"",
			"Items:",
			itemLines,
			"",
			`Subtotal: ${formatCents(order.subtotal, currency)}`,
			order.discount > 0 ? `Discount: -${formatCents(order.discount, currency)}` : null,
			`Shipping: ${formatCents(order.shipping, currency)}`,
			`Tax: ${formatCents(order.tax, currency)}`,
			`Total: ${formatCents(order.total, currency)}`,
			"",
			`Ship to:`,
			`  ${order.shippingAddress.name}`,
			`  ${order.shippingAddress.line1}`,
			order.shippingAddress.line2 ? `  ${order.shippingAddress.line2}` : null,
			`  ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.postalCode}`,
			`  ${order.shippingAddress.country}`,
		].filter(Boolean).join("\n"),
	});
}

// ── Cart Logic ──

async function getCart(ctx: PluginContext, sessionId: string): Promise<Cart> {
	const existing = (await ctx.storage.carts!.get(sessionId)) as Cart | null;
	if (existing) return existing;
	return {
		sessionId,
		items: [],
		updatedAt: now(),
	};
}

async function saveCart(ctx: PluginContext, cart: Cart): Promise<void> {
	cart.updatedAt = now();
	await ctx.storage.carts!.put(cart.sessionId, cart);
}

async function resolveDiscount(ctx: PluginContext, code: string, subtotal: number): Promise<{ valid: boolean; amount: number; error?: string }> {
	const result = await ctx.storage.discounts!.query({
		where: { code: code.toUpperCase() },
		limit: 1,
	});
	if (result.items.length === 0) return { valid: false, amount: 0, error: "Invalid discount code" };

	const discount = result.items[0]!.data as Discount;
	if (discount.status !== "active") return { valid: false, amount: 0, error: "Discount code is no longer active" };
	if (discount.expiresAt && new Date(discount.expiresAt) < new Date()) return { valid: false, amount: 0, error: "Discount code has expired" };
	if (discount.maxUses && discount.usedCount >= discount.maxUses) return { valid: false, amount: 0, error: "Discount code usage limit reached" };
	if (discount.minOrderAmount && subtotal < discount.minOrderAmount) {
		return { valid: false, amount: 0, error: `Minimum order of ${formatCents(discount.minOrderAmount, "usd")} required` };
	}

	const amount = discount.type === "percentage"
		? Math.round(subtotal * (discount.value / 100))
		: Math.min(discount.value, subtotal);

	return { valid: true, amount };
}

// ── Plugin Definition ──

export default definePlugin({
	hooks: {
		"plugin:install": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				ctx.log.info("Commerce plugin installed");
				await ctx.kv.set("settings:currency", "usd");
				await ctx.kv.set("settings:taxRate", 0);
				await ctx.kv.set("settings:flatShipping", 0);
				await ctx.kv.set("settings:freeShippingThreshold", 0);
				await ctx.kv.set("settings:orderNotificationEmail", "");
				await ctx.kv.set("state:orderCount", 0);
			},
		},

		"plugin:activate": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				if (ctx.cron) {
					await ctx.cron.schedule("cleanup-carts", { schedule: "@daily" });
				}
			},
		},

		cron: {
			handler: async (event: { name: string }, ctx: PluginContext) => {
				if (event.name === "cleanup-carts") {
					// Remove carts older than 7 days
					const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
					const old = await ctx.storage.carts!.query({
						where: { updatedAt: { lte: cutoff } },
						limit: 100,
					});
					if (old.items.length > 0) {
						await ctx.storage.carts!.deleteMany(old.items.map((i: { id: string }) => i.id));
						ctx.log.info(`Cleaned up ${old.items.length} abandoned carts`);
					}
				}
			},
		},
	},

	routes: {
		// ══════════════════════════════════════════
		// PUBLIC STOREFRONT API
		// ══════════════════════════════════════════

		// ── Products (public) ──

		"storefront/products": {
			public: true,
			input: z.object({
				category: z.string().optional(),
				limit: z.coerce.number().min(1).max(50).default(20),
				cursor: z.string().optional(),
			}),
			handler: async (routeCtx: { input: { category?: string; limit: number; cursor?: string } }, ctx: PluginContext) => {
				const { category, limit, cursor } = routeCtx.input;
				const where: Record<string, unknown> = { status: "active" };
				if (category) where.categoryId = category;

				const result = await ctx.storage.products!.query({
					where,
					orderBy: { createdAt: "desc" },
					limit,
					cursor,
				});

				return {
					items: result.items.map((i: { id: string; data: unknown }) => {
						const p = i.data as Product;
						return {
							id: i.id,
							name: p.name,
							slug: p.slug,
							description: p.description,
							price: p.price,
							compareAtPrice: p.compareAtPrice,
							images: p.images,
							variants: p.variants,
							categoryId: p.categoryId,
							inventory: p.inventory,
						};
					}),
					cursor: result.cursor,
					hasMore: result.hasMore,
				};
			},
		},

		"storefront/product": {
			public: true,
			input: z.object({ slug: z.string().min(1) }),
			handler: async (routeCtx: { input: { slug: string } }, ctx: PluginContext) => {
				const result = await ctx.storage.products!.query({
					where: { slug: routeCtx.input.slug, status: "active" },
					limit: 1,
				});
				if (result.items.length === 0) throw404("Product not found");

				const item = result.items[0]!;
				const p = item.data as Product;
				return {
					id: item.id,
					name: p.name,
					slug: p.slug,
					description: p.description,
					price: p.price,
					compareAtPrice: p.compareAtPrice,
					images: p.images,
					variants: p.variants,
					categoryId: p.categoryId,
					inventory: p.inventory,
					weight: p.weight,
					metadata: p.metadata,
				};
			},
		},

		"storefront/categories": {
			public: true,
			handler: async (_routeCtx: unknown, ctx: PluginContext) => {
				const result = await ctx.storage.categories!.query({
					orderBy: { sortOrder: "asc" },
					limit: 100,
				});
				return {
					items: result.items.map((i: { id: string; data: unknown }) => {
						const c = i.data as Category;
						return { id: i.id, name: c.name, slug: c.slug, description: c.description, image: c.image, parentId: c.parentId };
					}),
				};
			},
		},

		// ── Cart (public) ──

		"storefront/cart": {
			public: true,
			input: z.object({ sessionId: z.string().min(1) }),
			handler: async (routeCtx: { input: { sessionId: string } }, ctx: PluginContext) => {
				const cart = await getCart(ctx, routeCtx.input.sessionId);
				const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
				const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
				return {
					items: cart.items,
					itemCount: cart.items.reduce((sum, i) => sum + i.quantity, 0),
					subtotal,
					discountCode: cart.discountCode,
					discountAmount: cart.discountAmount ?? 0,
					currency,
				};
			},
		},

		"storefront/cart/add": {
			public: true,
			input: cartAddSchema,
			handler: async (routeCtx: { input: z.infer<typeof cartAddSchema> }, ctx: PluginContext) => {
				const { sessionId, productId, variantId, quantity } = routeCtx.input;

				const productData = (await ctx.storage.products!.get(productId)) as Product | null;
				if (!productData || productData.status !== "active") throw404("Product not found");

				let resolvedPrice = productData.price;
				let resolvedName = productData.name;

				if (variantId) {
					const variant = productData.variants.find((v) => v.id === variantId);
					if (!variant) throw404("Variant not found");
					if (variant.price !== undefined) resolvedPrice = variant.price;
					resolvedName = `${productData.name} — ${variant.name}`;

					if (variant.inventory !== -1 && variant.inventory < quantity) {
						throw400(`Only ${variant.inventory} left in stock`);
					}
				} else if (productData.inventory !== -1 && productData.inventory < quantity) {
					throw400(`Only ${productData.inventory} left in stock`);
				}

				const cart = await getCart(ctx, sessionId);
				const existing = cart.items.find(
					(i) => i.productId === productId && i.variantId === variantId,
				);

				if (existing) {
					existing.quantity += quantity;
				} else {
					cart.items.push({
						productId,
						variantId,
						name: resolvedName,
						price: resolvedPrice,
						quantity,
						image: productData.images[0],
					});
				}

				await saveCart(ctx, cart);
				return { success: true, itemCount: cart.items.reduce((s, i) => s + i.quantity, 0) };
			},
		},

		"storefront/cart/update": {
			public: true,
			input: cartUpdateSchema,
			handler: async (routeCtx: { input: z.infer<typeof cartUpdateSchema> }, ctx: PluginContext) => {
				const { sessionId, productId, variantId, quantity } = routeCtx.input;
				const cart = await getCart(ctx, sessionId);

				if (quantity === 0) {
					cart.items = cart.items.filter(
						(i) => !(i.productId === productId && i.variantId === variantId),
					);
				} else {
					const item = cart.items.find(
						(i) => i.productId === productId && i.variantId === variantId,
					);
					if (item) item.quantity = quantity;
				}

				await saveCart(ctx, cart);
				return { success: true, itemCount: cart.items.reduce((s, i) => s + i.quantity, 0) };
			},
		},

		"storefront/cart/discount": {
			public: true,
			input: cartDiscountSchema,
			handler: async (routeCtx: { input: z.infer<typeof cartDiscountSchema> }, ctx: PluginContext) => {
				const { sessionId, code } = routeCtx.input;
				const cart = await getCart(ctx, sessionId);
				const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

				const result = await resolveDiscount(ctx, code, subtotal);
				if (!result.valid) return { success: false, error: result.error };

				cart.discountCode = code.toUpperCase();
				cart.discountAmount = result.amount;
				await saveCart(ctx, cart);

				return { success: true, discountAmount: result.amount };
			},
		},

		// ── Checkout (public) ──

		"storefront/checkout": {
			public: true,
			input: checkoutSchema,
			handler: async (routeCtx: { input: z.infer<typeof checkoutSchema> }, ctx: PluginContext) => {
				const { sessionId, customerEmail, customerName, shippingAddress, billingAddress } = routeCtx.input;

				const cart = await getCart(ctx, sessionId);
				if (cart.items.length === 0) throw400("Cart is empty");

				const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
				const taxRate = (await ctx.kv.get<number>("settings:taxRate")) ?? 0;
				const flatShipping = (await ctx.kv.get<number>("settings:flatShipping")) ?? 0;
				const freeThreshold = (await ctx.kv.get<number>("settings:freeShippingThreshold")) ?? 0;

				const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
				const discount = cart.discountAmount ?? 0;
				const afterDiscount = Math.max(0, subtotal - discount);
				const shipping = freeThreshold > 0 && subtotal >= freeThreshold ? 0 : flatShipping;
				const tax = Math.round(afterDiscount * (taxRate / 100));
				const total = afterDiscount + shipping + tax;

				// Verify inventory
				for (const item of cart.items) {
					const product = (await ctx.storage.products!.get(item.productId)) as Product | null;
					if (!product || product.status !== "active") throw400(`${item.name} is no longer available`);

					if (item.variantId) {
						const variant = product.variants.find((v) => v.id === item.variantId);
						if (variant && variant.inventory !== -1 && variant.inventory < item.quantity) {
							throw400(`Not enough stock for ${item.name}`);
						}
					} else if (product.inventory !== -1 && product.inventory < item.quantity) {
						throw400(`Not enough stock for ${item.name}`);
					}
				}

				// Create Stripe Checkout Session
				const siteUrl = await ctx.kv.get<string>("settings:siteUrl") ?? "";
				const stripeParams: Record<string, string> = {
					"mode": "payment",
					"customer_email": customerEmail,
					"success_url": `${siteUrl}/order/success?session_id={CHECKOUT_SESSION_ID}`,
					"cancel_url": `${siteUrl}/cart`,
					"currency": currency,
				};

				cart.items.forEach((item, i) => {
					stripeParams[`line_items[${i}][price_data][currency]`] = currency;
					stripeParams[`line_items[${i}][price_data][unit_amount]`] = String(item.price);
					stripeParams[`line_items[${i}][price_data][product_data][name]`] = item.name;
					stripeParams[`line_items[${i}][quantity]`] = String(item.quantity);
				});

				if (shipping > 0) {
					const idx = cart.items.length;
					stripeParams[`line_items[${idx}][price_data][currency]`] = currency;
					stripeParams[`line_items[${idx}][price_data][unit_amount]`] = String(shipping);
					stripeParams[`line_items[${idx}][price_data][product_data][name]`] = "Shipping";
					stripeParams[`line_items[${idx}][quantity]`] = "1";
				}

				if (tax > 0) {
					const idx = cart.items.length + (shipping > 0 ? 1 : 0);
					stripeParams[`line_items[${idx}][price_data][currency]`] = currency;
					stripeParams[`line_items[${idx}][price_data][unit_amount]`] = String(tax);
					stripeParams[`line_items[${idx}][price_data][product_data][name]`] = "Tax";
					stripeParams[`line_items[${idx}][quantity]`] = "1";
				}

				const stripeSession = await stripeRequest(ctx, "checkout/sessions", stripeParams);
				const stripeSessionId = stripeSession.id as string;
				const checkoutUrl = stripeSession.url as string;

				// Create order (pending until webhook confirms)
				const orderId = genId();
				const orderNumber = genOrderNumber();

				const order: Order = {
					orderNumber,
					status: "pending",
					customerEmail,
					customerName,
					shippingAddress,
					billingAddress,
					items: cart.items.map((i) => ({
						productId: i.productId,
						variantId: i.variantId,
						name: i.name,
						price: i.price,
						quantity: i.quantity,
					})),
					subtotal,
					discount,
					shipping,
					tax,
					total,
					currency,
					stripeSessionId,
					discountCode: cart.discountCode,
					createdAt: now(),
					updatedAt: now(),
				};

				await ctx.storage.orders!.put(orderId, order);

				return {
					success: true,
					orderId,
					orderNumber,
					checkoutUrl,
					total,
					currency,
				};
			},
		},

		// ── Stripe Webhook (public) ──

		"storefront/webhook/stripe": {
			public: true,
			handler: async (routeCtx: { input: unknown; request: Request }, ctx: PluginContext) => {
				// Parse the webhook payload
				const payload = routeCtx.input as Record<string, unknown>;
				const type = payload.type as string;

				if (type === "checkout.session.completed") {
					const session = (payload.data as Record<string, unknown>).object as Record<string, unknown>;
					const stripeSessionId = session.id as string;
					const paymentIntent = session.payment_intent as string;

					// Find the order
					const result = await ctx.storage.orders!.query({
						where: { stripePaymentId: stripeSessionId },
						limit: 1,
					});

					// Try by session ID stored
					let orderId: string | undefined;
					let order: Order | undefined;

					// Search all pending orders for matching session
					const pending = await ctx.storage.orders!.query({
						where: { status: "pending" },
						limit: 100,
					});

					for (const item of pending.items) {
						const o = item.data as Order;
						if (o.stripeSessionId === stripeSessionId) {
							orderId = item.id;
							order = o;
							break;
						}
					}

					if (orderId && order) {
						// Mark paid
						order.status = "paid";
						order.stripePaymentId = paymentIntent;
						order.updatedAt = now();
						await ctx.storage.orders!.put(orderId, order);

						// Decrement inventory
						for (const item of order.items) {
							const product = (await ctx.storage.products!.get(item.productId)) as Product | null;
							if (!product) continue;

							if (item.variantId) {
								const variant = product.variants.find((v) => v.id === item.variantId);
								if (variant && variant.inventory !== -1) {
									variant.inventory = Math.max(0, variant.inventory - item.quantity);
								}
							} else if (product.inventory !== -1) {
								product.inventory = Math.max(0, product.inventory - item.quantity);
							}

							product.updatedAt = now();
							await ctx.storage.products!.put(item.productId, product);
						}

						// Update discount usage
						if (order.discountCode) {
							const discountResult = await ctx.storage.discounts!.query({
								where: { code: order.discountCode },
								limit: 1,
							});
							if (discountResult.items.length > 0) {
								const d = discountResult.items[0]!;
								const disc = d.data as Discount;
								disc.usedCount += 1;
								await ctx.storage.discounts!.put(d.id, disc);
							}
						}

						// Upsert customer
						const custResult = await ctx.storage.customers!.query({
							where: { email: order.customerEmail },
							limit: 1,
						});

						if (custResult.items.length > 0) {
							const c = custResult.items[0]!;
							const cust = c.data as Customer;
							cust.orderCount += 1;
							cust.totalSpent += order.total;
							cust.lastOrderAt = now();
							await ctx.storage.customers!.put(c.id, cust);
						} else {
							await ctx.storage.customers!.put(genId(), {
								email: order.customerEmail,
								name: order.customerName,
								orderCount: 1,
								totalSpent: order.total,
								lastOrderAt: now(),
								createdAt: now(),
							});
						}

						// Update order count
						const count = (await ctx.kv.get<number>("state:orderCount")) ?? 0;
						await ctx.kv.set("state:orderCount", count + 1);

						// Clear cart
						const carts = await ctx.storage.carts!.query({ limit: 100 });
						// Can't easily find by session, but the cart will auto-expire

						// Send notification email
						sendOrderEmail(ctx, order).catch((err) =>
							ctx.log.warn("Order email failed", err),
						);

						ctx.log.info(`Order ${order.orderNumber} paid — ${formatCents(order.total, order.currency)}`);
					}
				}

				return { received: true };
			},
		},

		// ── Order Lookup (public) ──

		"storefront/order": {
			public: true,
			input: z.object({ orderNumber: z.string().min(1), email: z.string().email() }),
			handler: async (routeCtx: { input: { orderNumber: string; email: string } }, ctx: PluginContext) => {
				const result = await ctx.storage.orders!.query({
					where: { customerEmail: routeCtx.input.email },
					limit: 100,
				});

				const match = result.items.find((i: { data: unknown }) => {
					const o = i.data as Order;
					return o.orderNumber === routeCtx.input.orderNumber;
				});

				if (!match) throw404("Order not found");
				const order = match.data as Order;

				return {
					orderNumber: order.orderNumber,
					status: order.status,
					items: order.items,
					subtotal: order.subtotal,
					discount: order.discount,
					shipping: order.shipping,
					tax: order.tax,
					total: order.total,
					currency: order.currency,
					createdAt: order.createdAt,
				};
			},
		},

		// ══════════════════════════════════════════
		// ADMIN API
		// ══════════════════════════════════════════

		// ── Products ──

		"products/list": {
			input: listSchema,
			handler: async (routeCtx: { input: z.infer<typeof listSchema> }, ctx: PluginContext) => {
				const { limit, cursor, status } = routeCtx.input;
				const where = status ? { status } : undefined;
				const result = await ctx.storage.products!.query({ where, orderBy: { createdAt: "desc" }, limit, cursor });
				return {
					items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as Product) })),
					cursor: result.cursor,
					hasMore: result.hasMore,
				};
			},
		},

		"products/create": {
			input: productCreateSchema,
			handler: async (routeCtx: { input: z.infer<typeof productCreateSchema> }, ctx: PluginContext) => {
				// Check slug uniqueness
				const existing = await ctx.storage.products!.query({ where: { slug: routeCtx.input.slug }, limit: 1 });
				if (existing.items.length > 0) throw400("A product with this slug already exists");

				const id = genId();
				const product: Product = {
					...routeCtx.input,
					createdAt: now(),
					updatedAt: now(),
				};
				await ctx.storage.products!.put(id, product);
				return { success: true, id, product: { id, ...product } };
			},
		},

		"products/update": {
			input: productUpdateSchema,
			handler: async (routeCtx: { input: z.infer<typeof productUpdateSchema> }, ctx: PluginContext) => {
				const { id, ...updates } = routeCtx.input;
				const existing = (await ctx.storage.products!.get(id)) as Product | null;
				if (!existing) throw404("Product not found");

				const updated = { ...existing, ...updates, updatedAt: now() };
				await ctx.storage.products!.put(id, updated);
				return { success: true, product: { id, ...updated } };
			},
		},

		"products/delete": {
			input: idSchema,
			handler: async (routeCtx: { input: { id: string } }, ctx: PluginContext) => {
				await ctx.storage.products!.delete(routeCtx.input.id);
				return { success: true };
			},
		},

		// ── Categories ──

		"categories/list": {
			handler: async (_routeCtx: unknown, ctx: PluginContext) => {
				const result = await ctx.storage.categories!.query({ orderBy: { sortOrder: "asc" }, limit: 100 });
				return { items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as Category) })) };
			},
		},

		"categories/create": {
			input: categorySchema,
			handler: async (routeCtx: { input: z.infer<typeof categorySchema> }, ctx: PluginContext) => {
				const id = genId();
				await ctx.storage.categories!.put(id, { ...routeCtx.input, createdAt: now() });
				return { success: true, id };
			},
		},

		"categories/delete": {
			input: idSchema,
			handler: async (routeCtx: { input: { id: string } }, ctx: PluginContext) => {
				await ctx.storage.categories!.delete(routeCtx.input.id);
				return { success: true };
			},
		},

		// ── Orders ──

		"orders/list": {
			input: listSchema,
			handler: async (routeCtx: { input: z.infer<typeof listSchema> }, ctx: PluginContext) => {
				const { limit, cursor, status } = routeCtx.input;
				const where = status ? { status } : undefined;
				const result = await ctx.storage.orders!.query({ where, orderBy: { createdAt: "desc" }, limit, cursor });
				return {
					items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as Order) })),
					cursor: result.cursor,
					hasMore: result.hasMore,
				};
			},
		},

		"orders/get": {
			input: idSchema,
			handler: async (routeCtx: { input: { id: string } }, ctx: PluginContext) => {
				const order = (await ctx.storage.orders!.get(routeCtx.input.id)) as Order | null;
				if (!order) throw404("Order not found");
				return { id: routeCtx.input.id, ...order };
			},
		},

		"orders/update": {
			input: orderUpdateSchema,
			handler: async (routeCtx: { input: z.infer<typeof orderUpdateSchema> }, ctx: PluginContext) => {
				const { id, ...updates } = routeCtx.input;
				const existing = (await ctx.storage.orders!.get(id)) as Order | null;
				if (!existing) throw404("Order not found");

				const updated = { ...existing, ...updates, updatedAt: now() };
				await ctx.storage.orders!.put(id, updated);
				return { success: true, order: { id, ...updated } };
			},
		},

		// ── Customers ──

		"customers/list": {
			input: listSchema,
			handler: async (routeCtx: { input: z.infer<typeof listSchema> }, ctx: PluginContext) => {
				const result = await ctx.storage.customers!.query({ orderBy: { createdAt: "desc" }, limit: routeCtx.input.limit, cursor: routeCtx.input.cursor });
				return {
					items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as Customer) })),
					cursor: result.cursor,
					hasMore: result.hasMore,
				};
			},
		},

		// ── Discounts ──

		"discounts/list": {
			input: listSchema,
			handler: async (routeCtx: { input: z.infer<typeof listSchema> }, ctx: PluginContext) => {
				const { limit, cursor, status } = routeCtx.input;
				const where = status ? { status } : undefined;
				const result = await ctx.storage.discounts!.query({ where, orderBy: { expiresAt: "desc" }, limit, cursor });
				return {
					items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as Discount) })),
					cursor: result.cursor,
					hasMore: result.hasMore,
				};
			},
		},

		"discounts/create": {
			input: discountCreateSchema,
			handler: async (routeCtx: { input: z.infer<typeof discountCreateSchema> }, ctx: PluginContext) => {
				const existing = await ctx.storage.discounts!.query({ where: { code: routeCtx.input.code }, limit: 1 });
				if (existing.items.length > 0) throw400("A discount with this code already exists");

				const id = genId();
				const discount: Discount = {
					...routeCtx.input,
					usedCount: 0,
					status: "active",
					createdAt: now(),
				};
				await ctx.storage.discounts!.put(id, discount);
				return { success: true, id };
			},
		},

		"discounts/delete": {
			input: idSchema,
			handler: async (routeCtx: { input: { id: string } }, ctx: PluginContext) => {
				await ctx.storage.discounts!.delete(routeCtx.input.id);
				return { success: true };
			},
		},

		// ── Stats ──

		stats: {
			handler: async (_routeCtx: unknown, ctx: PluginContext) => {
				const [totalOrders, paidOrders, processingOrders, shippedOrders, totalProducts, activeProducts, totalCustomers] = await Promise.all([
					ctx.storage.orders!.count(),
					ctx.storage.orders!.count({ status: "paid" }),
					ctx.storage.orders!.count({ status: "processing" }),
					ctx.storage.orders!.count({ status: "shipped" }),
					ctx.storage.products!.count(),
					ctx.storage.products!.count({ status: "active" }),
					ctx.storage.customers!.count(),
				]);

				// Calculate revenue from paid+ orders
				const paidResult = await ctx.storage.orders!.query({
					where: { status: { in: ["paid", "processing", "shipped", "delivered"] } },
					limit: 100,
				});
				const revenue = paidResult.items.reduce((sum: number, i: { data: unknown }) => sum + (i.data as Order).total, 0);

				const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";

				return {
					revenue,
					revenueFormatted: formatCents(revenue, currency),
					currency,
					orders: { total: totalOrders, paid: paidOrders, processing: processingOrders, shipped: shippedOrders },
					products: { total: totalProducts, active: activeProducts },
					customers: totalCustomers,
				};
			},
		},

		// ══════════════════════════════════════════
		// BLOCK KIT ADMIN UI
		// ══════════════════════════════════════════

		admin: {
			handler: async (routeCtx: { input: unknown }, ctx: PluginContext) => {
				const interaction = routeCtx.input as {
					type: string;
					page?: string;
					action_id?: string;
					values?: Record<string, unknown>;
				};

				// Widgets
				if (interaction.type === "page_load" && interaction.page === "widget:revenue-overview") {
					return buildRevenueWidget(ctx);
				}
				if (interaction.type === "page_load" && interaction.page === "widget:recent-orders") {
					return buildRecentOrdersWidget(ctx);
				}

				// Pages
				if (interaction.type === "page_load" && interaction.page === "/") return buildDashboard(ctx);
				if (interaction.type === "page_load" && interaction.page === "/products") return buildProductsPage(ctx);
				if (interaction.type === "page_load" && interaction.page === "/orders") return buildOrdersPage(ctx);
				if (interaction.type === "page_load" && interaction.page === "/customers") return buildCustomersPage(ctx);
				if (interaction.type === "page_load" && interaction.page === "/discounts") return buildDiscountsPage(ctx);
				if (interaction.type === "page_load" && interaction.page === "/settings") return buildSettingsPage(ctx);

				// Actions
				if (interaction.type === "form_submit" && interaction.action_id === "save_settings") {
					return saveSettings(ctx, interaction.values ?? {});
				}
				if (interaction.type === "form_submit" && interaction.action_id === "create_product") {
					return createProduct(ctx, interaction.values ?? {});
				}
				if (interaction.type === "form_submit" && interaction.action_id === "create_discount") {
					return createDiscount(ctx, interaction.values ?? {});
				}

				// Order status changes
				if (interaction.type === "block_action" && interaction.action_id?.startsWith("order_status:")) {
					const [, id, status] = interaction.action_id.split(":");
					if (id && status) {
						const order = (await ctx.storage.orders!.get(id)) as Order | null;
						if (order) {
							order.status = status as Order["status"];
							order.updatedAt = now();
							await ctx.storage.orders!.put(id, order);
						}
					}
					return buildOrdersPage(ctx);
				}

				return { blocks: [] };
			},
		},
	},
});

// ══════════════════════════════════════════
// BLOCK KIT BUILDERS
// ══════════════════════════════════════════

async function buildRevenueWidget(ctx: PluginContext) {
	try {
		const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
		const paidResult = await ctx.storage.orders!.query({
			where: { status: { in: ["paid", "processing", "shipped", "delivered"] } },
			limit: 100,
		});
		const revenue = paidResult.items.reduce((sum: number, i: { data: unknown }) => sum + (i.data as Order).total, 0);
		const orderCount = paidResult.items.length;

		return {
			blocks: [
				{
					type: "stats",
					stats: [
						{ label: "Revenue", value: formatCents(revenue, currency) },
						{ label: "Orders", value: String(orderCount) },
						{ label: "Avg Order", value: orderCount > 0 ? formatCents(Math.round(revenue / orderCount), currency) : "$0" },
					],
				},
			],
		};
	} catch {
		return { blocks: [{ type: "context", text: "Failed to load revenue data" }] };
	}
}

async function buildRecentOrdersWidget(ctx: PluginContext) {
	try {
		const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
		const result = await ctx.storage.orders!.query({
			orderBy: { createdAt: "desc" },
			limit: 5,
		});

		if (result.items.length === 0) {
			return { blocks: [{ type: "context", text: "No orders yet" }] };
		}

		return {
			blocks: [
				{
					type: "table",
					columns: [
						{ key: "order", label: "Order" },
						{ key: "customer", label: "Customer" },
						{ key: "total", label: "Total" },
						{ key: "status", label: "Status", format: "badge" },
					],
					rows: result.items.map((i: { data: unknown }) => {
						const o = i.data as Order;
						return {
							order: o.orderNumber,
							customer: o.customerName,
							total: formatCents(o.total, currency),
							status: o.status,
						};
					}),
				},
			],
		};
	} catch {
		return { blocks: [{ type: "context", text: "Failed to load orders" }] };
	}
}

async function buildDashboard(ctx: PluginContext) {
	try {
		const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
		const stripeKey = await ctx.kv.get<string>("settings:stripeSecretKey");

		const blocks: unknown[] = [{ type: "header", text: "Store Dashboard" }];

		if (!stripeKey) {
			blocks.push({
				type: "banner",
				variant: "alert",
				title: "Stripe not configured",
				description: "Go to Settings and add your Stripe secret key to start accepting payments.",
			});
		}

		const [totalOrders, paidOrders, processingCount, activeProducts, totalCustomers] = await Promise.all([
			ctx.storage.orders!.count(),
			ctx.storage.orders!.count({ status: "paid" }),
			ctx.storage.orders!.count({ status: "processing" }),
			ctx.storage.products!.count({ status: "active" }),
			ctx.storage.customers!.count(),
		]);

		const paidResult = await ctx.storage.orders!.query({
			where: { status: { in: ["paid", "processing", "shipped", "delivered"] } },
			limit: 100,
		});
		const revenue = paidResult.items.reduce((sum: number, i: { data: unknown }) => sum + (i.data as Order).total, 0);

		blocks.push(
			{
				type: "stats",
				stats: [
					{ label: "Revenue", value: formatCents(revenue, currency) },
					{ label: "Orders", value: String(totalOrders) },
					{ label: "Products", value: String(activeProducts) },
					{ label: "Customers", value: String(totalCustomers) },
				],
			},
			{ type: "divider" },
		);

		if (processingCount > 0) {
			blocks.push({
				type: "banner",
				variant: "default",
				title: `${processingCount} order${processingCount > 1 ? "s" : ""} need processing`,
				description: "Go to Orders to fulfill them.",
			});
		}

		// Recent orders
		const recent = await ctx.storage.orders!.query({ orderBy: { createdAt: "desc" }, limit: 10 });
		if (recent.items.length > 0) {
			blocks.push(
				{ type: "section", text: "**Recent Orders**" },
				{
					type: "table",
					columns: [
						{ key: "order", label: "Order" },
						{ key: "customer", label: "Customer" },
						{ key: "total", label: "Total" },
						{ key: "status", label: "Status", format: "badge" },
						{ key: "date", label: "Date", format: "relative_time" },
					],
					rows: recent.items.map((i: { data: unknown }) => {
						const o = i.data as Order;
						return { order: o.orderNumber, customer: o.customerName, total: formatCents(o.total, currency), status: o.status, date: o.createdAt };
					}),
				},
			);
		}

		return { blocks };
	} catch (error) {
		ctx.log.error("Dashboard error", error);
		return { blocks: [{ type: "context", text: "Failed to load dashboard" }] };
	}
}

async function buildProductsPage(ctx: PluginContext) {
	try {
		const result = await ctx.storage.products!.query({ orderBy: { createdAt: "desc" }, limit: 50 });
		const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
		const products = result.items as Array<{ id: string; data: Product }>;

		const blocks: unknown[] = [
			{ type: "header", text: "Products" },
			{
				type: "form",
				block_id: "add-product",
				fields: [
					{ type: "text_input", action_id: "name", label: "Product Name" },
					{ type: "text_input", action_id: "slug", label: "URL Slug" },
					{ type: "number_input", action_id: "price", label: "Price (cents)", min: 0 },
					{ type: "number_input", action_id: "inventory", label: "Inventory (-1 = unlimited)" },
					{ type: "select", action_id: "status", label: "Status", options: [
						{ label: "Draft", value: "draft" },
						{ label: "Active", value: "active" },
					] },
				],
				submit: { label: "Add Product", action_id: "create_product" },
			},
			{ type: "divider" },
		];

		if (products.length === 0) {
			blocks.push({ type: "context", text: "No products yet. Add your first product above." });
		} else {
			blocks.push({
				type: "table",
				columns: [
					{ key: "name", label: "Name" },
					{ key: "price", label: "Price" },
					{ key: "inventory", label: "Stock" },
					{ key: "status", label: "Status", format: "badge" },
				],
				rows: products.map((p) => ({
					name: p.data.name,
					price: formatCents(p.data.price, currency),
					inventory: p.data.inventory === -1 ? "Unlimited" : String(p.data.inventory),
					status: p.data.status,
				})),
			});
		}

		return { blocks };
	} catch (error) {
		ctx.log.error("Products page error", error);
		return { blocks: [{ type: "context", text: "Failed to load products" }] };
	}
}

async function buildOrdersPage(ctx: PluginContext) {
	try {
		const result = await ctx.storage.orders!.query({ orderBy: { createdAt: "desc" }, limit: 50 });
		const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
		const orders = result.items as Array<{ id: string; data: Order }>;

		const blocks: unknown[] = [{ type: "header", text: "Orders" }];

		if (orders.length === 0) {
			blocks.push({ type: "context", text: "No orders yet." });
		} else {
			blocks.push({
				type: "table",
				columns: [
					{ key: "order", label: "Order" },
					{ key: "customer", label: "Customer" },
					{ key: "items", label: "Items" },
					{ key: "total", label: "Total" },
					{ key: "status", label: "Status", format: "badge" },
					{ key: "date", label: "Date", format: "relative_time" },
				],
				rows: orders.map((o) => ({
					_id: o.id,
					order: o.data.orderNumber,
					customer: o.data.customerName,
					items: String(o.data.items.reduce((s, i) => s + i.quantity, 0)),
					total: formatCents(o.data.total, currency),
					status: o.data.status,
					date: o.data.createdAt,
				})),
			});

			// Quick actions for paid orders
			for (const o of orders.slice(0, 10)) {
				if (o.data.status === "paid") {
					blocks.push({
						type: "actions",
						elements: [
							{ type: "button", text: `Ship ${o.data.orderNumber}`, action_id: `order_status:${o.id}:shipped` },
							{ type: "button", text: "Processing", action_id: `order_status:${o.id}:processing` },
						],
					});
				}
			}
		}

		return { blocks };
	} catch (error) {
		ctx.log.error("Orders page error", error);
		return { blocks: [{ type: "context", text: "Failed to load orders" }] };
	}
}

async function buildCustomersPage(ctx: PluginContext) {
	try {
		const result = await ctx.storage.customers!.query({ orderBy: { createdAt: "desc" }, limit: 50 });
		const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
		const customers = result.items as Array<{ id: string; data: Customer }>;

		const blocks: unknown[] = [{ type: "header", text: "Customers" }];

		if (customers.length === 0) {
			blocks.push({ type: "context", text: "No customers yet. Customers are created automatically when orders are placed." });
		} else {
			blocks.push({
				type: "table",
				columns: [
					{ key: "name", label: "Name" },
					{ key: "email", label: "Email" },
					{ key: "orders", label: "Orders" },
					{ key: "spent", label: "Total Spent" },
					{ key: "lastOrder", label: "Last Order", format: "relative_time" },
				],
				rows: customers.map((c) => ({
					name: c.data.name,
					email: c.data.email,
					orders: String(c.data.orderCount),
					spent: formatCents(c.data.totalSpent, currency),
					lastOrder: c.data.lastOrderAt ?? "-",
				})),
			});
		}

		return { blocks };
	} catch (error) {
		ctx.log.error("Customers page error", error);
		return { blocks: [{ type: "context", text: "Failed to load customers" }] };
	}
}

async function buildDiscountsPage(ctx: PluginContext) {
	try {
		const result = await ctx.storage.discounts!.query({ limit: 50 });
		const discounts = result.items as Array<{ id: string; data: Discount }>;

		const blocks: unknown[] = [
			{ type: "header", text: "Discount Codes" },
			{
				type: "form",
				block_id: "add-discount",
				fields: [
					{ type: "text_input", action_id: "code", label: "Code (auto-uppercased)" },
					{ type: "select", action_id: "type", label: "Type", options: [
						{ label: "Percentage", value: "percentage" },
						{ label: "Fixed Amount (cents)", value: "fixed" },
					] },
					{ type: "number_input", action_id: "value", label: "Value (% or cents)", min: 0 },
					{ type: "number_input", action_id: "maxUses", label: "Max Uses (0 = unlimited)", min: 0 },
				],
				submit: { label: "Create Discount", action_id: "create_discount" },
			},
			{ type: "divider" },
		];

		if (discounts.length === 0) {
			blocks.push({ type: "context", text: "No discount codes yet." });
		} else {
			blocks.push({
				type: "table",
				columns: [
					{ key: "code", label: "Code" },
					{ key: "type", label: "Type" },
					{ key: "value", label: "Value" },
					{ key: "used", label: "Used" },
					{ key: "status", label: "Status", format: "badge" },
				],
				rows: discounts.map((d) => ({
					code: d.data.code,
					type: d.data.type,
					value: d.data.type === "percentage" ? `${d.data.value}%` : `${d.data.value}c`,
					used: d.data.maxUses ? `${d.data.usedCount}/${d.data.maxUses}` : String(d.data.usedCount),
					status: d.data.status,
				})),
			});
		}

		return { blocks };
	} catch (error) {
		ctx.log.error("Discounts page error", error);
		return { blocks: [{ type: "context", text: "Failed to load discounts" }] };
	}
}

async function buildSettingsPage(ctx: PluginContext) {
	try {
		const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
		const taxRate = (await ctx.kv.get<number>("settings:taxRate")) ?? 0;
		const flatShipping = (await ctx.kv.get<number>("settings:flatShipping")) ?? 0;
		const freeShippingThreshold = (await ctx.kv.get<number>("settings:freeShippingThreshold")) ?? 0;
		const orderNotificationEmail = (await ctx.kv.get<string>("settings:orderNotificationEmail")) ?? "";
		const siteUrl = (await ctx.kv.get<string>("settings:siteUrl")) ?? "";
		const stripeKey = await ctx.kv.get<string>("settings:stripeSecretKey");

		const blocks: unknown[] = [
			{ type: "header", text: "Store Settings" },
		];

		if (!stripeKey) {
			blocks.push({
				type: "banner",
				variant: "alert",
				title: "Stripe not configured",
				description: "Add your Stripe secret key below to start accepting payments. Get your key from dashboard.stripe.com/apikeys.",
			});
		} else {
			blocks.push({
				type: "banner",
				variant: "default",
				title: "Stripe connected",
				description: "Your store is ready to accept payments.",
			});
		}

		blocks.push({
			type: "form",
			block_id: "store-settings",
			fields: [
				{ type: "secret_input", action_id: "stripeSecretKey", label: "Stripe Secret Key (sk_...)" },
				{ type: "text_input", action_id: "stripeWebhookSecret", label: "Stripe Webhook Secret (whsec_...)" },
				{ type: "divider" },
				{ type: "text_input", action_id: "siteUrl", label: "Site URL (for checkout redirects)", initial_value: siteUrl },
				{ type: "text_input", action_id: "currency", label: "Currency Code", initial_value: currency },
				{ type: "number_input", action_id: "taxRate", label: "Tax Rate (%)", initial_value: taxRate, min: 0, max: 100 },
				{ type: "number_input", action_id: "flatShipping", label: "Flat Shipping Rate (cents)", initial_value: flatShipping, min: 0 },
				{ type: "number_input", action_id: "freeShippingThreshold", label: "Free Shipping Over (cents, 0 = disabled)", initial_value: freeShippingThreshold, min: 0 },
				{ type: "divider" },
				{ type: "text_input", action_id: "orderNotificationEmail", label: "Order Notification Email", initial_value: orderNotificationEmail },
			],
			submit: { label: "Save Settings", action_id: "save_settings" },
		});

		// Webhook setup instructions
		blocks.push(
			{ type: "divider" },
			{ type: "section", text: "**Stripe Webhook Setup**" },
			{ type: "context", text: "In your Stripe dashboard, create a webhook pointing to:" },
			{ type: "code", code: `${siteUrl || "https://yoursite.com"}/_emdash/api/plugins/commerce/storefront/webhook/stripe`, language: "bash" as never },
			{ type: "context", text: "Listen for the event: checkout.session.completed" },
		);

		return { blocks };
	} catch (error) {
		ctx.log.error("Settings page error", error);
		return { blocks: [{ type: "context", text: "Failed to load settings" }] };
	}
}

async function saveSettings(ctx: PluginContext, values: Record<string, unknown>) {
	try {
		if (typeof values.stripeSecretKey === "string" && values.stripeSecretKey !== "")
			await ctx.kv.set("settings:stripeSecretKey", values.stripeSecretKey);
		if (typeof values.stripeWebhookSecret === "string" && values.stripeWebhookSecret !== "")
			await ctx.kv.set("settings:stripeWebhookSecret", values.stripeWebhookSecret);
		if (typeof values.siteUrl === "string")
			await ctx.kv.set("settings:siteUrl", values.siteUrl);
		if (typeof values.currency === "string")
			await ctx.kv.set("settings:currency", values.currency.toLowerCase());
		if (typeof values.taxRate === "number")
			await ctx.kv.set("settings:taxRate", values.taxRate);
		if (typeof values.flatShipping === "number")
			await ctx.kv.set("settings:flatShipping", values.flatShipping);
		if (typeof values.freeShippingThreshold === "number")
			await ctx.kv.set("settings:freeShippingThreshold", values.freeShippingThreshold);
		if (typeof values.orderNotificationEmail === "string")
			await ctx.kv.set("settings:orderNotificationEmail", values.orderNotificationEmail);

		return {
			...(await buildSettingsPage(ctx)),
			toast: { message: "Settings saved", type: "success" },
		};
	} catch (error) {
		ctx.log.error("Save settings error", error);
		return {
			blocks: [{ type: "banner", variant: "error", title: "Failed to save settings" }],
			toast: { message: "Failed to save settings", type: "error" },
		};
	}
}

async function createProduct(ctx: PluginContext, values: Record<string, unknown>) {
	try {
		const name = values.name as string;
		const slug = values.slug as string;
		const price = Number(values.price) || 0;
		const inventory = Number(values.inventory) ?? -1;
		const status = (values.status as string) || "draft";

		if (!name || !slug) {
			return {
				...(await buildProductsPage(ctx)),
				toast: { message: "Name and slug are required", type: "error" },
			};
		}

		const existing = await ctx.storage.products!.query({ where: { slug }, limit: 1 });
		if (existing.items.length > 0) {
			return {
				...(await buildProductsPage(ctx)),
				toast: { message: "A product with this slug already exists", type: "error" },
			};
		}

		const id = genId();
		await ctx.storage.products!.put(id, {
			name,
			slug,
			description: "",
			price,
			status,
			images: [],
			variants: [],
			inventory,
			createdAt: now(),
			updatedAt: now(),
		});

		return {
			...(await buildProductsPage(ctx)),
			toast: { message: `Product "${name}" created`, type: "success" },
		};
	} catch (error) {
		ctx.log.error("Create product error", error);
		return {
			...(await buildProductsPage(ctx)),
			toast: { message: "Failed to create product", type: "error" },
		};
	}
}

async function createDiscount(ctx: PluginContext, values: Record<string, unknown>) {
	try {
		const code = (values.code as string || "").toUpperCase();
		const type = values.type as string;
		const value = Number(values.value) || 0;
		const maxUses = Number(values.maxUses) || 0;

		if (!code || !type) {
			return {
				...(await buildDiscountsPage(ctx)),
				toast: { message: "Code and type are required", type: "error" },
			};
		}

		const existing = await ctx.storage.discounts!.query({ where: { code }, limit: 1 });
		if (existing.items.length > 0) {
			return {
				...(await buildDiscountsPage(ctx)),
				toast: { message: "This discount code already exists", type: "error" },
			};
		}

		await ctx.storage.discounts!.put(genId(), {
			code,
			type: type as "percentage" | "fixed",
			value,
			maxUses: maxUses > 0 ? maxUses : undefined,
			usedCount: 0,
			status: "active",
			createdAt: now(),
		});

		return {
			...(await buildDiscountsPage(ctx)),
			toast: { message: `Discount "${code}" created`, type: "success" },
		};
	} catch (error) {
		ctx.log.error("Create discount error", error);
		return {
			...(await buildDiscountsPage(ctx)),
			toast: { message: "Failed to create discount", type: "error" },
		};
	}
}
