/**
 * Sandbox Entry Point — Commerce Plugin v0.3.0
 *
 * WooCommerce alternative for EmDash CMS.
 *
 * Three tiers:
 * - Free ($0): Full store, own Stripe keys, no Pro features.
 * - Pro ($29/mo): Own Stripe keys + all Pro features. No transaction fee.
 * - Pro Connect ($19/mo + 1.5%): Stripe Connect (managed) + all Pro features.
 */

import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import { z } from "zod";

// ══════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════

interface Product {
	name: string;
	slug: string;
	description: string;
	shortDescription?: string;
	price: number; // cents
	compareAtPrice?: number;
	status: "active" | "draft" | "archived";
	type: "physical" | "digital";
	categoryId?: string;
	images: string[];
	variants: Variant[];
	sku?: string;
	inventory: number; // -1 = unlimited
	lowStockThreshold?: number; // alert when inventory drops to this
	backordersAllowed: boolean; // allow purchases when out of stock
	weight?: number; // grams
	downloadUrl?: string; // for digital products (Pro)
	downloadLimit?: number; // max downloads per order
	seoTitle?: string;
	seoDescription?: string;
	metadata?: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

interface Variant {
	id: string;
	name: string;
	sku?: string;
	price?: number;
	inventory: number;
	options: Record<string, string>;
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
	price: number;
	quantity: number;
	image?: string;
	type: "physical" | "digital";
}

interface Cart {
	sessionId: string;
	items: CartItem[];
	customerEmail?: string;
	discountCode?: string;
	discountAmount?: number;
	updatedAt: string;
	abandonedEmailSent?: boolean;
}

interface Order {
	orderNumber: string;
	status: "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
	customerEmail: string;
	customerName: string;
	shippingAddress: Address;
	billingAddress?: Address;
	items: OrderItem[];
	subtotal: number;
	discount: number;
	shipping: number;
	tax: number;
	total: number;
	currency: string;
	stripePaymentId?: string;
	stripeSessionId?: string;
	discountCode?: string;
	notes?: string;
	trackingNumber?: string;
	trackingUrl?: string;
	customerEmailsSent: string[]; // track which emails we sent
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
	type: "physical" | "digital";
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
	totalSpent: number;
	lastOrderAt?: string;
	createdAt: string;
}

interface Discount {
	code: string;
	type: "percentage" | "fixed" | "free_shipping";
	value: number;
	minOrderAmount?: number;
	maxUses?: number;
	usedCount: number;
	applicableProducts?: string[]; // product IDs, empty = all
	applicableCategories?: string[]; // category IDs, empty = all
	status: "active" | "expired" | "disabled";
	expiresAt?: string;
	createdAt: string;
}

interface Download {
	orderId: string;
	productId: string;
	customerEmail: string;
	token: string;
	fileName: string;
	downloadUrl: string;
	downloadCount: number;
	downloadLimit: number;
	expiresAt: string;
	createdAt: string;
}

interface License {
	key: string;
	orderId: string;
	orderNumber: string;
	productId: string;
	productName: string;
	customerEmail: string;
	customerName: string;
	status: "active" | "revoked" | "expired";
	createdAt: string;
}

interface ShippingZone {
	name: string;
	countries: string[]; // ISO country codes, ["*"] = rest of world
	methods: ShippingMethod[];
	sortOrder: number;
	createdAt: string;
}

interface ShippingMethod {
	id: string;
	type: "flat_rate" | "free_shipping" | "weight_based" | "price_based";
	name: string;
	cost: number; // cents (flat_rate), or rate per unit
	minOrderAmount?: number; // cents, for free_shipping threshold
	minWeight?: number; // grams
	maxWeight?: number; // grams
	enabled: boolean;
}

interface TaxRule {
	country: string; // ISO code or "*"
	state: string; // state code or "*"
	rate: number; // percentage (e.g. 8.25)
	name: string; // e.g. "CA Sales Tax"
	compound: boolean; // applied on top of other taxes
	shipping: boolean; // applies to shipping too
	createdAt: string;
}

interface StockNotification {
	productId: string;
	productName: string;
	email: string;
	notified: boolean;
	createdAt: string;
}

interface OrderNote {
	orderId: string;
	type: "admin" | "system" | "customer_visible";
	message: string;
	author?: string; // admin name or "system"
	createdAt: string;
}

interface Review {
	productId: string;
	productName: string;
	customerEmail: string;
	customerName: string;
	rating: number; // 1-5
	title: string;
	body: string;
	status: "pending" | "approved" | "rejected";
	verified: boolean; // purchased the product
	createdAt: string;
}

interface AnalyticsEntry {
	date: string; // YYYY-MM-DD
	type: "daily_summary";
	revenue: number;
	orderCount: number;
	newCustomers: number;
	topProducts: Array<{ id: string; name: string; units: number; revenue: number }>;
}

// ══════════════════════════════════════════
// SCHEMAS
// ══════════════════════════════════════════

const productCreateSchema = z.object({
	name: z.string().min(1).max(200),
	slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
	description: z.string().max(10000).default(""),
	shortDescription: z.string().max(500).optional(),
	price: z.number().int().min(0),
	compareAtPrice: z.number().int().min(0).optional(),
	status: z.enum(["active", "draft", "archived"]).default("draft"),
	type: z.enum(["physical", "digital"]).default("physical"),
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
	lowStockThreshold: z.number().int().min(0).optional(),
	backordersAllowed: z.boolean().default(false),
	weight: z.number().min(0).optional(),
	downloadUrl: z.string().optional(),
	downloadLimit: z.number().int().min(1).optional(),
	seoTitle: z.string().max(200).optional(),
	seoDescription: z.string().max(500).optional(),
});

const productUpdateSchema = productCreateSchema.partial().extend({
	id: z.string().min(1),
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
	quantity: z.number().int().min(0).max(99),
});

const cartDiscountSchema = z.object({
	sessionId: z.string().min(1),
	code: z.string().min(1),
});

const cartEmailSchema = z.object({
	sessionId: z.string().min(1),
	email: z.string().email(),
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
	trackingNumber: z.string().max(200).optional(),
	trackingUrl: z.string().max(500).optional(),
});

const discountCreateSchema = z.object({
	code: z.string().min(1).max(50).transform((v) => v.toUpperCase()),
	type: z.enum(["percentage", "fixed", "free_shipping"]),
	value: z.number().min(0),
	minOrderAmount: z.number().int().min(0).optional(),
	maxUses: z.number().int().min(1).optional(),
	applicableProducts: z.array(z.string()).optional(),
	applicableCategories: z.array(z.string()).optional(),
	expiresAt: z.string().optional(),
});

const wooImportSchema = z.object({
	products: z.array(z.object({
		name: z.string(),
		sku: z.string().optional(),
		regular_price: z.string().optional(),
		sale_price: z.string().optional(),
		description: z.string().optional(),
		short_description: z.string().optional(),
		categories: z.string().optional(),
		images: z.string().optional(),
		stock_quantity: z.coerce.number().optional(),
		type: z.string().optional(),
	})),
});

const listSchema = z.object({
	limit: z.coerce.number().min(1).max(100).default(50),
	cursor: z.string().optional(),
	status: z.string().optional(),
});

const idSchema = z.object({ id: z.string().min(1) });

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

function genId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
	return new Date().toISOString();
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function genOrderNumber(): string {
	const d = new Date();
	const prefix = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
	const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
	return `ORD-${prefix}-${rand}`;
}

function genLicenseKey(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
	const segments: string[] = [];
	for (let s = 0; s < 4; s++) {
		let seg = "";
		for (let i = 0; i < 5; i++) {
			seg += chars[Math.floor(Math.random() * chars.length)];
		}
		segments.push(seg);
	}
	return `PFE-${segments.join("-")}`;
}

function genDownloadToken(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let token = "";
	for (let i = 0; i < 32; i++) {
		token += chars[Math.floor(Math.random() * chars.length)];
	}
	return token;
}

function slugify(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatCents(cents: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(cents / 100);
}

function throw404(msg: string): never {
	throw new Response(JSON.stringify({ error: msg }), {
		status: 404, headers: { "Content-Type": "application/json" },
	});
}

function throw400(msg: string): never {
	throw new Response(JSON.stringify({ error: msg }), {
		status: 400, headers: { "Content-Type": "application/json" },
	});
}

function throw403(msg: string): never {
	throw new Response(JSON.stringify({ error: msg, upgrade: true }), {
		status: 403, headers: { "Content-Type": "application/json" },
	});
}

// ══════════════════════════════════════════
// PRO TIER & STRIPE
// ══════════════════════════════════════════

type Tier = "free" | "pro" | "pro_connect";

async function getTier(ctx: PluginContext): Promise<Tier> {
	const licenseKey = await ctx.kv.get<string>("settings:licenseKey");
	if (!licenseKey) return "free";

	const stripeAccountId = await ctx.kv.get<string>("settings:stripeAccountId");
	if (stripeAccountId) return "pro_connect";

	return "pro";
}

async function isPro(ctx: PluginContext): Promise<boolean> {
	return (await getTier(ctx)) !== "free";
}

function requirePro(pro: boolean, feature: string): void {
	if (!pro) throw403(`${feature} requires a Pro license. Upgrade at pluginsforemdash.com/pricing`);
}

const PLATFORM_API = "https://api.pluginsforemdash.com/v1";

/** Stripe request using own keys (free tier) */
async function stripeRequest(
	ctx: PluginContext,
	endpoint: string,
	params: Record<string, string>,
): Promise<Record<string, unknown>> {
	const secretKey = await ctx.kv.get<string>("settings:stripeSecretKey");
	if (!secretKey || !ctx.http) throw new Error("Stripe is not configured");

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

/** Stripe Connect checkout via our platform API (Pro tier) */
async function platformCheckout(
	ctx: PluginContext,
	payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const licenseKey = await ctx.kv.get<string>("settings:licenseKey");
	const stripeAccountId = await ctx.kv.get<string>("settings:stripeAccountId");
	if (!licenseKey || !stripeAccountId || !ctx.http) {
		throw new Error("Stripe Connect is not configured");
	}

	const response = await ctx.http.fetch(`${PLATFORM_API}/checkout/create`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${licenseKey}`,
		},
		body: JSON.stringify({
			stripeAccountId,
			...payload,
		}),
	});

	const data = (await response.json()) as Record<string, unknown>;
	if (!response.ok) throw new Error(`Platform error: ${(data as { error?: string }).error ?? "Unknown"}`);
	return data;
}

// ══════════════════════════════════════════
// EMAIL
// ══════════════════════════════════════════

async function sendEmail(ctx: PluginContext, to: string, subject: string, text: string): Promise<void> {
	// Try EmDash email pipeline first
	if (ctx.email) {
		await ctx.email.send({ to, subject, text });
		return;
	}

	// Fallback: via platform API for Pro users
	const pro = await isPro(ctx);
	if (!pro || !ctx.http) return;

	const licenseKey = await ctx.kv.get<string>("settings:licenseKey");
	await ctx.http.fetch(`${PLATFORM_API}/email/send`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${licenseKey}`,
		},
		body: JSON.stringify({ to, subject, text }),
	}).catch(() => {});
}

async function sendOrderConfirmation(ctx: PluginContext, order: Order): Promise<void> {
	const pro = await isPro(ctx);
	if (!pro) return; // customer emails are Pro only

	const storeName = (await ctx.kv.get<string>("settings:storeName")) ?? "Our Store";
	const currency = order.currency;

	const itemLines = order.items
		.map((i) => `  ${i.name} x${i.quantity}  ${formatCents(i.price * i.quantity, currency)}`)
		.join("\n");

	await sendEmail(ctx, order.customerEmail,
		`Order confirmed — ${order.orderNumber}`,
		[
			`Hi ${order.customerName},`,
			"",
			`Thank you for your order from ${storeName}!`,
			"",
			`Order: ${order.orderNumber}`,
			"",
			"Items:",
			itemLines,
			"",
			`Subtotal: ${formatCents(order.subtotal, currency)}`,
			order.discount > 0 ? `Discount: -${formatCents(order.discount, currency)}` : null,
			order.shipping > 0 ? `Shipping: ${formatCents(order.shipping, currency)}` : null,
			order.tax > 0 ? `Tax: ${formatCents(order.tax, currency)}` : null,
			`Total: ${formatCents(order.total, currency)}`,
			"",
			"We'll send you another email when your order ships.",
			"",
			`- ${storeName}`,
		].filter(Boolean).join("\n"),
	);
}

async function sendShippingConfirmation(ctx: PluginContext, order: Order): Promise<void> {
	const pro = await isPro(ctx);
	if (!pro) return;

	const storeName = (await ctx.kv.get<string>("settings:storeName")) ?? "Our Store";

	await sendEmail(ctx, order.customerEmail,
		`Your order has shipped — ${order.orderNumber}`,
		[
			`Hi ${order.customerName},`,
			"",
			`Your order ${order.orderNumber} has shipped!`,
			order.trackingNumber ? `\nTracking: ${order.trackingNumber}` : null,
			order.trackingUrl ? `Track your package: ${order.trackingUrl}` : null,
			"",
			`- ${storeName}`,
		].filter(Boolean).join("\n"),
	);
}

async function sendAbandonedCartEmail(ctx: PluginContext, cart: Cart): Promise<void> {
	if (!cart.customerEmail || cart.items.length === 0) return;

	const storeName = (await ctx.kv.get<string>("settings:storeName")) ?? "Our Store";
	const siteUrl = (await ctx.kv.get<string>("settings:siteUrl")) ?? "";
	const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
	const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);

	const itemLines = cart.items.map((i) => `  ${i.name} x${i.quantity}`).join("\n");

	await sendEmail(ctx, cart.customerEmail,
		`You left items in your cart — ${storeName}`,
		[
			"Hi there,",
			"",
			"You left some items in your cart:",
			"",
			itemLines,
			"",
			`Total: ${formatCents(subtotal, currency)}`,
			"",
			siteUrl ? `Complete your purchase: ${siteUrl}/cart` : "Come back and complete your purchase!",
			"",
			`- ${storeName}`,
		].join("\n"),
	);
}

async function sendDigitalDownloadEmail(ctx: PluginContext, order: Order, downloads: Download[]): Promise<void> {
	const storeName = (await ctx.kv.get<string>("settings:storeName")) ?? "Our Store";
	const siteUrl = (await ctx.kv.get<string>("settings:siteUrl")) ?? "";

	const downloadLinks = downloads
		.map((d) => `  ${d.fileName}: ${siteUrl}/_emdash/api/plugins/commerce/download?token=${d.token}`)
		.join("\n");

	await sendEmail(ctx, order.customerEmail,
		`Your downloads are ready — ${order.orderNumber}`,
		[
			`Hi ${order.customerName},`,
			"",
			"Your digital purchase is ready for download:",
			"",
			downloadLinks,
			"",
			`Each link can be used ${downloads[0]?.downloadLimit ?? 5} times and expires in 7 days.`,
			"",
			`- ${storeName}`,
		].join("\n"),
	);
}

async function sendLicenseEmail(ctx: PluginContext, order: Order, licenses: License[]): Promise<void> {
	const storeName = (await ctx.kv.get<string>("settings:storeName")) ?? "Plugins for EmDash";

	const licenseLines = licenses.map((l) =>
		`  ${l.productName}: ${l.key}`
	).join("\n");

	await sendEmail(ctx, order.customerEmail,
		`Your license key${licenses.length > 1 ? "s" : ""} — ${order.orderNumber}`,
		[
			`Hi ${order.customerName},`,
			"",
			`Thank you for your purchase from ${storeName}!`,
			"",
			`Your license key${licenses.length > 1 ? "s" : ""}:`,
			"",
			licenseLines,
			"",
			"To activate:",
			"  1. Go to your EmDash admin panel",
			"  2. Navigate to the plugin's Settings page",
			"  3. Paste the license key and save",
			"",
			`Order: ${order.orderNumber}`,
			`Total: ${formatCents(order.total, order.currency)}`,
			"",
			"If you have any questions, reply to this email.",
			"",
			`— ${storeName}`,
		].join("\n"),
	);
}

async function notifyAdmin(ctx: PluginContext, order: Order): Promise<void> {
	const notifyEmail = await ctx.kv.get<string>("settings:orderNotificationEmail");
	if (!notifyEmail) return;

	const currency = order.currency;
	const itemLines = order.items
		.map((i) => `  ${i.name} x${i.quantity} — ${formatCents(i.price * i.quantity, currency)}`)
		.join("\n");

	await sendEmail(ctx, notifyEmail,
		`New order ${order.orderNumber} — ${formatCents(order.total, currency)}`,
		[
			`New order received!`,
			"",
			`Order: ${order.orderNumber}`,
			`Customer: ${order.customerName} (${order.customerEmail})`,
			"",
			"Items:", itemLines,
			"",
			`Total: ${formatCents(order.total, currency)}`,
			"",
			`Ship to: ${order.shippingAddress.line1}, ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.postalCode}`,
		].join("\n"),
	);
}

// ══════════════════════════════════════════
// CART & DISCOUNT LOGIC
// ══════════════════════════════════════════

async function getCart(ctx: PluginContext, sessionId: string): Promise<Cart> {
	const existing = (await ctx.storage.carts!.get(sessionId)) as Cart | null;
	if (existing) return existing;
	return { sessionId, items: [], updatedAt: now() };
}

async function saveCart(ctx: PluginContext, cart: Cart): Promise<void> {
	cart.updatedAt = now();
	await ctx.storage.carts!.put(cart.sessionId, cart);
}

async function calculateShipping(
	ctx: PluginContext,
	country: string,
	subtotal: number,
	totalWeight: number,
	hasPhysical: boolean,
	freeShippingFromDiscount: boolean,
): Promise<{ cost: number; methodName: string }> {
	if (!hasPhysical || freeShippingFromDiscount) return { cost: 0, methodName: "Free" };

	// Try shipping zones first
	const zonesResult = await ctx.storage.shippingZones!.query({ orderBy: { sortOrder: "asc" }, limit: 50 });
	const zones = zonesResult.items as Array<{ data: ShippingZone }>;

	for (const z of zones) {
		const zone = z.data;
		const matchesCountry = zone.countries.includes(country) || zone.countries.includes("*");
		if (!matchesCountry) continue;

		// Find the best enabled method
		for (const method of zone.methods.filter((m) => m.enabled)) {
			if (method.type === "free_shipping") {
				if (!method.minOrderAmount || subtotal >= method.minOrderAmount) {
					return { cost: 0, methodName: method.name };
				}
			}
			if (method.type === "flat_rate") {
				return { cost: method.cost, methodName: method.name };
			}
			if (method.type === "weight_based") {
				if (method.minWeight && totalWeight < method.minWeight) continue;
				if (method.maxWeight && totalWeight > method.maxWeight) continue;
				// cost is per 100g
				const units = Math.ceil(totalWeight / 100);
				return { cost: method.cost * units, methodName: method.name };
			}
			if (method.type === "price_based") {
				// cost is percentage of subtotal
				return { cost: Math.round(subtotal * (method.cost / 10000)), methodName: method.name };
			}
		}
	}

	// Fallback to legacy flat rate settings
	const flatShipping = (await ctx.kv.get<number>("settings:flatShipping")) ?? 0;
	const freeThreshold = (await ctx.kv.get<number>("settings:freeShippingThreshold")) ?? 0;

	if (freeThreshold > 0 && subtotal >= freeThreshold) return { cost: 0, methodName: "Free Shipping" };
	return { cost: flatShipping, methodName: flatShipping > 0 ? "Flat Rate" : "Free" };
}

async function calculateTax(
	ctx: PluginContext,
	country: string,
	state: string,
	subtotal: number,
	shippingCost: number,
): Promise<{ amount: number; breakdown: Array<{ name: string; rate: number; amount: number }> }> {
	// Try tax rules first
	const rulesResult = await ctx.storage.taxRules!.query({ limit: 100 });
	const rules = rulesResult.items as Array<{ data: TaxRule }>;

	const applicable = rules
		.map((r) => r.data)
		.filter((r) => (r.country === country || r.country === "*") && (r.state === state || r.state === "*"));

	if (applicable.length > 0) {
		let totalTax = 0;
		const breakdown: Array<{ name: string; rate: number; amount: number }> = [];
		let taxableAmount = subtotal;

		for (const rule of applicable) {
			const base = rule.compound ? taxableAmount + totalTax : taxableAmount;
			const shippingTax = rule.shipping ? Math.round(shippingCost * (rule.rate / 100)) : 0;
			const amount = Math.round(base * (rule.rate / 100)) + shippingTax;
			totalTax += amount;
			breakdown.push({ name: rule.name, rate: rule.rate, amount });
		}

		return { amount: totalTax, breakdown };
	}

	// Fallback to legacy single rate
	const taxRate = (await ctx.kv.get<number>("settings:taxRate")) ?? 0;
	if (taxRate <= 0) return { amount: 0, breakdown: [] };
	const amount = Math.round(subtotal * (taxRate / 100));
	return { amount, breakdown: [{ name: "Tax", rate: taxRate, amount }] };
}

function getStockStatus(product: Product): { status: "in_stock" | "low_stock" | "out_of_stock" | "on_backorder" | "unlimited"; display: string } {
	if (product.inventory === -1) return { status: "unlimited", display: "In Stock" };
	if (product.inventory === 0) {
		if (product.backordersAllowed) return { status: "on_backorder", display: "Available on Backorder" };
		return { status: "out_of_stock", display: "Out of Stock" };
	}
	const threshold = product.lowStockThreshold ?? 5;
	if (product.inventory <= threshold) return { status: "low_stock", display: `Low Stock — ${product.inventory} left` };
	return { status: "in_stock", display: "In Stock" };
}

async function sendStockNotifications(ctx: PluginContext, productId: string, productName: string): Promise<void> {
	const result = await ctx.storage.stockNotifications!.query({
		where: { productId, notified: false },
		limit: 100,
	});

	for (const item of result.items) {
		const notif = item.data as StockNotification;
		await sendEmail(ctx, notif.email,
			`${productName} is back in stock!`,
			`Good news — ${productName} is back in stock.\n\nShop now before it sells out again.`,
		).catch(() => {});
		notif.notified = true;
		await ctx.storage.stockNotifications!.put(item.id, notif);
	}

	if (result.items.length > 0) {
		ctx.log.info(`Sent ${result.items.length} back-in-stock notifications for ${productName}`);
	}
}

async function addOrderNote(ctx: PluginContext, orderId: string, type: OrderNote["type"], message: string, author?: string): Promise<void> {
	await ctx.storage.orderNotes!.put(genId(), {
		orderId, type, message, author: author ?? "system", createdAt: now(),
	});
}

async function resolveDiscount(
	ctx: PluginContext,
	code: string,
	subtotal: number,
	cartItems?: CartItem[],
): Promise<{ valid: boolean; amount: number; freeShipping: boolean; error?: string }> {
	const result = await ctx.storage.discounts!.query({ where: { code: code.toUpperCase() }, limit: 1 });
	if (result.items.length === 0) return { valid: false, amount: 0, freeShipping: false, error: "Invalid discount code" };

	const discount = result.items[0]!.data as Discount;
	if (discount.status !== "active") return { valid: false, amount: 0, freeShipping: false, error: "Discount code is no longer active" };
	if (discount.expiresAt && new Date(discount.expiresAt) < new Date()) return { valid: false, amount: 0, freeShipping: false, error: "Discount code has expired" };
	if (discount.maxUses && discount.usedCount >= discount.maxUses) return { valid: false, amount: 0, freeShipping: false, error: "Discount code usage limit reached" };
	if (discount.minOrderAmount && subtotal < discount.minOrderAmount) {
		return { valid: false, amount: 0, freeShipping: false, error: `Minimum order of ${formatCents(discount.minOrderAmount, "usd")} required` };
	}

	// Check product/category restrictions
	if (cartItems && discount.applicableProducts && discount.applicableProducts.length > 0) {
		const hasApplicable = cartItems.some((i) => discount.applicableProducts!.includes(i.productId));
		if (!hasApplicable) return { valid: false, amount: 0, freeShipping: false, error: "This discount doesn't apply to items in your cart" };
	}

	if (discount.type === "free_shipping") return { valid: true, amount: 0, freeShipping: true };

	// Calculate discount on applicable items only
	let discountableSubtotal = subtotal;
	if (cartItems && discount.applicableProducts && discount.applicableProducts.length > 0) {
		discountableSubtotal = cartItems
			.filter((i) => discount.applicableProducts!.includes(i.productId))
			.reduce((s, i) => s + i.price * i.quantity, 0);
	}

	const amount = discount.type === "percentage"
		? Math.round(discountableSubtotal * (discount.value / 100))
		: Math.min(discount.value, discountableSubtotal);

	return { valid: true, amount, freeShipping: false };
}

// ══════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════

async function recordSale(ctx: PluginContext, order: Order): Promise<void> {
	const date = today();
	const existing = (await ctx.storage.analytics!.get(date)) as AnalyticsEntry | null;

	if (existing) {
		existing.revenue += order.total;
		existing.orderCount += 1;
		// Update top products
		for (const item of order.items) {
			const found = existing.topProducts.find((p) => p.id === item.productId);
			if (found) {
				found.units += item.quantity;
				found.revenue += item.price * item.quantity;
			} else {
				existing.topProducts.push({ id: item.productId, name: item.name, units: item.quantity, revenue: item.price * item.quantity });
			}
		}
		existing.topProducts.sort((a, b) => b.revenue - a.revenue);
		existing.topProducts = existing.topProducts.slice(0, 10);
		await ctx.storage.analytics!.put(date, existing);
	} else {
		await ctx.storage.analytics!.put(date, {
			date,
			type: "daily_summary",
			revenue: order.total,
			orderCount: 1,
			newCustomers: 0,
			topProducts: order.items.map((i) => ({ id: i.productId, name: i.name, units: i.quantity, revenue: i.price * i.quantity })),
		});
	}
}

// Rate limiting
const captureTimestamps = new Map<string, number[]>();
function isRateLimited(key: string, max: number = 10, windowMs: number = 60_000): boolean {
	const cutoff = Date.now() - windowMs;
	const timestamps = (captureTimestamps.get(key) ?? []).filter((t) => t > cutoff);
	captureTimestamps.set(key, timestamps);
	if (timestamps.length >= max) return true;
	timestamps.push(Date.now());
	return false;
}

// ══════════════════════════════════════════
// PLUGIN DEFINITION
// ══════════════════════════════════════════

export default definePlugin({
	id: "commerce",
	version: "0.3.0",
	capabilities: ["network:fetch", "email:send", "read:users", "read:content"],
	allowedHosts: ["api.stripe.com", "api.pluginsforemdash.com", "connect.stripe.com"],

	admin: {
		pages: [
			{ path: "/", label: "Dashboard", icon: "chart" },
			{ path: "/products", label: "Products", icon: "list" },
			{ path: "/orders", label: "Orders", icon: "inbox" },
			{ path: "/customers", label: "Customers", icon: "users" },
			{ path: "/discounts", label: "Discounts", icon: "tag" },
			{ path: "/shipping", label: "Shipping", icon: "send" },
			{ path: "/licenses", label: "Licenses", icon: "tag" },
			{ path: "/settings", label: "Settings", icon: "gear" },
		],
		widgets: [],
	},

	hooks: {
		"plugin:install": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				ctx.log.info("Commerce plugin installed");
				await ctx.kv.set("settings:currency", "usd");
				await ctx.kv.set("settings:taxRate", 0);
				await ctx.kv.set("settings:flatShipping", 0);
				await ctx.kv.set("settings:freeShippingThreshold", 0);
				await ctx.kv.set("settings:orderNotificationEmail", "");
				await ctx.kv.set("settings:storeName", "");
				await ctx.kv.set("state:orderCount", 0);
			},
		},

		"plugin:activate": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				if (ctx.cron) {
					await ctx.cron.schedule("cleanup-carts", { schedule: "@daily" });
					await ctx.cron.schedule("abandoned-cart-emails", { schedule: "0 */4 * * *" }); // every 4 hours
				}
			},
		},

		cron: {
			handler: async (event: { name: string }, ctx: PluginContext) => {
				if (event.name === "cleanup-carts") {
					const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
					const old = await ctx.storage.carts!.query({ where: { updatedAt: { lte: cutoff } }, limit: 100 });
					if (old.items.length > 0) {
						await ctx.storage.carts!.deleteMany(old.items.map((i: { id: string }) => i.id));
						ctx.log.info(`Cleaned up ${old.items.length} old carts`);
					}
				}

				if (event.name === "abandoned-cart-emails") {
					const pro = await isPro(ctx);
					if (!pro) return;

					// Find carts 1-24 hours old with an email but no purchase
					const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
					const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

					const carts = await ctx.storage.carts!.query({
						where: { updatedAt: { gte: dayAgo, lte: hourAgo } },
						limit: 50,
					});

					let sent = 0;
					for (const item of carts.items) {
						const cart = item.data as Cart;
						if (!cart.customerEmail || cart.items.length === 0 || cart.abandonedEmailSent) continue;

						await sendAbandonedCartEmail(ctx, cart).catch((err) =>
							ctx.log.warn("Abandoned cart email failed", err),
						);

						cart.abandonedEmailSent = true;
						await ctx.storage.carts!.put(item.id, cart);
						sent++;
					}

					if (sent > 0) ctx.log.info(`Sent ${sent} abandoned cart emails`);
				}
			},
		},
	},

	routes: {
		// ══════════════════════════════════════════
		// PUBLIC STOREFRONT
		// ══════════════════════════════════════════

		"storefront/products": {
			public: true,
			input: z.object({
				category: z.string().optional(),
				search: z.string().optional(),
				limit: z.coerce.number().min(1).max(50).default(20),
				cursor: z.string().optional(),
			}),
			handler: async (routeCtx: { input: { category?: string; search?: string; limit: number; cursor?: string } }, ctx: PluginContext) => {
				const { category, search, limit, cursor } = routeCtx.input;
				const where: Record<string, unknown> = { status: "active" };
				if (category) where.categoryId = category;

				const result = await ctx.storage.products!.query({ where, orderBy: { createdAt: "desc" }, limit: search ? 100 : limit, cursor: search ? undefined : cursor });

				let items = result.items.map((i: { id: string; data: unknown }) => {
					const p = i.data as Product;

					// Calculate price range for variable products
					const variantPrices = p.variants.filter((v) => v.price !== undefined).map((v) => v.price!);
					const allPrices = [p.price, ...variantPrices];
					const minPrice = Math.min(...allPrices);
					const maxPrice = Math.max(...allPrices);
					const hasVariablePrice = minPrice !== maxPrice;

					const stock = getStockStatus(p);

					return {
						id: i.id, name: p.name, slug: p.slug, description: p.description,
						shortDescription: p.shortDescription, price: p.price,
						compareAtPrice: p.compareAtPrice, images: p.images,
						variants: p.variants, categoryId: p.categoryId,
						inventory: p.inventory, type: p.type,
						seoTitle: p.seoTitle, seoDescription: p.seoDescription,
						priceRange: hasVariablePrice ? { min: minPrice, max: maxPrice } : null,
						stockStatus: stock.status,
						stockDisplay: stock.display,
						backordersAllowed: p.backordersAllowed,
					};
				});

				// Client-side search filter (storage doesn't support full-text search)
				if (search) {
					const q = search.toLowerCase();
					items = items.filter((p: { name: string; description: string; shortDescription?: string }) =>
						p.name.toLowerCase().includes(q) ||
						p.description.toLowerCase().includes(q) ||
						(p.shortDescription?.toLowerCase().includes(q) ?? false)
					).slice(0, limit);
				}

				return {
					items,
					cursor: search ? undefined : result.cursor,
					hasMore: search ? false : result.hasMore,
				};
			},
		},

		"storefront/product": {
			public: true,
			input: z.object({ slug: z.string().min(1) }),
			handler: async (routeCtx: { input: { slug: string } }, ctx: PluginContext) => {
				const result = await ctx.storage.products!.query({ where: { slug: routeCtx.input.slug, status: "active" }, limit: 1 });
				if (result.items.length === 0) throw404("Product not found");
				const item = result.items[0]!;
				const p = item.data as Product;
				return { id: item.id, ...p };
			},
		},

		"storefront/categories": {
			public: true,
			handler: async (_routeCtx: unknown, ctx: PluginContext) => {
				const result = await ctx.storage.categories!.query({ orderBy: { sortOrder: "asc" }, limit: 100 });
				return { items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as Category) })) };
			},
		},

		// ── Cart ──

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
					subtotal, discountCode: cart.discountCode,
					discountAmount: cart.discountAmount ?? 0, currency,
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
					if (variant.inventory !== -1 && variant.inventory < quantity && !productData.backordersAllowed) {
						throw400(variant.inventory === 0 ? `${resolvedName} is out of stock` : `Only ${variant.inventory} left in stock`);
					}
				} else if (productData.inventory !== -1 && productData.inventory < quantity && !productData.backordersAllowed) {
					throw400(productData.inventory === 0 ? `${productData.name} is out of stock` : `Only ${productData.inventory} left in stock`);
				}

				const cart = await getCart(ctx, sessionId);
				const existing = cart.items.find((i) => i.productId === productId && i.variantId === variantId);

				if (existing) {
					existing.quantity += quantity;
				} else {
					cart.items.push({
						productId, variantId, name: resolvedName, price: resolvedPrice,
						quantity, image: productData.images[0], type: productData.type,
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
					cart.items = cart.items.filter((i) => !(i.productId === productId && i.variantId === variantId));
				} else {
					const item = cart.items.find((i) => i.productId === productId && i.variantId === variantId);
					if (item) item.quantity = quantity;
				}

				await saveCart(ctx, cart);
				return { success: true, itemCount: cart.items.reduce((s, i) => s + i.quantity, 0) };
			},
		},

		"storefront/cart/email": {
			public: true,
			input: cartEmailSchema,
			handler: async (routeCtx: { input: z.infer<typeof cartEmailSchema> }, ctx: PluginContext) => {
				const cart = await getCart(ctx, routeCtx.input.sessionId);
				cart.customerEmail = routeCtx.input.email;
				await saveCart(ctx, cart);
				return { success: true };
			},
		},

		"storefront/cart/discount": {
			public: true,
			input: cartDiscountSchema,
			handler: async (routeCtx: { input: z.infer<typeof cartDiscountSchema> }, ctx: PluginContext) => {
				const { sessionId, code } = routeCtx.input;
				const cart = await getCart(ctx, sessionId);
				const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
				const result = await resolveDiscount(ctx, code, subtotal, cart.items);
				if (!result.valid) return { success: false, error: result.error };

				cart.discountCode = code.toUpperCase();
				cart.discountAmount = result.amount;
				await saveCart(ctx, cart);
				return { success: true, discountAmount: result.amount, freeShipping: result.freeShipping };
			},
		},

		// ── Checkout ──

		"storefront/checkout": {
			public: true,
			input: checkoutSchema,
			handler: async (routeCtx: { input: z.infer<typeof checkoutSchema> }, ctx: PluginContext) => {
				const { sessionId, customerEmail, customerName, shippingAddress, billingAddress } = routeCtx.input;
				if (isRateLimited(`checkout:${customerEmail}`)) throw400("Too many checkout attempts. Try again shortly.");

				const cart = await getCart(ctx, sessionId);
				if (cart.items.length === 0) throw400("Cart is empty");

				const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";

				const hasPhysical = cart.items.some((i) => i.type === "physical");
				const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
				const discount = cart.discountAmount ?? 0;
				const afterDiscount = Math.max(0, subtotal - discount);

				// Calculate total weight for weight-based shipping
				let totalWeight = 0;
				for (const item of cart.items) {
					if (item.type === "physical") {
						const prod = (await ctx.storage.products!.get(item.productId)) as Product | null;
						totalWeight += (prod?.weight ?? 0) * item.quantity;
					}
				}

				// Resolve discount for free shipping check
				let discountResult = null;
				if (cart.discountCode) {
					discountResult = await resolveDiscount(ctx, cart.discountCode, subtotal);
				}
				const freeShippingFromDiscount = discountResult?.freeShipping ?? false;

				// Calculate shipping using zones
				const shippingResult = await calculateShipping(ctx, shippingAddress.country, afterDiscount, totalWeight, hasPhysical, freeShippingFromDiscount);
				const shipping = shippingResult.cost;

				// Calculate tax using rules
				const taxResult = await calculateTax(ctx, shippingAddress.country, shippingAddress.state, afterDiscount, shipping);
				const tax = taxResult.amount;

				const total = afterDiscount + shipping + tax;

				// Verify inventory
				for (const item of cart.items) {
					const product = (await ctx.storage.products!.get(item.productId)) as Product | null;
					if (!product || product.status !== "active") throw400(`${item.name} is no longer available`);
					if (!product.backordersAllowed) {
						if (item.variantId) {
							const variant = product.variants.find((v) => v.id === item.variantId);
							if (variant && variant.inventory !== -1 && variant.inventory < item.quantity) throw400(`Not enough stock for ${item.name}`);
						} else if (product.inventory !== -1 && product.inventory < item.quantity) {
							throw400(`Not enough stock for ${item.name}`);
						}
					}
				}

				// Create Stripe session
				const siteUrl = (await ctx.kv.get<string>("settings:siteUrl")) ?? "";
				const tier = await getTier(ctx);
				let checkoutUrl: string;
				let stripeSessionId: string;

				if (tier === "pro_connect") {
					// Stripe Connect via platform (Pro Connect tier)
					const platformResult = await platformCheckout(ctx, {
						currency,
						successUrl: `${siteUrl}/order/success?session_id={CHECKOUT_SESSION_ID}`,
						cancelUrl: `${siteUrl}/cart`,
						customerEmail,
						lineItems: [
							...cart.items.map((item) => ({
								name: item.name,
								unitAmount: item.price,
								quantity: item.quantity,
							})),
							...(shipping > 0 ? [{ name: "Shipping", unitAmount: shipping, quantity: 1 }] : []),
							...(tax > 0 ? [{ name: "Tax", unitAmount: tax, quantity: 1 }] : []),
						],
					});
					checkoutUrl = platformResult.url as string;
					stripeSessionId = platformResult.sessionId as string;
				} else {
					// Direct Stripe — own keys (Free and Pro tiers)
					const stripeParams: Record<string, string> = {
						"mode": "payment",
						"customer_email": customerEmail,
						"success_url": `${siteUrl}/order/success?session_id={CHECKOUT_SESSION_ID}`,
						"cancel_url": `${siteUrl}/cart`,
					};

					const allItems = [
						...cart.items.map((item) => ({ name: item.name, price: item.price, qty: item.quantity })),
						...(shipping > 0 ? [{ name: "Shipping", price: shipping, qty: 1 }] : []),
						...(tax > 0 ? [{ name: "Tax", price: tax, qty: 1 }] : []),
					];

					allItems.forEach((item, i) => {
						stripeParams[`line_items[${i}][price_data][currency]`] = currency;
						stripeParams[`line_items[${i}][price_data][unit_amount]`] = String(item.price);
						stripeParams[`line_items[${i}][price_data][product_data][name]`] = item.name;
						stripeParams[`line_items[${i}][quantity]`] = String(item.qty);
					});

					const stripeSession = await stripeRequest(ctx, "checkout/sessions", stripeParams);
					checkoutUrl = stripeSession.url as string;
					stripeSessionId = stripeSession.id as string;
				}

				// Create pending order
				const orderId = genId();
				const orderNumber = genOrderNumber();
				const order: Order = {
					orderNumber, status: "pending", customerEmail, customerName,
					shippingAddress, billingAddress,
					items: cart.items.map((i) => ({
						productId: i.productId, variantId: i.variantId,
						name: i.name, price: i.price, quantity: i.quantity, type: i.type,
					})),
					subtotal, discount, shipping, tax, total, currency,
					stripeSessionId, discountCode: cart.discountCode,
					customerEmailsSent: [], createdAt: now(), updatedAt: now(),
				};

				await ctx.storage.orders!.put(orderId, order);
				await addOrderNote(ctx, orderId, "system", `Order created — redirected to Stripe checkout`).catch(() => {});
				return { success: true, orderId, orderNumber, checkoutUrl, total, currency };
			},
		},

		// ── Stripe Webhook ──

		"storefront/webhook/stripe": {
			public: true,
			handler: async (routeCtx: { input: unknown }, ctx: PluginContext) => {
				const payload = routeCtx.input as Record<string, unknown>;
				const type = payload.type as string;

				if (type === "checkout.session.completed") {
					const session = (payload.data as Record<string, unknown>).object as Record<string, unknown>;
					const stripeSessionId = session.id as string;
					const paymentIntent = session.payment_intent as string;

					// Find matching pending order
					const pending = await ctx.storage.orders!.query({ where: { status: "pending" }, limit: 200 });
					let orderId: string | undefined;
					let order: Order | undefined;

					for (const item of pending.items) {
						const o = item.data as Order;
						if (o.stripeSessionId === stripeSessionId) {
							orderId = item.id;
							order = o;
							break;
						}
					}

					if (orderId && order) {
						order.status = "paid";
						order.stripePaymentId = paymentIntent;
						await addOrderNote(ctx, orderId, "system", `Payment confirmed (${paymentIntent})`).catch(() => {});
						order.updatedAt = now();

						// Decrement inventory
						for (const item of order.items) {
							const product = (await ctx.storage.products!.get(item.productId)) as Product | null;
							if (!product) continue;
							if (item.variantId) {
								const variant = product.variants.find((v) => v.id === item.variantId);
								if (variant && variant.inventory !== -1) variant.inventory = Math.max(0, variant.inventory - item.quantity);
							} else if (product.inventory !== -1) {
								product.inventory = Math.max(0, product.inventory - item.quantity);
							}
							product.updatedAt = now();
							await ctx.storage.products!.put(item.productId, product);
						}

						// Discount usage
						if (order.discountCode) {
							const discResult = await ctx.storage.discounts!.query({ where: { code: order.discountCode }, limit: 1 });
							if (discResult.items.length > 0) {
								const d = discResult.items[0]!;
								const disc = d.data as Discount;
								disc.usedCount += 1;
								await ctx.storage.discounts!.put(d.id, disc);
							}
						}

						// Upsert customer
						const custResult = await ctx.storage.customers!.query({ where: { email: order.customerEmail }, limit: 1 });
						if (custResult.items.length > 0) {
							const c = custResult.items[0]!;
							const cust = c.data as Customer;
							cust.orderCount += 1;
							cust.totalSpent += order.total;
							cust.lastOrderAt = now();
							await ctx.storage.customers!.put(c.id, cust);
						} else {
							await ctx.storage.customers!.put(genId(), {
								email: order.customerEmail, name: order.customerName,
								orderCount: 1, totalSpent: order.total, lastOrderAt: now(), createdAt: now(),
							});

							// Track new customer in analytics
							const todayEntry = (await ctx.storage.analytics!.get(today())) as AnalyticsEntry | null;
							if (todayEntry) {
								todayEntry.newCustomers += 1;
								await ctx.storage.analytics!.put(today(), todayEntry);
							}
						}

						// Generate license keys for digital products
						const generatedLicenses: License[] = [];
						for (const item of order.items) {
							if (item.type === "digital") {
								const license: License = {
									key: genLicenseKey(),
									orderId: orderId!,
									orderNumber: order.orderNumber,
									productId: item.productId,
									productName: item.name,
									customerEmail: order.customerEmail,
									customerName: order.customerName,
									status: "active",
									createdAt: now(),
								};
								await ctx.storage.licenses!.put(genId(), license);
								generatedLicenses.push(license);
							}
						}

						// Create digital download tokens (Pro)
						const digitalItems = order.items.filter((i) => i.type === "digital");
						const downloads: Download[] = [];
						if (digitalItems.length > 0 && await isPro(ctx)) {
							for (const item of digitalItems) {
								const product = (await ctx.storage.products!.get(item.productId)) as Product | null;
								if (!product?.downloadUrl) continue;

								const dl: Download = {
									orderId: orderId!, productId: item.productId,
									customerEmail: order.customerEmail,
									token: genDownloadToken(),
									fileName: product.name,
									downloadUrl: product.downloadUrl,
									downloadCount: 0,
									downloadLimit: product.downloadLimit ?? 5,
									expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
									createdAt: now(),
								};
								await ctx.storage.downloads!.put(genId(), dl);
								downloads.push(dl);
							}
						}

						// Record analytics
						await recordSale(ctx, order);

						// Save order
						await ctx.storage.orders!.put(orderId, order);

						// Increment order count
						const count = (await ctx.kv.get<number>("state:orderCount")) ?? 0;
						await ctx.kv.set("state:orderCount", count + 1);

						// Send emails (fire-and-forget)
						notifyAdmin(ctx, order).catch((e) => ctx.log.warn("Admin email failed", e));
						sendOrderConfirmation(ctx, order).catch((e) => ctx.log.warn("Order confirmation email failed", e));
						if (generatedLicenses.length > 0) {
							sendLicenseEmail(ctx, order, generatedLicenses).catch((e) => ctx.log.warn("License email failed", e));
						}
						if (downloads.length > 0) {
							sendDigitalDownloadEmail(ctx, order, downloads).catch((e) => ctx.log.warn("Download email failed", e));
						}

						ctx.log.info(`Order ${order.orderNumber} paid — ${formatCents(order.total, order.currency)}`);
					}
				}

				return { received: true };
			},
		},

		// ── Digital Downloads (Pro) ──

		download: {
			public: true,
			input: z.object({ token: z.string().min(1) }),
			handler: async (routeCtx: { input: { token: string } }, ctx: PluginContext) => {
				const result = await ctx.storage.downloads!.query({ where: { token: routeCtx.input.token }, limit: 1 });
				if (result.items.length === 0) throw404("Download not found");

				const dl = result.items[0]!.data as Download;
				if (new Date(dl.expiresAt) < new Date()) throw400("Download link has expired");
				if (dl.downloadCount >= dl.downloadLimit) throw400("Download limit reached");

				// Increment count
				dl.downloadCount += 1;
				await ctx.storage.downloads!.put(result.items[0]!.id, dl);

				// Redirect to the actual file
				throw new Response(null, {
					status: 302,
					headers: { "Location": dl.downloadUrl },
				});
			},
		},

		// ── Order Lookup ──

		"storefront/order": {
			public: true,
			input: z.object({ orderNumber: z.string().min(1), email: z.string().email() }),
			handler: async (routeCtx: { input: { orderNumber: string; email: string } }, ctx: PluginContext) => {
				const result = await ctx.storage.orders!.query({ where: { customerEmail: routeCtx.input.email }, limit: 100 });
				const match = result.items.find((i: { data: unknown }) => (i.data as Order).orderNumber === routeCtx.input.orderNumber);
				if (!match) throw404("Order not found");
				const order = match.data as Order;
				return {
					orderNumber: order.orderNumber, status: order.status, items: order.items,
					subtotal: order.subtotal, discount: order.discount, shipping: order.shipping,
					tax: order.tax, total: order.total, currency: order.currency,
					trackingNumber: order.trackingNumber, trackingUrl: order.trackingUrl,
					createdAt: order.createdAt,
				};
			},
		},

		// ══════════════════════════════════════════
		// ADMIN API
		// ══════════════════════════════════════════

		"products/list": {
			input: listSchema,
			handler: async (routeCtx: { input: z.infer<typeof listSchema> }, ctx: PluginContext) => {
				const { limit, cursor, status } = routeCtx.input;
				const where = status ? { status } : undefined;
				const result = await ctx.storage.products!.query({ where, orderBy: { createdAt: "desc" }, limit, cursor });
				return { items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as Product) })), cursor: result.cursor, hasMore: result.hasMore };
			},
		},

		"products/create": {
			input: productCreateSchema,
			handler: async (routeCtx: { input: z.infer<typeof productCreateSchema> }, ctx: PluginContext) => {
				const existing = await ctx.storage.products!.query({ where: { slug: routeCtx.input.slug }, limit: 1 });
				if (existing.items.length > 0) throw400("A product with this slug already exists");
				const id = genId();
				const product: Product = { ...routeCtx.input, createdAt: now(), updatedAt: now() };
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
				if (updates.type === "digital" && updates.downloadUrl) {
					const pro = await isPro(ctx);
					requirePro(pro, "Digital product downloads");
				}
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

		// ── WooCommerce Import (Pro) ──

		"products/import-woo": {
			input: wooImportSchema,
			handler: async (routeCtx: { input: z.infer<typeof wooImportSchema> }, ctx: PluginContext) => {
				const pro = await isPro(ctx);
				requirePro(pro, "WooCommerce import");

				const results = { imported: 0, skipped: 0, errors: [] as string[] };

				for (const wooProduct of routeCtx.input.products) {
					try {
						const slug = slugify(wooProduct.name);
						const existing = await ctx.storage.products!.query({ where: { slug }, limit: 1 });
						if (existing.items.length > 0) {
							results.skipped++;
							continue;
						}

						const regularPrice = Math.round(parseFloat(wooProduct.regular_price ?? "0") * 100);
						const salePrice = wooProduct.sale_price ? Math.round(parseFloat(wooProduct.sale_price) * 100) : undefined;

						const product: Product = {
							name: wooProduct.name,
							slug,
							description: wooProduct.description ?? "",
							shortDescription: wooProduct.short_description,
							price: salePrice ?? regularPrice,
							compareAtPrice: salePrice ? regularPrice : undefined,
							status: "draft", // import as draft so admin can review
							type: wooProduct.type === "virtual" || wooProduct.type === "downloadable" ? "digital" : "physical",
							images: wooProduct.images ? wooProduct.images.split(",").map((s: string) => s.trim()) : [],
							variants: [],
							sku: wooProduct.sku,
							inventory: wooProduct.stock_quantity ?? -1,
							createdAt: now(),
							updatedAt: now(),
						};

						await ctx.storage.products!.put(genId(), product);
						results.imported++;
					} catch (err) {
						results.errors.push(`Failed to import "${wooProduct.name}": ${err}`);
					}
				}

				return results;
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
				return { items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as Order) })), cursor: result.cursor, hasMore: result.hasMore };
			},
		},

		"orders/get": {
			input: idSchema,
			handler: async (routeCtx: { input: { id: string } }, ctx: PluginContext) => {
				const order = (await ctx.storage.orders!.get(routeCtx.input.id)) as Order | null;
				if (!order) throw404("Order not found");

				// Include timeline
				const notesResult = await ctx.storage.orderNotes!.query({
					where: { orderId: routeCtx.input.id },
					orderBy: { createdAt: "desc" },
					limit: 50,
				});

				return {
					id: routeCtx.input.id,
					...order,
					timeline: notesResult.items.map((n: { id: string; data: unknown }) => ({
						id: n.id, ...(n.data as OrderNote),
					})),
				};
			},
		},

		"orders/update": {
			input: orderUpdateSchema,
			handler: async (routeCtx: { input: z.infer<typeof orderUpdateSchema> }, ctx: PluginContext) => {
				const { id, ...updates } = routeCtx.input;
				const existing = (await ctx.storage.orders!.get(id)) as Order | null;
				if (!existing) throw404("Order not found");

				const updated = { ...existing, ...updates, updatedAt: now() };

				// Send shipping email if status changed to shipped
				if (updates.status === "shipped" && existing.status !== "shipped") {
					updated.customerEmailsSent = [...(existing.customerEmailsSent || []), "shipping"];
					sendShippingConfirmation(ctx, updated).catch((e) => ctx.log.warn("Shipping email failed", e));
				}

				await ctx.storage.orders!.put(id, updated);
				return { success: true, order: { id, ...updated } };
			},
		},

		"orders/refund": {
			input: z.object({ id: z.string().min(1), reason: z.string().max(500).optional() }),
			handler: async (routeCtx: { input: { id: string; reason?: string } }, ctx: PluginContext) => {
				const order = (await ctx.storage.orders!.get(routeCtx.input.id)) as Order | null;
				if (!order) throw404("Order not found");
				if (!order.stripePaymentId) throw400("No payment to refund");
				if (order.status === "refunded") throw400("Order already refunded");

				// Create Stripe refund
				const params: Record<string, string> = { payment_intent: order.stripePaymentId };
				if (routeCtx.input.reason) params.reason = "requested_by_customer";

				try {
					await stripeRequest(ctx, "refunds", params);
				} catch (e) {
					throw400(`Stripe refund failed: ${e instanceof Error ? e.message : "Unknown error"}`);
				}

				order.status = "refunded";
				order.notes = (order.notes ? order.notes + "\n" : "") + `Refunded${routeCtx.input.reason ? ": " + routeCtx.input.reason : ""}`;
				order.updatedAt = now();
				await ctx.storage.orders!.put(routeCtx.input.id, order);

				// Restore inventory and notify waitlist
				for (const item of order.items) {
					const product = (await ctx.storage.products!.get(item.productId)) as Product | null;
					if (!product) continue;
					const wasOutOfStock = product.inventory === 0;
					if (item.variantId) {
						const variant = product.variants.find((v) => v.id === item.variantId);
						if (variant && variant.inventory !== -1) variant.inventory += item.quantity;
					} else if (product.inventory !== -1) {
						product.inventory += item.quantity;
					}
					product.updatedAt = now();
					await ctx.storage.products!.put(item.productId, product);
					if (wasOutOfStock && product.inventory > 0) {
						sendStockNotifications(ctx, item.productId, product.name).catch(() => {});
					}
				}

				await addOrderNote(ctx, routeCtx.input.id, "system", `Refunded via Stripe${routeCtx.input.reason ? ": " + routeCtx.input.reason : ""}`).catch(() => {});
				return { success: true, message: "Order refunded" };
			},
		},

		"orders/notes": {
			input: z.object({ orderId: z.string().min(1), limit: z.coerce.number().default(50) }),
			handler: async (routeCtx: { input: { orderId: string; limit: number } }, ctx: PluginContext) => {
				const result = await ctx.storage.orderNotes!.query({
					where: { orderId: routeCtx.input.orderId },
					orderBy: { createdAt: "desc" },
					limit: routeCtx.input.limit,
				});
				return { items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as OrderNote) })) };
			},
		},

		"orders/notes/add": {
			input: z.object({
				orderId: z.string().min(1),
				message: z.string().min(1).max(2000),
				type: z.enum(["admin", "customer_visible"]).default("admin"),
			}),
			handler: async (routeCtx: { input: { orderId: string; message: string; type: string } }, ctx: PluginContext) => {
				const order = (await ctx.storage.orders!.get(routeCtx.input.orderId)) as Order | null;
				if (!order) throw404("Order not found");
				await addOrderNote(ctx, routeCtx.input.orderId, routeCtx.input.type as OrderNote["type"], routeCtx.input.message, "admin");
				return { success: true };
			},
		},

		"orders/delete": {
			input: idSchema,
			handler: async (routeCtx: { input: { id: string } }, ctx: PluginContext) => {
				await ctx.storage.orders!.delete(routeCtx.input.id);
				return { success: true };
			},
		},

		// ── Customers ──

		"customers/list": {
			input: listSchema,
			handler: async (routeCtx: { input: z.infer<typeof listSchema> }, ctx: PluginContext) => {
				const result = await ctx.storage.customers!.query({ orderBy: { createdAt: "desc" }, limit: routeCtx.input.limit, cursor: routeCtx.input.cursor });
				return { items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as Customer) })), cursor: result.cursor, hasMore: result.hasMore };
			},
		},

		// ── Discounts ──

		"discounts/list": {
			input: listSchema,
			handler: async (routeCtx: { input: z.infer<typeof listSchema> }, ctx: PluginContext) => {
				const result = await ctx.storage.discounts!.query({ limit: routeCtx.input.limit, cursor: routeCtx.input.cursor });
				return { items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as Discount) })), cursor: result.cursor, hasMore: result.hasMore };
			},
		},

		"discounts/create": {
			input: discountCreateSchema,
			handler: async (routeCtx: { input: z.infer<typeof discountCreateSchema> }, ctx: PluginContext) => {
				const existing = await ctx.storage.discounts!.query({ where: { code: routeCtx.input.code }, limit: 1 });
				if (existing.items.length > 0) throw400("This discount code already exists");
				const id = genId();
				await ctx.storage.discounts!.put(id, { ...routeCtx.input, usedCount: 0, status: "active" as const, createdAt: now() });
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

		// ── Shipping Zones ──

		"shipping/list": {
			handler: async (_routeCtx: unknown, ctx: PluginContext) => {
				const result = await ctx.storage.shippingZones!.query({ orderBy: { sortOrder: "asc" }, limit: 50 });
				return { items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as ShippingZone) })) };
			},
		},

		"shipping/create": {
			input: z.object({
				name: z.string().min(1).max(100),
				countries: z.array(z.string().min(2).max(2)).min(1),
				methods: z.array(z.object({
					id: z.string(),
					type: z.enum(["flat_rate", "free_shipping", "weight_based", "price_based"]),
					name: z.string(),
					cost: z.number().min(0),
					minOrderAmount: z.number().min(0).optional(),
					minWeight: z.number().min(0).optional(),
					maxWeight: z.number().min(0).optional(),
					enabled: z.boolean().default(true),
				})),
				sortOrder: z.number().int().default(0),
			}),
			handler: async (routeCtx: { input: any }, ctx: PluginContext) => {
				const id = genId();
				await ctx.storage.shippingZones!.put(id, { ...routeCtx.input, createdAt: now() });
				return { success: true, id };
			},
		},

		"shipping/delete": {
			input: idSchema,
			handler: async (routeCtx: { input: { id: string } }, ctx: PluginContext) => {
				await ctx.storage.shippingZones!.delete(routeCtx.input.id);
				return { success: true };
			},
		},

		// ── Shipping Estimate (public) ──

		// ── Stock Notifications ──

		"storefront/notify-restock": {
			public: true,
			input: z.object({
				productId: z.string().min(1),
				email: z.string().email(),
			}),
			handler: async (routeCtx: { input: { productId: string; email: string } }, ctx: PluginContext) => {
				if (isRateLimited(`restock:${routeCtx.input.email}`, 5)) throw400("Too many requests");

				const product = (await ctx.storage.products!.get(routeCtx.input.productId)) as Product | null;
				if (!product) throw404("Product not found");

				// Check if already registered
				const existing = await ctx.storage.stockNotifications!.query({
					where: { productId: routeCtx.input.productId, email: routeCtx.input.email },
					limit: 1,
				});
				if (existing.items.length > 0) {
					return { success: true, message: "You're already on the notification list." };
				}

				await ctx.storage.stockNotifications!.put(genId(), {
					productId: routeCtx.input.productId,
					productName: product.name,
					email: routeCtx.input.email,
					notified: false,
					createdAt: now(),
				});

				return { success: true, message: "We'll email you when this product is back in stock." };
			},
		},

		// ── Stock Status (public) ──

		"storefront/stock": {
			public: true,
			input: z.object({ productId: z.string().min(1) }),
			handler: async (routeCtx: { input: { productId: string } }, ctx: PluginContext) => {
				const product = (await ctx.storage.products!.get(routeCtx.input.productId)) as Product | null;
				if (!product) throw404("Product not found");

				const stock = getStockStatus(product);
				return {
					...stock,
					inventory: product.inventory === -1 ? null : product.inventory,
					backordersAllowed: product.backordersAllowed,
					variants: product.variants.map((v) => ({
						id: v.id,
						name: v.name,
						inventory: v.inventory === -1 ? null : v.inventory,
						status: v.inventory === -1 ? "unlimited" : v.inventory === 0 ? (product.backordersAllowed ? "on_backorder" : "out_of_stock") : v.inventory <= (product.lowStockThreshold ?? 5) ? "low_stock" : "in_stock",
					})),
				};
			},
		},

		"storefront/shipping-estimate": {
			public: true,
			input: z.object({
				sessionId: z.string().min(1),
				country: z.string().min(2).max(2),
			}),
			handler: async (routeCtx: { input: { sessionId: string; country: string } }, ctx: PluginContext) => {
				const cart = await getCart(ctx, routeCtx.input.sessionId);
				if (cart.items.length === 0) return { shipping: 0, methodName: "Free" };

				const hasPhysical = cart.items.some((i) => i.type === "physical");
				const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
				let totalWeight = 0;
				for (const item of cart.items) {
					if (item.type === "physical") {
						const prod = (await ctx.storage.products!.get(item.productId)) as Product | null;
						totalWeight += (prod?.weight ?? 0) * item.quantity;
					}
				}

				const result = await calculateShipping(ctx, routeCtx.input.country, subtotal, totalWeight, hasPhysical, false);
				const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
				return { shipping: result.cost, methodName: result.methodName, formatted: formatCents(result.cost, currency) };
			},
		},

		// ── Tax Rules ──

		"tax/list": {
			handler: async (_routeCtx: unknown, ctx: PluginContext) => {
				const result = await ctx.storage.taxRules!.query({ limit: 100 });
				return { items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as TaxRule) })) };
			},
		},

		"tax/create": {
			input: z.object({
				country: z.string().min(1).max(2),
				state: z.string().max(10).default("*"),
				rate: z.number().min(0).max(100),
				name: z.string().min(1).max(100),
				compound: z.boolean().default(false),
				shipping: z.boolean().default(false),
			}),
			handler: async (routeCtx: { input: any }, ctx: PluginContext) => {
				const id = genId();
				await ctx.storage.taxRules!.put(id, { ...routeCtx.input, createdAt: now() });
				return { success: true, id };
			},
		},

		"tax/delete": {
			input: idSchema,
			handler: async (routeCtx: { input: { id: string } }, ctx: PluginContext) => {
				await ctx.storage.taxRules!.delete(routeCtx.input.id);
				return { success: true };
			},
		},

		// ── Product Reviews ──

		"storefront/reviews": {
			public: true,
			input: z.object({ productId: z.string().min(1), limit: z.coerce.number().min(1).max(50).default(20) }),
			handler: async (routeCtx: { input: { productId: string; limit: number } }, ctx: PluginContext) => {
				const result = await ctx.storage.reviews!.query({
					where: { productId: routeCtx.input.productId, status: "approved" },
					orderBy: { createdAt: "desc" },
					limit: routeCtx.input.limit,
				});
				return {
					items: result.items.map((i: { id: string; data: unknown }) => {
						const r = i.data as Review;
						return { id: i.id, rating: r.rating, title: r.title, body: r.body, customerName: r.customerName, verified: r.verified, createdAt: r.createdAt };
					}),
				};
			},
		},

		"storefront/reviews/submit": {
			public: true,
			input: z.object({
				productId: z.string().min(1),
				customerEmail: z.string().email(),
				customerName: z.string().min(1).max(100),
				rating: z.number().int().min(1).max(5),
				title: z.string().min(1).max(200),
				body: z.string().min(1).max(5000),
			}),
			handler: async (routeCtx: { input: any }, ctx: PluginContext) => {
				if (isRateLimited(`review:${routeCtx.input.customerEmail}`, 3)) throw400("Too many reviews. Try again later.");

				// Check if they purchased the product
				const orders = await ctx.storage.orders!.query({ where: { customerEmail: routeCtx.input.customerEmail }, limit: 100 });
				const verified = orders.items.some((o: { data: unknown }) => {
					const order = o.data as Order;
					return order.status !== "pending" && order.items.some((i) => i.productId === routeCtx.input.productId);
				});

				const product = (await ctx.storage.products!.get(routeCtx.input.productId)) as Product | null;

				const id = genId();
				await ctx.storage.reviews!.put(id, {
					...routeCtx.input,
					productName: product?.name ?? "Unknown",
					status: "pending",
					verified,
					createdAt: now(),
				});

				return { success: true, id, message: "Review submitted for approval." };
			},
		},

		"reviews/list": {
			input: z.object({ status: z.string().optional(), limit: z.coerce.number().min(1).max(100).default(50) }),
			handler: async (routeCtx: { input: { status?: string; limit: number } }, ctx: PluginContext) => {
				const where = routeCtx.input.status ? { status: routeCtx.input.status } : undefined;
				const result = await ctx.storage.reviews!.query({ where, orderBy: { createdAt: "desc" }, limit: routeCtx.input.limit });
				return { items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as Review) })) };
			},
		},

		"reviews/approve": {
			input: idSchema,
			handler: async (routeCtx: { input: { id: string } }, ctx: PluginContext) => {
				const review = (await ctx.storage.reviews!.get(routeCtx.input.id)) as Review | null;
				if (!review) throw404("Review not found");
				review.status = "approved";
				await ctx.storage.reviews!.put(routeCtx.input.id, review);
				return { success: true };
			},
		},

		"reviews/reject": {
			input: idSchema,
			handler: async (routeCtx: { input: { id: string } }, ctx: PluginContext) => {
				const review = (await ctx.storage.reviews!.get(routeCtx.input.id)) as Review | null;
				if (!review) throw404("Review not found");
				review.status = "rejected";
				await ctx.storage.reviews!.put(routeCtx.input.id, review);
				return { success: true };
			},
		},

		// ── Analytics (Pro) ──

		"analytics/summary": {
			handler: async (_routeCtx: unknown, ctx: PluginContext) => {
				const pro = await isPro(ctx);
				requirePro(pro, "Analytics dashboard");

				const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";

				// Last 30 days
				const entries: AnalyticsEntry[] = [];
				for (let i = 0; i < 30; i++) {
					const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
					const dateStr = d.toISOString().slice(0, 10);
					const entry = (await ctx.storage.analytics!.get(dateStr)) as AnalyticsEntry | null;
					entries.push(entry ?? { date: dateStr, type: "daily_summary", revenue: 0, orderCount: 0, newCustomers: 0, topProducts: [] });
				}

				entries.reverse();

				const totalRevenue = entries.reduce((s, e) => s + e.revenue, 0);
				const totalOrders = entries.reduce((s, e) => s + e.orderCount, 0);
				const totalNewCustomers = entries.reduce((s, e) => s + e.newCustomers, 0);

				// Aggregate top products
				const productMap = new Map<string, { name: string; units: number; revenue: number }>();
				for (const entry of entries) {
					for (const p of entry.topProducts) {
						const existing = productMap.get(p.id);
						if (existing) {
							existing.units += p.units;
							existing.revenue += p.revenue;
						} else {
							productMap.set(p.id, { name: p.name, units: p.units, revenue: p.revenue });
						}
					}
				}
				const topProducts = [...productMap.entries()]
					.map(([id, data]) => ({ id, ...data }))
					.sort((a, b) => b.revenue - a.revenue)
					.slice(0, 10);

				return {
					period: "30d",
					currency,
					totalRevenue,
					totalRevenueFormatted: formatCents(totalRevenue, currency),
					totalOrders,
					totalNewCustomers,
					averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
					dailyData: entries.map((e) => ({
						date: e.date,
						revenue: e.revenue,
						orders: e.orderCount,
					})),
					topProducts,
				};
			},
		},

		// ── Stats ──

		stats: {
			handler: async (_routeCtx: unknown, ctx: PluginContext) => {
				const [totalOrders, paidOrders, processingOrders, activeProducts, totalCustomers] = await Promise.all([
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
				const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";

				return {
					revenue, revenueFormatted: formatCents(revenue, currency), currency,
					orders: { total: totalOrders, paid: paidOrders, processing: processingOrders },
					products: { active: activeProducts },
					customers: totalCustomers,
				};
			},
		},

		// ── Settings ──

		"settings/get": {
			handler: async (_routeCtx: unknown, ctx: PluginContext) => {
				const [currency, taxRate, flatShipping, freeShippingThreshold, orderNotificationEmail, siteUrl, storeName, stripeKey, stripeWebhookSecret, stripeAccount, licenseKey] = await Promise.all([
					ctx.kv.get<string>("settings:currency"),
					ctx.kv.get<number>("settings:taxRate"),
					ctx.kv.get<number>("settings:flatShipping"),
					ctx.kv.get<number>("settings:freeShippingThreshold"),
					ctx.kv.get<string>("settings:orderNotificationEmail"),
					ctx.kv.get<string>("settings:siteUrl"),
					ctx.kv.get<string>("settings:storeName"),
					ctx.kv.get<string>("settings:stripeSecretKey"),
					ctx.kv.get<string>("settings:stripeWebhookSecret"),
					ctx.kv.get<string>("settings:stripeAccountId"),
					ctx.kv.get<string>("settings:licenseKey"),
				]);
				const tier = await getTier(ctx);
				return {
					currency: currency ?? "usd",
					taxRate: taxRate ?? 0,
					flatShipping: flatShipping ?? 0,
					freeShippingThreshold: freeShippingThreshold ?? 0,
					orderNotificationEmail: orderNotificationEmail ?? "",
					siteUrl: siteUrl ?? "",
					storeName: storeName ?? "",
					hasStripeKey: !!stripeKey,
					hasStripeWebhookSecret: !!stripeWebhookSecret,
					hasStripeAccount: !!stripeAccount,
					hasLicenseKey: !!licenseKey,
					tier,
				};
			},
		},

		"settings/update": {
			input: z.object({
				storeName: z.string().optional(),
				siteUrl: z.string().optional(),
				currency: z.string().optional(),
				taxRate: z.number().min(0).max(100).optional(),
				flatShipping: z.number().min(0).optional(),
				freeShippingThreshold: z.number().min(0).optional(),
				orderNotificationEmail: z.string().optional(),
				stripeSecretKey: z.string().optional(),
				stripeWebhookSecret: z.string().optional(),
				licenseKey: z.string().optional(),
			}),
			handler: async (routeCtx: { input: Record<string, unknown> }, ctx: PluginContext) => {
				const values = routeCtx.input;
				const stringFields = ["storeName", "siteUrl", "currency", "orderNotificationEmail"];
				const secretFields = ["licenseKey", "stripeSecretKey", "stripeWebhookSecret"];
				const numberFields = ["taxRate", "flatShipping", "freeShippingThreshold"];

				for (const key of stringFields) {
					if (typeof values[key] === "string") await ctx.kv.set(`settings:${key}`, key === "currency" ? (values[key] as string).toLowerCase() : values[key]);
				}
				for (const key of secretFields) {
					if (typeof values[key] === "string" && values[key] !== "") await ctx.kv.set(`settings:${key}`, values[key]);
				}
				for (const key of numberFields) {
					if (typeof values[key] === "number") await ctx.kv.set(`settings:${key}`, values[key]);
				}

				return { success: true };
			},
		},

		// ── Licenses (admin) ──

		"licenses/list": {
			input: listSchema,
			handler: async (routeCtx: { input: z.infer<typeof listSchema> }, ctx: PluginContext) => {
				const result = await ctx.storage.licenses!.query({ orderBy: { createdAt: "desc" }, limit: routeCtx.input.limit, cursor: routeCtx.input.cursor });
				return { items: result.items.map((i: { id: string; data: unknown }) => ({ id: i.id, ...(i.data as License) })), cursor: result.cursor, hasMore: result.hasMore };
			},
		},

		"licenses/revoke": {
			input: idSchema,
			handler: async (routeCtx: { input: { id: string } }, ctx: PluginContext) => {
				const license = (await ctx.storage.licenses!.get(routeCtx.input.id)) as License | null;
				if (!license) throw404("License not found");
				license.status = "revoked";
				await ctx.storage.licenses!.put(routeCtx.input.id, license);
				return { success: true };
			},
		},

		// ── Orders Clear All ──

		"orders/clear": {
			handler: async (_routeCtx: unknown, ctx: PluginContext) => {
				const result = await ctx.storage.orders!.query({ limit: 1000 });
				for (const item of result.items) {
					await ctx.storage.orders!.delete(item.id);
				}
				return { success: true, deleted: result.items.length };
			},
		},

		// ── License Verification (public) ──

		"storefront/verify-license": {
			public: true,
			input: z.object({ key: z.string().min(1) }),
			handler: async (routeCtx: { input: { key: string } }, ctx: PluginContext) => {
				const result = await ctx.storage.licenses!.query({ where: { key: routeCtx.input.key }, limit: 1 });
				if (result.items.length === 0) return { valid: false, error: "Invalid license key" };

				const license = result.items[0]!.data as License;
				if (license.status !== "active") return { valid: false, error: "License is " + license.status };

				return {
					valid: true,
					product: license.productName,
					customerEmail: license.customerEmail,
					createdAt: license.createdAt,
				};
			},
		},

		// ── Related Products ──

		"storefront/related": {
			public: true,
			input: z.object({ productId: z.string().min(1), limit: z.coerce.number().min(1).max(10).default(4) }),
			handler: async (routeCtx: { input: { productId: string; limit: number } }, ctx: PluginContext) => {
				const product = (await ctx.storage.products!.get(routeCtx.input.productId)) as Product | null;
				if (!product) return { items: [] };

				// Get products in same category, excluding current
				const where: Record<string, unknown> = { status: "active" };
				if (product.categoryId) where.categoryId = product.categoryId;

				const result = await ctx.storage.products!.query({ where, orderBy: { createdAt: "desc" }, limit: routeCtx.input.limit + 1 });
				const related = result.items
					.filter((i: { id: string }) => i.id !== routeCtx.input.productId)
					.slice(0, routeCtx.input.limit)
					.map((i: { id: string; data: unknown }) => {
						const p = i.data as Product;
						return { id: i.id, name: p.name, slug: p.slug, price: p.price, compareAtPrice: p.compareAtPrice, images: p.images, type: p.type };
					});

				return { items: related };
			},
		},

		// ── Customer Order History ──

		"storefront/orders": {
			public: true,
			input: z.object({ email: z.string().email(), limit: z.coerce.number().min(1).max(50).default(20) }),
			handler: async (routeCtx: { input: { email: string; limit: number } }, ctx: PluginContext) => {
				const result = await ctx.storage.orders!.query({
					where: { customerEmail: routeCtx.input.email },
					orderBy: { createdAt: "desc" },
					limit: routeCtx.input.limit,
				});

				return {
					items: result.items.map((i: { data: unknown }) => {
						const o = i.data as Order;
						return {
							orderNumber: o.orderNumber, status: o.status,
							total: o.total, currency: o.currency,
							itemCount: o.items.reduce((s, item) => s + item.quantity, 0),
							createdAt: o.createdAt,
						};
					}),
				};
			},
		},

		// ══════════════════════════════════════════
		// STRIPE CONNECT CALLBACK (Pro)
		// ══════════════════════════════════════════

		"connect/callback": {
			handler: async (routeCtx: { input: unknown }, ctx: PluginContext) => {
				const input = routeCtx.input as { stripeAccountId?: string; token?: string };
				if (!input.stripeAccountId || !input.token) throw400("Missing connection data");

				// Verify token with platform
				const licenseKey = await ctx.kv.get<string>("settings:licenseKey");
				if (!licenseKey || !ctx.http) throw400("Pro license required for Stripe Connect");

				const response = await ctx.http.fetch(`${PLATFORM_API}/connect/verify`, {
					method: "POST",
					headers: { "Content-Type": "application/json", "Authorization": `Bearer ${licenseKey}` },
					body: JSON.stringify({ token: input.token, stripeAccountId: input.stripeAccountId }),
				});

				if (!response.ok) throw400("Failed to verify Stripe connection");

				await ctx.kv.set("settings:stripeAccountId", input.stripeAccountId);
				return { success: true, message: "Stripe account connected" };
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
				if (interaction.type === "page_load" && interaction.page === "widget:revenue-overview") return buildRevenueWidget(ctx);
				if (interaction.type === "page_load" && interaction.page === "widget:recent-orders") return buildRecentOrdersWidget(ctx);

				// Pages
				if (interaction.type === "page_load" && interaction.page === "/") return buildDashboard(ctx);
				if (interaction.type === "page_load" && interaction.page === "/products") return buildProductsPage(ctx);
				if (interaction.type === "page_load" && interaction.page === "/orders") return buildOrdersPage(ctx);
				if (interaction.type === "page_load" && interaction.page === "/customers") return buildCustomersPage(ctx);
				if (interaction.type === "page_load" && interaction.page === "/discounts") return buildDiscountsPage(ctx);
				if (interaction.type === "page_load" && interaction.page === "/shipping") return buildShippingPage(ctx);
				if (interaction.type === "page_load" && interaction.page === "/licenses") return buildLicensesPage(ctx);
				if (interaction.type === "page_load" && interaction.page === "/analytics") return buildAnalyticsPage(ctx);
				if (interaction.type === "page_load" && interaction.page === "/settings") return buildSettingsPage(ctx);

				// Actions
				if (interaction.type === "form_submit" && interaction.action_id === "save_settings") return saveSettings(ctx, interaction.values ?? {});
				if (interaction.type === "form_submit" && interaction.action_id === "create_product") return createProduct(ctx, interaction.values ?? {});
				if (interaction.type === "form_submit" && interaction.action_id === "create_discount") return createDiscount(ctx, interaction.values ?? {});

				// Shipping zone create
				if (interaction.type === "form_submit" && interaction.action_id === "create_shipping_zone") {
					const v = interaction.values ?? {};
					const zoneName = v.zoneName as string;
					const countries = (v.countries as string || "").split(",").map((c: string) => c.trim().toUpperCase()).filter(Boolean);
					const methodType = v.methodType as string;
					const methodCost = Number(v.methodCost) || 0;
					const freeShippingMin = Number(v.freeShippingMin) || 0;

					if (!zoneName || countries.length === 0) {
						return { ...(await buildShippingPage(ctx)), toast: { message: "Name and countries required", type: "error" } };
					}

					await ctx.storage.shippingZones!.put(genId(), {
						name: zoneName,
						countries,
						methods: [{
							id: genId(),
							type: methodType as ShippingMethod["type"],
							name: methodType === "free_shipping" ? "Free Shipping" : methodType === "weight_based" ? "Weight Based" : "Flat Rate",
							cost: methodCost,
							minOrderAmount: freeShippingMin > 0 ? freeShippingMin : undefined,
							enabled: true,
						}],
						sortOrder: 0,
						createdAt: now(),
					});
					return { ...(await buildShippingPage(ctx)), toast: { message: `Zone "${zoneName}" created`, type: "success" } };
				}

				// Tax rule create
				if (interaction.type === "form_submit" && interaction.action_id === "create_tax_rule") {
					const v = interaction.values ?? {};
					const taxName = v.taxName as string;
					const taxCountry = (v.taxCountry as string || "*").toUpperCase();
					const taxState = (v.taxState as string || "*").toUpperCase();
					const taxRate = Number(v.taxRate) || 0;
					const taxOnShipping = v.taxOnShipping === true;

					if (!taxName) return { ...(await buildShippingPage(ctx)), toast: { message: "Tax name required", type: "error" } };

					await ctx.storage.taxRules!.put(genId(), {
						country: taxCountry, state: taxState, rate: taxRate,
						name: taxName, compound: false, shipping: taxOnShipping, createdAt: now(),
					});
					return { ...(await buildShippingPage(ctx)), toast: { message: `Tax rule "${taxName}" created`, type: "success" } };
				}

				// Shipping zone delete
				if (interaction.type === "block_action" && interaction.action_id?.startsWith("shipping_delete:")) {
					const id = interaction.action_id.split(":")[1];
					if (id) await ctx.storage.shippingZones!.delete(id);
					return { ...(await buildShippingPage(ctx)), toast: { message: "Zone deleted", type: "success" } };
				}

				// Tax rule delete
				if (interaction.type === "block_action" && interaction.action_id?.startsWith("tax_delete:")) {
					const id = interaction.action_id.split(":")[1];
					if (id) await ctx.storage.taxRules!.delete(id);
					return { ...(await buildShippingPage(ctx)), toast: { message: "Tax rule deleted", type: "success" } };
				}

				// Back to products list
				if (interaction.type === "block_action" && interaction.action_id === "back_to_products") {
					return buildProductsPage(ctx);
				}

				// Show product edit form
				if (interaction.type === "block_action" && interaction.action_id?.startsWith("product_edit:")) {
					const id = interaction.action_id.split(":")[1];
					if (id) return buildProductEditPage(ctx, id);
					return buildProductsPage(ctx);
				}

				// Save product edit
				if (interaction.type === "form_submit" && interaction.action_id?.startsWith("save_product:")) {
					const id = interaction.action_id.split(":")[1];
					if (id) return saveProduct(ctx, id, interaction.values ?? {});
					return buildProductsPage(ctx);
				}

				// License revoke
				if (interaction.type === "block_action" && interaction.action_id?.startsWith("license_revoke:")) {
					const id = interaction.action_id.split(":")[1];
					if (id) {
						const license = (await ctx.storage.licenses!.get(id)) as License | null;
						if (license) {
							license.status = "revoked";
							await ctx.storage.licenses!.put(id, license);
						}
					}
					return { ...(await buildLicensesPage(ctx)), toast: { message: "License revoked", type: "success" } };
				}

				// Clear all orders
				if (interaction.type === "block_action" && interaction.action_id === "clear_all_orders") {
					const all = await ctx.storage.orders!.query({ limit: 1000 });
					if (all.items.length > 0) {
						await ctx.storage.orders!.deleteMany(all.items.map((i: { id: string }) => i.id));
					}
					return { ...(await buildOrdersPage(ctx)), toast: { message: `Deleted ${all.items.length} orders`, type: "success" } };
				}

				// Order refund
				if (interaction.type === "block_action" && interaction.action_id?.startsWith("order_refund:")) {
					const id = interaction.action_id.split(":")[1];
					if (id) {
						const order = (await ctx.storage.orders!.get(id)) as Order | null;
						if (order && order.stripePaymentId && order.status !== "refunded") {
							try {
								await stripeRequest(ctx, "refunds", { payment_intent: order.stripePaymentId });
								order.status = "refunded";
								order.updatedAt = now();
								await ctx.storage.orders!.put(id, order);

								// Restore inventory
								for (const item of order.items) {
									const product = (await ctx.storage.products!.get(item.productId)) as Product | null;
									if (!product) continue;
									if (item.variantId) {
										const variant = product.variants.find((v) => v.id === item.variantId);
										if (variant && variant.inventory !== -1) variant.inventory += item.quantity;
									} else if (product.inventory !== -1) {
										product.inventory += item.quantity;
									}
									product.updatedAt = now();
									await ctx.storage.products!.put(item.productId, product);
								}

								// Revoke any licenses
								if (ctx.storage.licenses) {
									const lics = await ctx.storage.licenses.query({ where: { orderId: id }, limit: 100 });
									for (const l of lics.items) {
										const lic = l.data as License;
										lic.status = "revoked";
										await ctx.storage.licenses.put(l.id, lic);
									}
								}

								return { ...(await buildOrdersPage(ctx)), toast: { message: `Order ${order.orderNumber} refunded`, type: "success" } };
							} catch (e) {
								return { ...(await buildOrdersPage(ctx)), toast: { message: `Refund failed: ${e instanceof Error ? e.message : "Unknown error"}`, type: "error" } };
							}
						}
					}
					return buildOrdersPage(ctx);
				}

				// Order delete
				if (interaction.type === "block_action" && interaction.action_id?.startsWith("order_delete:")) {
					const id = interaction.action_id.split(":")[1];
					if (id) await ctx.storage.orders!.delete(id);
					return { ...(await buildOrdersPage(ctx)), toast: { message: "Order deleted", type: "success" } };
				}

				// Product delete
				if (interaction.type === "block_action" && interaction.action_id?.startsWith("product_delete:")) {
					const id = interaction.action_id.split(":")[1];
					if (id) {
						await ctx.storage.products!.delete(id);
					}
					return { ...(await buildProductsPage(ctx)), toast: { message: "Product deleted", type: "success" } };
				}

				if (interaction.type === "block_action" && interaction.action_id?.startsWith("order_status:")) {
					const [, id, status] = interaction.action_id.split(":");
					if (id && status) {
						const order = (await ctx.storage.orders!.get(id)) as Order | null;
						if (order) {
							const oldStatus = order.status;
							order.status = status as Order["status"];
							order.updatedAt = now();
							if (status === "shipped" && oldStatus !== "shipped") {
								order.customerEmailsSent = [...(order.customerEmailsSent || []), "shipping"];
								sendShippingConfirmation(ctx, order).catch(() => {});
							}
							await ctx.storage.orders!.put(id, order);
							await addOrderNote(ctx, id, "admin", `Status changed: ${oldStatus} → ${status}`).catch(() => {});
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
		if (!ctx.storage?.orders) return { blocks: [{ type: "context", text: "Store initializing..." }] };
		const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
		const paidResult = await ctx.storage.orders.query({
			where: { status: { in: ["paid", "processing", "shipped", "delivered"] } }, limit: 100,
		});
		const items = paidResult?.items ?? [];
		const revenue = items.reduce((sum: number, i: { data: unknown }) => sum + (i.data as Order).total, 0);
		const orderCount = items.length;
		return {
			blocks: [{
				type: "stats",
				stats: [
					{ label: "Revenue", value: formatCents(revenue, currency) },
					{ label: "Orders", value: String(orderCount) },
					{ label: "Avg Order", value: orderCount > 0 ? formatCents(Math.round(revenue / orderCount), currency) : "$0" },
				],
			}],
		};
	} catch { return { blocks: [{ type: "context", text: "Failed to load revenue data" }] }; }
}

async function buildRecentOrdersWidget(ctx: PluginContext) {
	try {
		if (!ctx.storage?.orders) return { blocks: [{ type: "context", text: "Store initializing..." }] };
		const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
		const result = await ctx.storage.orders.query({ orderBy: { createdAt: "desc" }, limit: 5 });
		const items = result?.items ?? [];
		if (items.length === 0) return { blocks: [{ type: "context", text: "No orders yet" }] };
		return {
			blocks: [{
				type: "table",
				columns: [
					{ key: "order", label: "Order" }, { key: "customer", label: "Customer" },
					{ key: "total", label: "Total" }, { key: "status", label: "Status", format: "badge" },
				],
				rows: items.map((i: { data: unknown }) => {
					const o = i.data as Order;
					return { order: o.orderNumber, customer: o.customerName, total: formatCents(o.total, currency), status: o.status };
				}),
			}],
		};
	} catch { return { blocks: [{ type: "context", text: "Failed to load orders" }] }; }
}

async function buildDashboard(ctx: PluginContext) {
	try {
		if (!ctx.storage?.orders || !ctx.storage?.products || !ctx.storage?.customers) {
			return { blocks: [
				{ type: "header", text: "Store Dashboard" },
				{ type: "banner", variant: "default", title: "Initializing", description: "The commerce plugin is setting up. Refresh the page in a moment." },
			]};
		}

		const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
		const stripeKey = await ctx.kv.get<string>("settings:stripeSecretKey");
		const stripeAccount = await ctx.kv.get<string>("settings:stripeAccountId");
		const pro = await isPro(ctx);

		const blocks: unknown[] = [{ type: "header", text: "Store Dashboard" }];

		if (!stripeKey && !stripeAccount) {
			blocks.push({ type: "banner", variant: "alert", title: "Payments not configured", description: "Go to Settings to connect Stripe." });
		}

		if (!pro) {
			blocks.push({ type: "banner", variant: "default", title: "Upgrade to Pro", description: "Customer emails, abandoned cart recovery, analytics, digital downloads, and WooCommerce import. Pro $29/mo (own keys) or Pro Connect $19/mo + 1.5% (managed Stripe). pluginsforemdash.com/pricing" });
		}

		const [totalOrders, paidOrders, processingCount, activeProducts, totalCustomers] = await Promise.all([
			ctx.storage.orders.count(), ctx.storage.orders.count({ status: "paid" }),
			ctx.storage.orders.count({ status: "processing" }), ctx.storage.products.count({ status: "active" }),
			ctx.storage.customers.count(),
		]);

		const paidResult = await ctx.storage.orders.query({ where: { status: { in: ["paid", "processing", "shipped", "delivered"] } }, limit: 100 });
		const revenue = (paidResult?.items ?? []).reduce((sum: number, i: { data: unknown }) => sum + (i.data as Order).total, 0);

		blocks.push(
			{ type: "stats", stats: [
				{ label: "Revenue", value: formatCents(revenue, currency) },
				{ label: "Orders", value: String(totalOrders) },
				{ label: "Products", value: String(activeProducts) },
				{ label: "Customers", value: String(totalCustomers) },
			]},
			{ type: "divider" },
		);

		if (processingCount > 0) {
			blocks.push({ type: "banner", variant: "default", title: `${processingCount} order${processingCount > 1 ? "s" : ""} need processing`, description: "Go to Orders to fulfill them." });
		}

		// Low stock alerts
		const allProducts = await ctx.storage.products.query({ where: { status: "active" }, limit: 100 });
		const lowStock = (allProducts?.items ?? []).filter((i: { data: unknown }) => {
			const p = i.data as Product;
			return p.inventory !== -1 && p.inventory > 0 && p.inventory <= 5;
		});
		const outOfStock = (allProducts?.items ?? []).filter((i: { data: unknown }) => {
			const p = i.data as Product;
			return p.inventory === 0;
		});

		if (outOfStock.length > 0) {
			blocks.push({
				type: "banner", variant: "error",
				title: `${outOfStock.length} product${outOfStock.length > 1 ? "s" : ""} out of stock`,
				description: outOfStock.map((i: { data: unknown }) => (i.data as Product).name).join(", "),
			});
		}
		if (lowStock.length > 0) {
			blocks.push({
				type: "banner", variant: "alert",
				title: `${lowStock.length} product${lowStock.length > 1 ? "s" : ""} running low`,
				description: lowStock.map((i: { data: unknown }) => `${(i.data as Product).name} (${(i.data as Product).inventory} left)`).join(", "),
			});
		}

		const recent = await ctx.storage.orders.query({ orderBy: { createdAt: "desc" }, limit: 10 });
		const recentItems = recent?.items ?? [];
		if (recentItems.length > 0) {
			blocks.push(
				{ type: "section", text: "**Recent Orders**" },
				{ type: "table", columns: [
					{ key: "order", label: "Order" }, { key: "customer", label: "Customer" },
					{ key: "total", label: "Total" }, { key: "status", label: "Status", format: "badge" },
					{ key: "date", label: "Date", format: "relative_time" },
				], rows: recentItems.map((i: { data: unknown }) => {
					const o = i.data as Order;
					return { order: o.orderNumber, customer: o.customerName, total: formatCents(o.total, currency), status: o.status, date: o.createdAt };
				})},
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
		const pro = await isPro(ctx);

		const fields: unknown[] = [
			{ type: "text_input", action_id: "name", label: "Product Name" },
			{ type: "text_input", action_id: "slug", label: "URL Slug" },
			{ type: "number_input", action_id: "price", label: "Price (cents)", min: 0 },
			{ type: "number_input", action_id: "inventory", label: "Inventory (-1 = unlimited)" },
			{ type: "select", action_id: "status", label: "Status", options: [
				{ label: "Draft", value: "draft" }, { label: "Active", value: "active" },
			]},
			{ type: "select", action_id: "type", label: "Type", options: [
				{ label: "Physical", value: "physical" },
				{ label: "Digital", value: "digital" },
			]},
		];

		const blocks: unknown[] = [
			{ type: "header", text: "Products" },
			{ type: "form", block_id: "add-product", fields, submit: { label: "Add Product", action_id: "create_product" } },
			{ type: "divider" },
		];

		if (products.length === 0) {
			blocks.push({ type: "context", text: "No products yet. Add your first product above." });
			if (pro) {
				blocks.push({ type: "context", text: "Pro tip: Use the WooCommerce Import API to bulk import products from your old store." });
			}
		} else {
			blocks.push({
				type: "table",
				columns: [
					{ key: "name", label: "Name" }, { key: "slug", label: "Slug" },
					{ key: "price", label: "Price" }, { key: "stock", label: "Stock" },
					{ key: "type", label: "Type" },
					{ key: "status", label: "Status", format: "badge" },
				],
				rows: products.map((p) => {
					const stock = getStockStatus(p.data);
					return {
						name: p.data.name, slug: p.data.slug,
						price: formatCents(p.data.price, currency),
						stock: stock.display,
						type: p.data.type ?? "physical", status: p.data.status,
					};
				}),
			});

			for (const p of products) {
				blocks.push({ type: "actions", elements: [
					{ type: "button", text: `Edit "${p.data.name}"`, action_id: `product_edit:${p.id}` },
					{
						type: "button", text: "Delete", action_id: `product_delete:${p.id}`, style: "danger",
						confirm: { title: "Delete Product?", text: `Permanently delete ${p.data.name}?`, confirm: "Delete", deny: "Cancel" },
					},
				]});
			}
		}

		return { blocks };
	} catch (error) { ctx.log.error("Products page error", error); return { blocks: [{ type: "context", text: "Failed to load products" }] }; }
}

async function buildProductEditPage(ctx: PluginContext, productId: string) {
	try {
		const product = (await ctx.storage.products!.get(productId)) as Product | null;
		if (!product) return { ...(await buildProductsPage(ctx)), toast: { message: "Product not found", type: "error" } };

		const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";

		return {
			blocks: [
				{ type: "header", text: `Edit: ${product.name}` },
				{
					type: "form", block_id: `edit-product-${productId}`,
					fields: [
						{ type: "text_input", action_id: "name", label: "Product Name", initial_value: product.name },
						{ type: "text_input", action_id: "slug", label: "URL Slug", initial_value: product.slug },
						{ type: "text_input", action_id: "description", label: "Description", initial_value: product.description },
						{ type: "number_input", action_id: "price", label: "Price (cents)", initial_value: product.price, min: 0 },
						{ type: "number_input", action_id: "compareAtPrice", label: "Compare At Price (cents, 0 = none)", initial_value: product.compareAtPrice ?? 0, min: 0 },
						{ type: "number_input", action_id: "inventory", label: "Inventory (-1 = unlimited)", initial_value: product.inventory },
						{ type: "select", action_id: "status", label: "Status", initial_value: product.status, options: [
							{ label: "Draft", value: "draft" },
							{ label: "Active", value: "active" },
							{ label: "Archived", value: "archived" },
						]},
						{ type: "select", action_id: "type", label: "Type", initial_value: product.type ?? "physical", options: [
							{ label: "Physical", value: "physical" },
							{ label: "Digital", value: "digital" },
						]},
						{ type: "text_input", action_id: "sku", label: "SKU (optional)", initial_value: product.sku ?? "" },
						{ type: "text_input", action_id: "seoTitle", label: "SEO Title (optional)", initial_value: product.seoTitle ?? "" },
						{ type: "number_input", action_id: "lowStockThreshold", label: "Low Stock Threshold (alert when below)", initial_value: product.lowStockThreshold ?? 5, min: 0 },
						{ type: "toggle", action_id: "backordersAllowed", label: "Allow Backorders (sell when out of stock)", initial_value: product.backordersAllowed ?? false },
						{ type: "number_input", action_id: "weight", label: "Weight (grams, for shipping)", initial_value: product.weight ?? 0, min: 0 },
						{ type: "text_input", action_id: "seoDescription", label: "SEO Description (optional)", initial_value: product.seoDescription ?? "" },
					],
					submit: { label: "Save Changes", action_id: `save_product:${productId}` },
				},
				{ type: "divider" },
				{ type: "actions", elements: [
					{ type: "button", text: "Back to Products", action_id: "back_to_products" },
				]},
			],
		};
	} catch (error) {
		ctx.log.error("Edit product error", error);
		return { blocks: [{ type: "context", text: "Failed to load product" }] };
	}
}

async function saveProduct(ctx: PluginContext, productId: string, values: Record<string, unknown>) {
	try {
		const existing = (await ctx.storage.products!.get(productId)) as Product | null;
		if (!existing) return { ...(await buildProductsPage(ctx)), toast: { message: "Product not found", type: "error" } };

		const updated = { ...existing };
		if (typeof values.name === "string" && values.name) updated.name = values.name;
		if (typeof values.slug === "string" && values.slug) updated.slug = values.slug;
		if (typeof values.description === "string") updated.description = values.description;
		if (typeof values.price === "number") updated.price = values.price;
		if (typeof values.compareAtPrice === "number") updated.compareAtPrice = values.compareAtPrice > 0 ? values.compareAtPrice : undefined;
		if (typeof values.inventory === "number") updated.inventory = values.inventory;
		if (typeof values.status === "string") updated.status = values.status as Product["status"];
		if (typeof values.type === "string") updated.type = values.type as Product["type"];
		if (typeof values.sku === "string") updated.sku = values.sku || undefined;
		if (typeof values.seoTitle === "string") updated.seoTitle = values.seoTitle || undefined;
		if (typeof values.lowStockThreshold === "number") updated.lowStockThreshold = values.lowStockThreshold;
		if (typeof values.backordersAllowed === "boolean") updated.backordersAllowed = values.backordersAllowed;
		if (typeof values.weight === "number") updated.weight = values.weight > 0 ? values.weight : undefined;
		if (typeof values.seoDescription === "string") updated.seoDescription = values.seoDescription || undefined;
		updated.updatedAt = now();

		await ctx.storage.products!.put(productId, updated);
		return { ...(await buildProductsPage(ctx)), toast: { message: `"${updated.name}" saved`, type: "success" } };
	} catch (error) {
		ctx.log.error("Save product error", error);
		return { ...(await buildProductsPage(ctx)), toast: { message: "Failed to save", type: "error" } };
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
					{ key: "order", label: "Order" }, { key: "customer", label: "Customer" },
					{ key: "items", label: "Items" }, { key: "total", label: "Total" },
					{ key: "status", label: "Status", format: "badge" }, { key: "date", label: "Date", format: "relative_time" },
				],
				rows: orders.map((o) => ({
					_id: o.id, order: o.data.orderNumber, customer: o.data.customerName,
					items: String(o.data.items.reduce((s, i) => s + i.quantity, 0)),
					total: formatCents(o.data.total, currency), status: o.data.status, date: o.data.createdAt,
				})),
			});

			// Per-order actions based on status
			for (const o of orders) {
				const elements: unknown[] = [];

				if (o.data.status === "paid") {
					elements.push({ type: "button", text: `Mark Processing`, action_id: `order_status:${o.id}:processing` });
					elements.push({ type: "button", text: `Ship`, action_id: `order_status:${o.id}:shipped`, style: "primary" });
				}
				if (o.data.status === "processing") {
					elements.push({ type: "button", text: `Ship ${o.data.orderNumber}`, action_id: `order_status:${o.id}:shipped`, style: "primary" });
				}
				if (o.data.status === "shipped") {
					elements.push({ type: "button", text: `Mark Delivered`, action_id: `order_status:${o.id}:delivered` });
				}
				if (["paid", "processing", "shipped"].includes(o.data.status) && o.data.stripePaymentId) {
					elements.push({
						type: "button", text: "Refund", action_id: `order_refund:${o.id}`, style: "danger",
						confirm: { title: `Refund ${o.data.orderNumber}?`, text: `This will refund ${formatCents(o.data.total, currency)} to the customer and revoke any licenses.`, confirm: "Refund", deny: "Cancel" },
					});
				}
				if (["pending", "cancelled", "refunded"].includes(o.data.status)) {
					elements.push({
						type: "button", text: "Delete", action_id: `order_delete:${o.id}`, style: "danger",
						confirm: { title: "Delete Order?", text: `Permanently delete ${o.data.orderNumber}?`, confirm: "Delete", deny: "Cancel" },
					});
				}

				if (elements.length > 0) {
					blocks.push({ type: "actions", elements });
				}
			}

			blocks.push(
				{ type: "divider" },
				{ type: "actions", elements: [{
					type: "button", text: "Clear All Orders", action_id: "clear_all_orders", style: "danger",
					confirm: { title: "Clear All Orders?", text: "This will permanently delete all orders. This cannot be undone.", confirm: "Clear All", deny: "Cancel" },
				}]},
			);
		}

		return { blocks };
	} catch (error) { ctx.log.error("Orders page error", error); return { blocks: [{ type: "context", text: "Failed to load orders" }] }; }
}

async function buildCustomersPage(ctx: PluginContext) {
	try {
		const result = await ctx.storage.customers!.query({ orderBy: { createdAt: "desc" }, limit: 50 });
		const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";
		const customers = result.items as Array<{ id: string; data: Customer }>;

		const blocks: unknown[] = [{ type: "header", text: "Customers" }];
		if (customers.length === 0) {
			blocks.push({ type: "context", text: "No customers yet." });
		} else {
			blocks.push({
				type: "table",
				columns: [
					{ key: "name", label: "Name" }, { key: "email", label: "Email" },
					{ key: "orders", label: "Orders" }, { key: "spent", label: "Total Spent" },
					{ key: "lastOrder", label: "Last Order", format: "relative_time" },
				],
				rows: customers.map((c) => ({
					name: c.data.name, email: c.data.email, orders: String(c.data.orderCount),
					spent: formatCents(c.data.totalSpent, currency), lastOrder: c.data.lastOrderAt ?? "-",
				})),
			});
		}
		return { blocks };
	} catch (error) { ctx.log.error("Customers page error", error); return { blocks: [{ type: "context", text: "Failed to load customers" }] }; }
}

async function buildDiscountsPage(ctx: PluginContext) {
	try {
		const result = await ctx.storage.discounts!.query({ limit: 50 });
		const discounts = result.items as Array<{ id: string; data: Discount }>;

		const blocks: unknown[] = [
			{ type: "header", text: "Discount Codes" },
			{ type: "form", block_id: "add-discount", fields: [
				{ type: "text_input", action_id: "code", label: "Code" },
				{ type: "select", action_id: "type", label: "Type", options: [
					{ label: "Percentage", value: "percentage" },
					{ label: "Fixed (cents)", value: "fixed" },
					{ label: "Free Shipping", value: "free_shipping" },
				]},
				{ type: "number_input", action_id: "value", label: "Value (% or cents)", min: 0 },
				{ type: "number_input", action_id: "maxUses", label: "Max Uses (0 = unlimited)", min: 0 },
			], submit: { label: "Create Discount", action_id: "create_discount" }},
			{ type: "divider" },
		];

		if (discounts.length === 0) {
			blocks.push({ type: "context", text: "No discount codes yet." });
		} else {
			blocks.push({
				type: "table",
				columns: [
					{ key: "code", label: "Code" }, { key: "type", label: "Type" },
					{ key: "value", label: "Value" }, { key: "used", label: "Used" },
					{ key: "status", label: "Status", format: "badge" },
				],
				rows: discounts.map((d) => ({
					code: d.data.code, type: d.data.type,
					value: d.data.type === "percentage" ? `${d.data.value}%` : d.data.type === "free_shipping" ? "Free" : `${d.data.value}c`,
					used: d.data.maxUses ? `${d.data.usedCount}/${d.data.maxUses}` : String(d.data.usedCount),
					status: d.data.status,
				})),
			});
		}
		return { blocks };
	} catch (error) { ctx.log.error("Discounts page error", error); return { blocks: [{ type: "context", text: "Failed to load discounts" }] }; }
}

async function buildShippingPage(ctx: PluginContext) {
	try {
		const zones = await ctx.storage.shippingZones!.query({ orderBy: { sortOrder: "asc" }, limit: 50 });
		const taxRules = await ctx.storage.taxRules!.query({ limit: 100 });

		const blocks: unknown[] = [
			{ type: "header", text: "Shipping & Tax" },
			{ type: "section", text: "**Shipping Zones**" },
			{ type: "context", text: "Zones are matched top to bottom by country. First match wins. Use '*' for rest-of-world." },
		];

		if (zones.items.length === 0) {
			blocks.push({ type: "context", text: "No shipping zones. Using legacy flat rate from Settings." });
		} else {
			for (const z of zones.items as Array<{ id: string; data: ShippingZone }>) {
				const zone = z.data;
				const methodLines = zone.methods.map((m) => {
					const cost = m.type === "free_shipping" ? "Free" + (m.minOrderAmount ? ` (over ${formatCents(m.minOrderAmount, "usd")})` : "") :
						m.type === "weight_based" ? `${formatCents(m.cost, "usd")}/100g` :
						formatCents(m.cost, "usd");
					return `${m.name} (${m.type}): ${cost}${m.enabled ? "" : " [disabled]"}`;
				}).join(" | ");

				blocks.push(
					{ type: "fields", fields: [
						{ label: zone.name, value: `Countries: ${zone.countries.join(", ")}` },
						{ label: "Methods", value: methodLines || "None" },
					]},
					{ type: "actions", elements: [{
						type: "button", text: "Delete Zone", action_id: `shipping_delete:${z.id}`, style: "danger",
						confirm: { title: "Delete Zone?", text: `Delete shipping zone "${zone.name}"?`, confirm: "Delete", deny: "Cancel" },
					}]},
				);
			}
		}

		// Quick add zone form
		blocks.push(
			{ type: "divider" },
			{ type: "form", block_id: "add-shipping-zone", fields: [
				{ type: "text_input", action_id: "zoneName", label: "Zone Name (e.g. 'United States')" },
				{ type: "text_input", action_id: "countries", label: "Country Codes (comma-separated, e.g. 'US,CA' or '*')" },
				{ type: "select", action_id: "methodType", label: "Shipping Method", options: [
					{ label: "Flat Rate", value: "flat_rate" },
					{ label: "Free Shipping", value: "free_shipping" },
					{ label: "Weight Based (per 100g)", value: "weight_based" },
				]},
				{ type: "number_input", action_id: "methodCost", label: "Cost (cents, or 0 for free shipping)", min: 0 },
				{ type: "number_input", action_id: "freeShippingMin", label: "Free Shipping Min Order (cents, 0 = always free)", min: 0 },
			], submit: { label: "Add Shipping Zone", action_id: "create_shipping_zone" }},
		);

		// Tax Rules
		blocks.push(
			{ type: "divider" },
			{ type: "section", text: "**Tax Rules**" },
			{ type: "context", text: "Tax is calculated based on the shipping country/state. Use '*' for any." },
		);

		if (taxRules.items.length === 0) {
			blocks.push({ type: "context", text: "No tax rules. Using legacy single rate from Settings." });
		} else {
			blocks.push({
				type: "table",
				columns: [
					{ key: "name", label: "Name" }, { key: "country", label: "Country" },
					{ key: "state", label: "State" }, { key: "rate", label: "Rate" },
					{ key: "shipping", label: "On Shipping" },
				],
				rows: (taxRules.items as Array<{ id: string; data: TaxRule }>).map((t) => ({
					name: t.data.name, country: t.data.country, state: t.data.state,
					rate: `${t.data.rate}%`, shipping: t.data.shipping ? "Yes" : "No",
				})),
			});

			for (const t of taxRules.items as Array<{ id: string; data: TaxRule }>) {
				blocks.push({ type: "actions", elements: [{
					type: "button", text: `Delete "${t.data.name}"`, action_id: `tax_delete:${t.id}`, style: "danger",
				}]});
			}
		}

		blocks.push(
			{ type: "divider" },
			{ type: "form", block_id: "add-tax-rule", fields: [
				{ type: "text_input", action_id: "taxName", label: "Tax Name (e.g. 'US Sales Tax')" },
				{ type: "text_input", action_id: "taxCountry", label: "Country Code (e.g. 'US' or '*')" },
				{ type: "text_input", action_id: "taxState", label: "State Code (e.g. 'CA' or '*')" },
				{ type: "number_input", action_id: "taxRate", label: "Rate (%)", min: 0, max: 100 },
				{ type: "toggle", action_id: "taxOnShipping", label: "Apply to Shipping" },
			], submit: { label: "Add Tax Rule", action_id: "create_tax_rule" }},
		);

		return { blocks };
	} catch (error) {
		ctx.log.error("Shipping page error", error);
		return { blocks: [{ type: "context", text: "Failed to load shipping settings" }] };
	}
}

async function buildLicensesPage(ctx: PluginContext) {
	try {
		if (!ctx.storage?.licenses) return { blocks: [{ type: "header", text: "Licenses" }, { type: "context", text: "License storage initializing..." }] };

		const result = await ctx.storage.licenses.query({ orderBy: { createdAt: "desc" }, limit: 50 });
		const licenses = result.items as Array<{ id: string; data: License }>;

		const [totalActive, totalRevoked] = await Promise.all([
			ctx.storage.licenses.count({ status: "active" }),
			ctx.storage.licenses.count({ status: "revoked" }),
		]);

		const blocks: unknown[] = [
			{ type: "header", text: "Licenses" },
			{ type: "stats", stats: [
				{ label: "Active", value: String(totalActive) },
				{ label: "Revoked", value: String(totalRevoked) },
				{ label: "Total", value: String(totalActive + totalRevoked) },
			]},
			{ type: "divider" },
		];

		if (licenses.length === 0) {
			blocks.push({ type: "context", text: "No licenses yet. Licenses are generated automatically when digital products are purchased." });
		} else {
			blocks.push({
				type: "table",
				columns: [
					{ key: "key", label: "License Key" },
					{ key: "product", label: "Product" },
					{ key: "customer", label: "Customer" },
					{ key: "order", label: "Order" },
					{ key: "status", label: "Status", format: "badge" },
					{ key: "date", label: "Created", format: "relative_time" },
				],
				rows: licenses.map((l) => ({
					key: l.data.key,
					product: l.data.productName,
					customer: l.data.customerEmail,
					order: l.data.orderNumber,
					status: l.data.status,
					date: l.data.createdAt,
				})),
			});

			for (const l of licenses) {
				if (l.data.status === "active") {
					blocks.push({ type: "actions", elements: [
						{
							type: "button", text: `Revoke ${l.data.key}`, action_id: `license_revoke:${l.id}`, style: "danger",
							confirm: { title: "Revoke License?", text: `This will deactivate license ${l.data.key} for ${l.data.customerEmail}.`, confirm: "Revoke", deny: "Cancel" },
						},
					]});
				}
			}
		}

		return { blocks };
	} catch (error) {
		ctx.log.error("Licenses page error", error);
		return { blocks: [{ type: "context", text: "Failed to load licenses" }] };
	}
}

async function buildAnalyticsPage(ctx: PluginContext) {
	const pro = await isPro(ctx);
	if (!pro) {
		return {
			blocks: [
				{ type: "header", text: "Analytics" },
				{ type: "banner", variant: "alert", title: "Pro feature", description: "Analytics requires Pro ($29/mo) or Pro Connect ($19/mo + 1.5%). Revenue charts, top products, and customer insights. Upgrade at pluginsforemdash.com/pricing" },
			],
		};
	}

	try {
		const currency = (await ctx.kv.get<string>("settings:currency")) ?? "usd";

		// Build 30-day chart data
		const seriesData: Array<[number, number]> = [];
		let totalRevenue = 0;
		let totalOrders = 0;
		let totalNewCustomers = 0;
		const productMap = new Map<string, { name: string; units: number; revenue: number }>();

		for (let i = 29; i >= 0; i--) {
			const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
			const dateStr = d.toISOString().slice(0, 10);
			const entry = (await ctx.storage.analytics!.get(dateStr)) as AnalyticsEntry | null;
			seriesData.push([d.getTime(), entry?.revenue ?? 0]);
			totalRevenue += entry?.revenue ?? 0;
			totalOrders += entry?.orderCount ?? 0;
			totalNewCustomers += entry?.newCustomers ?? 0;

			if (entry) {
				for (const p of entry.topProducts) {
					const ex = productMap.get(p.id);
					if (ex) { ex.units += p.units; ex.revenue += p.revenue; }
					else productMap.set(p.id, { ...p });
				}
			}
		}

		const topProducts = [...productMap.entries()]
			.map(([id, data]) => ({ id, ...data }))
			.sort((a, b) => b.revenue - a.revenue)
			.slice(0, 5);

		const blocks: unknown[] = [
			{ type: "header", text: "Analytics — Last 30 Days" },
			{ type: "stats", stats: [
				{ label: "Revenue", value: formatCents(totalRevenue, currency) },
				{ label: "Orders", value: String(totalOrders) },
				{ label: "New Customers", value: String(totalNewCustomers) },
				{ label: "Avg Order", value: totalOrders > 0 ? formatCents(Math.round(totalRevenue / totalOrders), currency) : "$0" },
			]},
			{ type: "chart", config: {
				chart_type: "timeseries",
				series: [{ name: "Revenue", data: seriesData, color: "#2563eb" }],
				y_axis_name: `Revenue (${currency.toUpperCase()})`,
				style: "bar",
				gradient: true,
				height: 300,
			}},
			{ type: "divider" },
		];

		if (topProducts.length > 0) {
			blocks.push(
				{ type: "section", text: "**Top Products**" },
				{ type: "table", columns: [
					{ key: "name", label: "Product" }, { key: "units", label: "Units Sold" },
					{ key: "revenue", label: "Revenue" },
				], rows: topProducts.map((p) => ({
					name: p.name, units: String(p.units), revenue: formatCents(p.revenue, currency),
				}))},
			);
		}

		return { blocks };
	} catch (error) {
		ctx.log.error("Analytics error", error);
		return { blocks: [{ type: "context", text: "Failed to load analytics" }] };
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
		const storeName = (await ctx.kv.get<string>("settings:storeName")) ?? "";
		const stripeKey = await ctx.kv.get<string>("settings:stripeSecretKey");
		const stripeAccount = await ctx.kv.get<string>("settings:stripeAccountId");
		const pro = await isPro(ctx);

		const blocks: unknown[] = [{ type: "header", text: "Store Settings" }];

		// Tier status
		const tier = await getTier(ctx);
		if (tier === "pro_connect") {
			blocks.push({ type: "banner", variant: "default", title: "Pro Connect Active — Stripe Connected", description: "Payments via Stripe Connect. 1.5% platform fee. All Pro features enabled." });
		} else if (tier === "pro" && stripeKey) {
			blocks.push({ type: "banner", variant: "default", title: "Pro Active — Using Your Stripe Keys", description: "All Pro features enabled. No transaction fee. $29/mo." });
		} else if (tier === "pro" && !stripeKey) {
			blocks.push({ type: "banner", variant: "alert", title: "Pro Active — Add Stripe Key", description: "Add your Stripe secret key below to start accepting payments." });
		} else if (stripeKey) {
			blocks.push({ type: "banner", variant: "default", title: "Free Plan — Using Your Stripe Keys", description: "Upgrade to Pro ($29/mo) for customer emails, analytics, abandoned cart recovery, and more. Or Pro Connect ($19/mo + 1.5%) for managed Stripe." });
		} else {
			blocks.push({ type: "banner", variant: "alert", title: "Payments Not Configured", description: "Add your Stripe secret key below (free) or upgrade to Pro." });
		}

		blocks.push({ type: "form", block_id: "store-settings", fields: [
			{ type: "text_input", action_id: "storeName", label: "Store Name", initial_value: storeName },
			{ type: "text_input", action_id: "siteUrl", label: "Site URL", initial_value: siteUrl },
			{ type: "divider" },
			{ type: "secret_input", action_id: "licenseKey", label: "Pro License Key (Pro $29/mo or Pro Connect $19/mo + 1.5%)" },
			{ type: "secret_input", action_id: "stripeSecretKey", label: "Stripe Secret Key (free tier)" },
			{ type: "text_input", action_id: "stripeWebhookSecret", label: "Stripe Webhook Secret" },
			{ type: "divider" },
			{ type: "text_input", action_id: "currency", label: "Currency", initial_value: currency },
			{ type: "number_input", action_id: "taxRate", label: "Tax Rate (%)", initial_value: taxRate, min: 0, max: 100 },
			{ type: "number_input", action_id: "flatShipping", label: "Shipping Rate (cents)", initial_value: flatShipping, min: 0 },
			{ type: "number_input", action_id: "freeShippingThreshold", label: "Free Shipping Over (cents, 0 = off)", initial_value: freeShippingThreshold, min: 0 },
			{ type: "divider" },
			{ type: "text_input", action_id: "orderNotificationEmail", label: "Order Notification Email", initial_value: orderNotificationEmail },
		], submit: { label: "Save Settings", action_id: "save_settings" }});

		// Webhook instructions
		blocks.push(
			{ type: "divider" },
			{ type: "section", text: "**Stripe Webhook**" },
			{ type: "context", text: "Point your Stripe webhook to:" },
			{ type: "code", code: `${siteUrl || "https://yoursite.com"}/_emdash/api/plugins/commerce/storefront/webhook/stripe`, language: "bash" as never },
			{ type: "context", text: "Event: checkout.session.completed" },
		);

		// Pro features summary
		if (tier === "free") {
			blocks.push(
				{ type: "divider" },
				{ type: "section", text: "**Upgrade to Pro**" },
				{ type: "context", text: "Pro ($29/mo, own Stripe keys, 0% fee) or Pro Connect ($19/mo + 1.5%, managed Stripe). Both include: Customer order & shipping emails | Abandoned cart recovery | Analytics dashboard with charts | Digital product downloads | WooCommerce CSV import | Priority support" },
			);
		}

		return { blocks };
	} catch (error) { ctx.log.error("Settings page error", error); return { blocks: [{ type: "context", text: "Failed to load settings" }] }; }
}

async function saveSettings(ctx: PluginContext, values: Record<string, unknown>) {
	try {
		const stringFields = ["storeName", "siteUrl", "currency", "orderNotificationEmail"];
		const secretFields = ["licenseKey", "stripeSecretKey", "stripeWebhookSecret"];
		const numberFields = ["taxRate", "flatShipping", "freeShippingThreshold"];

		for (const key of stringFields) {
			if (typeof values[key] === "string") await ctx.kv.set(`settings:${key}`, key === "currency" ? (values[key] as string).toLowerCase() : values[key]);
		}
		for (const key of secretFields) {
			if (typeof values[key] === "string" && values[key] !== "") await ctx.kv.set(`settings:${key}`, values[key]);
		}
		for (const key of numberFields) {
			if (typeof values[key] === "number") await ctx.kv.set(`settings:${key}`, values[key]);
		}

		return { ...(await buildSettingsPage(ctx)), toast: { message: "Settings saved", type: "success" } };
	} catch (error) {
		ctx.log.error("Save settings error", error);
		return { blocks: [{ type: "banner", variant: "error", title: "Failed to save settings" }], toast: { message: "Failed to save", type: "error" } };
	}
}

async function createProduct(ctx: PluginContext, values: Record<string, unknown>) {
	try {
		const name = values.name as string;
		const slug = values.slug as string;
		if (!name || !slug) return { ...(await buildProductsPage(ctx)), toast: { message: "Name and slug are required", type: "error" } };

		const existing = await ctx.storage.products!.query({ where: { slug }, limit: 1 });
		if (existing.items.length > 0) return { ...(await buildProductsPage(ctx)), toast: { message: "Slug already exists", type: "error" } };

		await ctx.storage.products!.put(genId(), {
			name, slug, description: "", price: Number(values.price) || 0,
			status: (values.status as string) || "draft",
			type: (values.type as string) || "physical",
			images: [], variants: [], inventory: Number(values.inventory) ?? -1,
			createdAt: now(), updatedAt: now(),
		});

		return { ...(await buildProductsPage(ctx)), toast: { message: `"${name}" created`, type: "success" } };
	} catch (error) { ctx.log.error("Create product error", error); return { ...(await buildProductsPage(ctx)), toast: { message: "Failed", type: "error" } }; }
}

async function createDiscount(ctx: PluginContext, values: Record<string, unknown>) {
	try {
		const code = ((values.code as string) || "").toUpperCase();
		const type = values.type as string;
		if (!code || !type) return { ...(await buildDiscountsPage(ctx)), toast: { message: "Code and type required", type: "error" } };

		const existing = await ctx.storage.discounts!.query({ where: { code }, limit: 1 });
		if (existing.items.length > 0) return { ...(await buildDiscountsPage(ctx)), toast: { message: "Code exists", type: "error" } };

		const maxUses = Number(values.maxUses) || 0;
		await ctx.storage.discounts!.put(genId(), {
			code, type: type as Discount["type"], value: Number(values.value) || 0,
			maxUses: maxUses > 0 ? maxUses : undefined, usedCount: 0, status: "active" as const, createdAt: now(),
		});

		return { ...(await buildDiscountsPage(ctx)), toast: { message: `"${code}" created`, type: "success" } };
	} catch (error) { ctx.log.error("Create discount error", error); return { ...(await buildDiscountsPage(ctx)), toast: { message: "Failed", type: "error" } }; }
}
