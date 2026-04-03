/**
 * Commerce Plugin - Admin UI
 *
 * Native React admin for the commerce plugin.
 * Provides a WooCommerce-quality admin experience with product management,
 * order processing, customer tracking, discount codes, shipping zones,
 * license keys, and store settings.
 */

import { Badge, Button, Checkbox, Input, Loader, Select } from "@cloudflare/kumo";
import {
	Plus,
	Trash,
	PencilSimple,
	ArrowLeft,
	Package,
	ShoppingCart,
	Users,
	Tag,
	Gear,
	CurrencyDollar,
	Truck,
	Key,
	ChartBar,
	CaretRight,
	Warning,
	CheckCircle,
	XCircle,
} from "@phosphor-icons/react";
import type { PluginAdminExports } from "emdash";
import { apiFetch as baseFetch, getErrorMessage, parseApiResponse } from "emdash/plugin-utils";
import * as React from "react";

// =============================================================================
// Constants
// =============================================================================

const API = "/_emdash/api/plugins/commerce";

// =============================================================================
// API Helpers
// =============================================================================

function apiFetch(route: string, body?: unknown): Promise<Response> {
	return baseFetch(`${API}/${route}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body ?? {}),
	});
}

// =============================================================================
// Types
// =============================================================================

interface Product {
	id: string;
	name: string;
	slug: string;
	description: string;
	shortDescription?: string;
	price: number;
	compareAtPrice?: number;
	status: "active" | "draft" | "archived";
	type: "physical" | "digital";
	categoryId?: string;
	images: string[];
	variants: Variant[];
	sku?: string;
	inventory: number;
	lowStockThreshold?: number;
	backordersAllowed: boolean;
	weight?: number;
	downloadUrl?: string;
	downloadLimit?: number;
	seoTitle?: string;
	seoDescription?: string;
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
	id: string;
	name: string;
	slug: string;
	description?: string;
	parentId?: string;
	sortOrder: number;
}

interface Order {
	id: string;
	orderNumber: string;
	status: "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
	customerEmail: string;
	customerName: string;
	items: OrderItem[];
	subtotal: number;
	discount: number;
	shipping: number;
	tax: number;
	total: number;
	currency: string;
	trackingNumber?: string;
	trackingUrl?: string;
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

interface Customer {
	id: string;
	email: string;
	name: string;
	orderCount: number;
	totalSpent: number;
	lastOrderAt?: string;
	createdAt: string;
}

interface Discount {
	id: string;
	code: string;
	type: "percentage" | "fixed" | "free_shipping";
	value: number;
	minOrderAmount?: number;
	maxUses?: number;
	usedCount: number;
	status: "active" | "expired" | "disabled";
	expiresAt?: string;
	createdAt: string;
}

interface ShippingZone {
	id: string;
	name: string;
	countries: string[];
	methods: ShippingMethod[];
	sortOrder: number;
	createdAt: string;
}

interface ShippingMethod {
	id: string;
	type: "flat_rate" | "free_shipping" | "weight_based" | "price_based";
	name: string;
	cost: number;
	minOrderAmount?: number;
	minWeight?: number;
	maxWeight?: number;
	enabled: boolean;
}

interface TaxRule {
	id: string;
	country: string;
	state: string;
	rate: number;
	name: string;
	compound: boolean;
	shipping: boolean;
	createdAt: string;
}

interface License {
	id: string;
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

interface StatsData {
	revenue: number;
	revenueFormatted: string;
	currency: string;
	orders: { total: number; paid: number; processing: number };
	products: { active: number };
	customers: number;
}

interface SettingsData {
	currency: string;
	taxRate: number;
	flatShipping: number;
	freeShippingThreshold: number;
	orderNotificationEmail: string;
	siteUrl: string;
	storeName: string;
	hasStripeKey: boolean;
	hasStripeWebhookSecret: boolean;
	hasStripeAccount: boolean;
	hasLicenseKey: boolean;
	tier: string;
}

// =============================================================================
// Shared Helpers
// =============================================================================

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function formatCurrency(cents: number, currency = "usd"): string {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(cents / 100);
}

function autoSlugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function EmptyState({
	icon: Icon,
	title,
	description,
	action,
}: {
	icon: React.ElementType;
	title: string;
	description: string;
	action?: React.ReactNode;
}) {
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 0", textAlign: "center" }}>
			<Icon style={{ width: 40, height: 40, opacity: 0.3, marginBottom: 12 }} />
			<h3 style={{ fontWeight: 500, opacity: 0.7, margin: 0 }}>{title}</h3>
			<p style={{ fontSize: 14, opacity: 0.5, marginTop: 4, maxWidth: 360 }}>{description}</p>
			{action && <div style={{ marginTop: 16 }}>{action}</div>}
		</div>
	);
}

function ErrorBanner({ message }: { message: string }) {
	return (
		<div style={{ padding: 12, borderRadius: 8, border: "1px solid #ef444480", background: "#ef44440d", color: "#ef4444", fontSize: 14 }}>
			{message}
		</div>
	);
}

function Card({ title, children, style: cardStyle }: { title?: string; children: React.ReactNode; style?: React.CSSProperties }) {
	return (
		<div style={{ border: "1px solid var(--color-border-default, #e5e7eb)", borderRadius: 8, background: "var(--color-background-default, #fff)", ...cardStyle }}>
			{title && (
				<div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-default, #e5e7eb)", fontWeight: 600, fontSize: 14 }}>
					{title}
				</div>
			)}
			<div style={{ padding: 16 }}>{children}</div>
		</div>
	);
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon?: React.ElementType }) {
	return (
		<div style={{ border: "1px solid var(--color-border-default, #e5e7eb)", borderRadius: 8, padding: 16, background: "var(--color-background-default, #fff)", flex: 1, minWidth: 140 }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
				<div>
					<p style={{ fontSize: 12, opacity: 0.6, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 500 }}>{label}</p>
					<p style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 0" }}>{value}</p>
				</div>
				{Icon && <Icon style={{ width: 20, height: 20, opacity: 0.3 }} />}
			</div>
		</div>
	);
}

function PageHeader({
	title,
	description,
	onBack,
	action,
}: {
	title: string;
	description?: string;
	onBack?: () => void;
	action?: React.ReactNode;
}) {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
				{onBack && (
					<Button variant="ghost" shape="square" onClick={onBack} aria-label="Back">
						<ArrowLeft style={{ width: 20, height: 20 }} />
					</Button>
				)}
				<div>
					<h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{title}</h1>
					{description && <p style={{ fontSize: 14, opacity: 0.6, margin: "4px 0 0" }}>{description}</p>}
				</div>
			</div>
			{action && <div>{action}</div>}
		</div>
	);
}

const tableStyles: Record<string, React.CSSProperties> = {
	wrapper: { border: "1px solid var(--color-border-default, #e5e7eb)", borderRadius: 8, overflowX: "auto" },
	table: { width: "100%", fontSize: 14, borderCollapse: "collapse" },
	th: { textAlign: "left", padding: "10px 12px", fontWeight: 500, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--color-border-default, #e5e7eb)", opacity: 0.7 },
	td: { padding: "10px 12px", borderBottom: "1px solid var(--color-border-default, #e5e7eb)" },
	tdRight: { padding: "10px 12px", borderBottom: "1px solid var(--color-border-default, #e5e7eb)", textAlign: "right" },
};

function getStockLabel(product: Product): { label: string; variant: "success" | "warning" | "danger" } {
	if (product.inventory === -1) return { label: "Unlimited", variant: "success" };
	if (product.inventory === 0) return { label: "Out of Stock", variant: "danger" };
	if (product.inventory <= (product.lowStockThreshold ?? 5)) return { label: `Low (${product.inventory})`, variant: "warning" };
	return { label: `In Stock (${product.inventory})`, variant: "success" };
}

function getOrderStatusVariant(status: string): "success" | "warning" | "danger" | "default" {
	switch (status) {
		case "delivered": return "success";
		case "shipped": case "processing": return "warning";
		case "cancelled": case "refunded": return "danger";
		default: return "default";
	}
}

// =============================================================================
// Dashboard Page
// =============================================================================

function DashboardPage() {
	const [stats, setStats] = React.useState<StatsData | null>(null);
	const [recentOrders, setRecentOrders] = React.useState<Order[]>([]);
	const [lowStockProducts, setLowStockProducts] = React.useState<Product[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);

	const loadData = React.useCallback(async () => {
		try {
			const [statsRes, ordersRes, productsRes] = await Promise.all([
				apiFetch("stats"),
				apiFetch("orders/list", { limit: 10 }),
				apiFetch("products/list", { limit: 50 }),
			]);

			if (statsRes.ok) {
				setStats(await parseApiResponse<StatsData>(statsRes));
			}
			if (ordersRes.ok) {
				const data = await parseApiResponse<{ items: Order[] }>(ordersRes);
				setRecentOrders(data.items);
			}
			if (productsRes.ok) {
				const data = await parseApiResponse<{ items: Product[] }>(productsRes);
				setLowStockProducts(
					data.items.filter(
						(p) => p.inventory !== -1 && p.inventory <= (p.lowStockThreshold ?? 5) && p.status === "active"
					)
				);
			}
		} catch {
			setError("Failed to load dashboard data");
		} finally {
			setLoading(false);
		}
	}, []);

	React.useEffect(() => {
		void loadData();
	}, [loadData]);

	if (loading) {
		return (
			<div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
				<Loader />
			</div>
		);
	}

	if (error) return <ErrorBanner message={error} />;

	const processingCount = stats?.orders.processing ?? 0;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<PageHeader title="Dashboard" description="Store overview" />

			{/* Stats Row */}
			<div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
				<StatCard label="Revenue" value={stats?.revenueFormatted ?? "$0.00"} icon={CurrencyDollar} />
				<StatCard label="Orders" value={stats?.orders.total ?? 0} icon={ShoppingCart} />
				<StatCard label="Products" value={stats?.products.active ?? 0} icon={Package} />
				<StatCard label="Customers" value={stats?.customers ?? 0} icon={Users} />
			</div>

			{/* Alerts */}
			{processingCount > 0 && (
				<div style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, borderRadius: 8, border: "1px solid #f59e0b40", background: "#f59e0b0d" }}>
					<Warning style={{ width: 18, height: 18, color: "#f59e0b" }} />
					<span style={{ fontSize: 14 }}>
						{processingCount} order{processingCount !== 1 ? "s" : ""} awaiting processing
					</span>
				</div>
			)}

			{lowStockProducts.length > 0 && (
				<div style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, borderRadius: 8, border: "1px solid #ef444440", background: "#ef44440d" }}>
					<Warning style={{ width: 18, height: 18, color: "#ef4444" }} />
					<span style={{ fontSize: 14 }}>
						{lowStockProducts.length} product{lowStockProducts.length !== 1 ? "s" : ""} low on stock:{" "}
						{lowStockProducts.map((p) => p.name).join(", ")}
					</span>
				</div>
			)}

			{/* Recent Orders */}
			<Card title="Recent Orders">
				{recentOrders.length === 0 ? (
					<p style={{ fontSize: 14, opacity: 0.5, textAlign: "center", padding: 24 }}>No orders yet</p>
				) : (
					<div style={{ margin: -16, ...tableStyles.wrapper, border: "none" }}>
						<table style={tableStyles.table}>
							<thead>
								<tr>
									<th style={tableStyles.th}>Order</th>
									<th style={tableStyles.th}>Customer</th>
									<th style={tableStyles.th}>Items</th>
									<th style={tableStyles.th}>Total</th>
									<th style={tableStyles.th}>Status</th>
									<th style={tableStyles.th}>Date</th>
								</tr>
							</thead>
							<tbody>
								{recentOrders.map((order) => (
									<tr key={order.id}>
										<td style={tableStyles.td}>#{order.orderNumber}</td>
										<td style={tableStyles.td}>{order.customerName}</td>
										<td style={tableStyles.td}>{order.items.reduce((s, i) => s + i.quantity, 0)}</td>
										<td style={tableStyles.td}>{formatCurrency(order.total, order.currency)}</td>
										<td style={tableStyles.td}>
											<Badge variant={getOrderStatusVariant(order.status)}>{order.status}</Badge>
										</td>
										<td style={tableStyles.td}>{formatDate(order.createdAt)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>
		</div>
	);
}

// =============================================================================
// Products Page
// =============================================================================

function ProductsPage() {
	const [products, setProducts] = React.useState<Product[]>([]);
	const [categories, setCategories] = React.useState<Category[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);
	const [editing, setEditing] = React.useState<Product | null>(null);
	const [creating, setCreating] = React.useState(false);

	const loadData = React.useCallback(async () => {
		try {
			const [productsRes, categoriesRes] = await Promise.all([
				apiFetch("products/list", { limit: 100 }),
				apiFetch("categories/list"),
			]);
			if (productsRes.ok) {
				const data = await parseApiResponse<{ items: Product[] }>(productsRes);
				setProducts(data.items);
			}
			if (categoriesRes.ok) {
				const data = await parseApiResponse<{ items: Category[] }>(categoriesRes);
				setCategories(data.items);
			}
		} catch {
			setError("Failed to load products");
		} finally {
			setLoading(false);
		}
	}, []);

	React.useEffect(() => {
		void loadData();
	}, [loadData]);

	const handleDelete = async (product: Product) => {
		if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
		const res = await apiFetch("products/delete", { id: product.id });
		if (res.ok) await loadData();
	};

	if (editing || creating) {
		return (
			<ProductEditor
				product={editing}
				categories={categories}
				onSave={async () => {
					setEditing(null);
					setCreating(false);
					await loadData();
				}}
				onCancel={() => {
					setEditing(null);
					setCreating(false);
				}}
			/>
		);
	}

	if (loading) {
		return (
			<div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
				<Loader />
			</div>
		);
	}

	if (error) return <ErrorBanner message={error} />;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<PageHeader
				title="Products"
				description={`${products.length} product${products.length !== 1 ? "s" : ""}`}
				action={
					<Button icon={<Plus />} onClick={() => setCreating(true)}>
						Add Product
					</Button>
				}
			/>

			{products.length === 0 ? (
				<EmptyState
					icon={Package}
					title="No products yet"
					description="Create your first product to start selling."
					action={
						<Button icon={<Plus />} onClick={() => setCreating(true)}>
							Add Product
						</Button>
					}
				/>
			) : (
				<div style={tableStyles.wrapper}>
					<table style={tableStyles.table}>
						<thead>
							<tr>
								<th style={tableStyles.th}>Image</th>
								<th style={tableStyles.th}>Name</th>
								<th style={tableStyles.th}>SKU</th>
								<th style={tableStyles.th}>Price</th>
								<th style={tableStyles.th}>Stock</th>
								<th style={tableStyles.th}>Type</th>
								<th style={tableStyles.th}>Status</th>
								<th style={{ ...tableStyles.th, textAlign: "right" }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{products.map((product) => {
								const stock = getStockLabel(product);
								return (
									<tr key={product.id}>
										<td style={tableStyles.td}>
											{product.images[0] ? (
												<img
													src={product.images[0]}
													alt=""
													style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }}
												/>
											) : (
												<div style={{ width: 40, height: 40, borderRadius: 4, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
													<Package style={{ width: 16, height: 16, opacity: 0.3 }} />
												</div>
											)}
										</td>
										<td style={{ ...tableStyles.td, fontWeight: 500 }}>{product.name}</td>
										<td style={{ ...tableStyles.td, fontFamily: "monospace", fontSize: 12 }}>{product.sku || "--"}</td>
										<td style={tableStyles.td}>{formatCurrency(product.price)}</td>
										<td style={tableStyles.td}>
											<Badge variant={stock.variant}>{stock.label}</Badge>
										</td>
										<td style={tableStyles.td}>
											<Badge variant="default">{product.type}</Badge>
										</td>
										<td style={tableStyles.td}>
											<Badge variant={product.status === "active" ? "success" : product.status === "draft" ? "warning" : "default"}>
												{product.status}
											</Badge>
										</td>
										<td style={tableStyles.tdRight}>
											<div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
												<Button variant="ghost" shape="square" onClick={() => setEditing(product)} aria-label="Edit">
													<PencilSimple style={{ width: 16, height: 16 }} />
												</Button>
												<Button variant="ghost" shape="square" onClick={() => void handleDelete(product)} aria-label="Delete">
													<Trash style={{ width: 16, height: 16 }} />
												</Button>
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

// =============================================================================
// Product Editor
// =============================================================================

const STATUS_ITEMS = [
	{ label: "Draft", value: "draft" },
	{ label: "Active", value: "active" },
	{ label: "Archived", value: "archived" },
];

const TYPE_ITEMS = [
	{ label: "Physical", value: "physical" },
	{ label: "Digital", value: "digital" },
];

function ProductEditor({
	product,
	categories,
	onSave,
	onCancel,
}: {
	product: Product | null;
	categories: Category[];
	onSave: () => void;
	onCancel: () => void;
}) {
	const isNew = !product;

	const [name, setName] = React.useState(product?.name ?? "");
	const [slug, setSlug] = React.useState(product?.slug ?? "");
	const [description, setDescription] = React.useState(product?.description ?? "");
	const [shortDescription, setShortDescription] = React.useState(product?.shortDescription ?? "");
	const [price, setPrice] = React.useState(product ? String(product.price / 100) : "");
	const [compareAtPrice, setCompareAtPrice] = React.useState(product?.compareAtPrice ? String(product.compareAtPrice / 100) : "");
	const [sku, setSku] = React.useState(product?.sku ?? "");
	const [status, setStatus] = React.useState(product?.status ?? "active");
	const [type, setType] = React.useState(product?.type ?? "digital");
	const [categoryId, setCategoryId] = React.useState(product?.categoryId ?? "");
	const [imageUrl, setImageUrl] = React.useState(product?.images[0] ?? "");
	const [inventory, setInventory] = React.useState(product ? String(product.inventory === -1 ? "" : product.inventory) : "");
	const [lowStockThreshold, setLowStockThreshold] = React.useState(product?.lowStockThreshold != null ? String(product.lowStockThreshold) : "5");
	const [backordersAllowed, setBackordersAllowed] = React.useState(product?.backordersAllowed ?? false);
	const [weight, setWeight] = React.useState(product?.weight != null ? String(product.weight) : "");
	const [seoTitle, setSeoTitle] = React.useState(product?.seoTitle ?? "");
	const [seoDescription, setSeoDescription] = React.useState(product?.seoDescription ?? "");
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [activeSection, setActiveSection] = React.useState("general");

	const handleNameChange = (value: string) => {
		setName(value);
		if (isNew) {
			setSlug(autoSlugify(value));
		}
	};

	const handleSave = async () => {
		if (!name.trim()) {
			setError("Product name is required");
			return;
		}
		if (!slug.trim()) {
			setError("URL slug is required");
			return;
		}
		const priceNum = Math.round(parseFloat(price || "0") * 100);
		if (isNaN(priceNum) || priceNum < 0) {
			setError("Price must be a valid positive number");
			return;
		}

		setSaving(true);
		setError(null);

		const compareNum = compareAtPrice ? Math.round(parseFloat(compareAtPrice) * 100) : undefined;
		const inventoryNum = inventory === "" ? -1 : parseInt(inventory, 10);
		const weightNum = weight ? parseFloat(weight) : undefined;
		const lowStockNum = lowStockThreshold ? parseInt(lowStockThreshold, 10) : undefined;

		const payload: Record<string, unknown> = {
			name,
			slug,
			description,
			shortDescription: shortDescription || undefined,
			price: priceNum,
			compareAtPrice: compareNum,
			sku: sku || undefined,
			status,
			type,
			categoryId: categoryId || undefined,
			images: imageUrl ? [imageUrl] : [],
			inventory: inventoryNum,
			lowStockThreshold: lowStockNum,
			backordersAllowed,
			weight: weightNum,
			seoTitle: seoTitle || undefined,
			seoDescription: seoDescription || undefined,
		};

		if (product) {
			payload.id = product.id;
		}

		try {
			const route = product ? "products/update" : "products/create";
			const res = await apiFetch(route, payload);
			if (!res.ok) {
				setError(await getErrorMessage(res, "Failed to save product"));
				return;
			}
			onSave();
		} catch {
			setError("Failed to save product");
		} finally {
			setSaving(false);
		}
	};

	const categoryItems = [
		{ label: "No category", value: "" },
		...categories.map((c) => ({ label: c.name, value: c.id })),
	];

	const sectionTabs = [
		{ id: "general", label: "General" },
		{ id: "inventory", label: "Inventory" },
		{ id: "shipping", label: "Shipping" },
		{ id: "seo", label: "SEO" },
	];

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<PageHeader
				title={product ? "Edit Product" : "New Product"}
				description={product ? `Editing: ${product.name}` : undefined}
				onBack={onCancel}
			/>

			{error && <ErrorBanner message={error} />}

			<div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>
				{/* Left Column - Main Content */}
				<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
					<Input
						label="Product Name"
						value={name}
						onChange={(e) => handleNameChange(e.target.value)}
						placeholder="My Awesome Product"
					/>

					<Input
						label="URL Slug"
						value={slug}
						onChange={(e) => setSlug(e.target.value)}
						placeholder="my-awesome-product"
					/>

					<div>
						<label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Description</label>
						<textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Full product description..."
							rows={5}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: 6,
								border: "1px solid var(--color-border-default, #d1d5db)",
								background: "var(--color-background-default, #fff)",
								fontSize: 14,
								fontFamily: "inherit",
								resize: "vertical",
								boxSizing: "border-box",
							}}
						/>
					</div>

					<div>
						<label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Short Description</label>
						<textarea
							value={shortDescription}
							onChange={(e) => setShortDescription(e.target.value)}
							placeholder="Brief summary for product cards..."
							rows={2}
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: 6,
								border: "1px solid var(--color-border-default, #d1d5db)",
								background: "var(--color-background-default, #fff)",
								fontSize: 14,
								fontFamily: "inherit",
								resize: "vertical",
								boxSizing: "border-box",
							}}
						/>
					</div>

					{/* Product Data Panel */}
					<Card title="Product Data">
						<div style={{ margin: "-16px" }}>
							{/* Section Tabs */}
							<div style={{ display: "flex", borderBottom: "1px solid var(--color-border-default, #e5e7eb)" }}>
								{sectionTabs.map((tab) => (
									<button
										key={tab.id}
										onClick={() => setActiveSection(tab.id)}
										style={{
											padding: "10px 16px",
											fontSize: 13,
											fontWeight: activeSection === tab.id ? 600 : 400,
											border: "none",
											borderBottom: activeSection === tab.id ? "2px solid var(--color-text-default, #111)" : "2px solid transparent",
											background: "transparent",
											cursor: "pointer",
											opacity: activeSection === tab.id ? 1 : 0.6,
										}}
									>
										{tab.label}
									</button>
								))}
							</div>

							<div style={{ padding: 16 }}>
								{activeSection === "general" && (
									<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
										<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
											<Input
												label="Price"
												value={price}
												onChange={(e) => setPrice(e.target.value)}
												placeholder="0.00"
												type="number"
											/>
											<Input
												label="Compare At Price"
												value={compareAtPrice}
												onChange={(e) => setCompareAtPrice(e.target.value)}
												placeholder="0.00"
												type="number"
											/>
										</div>
										<Input
											label="SKU"
											value={sku}
											onChange={(e) => setSku(e.target.value)}
											placeholder="PROD-001"
										/>
									</div>
								)}

								{activeSection === "inventory" && (
									<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
										<Input
											label="Stock Quantity (leave empty for unlimited)"
											value={inventory}
											onChange={(e) => setInventory(e.target.value)}
											placeholder="Unlimited"
											type="number"
										/>
										<Input
											label="Low Stock Threshold"
											value={lowStockThreshold}
											onChange={(e) => setLowStockThreshold(e.target.value)}
											placeholder="5"
											type="number"
										/>
										<Checkbox
											label="Allow backorders"
											checked={backordersAllowed}
											onChange={(e) => setBackordersAllowed(e.target.checked)}
										/>
									</div>
								)}

								{activeSection === "shipping" && (
									<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
										<Input
											label="Weight (grams)"
											value={weight}
											onChange={(e) => setWeight(e.target.value)}
											placeholder="0"
											type="number"
										/>
									</div>
								)}

								{activeSection === "seo" && (
									<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
										<Input
											label="SEO Title"
											value={seoTitle}
											onChange={(e) => setSeoTitle(e.target.value)}
											placeholder={name || "Page title for search engines"}
										/>
										<div>
											<label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>SEO Description</label>
											<textarea
												value={seoDescription}
												onChange={(e) => setSeoDescription(e.target.value)}
												placeholder="Meta description for search engines..."
												rows={3}
												style={{
													width: "100%",
													padding: "8px 12px",
													borderRadius: 6,
													border: "1px solid var(--color-border-default, #d1d5db)",
													background: "var(--color-background-default, #fff)",
													fontSize: 14,
													fontFamily: "inherit",
													resize: "vertical",
													boxSizing: "border-box",
												}}
											/>
										</div>
									</div>
								)}
							</div>
						</div>
					</Card>

					{/* Variants section (read-only) */}
					{product && product.variants.length > 0 && (
						<Card title="Variants">
							<div style={{ margin: -16, ...tableStyles.wrapper, border: "none" }}>
								<table style={tableStyles.table}>
									<thead>
										<tr>
											<th style={tableStyles.th}>Name</th>
											<th style={tableStyles.th}>SKU</th>
											<th style={tableStyles.th}>Price</th>
											<th style={tableStyles.th}>Stock</th>
										</tr>
									</thead>
									<tbody>
										{product.variants.map((v) => (
											<tr key={v.id}>
												<td style={tableStyles.td}>{v.name}</td>
												<td style={{ ...tableStyles.td, fontFamily: "monospace", fontSize: 12 }}>{v.sku || "--"}</td>
												<td style={tableStyles.td}>{v.price != null ? formatCurrency(v.price) : "Same as parent"}</td>
												<td style={tableStyles.td}>{v.inventory === -1 ? "Unlimited" : v.inventory}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</Card>
					)}
				</div>

				{/* Right Column - Sidebar */}
				<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
					{/* Status & Save */}
					<Card title="Publish">
						<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
							<Select
								label="Status"
								items={STATUS_ITEMS}
								value={status}
								onChange={(value) => setStatus(value as Product["status"])}
							/>
							<Button onClick={() => void handleSave()} disabled={saving} style={{ width: "100%" }}>
								{saving ? "Saving..." : product ? "Update Product" : "Create Product"}
							</Button>
						</div>
					</Card>

					{/* Product Type */}
					<Card title="Product Type">
						<Select
							label="Type"
							items={TYPE_ITEMS}
							value={type}
							onChange={(value) => setType(value as Product["type"])}
						/>
					</Card>

					{/* Product Image */}
					<Card title="Product Image">
						<Input
							label="Image URL"
							value={imageUrl}
							onChange={(e) => setImageUrl(e.target.value)}
							placeholder="https://..."
						/>
						{imageUrl && (
							<div style={{ marginTop: 8 }}>
								<img
									src={imageUrl}
									alt="Preview"
									style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 4 }}
								/>
							</div>
						)}
					</Card>

					{/* Category */}
					{categories.length > 0 && (
						<Card title="Category">
							<Select
								label="Category"
								items={categoryItems}
								value={categoryId}
								onChange={setCategoryId}
							/>
						</Card>
					)}
				</div>
			</div>
		</div>
	);
}

// =============================================================================
// Orders Page
// =============================================================================

function OrderDetailView({ orderId, onBack }: { orderId: string; onBack: () => void }) {
	const [order, setOrder] = React.useState<any>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		apiFetch("orders/get", { id: orderId })
			.then((res) => res.ok ? parseApiResponse<any>(res) : null)
			.then((data) => setOrder(data))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [orderId]);

	if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 64 }}><Loader /></div>;
	if (!order) return <ErrorBanner message="Order not found" />;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
				<Button variant="ghost" onClick={onBack}><ArrowLeft style={{ width: 16, height: 16, marginRight: 4 }} /> Back</Button>
				<h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Order #{order.orderNumber}</h2>
				<Badge variant={getOrderStatusVariant(order.status)}>{order.status}</Badge>
			</div>

			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
				<Card title="Customer">
					<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						<div><strong>{order.customerName}</strong></div>
						<div style={{ fontSize: 13, opacity: 0.7 }}>{order.customerEmail}</div>
					</div>
				</Card>
				<Card title="Shipping Address">
					<div style={{ fontSize: 13, lineHeight: 1.6 }}>
						{order.shippingAddress?.name}<br />
						{order.shippingAddress?.line1}<br />
						{order.shippingAddress?.line2 && <>{order.shippingAddress.line2}<br /></>}
						{order.shippingAddress?.city}, {order.shippingAddress?.state} {order.shippingAddress?.postalCode}<br />
						{order.shippingAddress?.country}
					</div>
				</Card>
			</div>

			<Card title="Items">
				<table style={tableStyles.table}>
					<thead>
						<tr>
							<th style={tableStyles.th}>Product</th>
							<th style={tableStyles.th}>SKU</th>
							<th style={tableStyles.th}>Price</th>
							<th style={tableStyles.th}>Qty</th>
							<th style={{ ...tableStyles.th, textAlign: "right" }}>Total</th>
						</tr>
					</thead>
					<tbody>
						{order.items.map((item: any, i: number) => (
							<tr key={i}>
								<td style={{ ...tableStyles.td, fontWeight: 500 }}>{item.name}</td>
								<td style={{ ...tableStyles.td, fontSize: 12, opacity: 0.6 }}>{item.sku || "—"}</td>
								<td style={tableStyles.td}>{formatCurrency(item.price, order.currency)}</td>
								<td style={tableStyles.td}>{item.quantity}</td>
								<td style={tableStyles.tdRight}>{formatCurrency(item.price * item.quantity, order.currency)}</td>
							</tr>
						))}
					</tbody>
				</table>
				<div style={{ borderTop: "1px solid var(--color-border-default, #e5e7eb)", paddingTop: 12, marginTop: 12 }}>
					<div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
						<span>Subtotal</span><span>{formatCurrency(order.subtotal, order.currency)}</span>
					</div>
					{order.discount > 0 && (
						<div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "green" }}>
							<span>Discount{order.discountCode ? ` (${order.discountCode})` : ""}</span><span>-{formatCurrency(order.discount, order.currency)}</span>
						</div>
					)}
					{order.shipping > 0 && (
						<div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
							<span>Shipping</span><span>{formatCurrency(order.shipping, order.currency)}</span>
						</div>
					)}
					{order.tax > 0 && (
						<div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
							<span>Tax</span><span>{formatCurrency(order.tax, order.currency)}</span>
						</div>
					)}
					<div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 600, marginTop: 8 }}>
						<span>Total</span><span>{formatCurrency(order.total, order.currency)}</span>
					</div>
				</div>
			</Card>

			{order.trackingNumber && (
				<Card title="Tracking">
					<div style={{ fontSize: 13 }}>
						<strong>Tracking #:</strong> {order.trackingNumber}
						{order.trackingUrl && <> — <a href={order.trackingUrl} target="_blank" rel="noopener" style={{ color: "var(--color-accent, #2563eb)" }}>Track Package</a></>}
					</div>
				</Card>
			)}

			{order.timeline && order.timeline.length > 0 && (
				<Card title="Timeline">
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						{order.timeline.map((note: any) => (
							<div key={note.id} style={{ display: "flex", gap: 8, fontSize: 13, paddingBottom: 8, borderBottom: "1px solid var(--color-border-subtle, #f3f4f6)" }}>
								<span style={{ opacity: 0.5, whiteSpace: "nowrap" }}>{formatDate(note.createdAt)}</span>
								<span>{note.message}</span>
								<Badge variant="default">{note.type}</Badge>
							</div>
						))}
					</div>
				</Card>
			)}

			{order.notes && (
				<Card title="Notes">
					<p style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{order.notes}</p>
				</Card>
			)}
		</div>
	);
}

function CustomerDetailView({ customerId, onBack }: { customerId: string; onBack: () => void }) {
	const [customer, setCustomer] = React.useState<Customer | null>(null);
	const [orders, setOrders] = React.useState<Order[]>([]);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		Promise.all([
			apiFetch("customers/list", { limit: 100 }).then((r) => r.ok ? parseApiResponse<{ items: Customer[] }>(r) : { items: [] }),
			apiFetch("orders/list", { limit: 100 }).then((r) => r.ok ? parseApiResponse<{ items: Order[] }>(r) : { items: [] }),
		]).then(([custData, orderData]) => {
			const cust = custData.items.find((c) => c.id === customerId) ?? null;
			setCustomer(cust);
			if (cust) {
				setOrders(orderData.items.filter((o) => o.customerEmail === cust.email));
			}
		}).catch(() => {}).finally(() => setLoading(false));
	}, [customerId]);

	if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 64 }}><Loader /></div>;
	if (!customer) return <ErrorBanner message="Customer not found" />;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
				<Button variant="ghost" onClick={onBack}><ArrowLeft style={{ width: 16, height: 16, marginRight: 4 }} /> Back</Button>
				<h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{customer.name}</h2>
			</div>

			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
				<StatCard label="Email" value={customer.email} />
				<StatCard label="Orders" value={String(customer.orderCount)} />
				<StatCard label="Total Spent" value={formatCurrency(customer.totalSpent, "usd")} />
				<StatCard label="Last Order" value={customer.lastOrderAt ? formatDate(customer.lastOrderAt) : "Never"} />
			</div>

			<Card title={`Orders (${orders.length})`}>
				{orders.length === 0 ? (
					<p style={{ fontSize: 13, opacity: 0.6 }}>No orders found for this customer.</p>
				) : (
					<table style={tableStyles.table}>
						<thead>
							<tr>
								<th style={tableStyles.th}>Order</th>
								<th style={tableStyles.th}>Items</th>
								<th style={tableStyles.th}>Total</th>
								<th style={tableStyles.th}>Status</th>
								<th style={tableStyles.th}>Date</th>
							</tr>
						</thead>
						<tbody>
							{orders.map((order) => (
								<tr key={order.id}>
									<td style={{ ...tableStyles.td, fontWeight: 500 }}>#{order.orderNumber}</td>
									<td style={tableStyles.td}>{order.items.reduce((s, i) => s + i.quantity, 0)}</td>
									<td style={tableStyles.td}>{formatCurrency(order.total, order.currency)}</td>
									<td style={tableStyles.td}><Badge variant={getOrderStatusVariant(order.status)}>{order.status}</Badge></td>
									<td style={tableStyles.td}>{formatDate(order.createdAt)}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</Card>
		</div>
	);
}

function OrdersPage() {
	const [orders, setOrders] = React.useState<Order[]>([]);
	const [selectedOrderId, setSelectedOrderId] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);

	const loadOrders = React.useCallback(async () => {
		try {
			const res = await apiFetch("orders/list", { limit: 100 });
			if (!res.ok) {
				setError("Failed to load orders");
				return;
			}
			const data = await parseApiResponse<{ items: Order[] }>(res);
			setOrders(data.items);
		} catch {
			setError("Failed to load orders");
		} finally {
			setLoading(false);
		}
	}, []);

	React.useEffect(() => {
		void loadOrders();
	}, [loadOrders]);

	const handleUpdateStatus = async (orderId: string, status: string, trackingNumber?: string, trackingUrl?: string) => {
		const payload: Record<string, unknown> = { id: orderId, status };
		if (trackingNumber) payload.trackingNumber = trackingNumber;
		if (trackingUrl) payload.trackingUrl = trackingUrl;
		const res = await apiFetch("orders/update", payload);
		if (res.ok) await loadOrders();
	};

	const handleRefund = async (order: Order) => {
		if (!confirm(`Refund order #${order.orderNumber} for ${formatCurrency(order.total, order.currency)}? This will issue a refund via Stripe.`)) return;
		const res = await apiFetch("orders/refund", { id: order.id });
		if (res.ok) {
			await loadOrders();
		} else {
			const msg = await getErrorMessage(res, "Refund failed");
			alert(msg);
		}
	};

	const handleDelete = async (order: Order) => {
		if (!confirm(`Delete order #${order.orderNumber}? This cannot be undone.`)) return;
		const res = await apiFetch("orders/delete", { id: order.id });
		if (res.ok) await loadOrders();
	};

	const handleClearAll = async () => {
		if (!confirm("Delete ALL orders? This cannot be undone.")) return;
		if (!confirm("Are you sure? This will permanently delete every order.")) return;
		const res = await apiFetch("orders/clear");
		if (res.ok) await loadOrders();
	};

	if (loading) {
		return (
			<div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
				<Loader />
			</div>
		);
	}

	if (error) return <ErrorBanner message={error} />;

	if (selectedOrderId) {
		return <OrderDetailView orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />;
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<PageHeader title="Orders" description={`${orders.length} order${orders.length !== 1 ? "s" : ""}`} />

			{orders.length === 0 ? (
				<EmptyState
					icon={ShoppingCart}
					title="No orders yet"
					description="Orders will appear here when customers make purchases."
				/>
			) : (
				<>
					<div style={tableStyles.wrapper}>
						<table style={tableStyles.table}>
							<thead>
								<tr>
									<th style={tableStyles.th}>Order</th>
									<th style={tableStyles.th}>Customer</th>
									<th style={tableStyles.th}>Email</th>
									<th style={tableStyles.th}>Items</th>
									<th style={tableStyles.th}>Total</th>
									<th style={tableStyles.th}>Status</th>
									<th style={tableStyles.th}>Date</th>
									<th style={{ ...tableStyles.th, textAlign: "right" }}>Actions</th>
								</tr>
							</thead>
							<tbody>
								{orders.map((order) => (
									<tr key={order.id}>
										<td style={{ ...tableStyles.td, fontWeight: 500 }}>
												<a onClick={() => setSelectedOrderId(order.id)} style={{ cursor: "pointer", color: "var(--color-accent, #2563eb)" }}>
													#{order.orderNumber}
												</a>
											</td>
										<td style={tableStyles.td}>{order.customerName}</td>
										<td style={{ ...tableStyles.td, fontSize: 12 }}>{order.customerEmail}</td>
										<td style={tableStyles.td}>{order.items.reduce((s, i) => s + i.quantity, 0)}</td>
										<td style={tableStyles.td}>{formatCurrency(order.total, order.currency)}</td>
										<td style={tableStyles.td}>
											<Badge variant={getOrderStatusVariant(order.status)}>{order.status}</Badge>
										</td>
										<td style={tableStyles.td}>{formatDate(order.createdAt)}</td>
										<td style={tableStyles.tdRight}>
											<div style={{ display: "flex", justifyContent: "flex-end", gap: 4, flexWrap: "wrap" }}>
												{order.status === "paid" && (
													<Button variant="outline" size="sm" onClick={() => void handleUpdateStatus(order.id, "processing")}>
														Process
													</Button>
												)}
												{(order.status === "processing" || order.status === "paid") && (
													<Button variant="outline" size="sm" onClick={() => void handleUpdateStatus(order.id, "shipped")}>
														Ship
													</Button>
												)}
												{order.status === "shipped" && (
													<Button variant="outline" size="sm" onClick={() => void handleUpdateStatus(order.id, "delivered")}>
														Delivered
													</Button>
												)}
												{!["refunded", "cancelled", "pending"].includes(order.status) && (
													<Button variant="outline" size="sm" onClick={() => void handleRefund(order)}>
														Refund
													</Button>
												)}
												<Button variant="ghost" shape="square" onClick={() => void handleDelete(order)} aria-label="Delete">
													<Trash style={{ width: 14, height: 14 }} />
												</Button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div style={{ display: "flex", justifyContent: "flex-end" }}>
						<Button variant="outline" onClick={() => void handleClearAll()}>
							<Trash style={{ width: 14, height: 14, marginRight: 6 }} />
							Clear All Orders
						</Button>
					</div>
				</>
			)}
		</div>
	);
}

// =============================================================================
// Customers Page
// =============================================================================

function CustomersPage() {
	const [customers, setCustomers] = React.useState<Customer[]>([]);
	const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);

	const loadCustomers = React.useCallback(async () => {
		try {
			const res = await apiFetch("customers/list", { limit: 100 });
			if (!res.ok) {
				setError("Failed to load customers");
				return;
			}
			const data = await parseApiResponse<{ items: Customer[] }>(res);
			setCustomers(data.items);
		} catch {
			setError("Failed to load customers");
		} finally {
			setLoading(false);
		}
	}, []);

	React.useEffect(() => {
		void loadCustomers();
	}, [loadCustomers]);

	if (loading) {
		return (
			<div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
				<Loader />
			</div>
		);
	}

	if (error) return <ErrorBanner message={error} />;

	if (selectedCustomerId) {
		return <CustomerDetailView customerId={selectedCustomerId} onBack={() => setSelectedCustomerId(null)} />;
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<PageHeader title="Customers" description={`${customers.length} customer${customers.length !== 1 ? "s" : ""}`} />

			{customers.length === 0 ? (
				<EmptyState
					icon={Users}
					title="No customers yet"
					description="Customer profiles are created automatically when orders are placed."
				/>
			) : (
				<div style={tableStyles.wrapper}>
					<table style={tableStyles.table}>
						<thead>
							<tr>
								<th style={tableStyles.th}>Name</th>
								<th style={tableStyles.th}>Email</th>
								<th style={tableStyles.th}>Orders</th>
								<th style={tableStyles.th}>Total Spent</th>
								<th style={tableStyles.th}>Last Order</th>
							</tr>
						</thead>
						<tbody>
							{customers.map((customer) => (
								<tr key={customer.id}>
									<td style={{ ...tableStyles.td, fontWeight: 500 }}>
												<a onClick={() => setSelectedCustomerId(customer.id)} style={{ cursor: "pointer", color: "var(--color-accent, #2563eb)" }}>
													{customer.name}
												</a>
											</td>
									<td style={tableStyles.td}>{customer.email}</td>
									<td style={tableStyles.td}>{customer.orderCount}</td>
									<td style={tableStyles.td}>{formatCurrency(customer.totalSpent)}</td>
									<td style={tableStyles.td}>{customer.lastOrderAt ? formatDate(customer.lastOrderAt) : "Never"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

// =============================================================================
// Discounts Page
// =============================================================================

const DISCOUNT_TYPE_ITEMS = [
	{ label: "Percentage", value: "percentage" },
	{ label: "Fixed Amount", value: "fixed" },
	{ label: "Free Shipping", value: "free_shipping" },
];

function DiscountsPage() {
	const [discounts, setDiscounts] = React.useState<Discount[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);
	const [creating, setCreating] = React.useState(false);

	// Create form state
	const [code, setCode] = React.useState("");
	const [discountType, setDiscountType] = React.useState("percentage");
	const [value, setValue] = React.useState("");
	const [maxUses, setMaxUses] = React.useState("");
	const [formError, setFormError] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);

	const loadDiscounts = React.useCallback(async () => {
		try {
			const res = await apiFetch("discounts/list", { limit: 100 });
			if (!res.ok) {
				setError("Failed to load discounts");
				return;
			}
			const data = await parseApiResponse<{ items: Discount[] }>(res);
			setDiscounts(data.items);
		} catch {
			setError("Failed to load discounts");
		} finally {
			setLoading(false);
		}
	}, []);

	React.useEffect(() => {
		void loadDiscounts();
	}, [loadDiscounts]);

	const handleCreate = async () => {
		if (!code.trim()) {
			setFormError("Discount code is required");
			return;
		}

		const numValue = parseFloat(value || "0");
		if (discountType !== "free_shipping" && (isNaN(numValue) || numValue <= 0)) {
			setFormError("Value must be a positive number");
			return;
		}

		setSaving(true);
		setFormError(null);

		try {
			const payload: Record<string, unknown> = {
				code: code.toUpperCase().trim(),
				type: discountType,
				value: discountType === "fixed" ? Math.round(numValue * 100) : numValue,
			};
			if (maxUses) payload.maxUses = parseInt(maxUses, 10);

			const res = await apiFetch("discounts/create", payload);
			if (!res.ok) {
				setFormError(await getErrorMessage(res, "Failed to create discount"));
				return;
			}

			setCode("");
			setDiscountType("percentage");
			setValue("");
			setMaxUses("");
			setCreating(false);
			await loadDiscounts();
		} catch {
			setFormError("Failed to create discount");
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (discount: Discount) => {
		if (!confirm(`Delete discount "${discount.code}"?`)) return;
		const res = await apiFetch("discounts/delete", { id: discount.id });
		if (res.ok) await loadDiscounts();
	};

	if (loading) {
		return (
			<div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
				<Loader />
			</div>
		);
	}

	if (error) return <ErrorBanner message={error} />;

	const formatDiscountValue = (d: Discount) => {
		if (d.type === "percentage") return `${d.value}%`;
		if (d.type === "fixed") return formatCurrency(d.value);
		return "Free";
	};

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<PageHeader
				title="Discounts"
				description={`${discounts.length} discount code${discounts.length !== 1 ? "s" : ""}`}
				action={
					!creating ? (
						<Button icon={<Plus />} onClick={() => setCreating(true)}>
							Add Discount
						</Button>
					) : undefined
				}
			/>

			{/* Create Form */}
			{creating && (
				<Card title="New Discount Code">
					{formError && <ErrorBanner message={formError} />}
					<div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: formError ? 12 : 0 }}>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
							<Input
								label="Code"
								value={code}
								onChange={(e) => setCode(e.target.value)}
								placeholder="SUMMER20"
							/>
							<Select
								label="Type"
								items={DISCOUNT_TYPE_ITEMS}
								value={discountType}
								onChange={setDiscountType}
							/>
						</div>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
							{discountType !== "free_shipping" && (
								<Input
									label={discountType === "percentage" ? "Percentage" : "Amount"}
									value={value}
									onChange={(e) => setValue(e.target.value)}
									placeholder={discountType === "percentage" ? "20" : "10.00"}
									type="number"
								/>
							)}
							<Input
								label="Max Uses (leave empty for unlimited)"
								value={maxUses}
								onChange={(e) => setMaxUses(e.target.value)}
								placeholder="Unlimited"
								type="number"
							/>
						</div>
						<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
							<Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
							<Button onClick={() => void handleCreate()} disabled={saving}>
								{saving ? "Creating..." : "Create Discount"}
							</Button>
						</div>
					</div>
				</Card>
			)}

			{/* Discounts Table */}
			{discounts.length === 0 && !creating ? (
				<EmptyState
					icon={Tag}
					title="No discount codes"
					description="Create discount codes to offer promotions to your customers."
					action={
						<Button icon={<Plus />} onClick={() => setCreating(true)}>
							Add Discount
						</Button>
					}
				/>
			) : discounts.length > 0 ? (
				<div style={tableStyles.wrapper}>
					<table style={tableStyles.table}>
						<thead>
							<tr>
								<th style={tableStyles.th}>Code</th>
								<th style={tableStyles.th}>Type</th>
								<th style={tableStyles.th}>Value</th>
								<th style={tableStyles.th}>Used / Max</th>
								<th style={tableStyles.th}>Status</th>
								<th style={{ ...tableStyles.th, textAlign: "right" }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{discounts.map((discount) => (
								<tr key={discount.id}>
									<td style={{ ...tableStyles.td, fontWeight: 600, fontFamily: "monospace" }}>{discount.code}</td>
									<td style={tableStyles.td}>{discount.type.replace("_", " ")}</td>
									<td style={tableStyles.td}>{formatDiscountValue(discount)}</td>
									<td style={tableStyles.td}>
										{discount.usedCount} / {discount.maxUses ?? "\u221e"}
									</td>
									<td style={tableStyles.td}>
										<Badge variant={discount.status === "active" ? "success" : discount.status === "expired" ? "warning" : "default"}>
											{discount.status}
										</Badge>
									</td>
									<td style={tableStyles.tdRight}>
										<Button variant="ghost" shape="square" onClick={() => void handleDelete(discount)} aria-label="Delete">
											<Trash style={{ width: 14, height: 14 }} />
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}
		</div>
	);
}

// =============================================================================
// Shipping Page
// =============================================================================

const SHIPPING_METHOD_TYPES = [
	{ label: "Flat Rate", value: "flat_rate" },
	{ label: "Free Shipping", value: "free_shipping" },
	{ label: "Weight Based", value: "weight_based" },
	{ label: "Price Based", value: "price_based" },
];

function ShippingPage() {
	const [zones, setZones] = React.useState<ShippingZone[]>([]);
	const [taxRules, setTaxRules] = React.useState<TaxRule[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);
	const [creatingZone, setCreatingZone] = React.useState(false);
	const [creatingTax, setCreatingTax] = React.useState(false);

	// Zone form
	const [zoneName, setZoneName] = React.useState("");
	const [zoneCountries, setZoneCountries] = React.useState("");
	const [methodType, setMethodType] = React.useState("flat_rate");
	const [methodName, setMethodName] = React.useState("");
	const [methodCost, setMethodCost] = React.useState("");

	// Tax form
	const [taxCountry, setTaxCountry] = React.useState("");
	const [taxState, setTaxState] = React.useState("*");
	const [taxRate, setTaxRate] = React.useState("");
	const [taxName, setTaxName] = React.useState("");
	const [taxCompound, setTaxCompound] = React.useState(false);
	const [taxShipping, setTaxShipping] = React.useState(false);

	const [formError, setFormError] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);

	const loadData = React.useCallback(async () => {
		try {
			const [zonesRes, taxRes] = await Promise.all([
				apiFetch("shipping/list"),
				apiFetch("tax/list"),
			]);
			if (zonesRes.ok) {
				const data = await parseApiResponse<{ items: ShippingZone[] }>(zonesRes);
				setZones(data.items);
			}
			if (taxRes.ok) {
				const data = await parseApiResponse<{ items: TaxRule[] }>(taxRes);
				setTaxRules(data.items);
			}
		} catch {
			setError("Failed to load shipping data");
		} finally {
			setLoading(false);
		}
	}, []);

	React.useEffect(() => {
		void loadData();
	}, [loadData]);

	const handleCreateZone = async () => {
		if (!zoneName.trim() || !zoneCountries.trim()) {
			setFormError("Zone name and countries are required");
			return;
		}

		setSaving(true);
		setFormError(null);

		const countries = zoneCountries.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
		const methods: ShippingMethod[] = [];

		if (methodName.trim()) {
			methods.push({
				id: crypto.randomUUID(),
				type: methodType as ShippingMethod["type"],
				name: methodName,
				cost: Math.round(parseFloat(methodCost || "0") * 100),
				enabled: true,
			});
		}

		try {
			const res = await apiFetch("shipping/create", {
				name: zoneName,
				countries,
				methods,
				sortOrder: zones.length,
			});
			if (!res.ok) {
				setFormError(await getErrorMessage(res, "Failed to create zone"));
				return;
			}
			setZoneName("");
			setZoneCountries("");
			setMethodType("flat_rate");
			setMethodName("");
			setMethodCost("");
			setCreatingZone(false);
			await loadData();
		} catch {
			setFormError("Failed to create zone");
		} finally {
			setSaving(false);
		}
	};

	const handleCreateTax = async () => {
		if (!taxCountry.trim() || !taxName.trim()) {
			setFormError("Country and name are required");
			return;
		}
		const rate = parseFloat(taxRate || "0");
		if (isNaN(rate) || rate < 0 || rate > 100) {
			setFormError("Rate must be between 0 and 100");
			return;
		}

		setSaving(true);
		setFormError(null);

		try {
			const res = await apiFetch("tax/create", {
				country: taxCountry.toUpperCase().trim(),
				state: taxState || "*",
				rate,
				name: taxName,
				compound: taxCompound,
				shipping: taxShipping,
			});
			if (!res.ok) {
				setFormError(await getErrorMessage(res, "Failed to create tax rule"));
				return;
			}
			setTaxCountry("");
			setTaxState("*");
			setTaxRate("");
			setTaxName("");
			setTaxCompound(false);
			setTaxShipping(false);
			setCreatingTax(false);
			await loadData();
		} catch {
			setFormError("Failed to create tax rule");
		} finally {
			setSaving(false);
		}
	};

	const handleDeleteZone = async (zone: ShippingZone) => {
		if (!confirm(`Delete shipping zone "${zone.name}"?`)) return;
		const res = await apiFetch("shipping/delete", { id: zone.id });
		if (res.ok) await loadData();
	};

	const handleDeleteTax = async (tax: TaxRule) => {
		if (!confirm(`Delete tax rule "${tax.name}"?`)) return;
		const res = await apiFetch("tax/delete", { id: tax.id });
		if (res.ok) await loadData();
	};

	if (loading) {
		return (
			<div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
				<Loader />
			</div>
		);
	}

	if (error) return <ErrorBanner message={error} />;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<PageHeader title="Shipping & Tax" description="Manage shipping zones and tax rules" />

			{/* Shipping Zones */}
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
				<h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Shipping Zones</h2>
				{!creatingZone && (
					<Button variant="outline" icon={<Plus />} onClick={() => { setCreatingZone(true); setFormError(null); }}>
						Add Zone
					</Button>
				)}
			</div>

			{creatingZone && (
				<Card title="New Shipping Zone">
					{formError && <ErrorBanner message={formError} />}
					<div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: formError ? 12 : 0 }}>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
							<Input label="Zone Name" value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="US Domestic" />
							<Input label="Countries (comma-separated ISO codes)" value={zoneCountries} onChange={(e) => setZoneCountries(e.target.value)} placeholder="US, CA" />
						</div>
						<p style={{ fontSize: 13, fontWeight: 500, margin: 0, opacity: 0.7 }}>Shipping Method (optional)</p>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
							<Select label="Type" items={SHIPPING_METHOD_TYPES} value={methodType} onChange={setMethodType} />
							<Input label="Name" value={methodName} onChange={(e) => setMethodName(e.target.value)} placeholder="Standard Shipping" />
							<Input label="Cost" value={methodCost} onChange={(e) => setMethodCost(e.target.value)} placeholder="5.99" type="number" />
						</div>
						<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
							<Button variant="outline" onClick={() => setCreatingZone(false)}>Cancel</Button>
							<Button onClick={() => void handleCreateZone()} disabled={saving}>
								{saving ? "Creating..." : "Create Zone"}
							</Button>
						</div>
					</div>
				</Card>
			)}

			{zones.length === 0 && !creatingZone ? (
				<EmptyState
					icon={Truck}
					title="No shipping zones"
					description="Add shipping zones to calculate shipping costs for your customers."
					action={
						<Button icon={<Plus />} onClick={() => setCreatingZone(true)}>
							Add Zone
						</Button>
					}
				/>
			) : zones.length > 0 ? (
				<div style={tableStyles.wrapper}>
					<table style={tableStyles.table}>
						<thead>
							<tr>
								<th style={tableStyles.th}>Zone</th>
								<th style={tableStyles.th}>Countries</th>
								<th style={tableStyles.th}>Methods</th>
								<th style={{ ...tableStyles.th, textAlign: "right" }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{zones.map((zone) => (
								<tr key={zone.id}>
									<td style={{ ...tableStyles.td, fontWeight: 500 }}>{zone.name}</td>
									<td style={{ ...tableStyles.td, fontFamily: "monospace", fontSize: 12 }}>
										{zone.countries.join(", ")}
									</td>
									<td style={tableStyles.td}>
										{zone.methods.length === 0 ? (
											<span style={{ opacity: 0.5 }}>None</span>
										) : (
											zone.methods.map((m) => (
												<div key={m.id} style={{ fontSize: 13 }}>
													{m.name} ({m.type.replace("_", " ")}) - {formatCurrency(m.cost)}
												</div>
											))
										)}
									</td>
									<td style={tableStyles.tdRight}>
										<Button variant="ghost" shape="square" onClick={() => void handleDeleteZone(zone)} aria-label="Delete">
											<Trash style={{ width: 14, height: 14 }} />
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}

			{/* Tax Rules */}
			<div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
				<h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Tax Rules</h2>
				{!creatingTax && (
					<Button variant="outline" icon={<Plus />} onClick={() => { setCreatingTax(true); setFormError(null); }}>
						Add Tax Rule
					</Button>
				)}
			</div>

			{creatingTax && (
				<Card title="New Tax Rule">
					{formError && <ErrorBanner message={formError} />}
					<div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: formError ? 12 : 0 }}>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
							<Input label="Country (ISO)" value={taxCountry} onChange={(e) => setTaxCountry(e.target.value)} placeholder="US" />
							<Input label="State (* for all)" value={taxState} onChange={(e) => setTaxState(e.target.value)} placeholder="*" />
							<Input label="Rate (%)" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="8.25" type="number" />
							<Input label="Name" value={taxName} onChange={(e) => setTaxName(e.target.value)} placeholder="CA Sales Tax" />
						</div>
						<div style={{ display: "flex", gap: 16, alignItems: "center" }}>
							<Checkbox label="Compound (on top of other taxes)" checked={taxCompound} onChange={(e) => setTaxCompound(e.target.checked)} />
							<Checkbox label="Apply to shipping" checked={taxShipping} onChange={(e) => setTaxShipping(e.target.checked)} />
						</div>
						<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
							<Button variant="outline" onClick={() => setCreatingTax(false)}>Cancel</Button>
							<Button onClick={() => void handleCreateTax()} disabled={saving}>
								{saving ? "Creating..." : "Create Tax Rule"}
							</Button>
						</div>
					</div>
				</Card>
			)}

			{taxRules.length === 0 && !creatingTax ? (
				<div style={{ padding: 24, textAlign: "center", opacity: 0.5, fontSize: 14 }}>
					No tax rules configured. Use the store settings for a simple flat tax rate, or add rules here for per-region rates.
				</div>
			) : taxRules.length > 0 ? (
				<div style={tableStyles.wrapper}>
					<table style={tableStyles.table}>
						<thead>
							<tr>
								<th style={tableStyles.th}>Name</th>
								<th style={tableStyles.th}>Country</th>
								<th style={tableStyles.th}>State</th>
								<th style={tableStyles.th}>Rate</th>
								<th style={tableStyles.th}>Compound</th>
								<th style={tableStyles.th}>Shipping</th>
								<th style={{ ...tableStyles.th, textAlign: "right" }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{taxRules.map((rule) => (
								<tr key={rule.id}>
									<td style={{ ...tableStyles.td, fontWeight: 500 }}>{rule.name}</td>
									<td style={{ ...tableStyles.td, fontFamily: "monospace" }}>{rule.country}</td>
									<td style={{ ...tableStyles.td, fontFamily: "monospace" }}>{rule.state}</td>
									<td style={tableStyles.td}>{rule.rate}%</td>
									<td style={tableStyles.td}>{rule.compound ? <CheckCircle style={{ width: 16, height: 16, color: "#22c55e" }} /> : <XCircle style={{ width: 16, height: 16, opacity: 0.3 }} />}</td>
									<td style={tableStyles.td}>{rule.shipping ? <CheckCircle style={{ width: 16, height: 16, color: "#22c55e" }} /> : <XCircle style={{ width: 16, height: 16, opacity: 0.3 }} />}</td>
									<td style={tableStyles.tdRight}>
										<Button variant="ghost" shape="square" onClick={() => void handleDeleteTax(rule)} aria-label="Delete">
											<Trash style={{ width: 14, height: 14 }} />
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}
		</div>
	);
}

// =============================================================================
// Licenses Page
// =============================================================================

function LicensesPage() {
	const [licenses, setLicenses] = React.useState<License[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);

	const loadLicenses = React.useCallback(async () => {
		try {
			const res = await apiFetch("licenses/list", { limit: 100 });
			if (!res.ok) {
				setError("Failed to load licenses");
				return;
			}
			const data = await parseApiResponse<{ items: License[] }>(res);
			setLicenses(data.items);
		} catch {
			setError("Failed to load licenses");
		} finally {
			setLoading(false);
		}
	}, []);

	React.useEffect(() => {
		void loadLicenses();
	}, [loadLicenses]);

	const handleRevoke = async (license: License) => {
		if (!confirm(`Revoke license key "${license.key}" for ${license.customerEmail}?`)) return;
		const res = await apiFetch("licenses/revoke", { id: license.id });
		if (res.ok) await loadLicenses();
	};

	if (loading) {
		return (
			<div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
				<Loader />
			</div>
		);
	}

	if (error) return <ErrorBanner message={error} />;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<PageHeader title="Licenses" description="Software license keys for digital products" />

			{licenses.length === 0 ? (
				<EmptyState
					icon={Key}
					title="No licenses"
					description="License keys are generated automatically when customers purchase digital products."
				/>
			) : (
				<div style={tableStyles.wrapper}>
					<table style={tableStyles.table}>
						<thead>
							<tr>
								<th style={tableStyles.th}>License Key</th>
								<th style={tableStyles.th}>Product</th>
								<th style={tableStyles.th}>Customer</th>
								<th style={tableStyles.th}>Order</th>
								<th style={tableStyles.th}>Status</th>
								<th style={tableStyles.th}>Date</th>
								<th style={{ ...tableStyles.th, textAlign: "right" }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{licenses.map((license) => (
								<tr key={license.id}>
									<td style={{ ...tableStyles.td, fontFamily: "monospace", fontSize: 12 }}>{license.key}</td>
									<td style={tableStyles.td}>{license.productName}</td>
									<td style={tableStyles.td}>
										<div>{license.customerName}</div>
										<div style={{ fontSize: 12, opacity: 0.6 }}>{license.customerEmail}</div>
									</td>
									<td style={tableStyles.td}>#{license.orderNumber}</td>
									<td style={tableStyles.td}>
										<Badge variant={license.status === "active" ? "success" : license.status === "revoked" ? "danger" : "warning"}>
											{license.status}
										</Badge>
									</td>
									<td style={tableStyles.td}>{formatDate(license.createdAt)}</td>
									<td style={tableStyles.tdRight}>
										{license.status === "active" && (
											<Button variant="outline" size="sm" onClick={() => void handleRevoke(license)}>
												Revoke
											</Button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

// =============================================================================
// Settings Page
// =============================================================================

function SettingsPage() {
	const [settings, setSettings] = React.useState<SettingsData | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

	// Form state
	const [storeName, setStoreName] = React.useState("");
	const [siteUrl, setSiteUrl] = React.useState("");
	const [currency, setCurrency] = React.useState("usd");
	const [taxRate, setTaxRate] = React.useState("0");
	const [flatShipping, setFlatShipping] = React.useState("0");
	const [freeShippingThreshold, setFreeShippingThreshold] = React.useState("0");
	const [orderNotificationEmail, setOrderNotificationEmail] = React.useState("");
	const [stripeSecretKey, setStripeSecretKey] = React.useState("");
	const [stripeWebhookSecret, setStripeWebhookSecret] = React.useState("");
	const [licenseKey, setLicenseKey] = React.useState("");

	const loadSettings = React.useCallback(async () => {
		try {
			const res = await apiFetch("settings/get");
			if (!res.ok) {
				setError("Failed to load settings");
				return;
			}
			const data = await parseApiResponse<SettingsData>(res);
			setSettings(data);
			setStoreName(data.storeName);
			setSiteUrl(data.siteUrl);
			setCurrency(data.currency);
			setTaxRate(String(data.taxRate));
			setFlatShipping(String(data.flatShipping));
			setFreeShippingThreshold(String(data.freeShippingThreshold));
			setOrderNotificationEmail(data.orderNotificationEmail);
		} catch {
			setError("Failed to load settings");
		} finally {
			setLoading(false);
		}
	}, []);

	React.useEffect(() => {
		void loadSettings();
	}, [loadSettings]);

	const handleSave = async () => {
		setSaving(true);
		setSaveMessage(null);
		setError(null);

		try {
			const payload: Record<string, unknown> = {
				storeName,
				siteUrl,
				currency,
				taxRate: parseFloat(taxRate || "0"),
				flatShipping: parseInt(flatShipping || "0", 10),
				freeShippingThreshold: parseInt(freeShippingThreshold || "0", 10),
				orderNotificationEmail,
			};

			if (stripeSecretKey) payload.stripeSecretKey = stripeSecretKey;
			if (stripeWebhookSecret) payload.stripeWebhookSecret = stripeWebhookSecret;
			if (licenseKey) payload.licenseKey = licenseKey;

			const res = await apiFetch("settings/update", payload);
			if (!res.ok) {
				setError(await getErrorMessage(res, "Failed to save settings"));
				return;
			}
			setSaveMessage("Settings saved successfully");
			setStripeSecretKey("");
			setStripeWebhookSecret("");
			setLicenseKey("");
			await loadSettings();
		} catch {
			setError("Failed to save settings");
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
				<Loader />
			</div>
		);
	}

	if (error && !settings) return <ErrorBanner message={error} />;

	const tierLabel = settings?.tier === "pro_connect"
		? "Pro Connect"
		: settings?.tier === "pro"
			? "Pro"
			: "Free";

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<PageHeader title="Settings" description="Store configuration" />

			{/* Tier Banner */}
			<div style={{
				padding: "12px 16px",
				borderRadius: 8,
				border: `1px solid ${settings?.tier === "free" ? "#f59e0b40" : "#22c55e40"}`,
				background: settings?.tier === "free" ? "#f59e0b0d" : "#22c55e0d",
				display: "flex",
				alignItems: "center",
				gap: 8,
			}}>
				{settings?.tier === "free" ? (
					<Warning style={{ width: 18, height: 18, color: "#f59e0b" }} />
				) : (
					<CheckCircle style={{ width: 18, height: 18, color: "#22c55e" }} />
				)}
				<div>
					<span style={{ fontWeight: 600 }}>{tierLabel} Plan</span>
					{settings?.tier === "free" && !settings.hasStripeKey && (
						<span style={{ fontSize: 13, marginLeft: 8, opacity: 0.7 }}>
							Add your Stripe secret key below to start accepting payments.
						</span>
					)}
					{settings?.tier === "free" && settings.hasStripeKey && (
						<span style={{ fontSize: 13, marginLeft: 8, opacity: 0.7 }}>
							Upgrade to Pro for customer emails, analytics, abandoned cart recovery, and more.
						</span>
					)}
				</div>
			</div>

			{error && <ErrorBanner message={error} />}

			{saveMessage && (
				<div style={{ padding: 12, borderRadius: 8, border: "1px solid #22c55e40", background: "#22c55e0d", color: "#22c55e", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
					<CheckCircle style={{ width: 16, height: 16 }} />
					{saveMessage}
				</div>
			)}

			{/* Stripe Configuration */}
			<Card title="Stripe Configuration">
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					<div>
						<Input
							label="Stripe Secret Key"
							value={stripeSecretKey}
							onChange={(e) => setStripeSecretKey(e.target.value)}
							placeholder={settings?.hasStripeKey ? "********** (configured)" : "sk_live_..."}
							type="password"
						/>
						{settings?.hasStripeKey && (
							<p style={{ fontSize: 12, opacity: 0.5, margin: "4px 0 0" }}>
								A Stripe key is already configured. Enter a new one to replace it.
							</p>
						)}
					</div>
					<div>
						<Input
							label="Stripe Webhook Secret"
							value={stripeWebhookSecret}
							onChange={(e) => setStripeWebhookSecret(e.target.value)}
							placeholder={settings?.hasStripeWebhookSecret ? "********** (configured)" : "whsec_..."}
							type="password"
						/>
						<p style={{ fontSize: 12, opacity: 0.5, margin: "4px 0 0" }}>
							Webhook URL: {siteUrl || "https://yoursite.com"}/_emdash/api/plugins/commerce/storefront/webhook/stripe
						</p>
					</div>
				</div>
			</Card>

			{/* Store Settings */}
			<Card title="Store Settings">
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
						<Input label="Store Name" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="My Store" />
						<Input label="Site URL" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://mystore.com" />
					</div>
					<Input label="Currency (ISO code)" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="usd" />
				</div>
			</Card>

			{/* Tax & Shipping Defaults */}
			<Card title="Tax & Shipping Defaults">
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					<p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>
						These are fallback rates used when no specific shipping zones or tax rules apply.
					</p>
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
						<Input label="Tax Rate (%)" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="0" type="number" />
						<Input label="Flat Shipping (cents)" value={flatShipping} onChange={(e) => setFlatShipping(e.target.value)} placeholder="0" type="number" />
						<Input label="Free Shipping Over (cents, 0=off)" value={freeShippingThreshold} onChange={(e) => setFreeShippingThreshold(e.target.value)} placeholder="0" type="number" />
					</div>
				</div>
			</Card>

			{/* Notifications */}
			<Card title="Notifications">
				<Input
					label="Order Notification Email"
					value={orderNotificationEmail}
					onChange={(e) => setOrderNotificationEmail(e.target.value)}
					placeholder="admin@mystore.com"
				/>
			</Card>

			{/* Pro License */}
			<Card title="Pro License">
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					<Input
						label="License Key"
						value={licenseKey}
						onChange={(e) => setLicenseKey(e.target.value)}
						placeholder={settings?.hasLicenseKey ? "********** (configured)" : "Enter your Pro license key"}
						type="password"
					/>
					<p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>
						Get a Pro license at pluginsforemdash.com/pricing. Pro ($29/mo) or Pro Connect ($19/mo + 1.5%).
					</p>
				</div>
			</Card>

			{/* Save Button */}
			<div style={{ display: "flex", justifyContent: "flex-end" }}>
				<Button onClick={() => void handleSave()} disabled={saving}>
					{saving ? "Saving..." : "Save Settings"}
				</Button>
			</div>
		</div>
	);
}

// =============================================================================
// Exports
// =============================================================================

export const pages: PluginAdminExports["pages"] = {
	"/": DashboardPage,
	"/products": ProductsPage,
	"/orders": OrdersPage,
	"/customers": CustomersPage,
	"/discounts": DiscountsPage,
	"/shipping": ShippingPage,
	"/licenses": LicensesPage,
	"/settings": SettingsPage,
};

export const widgets: PluginAdminExports["widgets"] = {};
