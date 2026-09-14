/**
 * Demo dataset (spec §126).
 * Deterministic, realistic, and clearly separate from a user's real data —
 * it is only ever written when the user explicitly chooses "Load demo data",
 * and it can be cleared with a scoped reset.
 */
import { uid, seededRandom } from '../lib/id';
import { addDays, todayISO } from '../lib/dates';
import { money } from '../lib/money';
import { db } from './index';
import { defaultSettings, COURIER_PRESETS, DEFAULT_EXPENSE_CATEGORIES } from '../domain/defaults';
import type {
  AdRow,
  Customer,
  Damage,
  DirectCosts,
  Expense,
  InventoryMovement,
  Order,
  OrderItem,
  Payment,
  Product,
  Purchase,
  PurchaseItem,
  RecurringExpense,
  ReturnRecord,
  Supplier,
} from '../domain/types';

const PRODUCT_SEED: {
  name: string;
  sku: string;
  category: string;
  brand: string;
  selling: number;
  buying: number;
  packaging: number;
  freight: number;
  weight: number;
}[] = [
  { name: 'Cotton Panjabi — Ivory', sku: 'PNJ-101', category: 'Fashion', brand: 'Aarong Weave', selling: 2450, buying: 1180, packaging: 25, freight: 30, weight: 0.42 },
  { name: 'Cotton Panjabi — Slate', sku: 'PNJ-102', category: 'Fashion', brand: 'Aarong Weave', selling: 2450, buying: 1180, packaging: 25, freight: 30, weight: 0.42 },
  { name: 'Jamdani Saree — Teal', sku: 'SAR-201', category: 'Fashion', brand: 'Tangail Handloom', selling: 6800, buying: 3900, packaging: 60, freight: 45, weight: 0.68 },
  { name: 'Jamdani Saree — Rust', sku: 'SAR-202', category: 'Fashion', brand: 'Tangail Handloom', selling: 6800, buying: 3900, packaging: 60, freight: 45, weight: 0.68 },
  { name: 'Leather Wallet — Brown', sku: 'WLT-301', category: 'Accessories', brand: 'Dhaka Leather', selling: 1450, buying: 620, packaging: 18, freight: 12, weight: 0.18 },
  { name: 'Leather Belt — Black', sku: 'BLT-302', category: 'Accessories', brand: 'Dhaka Leather', selling: 1150, buying: 480, packaging: 15, freight: 10, weight: 0.22 },
  { name: 'Wireless Earbuds Pro', sku: 'AUD-401', category: 'Electronics', brand: 'SoundCore', selling: 3900, buying: 2350, packaging: 30, freight: 55, weight: 0.28 },
  { name: 'Smart Watch Series 8', sku: 'WCH-402', category: 'Electronics', brand: 'SoundCore', selling: 5200, buying: 3400, packaging: 35, freight: 60, weight: 0.34 },
  { name: 'Power Bank 20000mAh', sku: 'PWR-403', category: 'Electronics', brand: 'VoltEdge', selling: 2750, buying: 1720, packaging: 22, freight: 40, weight: 0.46 },
  { name: 'Vitamin C Serum 30ml', sku: 'BTY-501', category: 'Beauty', brand: 'GlowLab', selling: 1650, buying: 690, packaging: 20, freight: 14, weight: 0.12 },
  { name: 'Sunscreen SPF50 50ml', sku: 'BTY-502', category: 'Beauty', brand: 'GlowLab', selling: 1250, buying: 540, packaging: 18, freight: 12, weight: 0.14 },
  { name: 'Hair Oil — Herbal 100ml', sku: 'BTY-503', category: 'Beauty', brand: 'GlowLab', selling: 890, buying: 330, packaging: 16, freight: 12, weight: 0.16 },
  { name: 'Ceramic Dinner Set (16pc)', sku: 'HOM-601', category: 'Home', brand: 'Clay & Co', selling: 4300, buying: 2600, packaging: 120, freight: 90, weight: 4.8 },
  { name: 'Bedsheet Set — Queen', sku: 'HOM-602', category: 'Home', brand: 'Clay & Co', selling: 2650, buying: 1420, packaging: 40, freight: 35, weight: 1.6 },
  { name: 'Kids Cotton Frock', sku: 'KID-701', category: 'Kids', brand: 'Little Loom', selling: 990, buying: 420, packaging: 15, freight: 14, weight: 0.24 },
  { name: 'Kids Sneakers', sku: 'KID-702', category: 'Kids', brand: 'Little Loom', selling: 1750, buying: 880, packaging: 28, freight: 26, weight: 0.52 },
  { name: 'Herbal Toothpaste Pack', sku: 'HLT-801', category: 'Health', brand: 'NeemCare', selling: 480, buying: 190, packaging: 8, freight: 8, weight: 0.2 },
  { name: 'Orthopaedic Pillow', sku: 'HLT-802', category: 'Health', brand: 'NeemCare', selling: 1980, buying: 1050, packaging: 45, freight: 32, weight: 1.1 },
  { name: 'Steel Water Bottle 1L', sku: 'HOM-603', category: 'Home', brand: 'Clay & Co', selling: 850, buying: 390, packaging: 12, freight: 16, weight: 0.38 },
  { name: 'Silk Scarf — Printed', sku: 'ACC-303', category: 'Accessories', brand: 'Aarong Weave', selling: 1290, buying: 560, packaging: 14, freight: 10, weight: 0.1 },
];

const CUSTOMER_NAMES = [
  'Ayesha Rahman', 'Tanvir Hasan', 'Nusrat Jahan', 'Mahmudul Karim', 'Sabrina Akter', 'Rafiqul Islam',
  'Farhana Yeasmin', 'Imran Chowdhury', 'Shirin Sultana', 'Jahangir Alam', 'Rumana Parvin', 'Shakib Ahmed',
  'Taslima Begum', 'Arif Hossain', 'Nadia Islam', 'Kamrul Hasan', 'Sadia Afrin', 'Rashedul Haque',
  'Mithila Das', 'Zubair Rahman', 'Habiba Khatun', 'Nayeem Uddin', 'Rima Sarker', 'Sohel Rana',
  'Anika Tabassum', 'Faisal Mahmud', 'Jannatul Ferdous', 'Rakibul Islam', 'Sumaiya Noor', 'Omar Faruq',
];

const CITIES = ['Dhaka', 'Chattogram', 'Sylhet', 'Khulna', 'Rajshahi', 'Barishal', 'Rangpur', 'Mymensingh', 'Cumilla', 'Narayanganj'];

const CHANNELS = ['Facebook', 'Website', 'Instagram', 'WhatsApp', 'TikTok', 'Marketplace', 'Offline'];
const METHODS = ['COD', 'bKash', 'Nagad', 'Full Advance', 'Partial Payment', 'Card'];
const RETURN_REASONS = ['Customer refusal', 'Size', 'Quality', 'Wrong product', 'Changed mind', 'Address', 'Courier issue'];

const CAMPAIGNS: Record<string, { name: string; type: string; roas: number }[]> = {
  meta: [
    { name: 'Panjabi — Eid Collection', type: 'Advantage+ Shopping', roas: 3.8 },
    { name: 'Saree — Retargeting', type: 'Sales', roas: 2.9 },
    { name: 'Beauty — Prospecting', type: 'Sales', roas: 1.7 },
    { name: 'Electronics — Catalogue', type: 'Advantage+ Shopping', roas: 3.2 },
  ],
  google: [
    { name: 'PMax — All Products', type: 'Performance Max', roas: 3.5 },
    { name: 'Shopping — Electronics', type: 'Shopping', roas: 2.6 },
    { name: 'Search — Brand', type: 'Search', roas: 6.4 },
    { name: 'Demand Gen — Beauty', type: 'Demand Gen', roas: 1.4 },
  ],
  tiktok: [
    { name: 'Smart+ — Fashion', type: 'Smart+', roas: 2.4 },
    { name: 'Spark — Creator Video', type: 'Spark', roas: 4.1 },
    { name: 'Catalog — Home', type: 'Catalog', roas: 1.1 },
  ],
};

const META_CREATIVES = ['Eid hero video 15s', 'Carousel — 6 styles', 'Static — offer card', 'UGC testimonial 30s'];
const META_TEXTS = ['Free delivery above ৳2000', 'Eid collection is live', 'Limited stock — order today', 'Cash on delivery available'];
const TT_TEXTS = ['Shop the look', 'Before & after', 'Under ৳2500', 'Trending now'];

export interface DemoStats {
  products: number;
  customers: number;
  orders: number;
  adRows: number;
  expenses: number;
}

export async function seedDemoData(days = 120): Promise<DemoStats> {
  const rand = seededRandom(20260914);
  const today = todayISO();
  const start = addDays(today, -(days - 1));

  const now = new Date().toISOString();
  const costs = (packaging: number, freight: number): DirectCosts => ({
    importDuty: 0,
    freight: money(freight),
    customs: 0,
    handling: money(5),
    packaging: money(packaging),
    label: money(3),
    other: 0,
  });

  /* ---- couriers ---- */
  const couriers = COURIER_PRESETS.map((c, i) => ({
    id: `cou_${i}`,
    name: c.name,
    deliveryFee: money(c.deliveryFee / 100),
    codFee: money(c.codFee / 100),
    codFeePct: c.codFeePct,
    settlementDays: c.settlementDays,
    notes: '',
    active: true,
    createdAt: now,
  }));

  /* ---- suppliers ---- */
  const suppliers: Supplier[] = [
    { id: 'sup_0', name: 'Aarong Weave Wholesale', phone: '+8801711000001', email: 'sales@aarongweave.example', address: 'Tejgaon, Dhaka', notes: 'Fabric partner since 2023', createdAt: start },
    { id: 'sup_1', name: 'Tangail Handloom Cooperative', phone: '+8801711000002', email: 'orders@tangailhl.example', address: 'Tangail', notes: 'Handloom sarees, 10 day lead time', createdAt: start },
    { id: 'sup_2', name: 'SoundCore Distributors BD', phone: '+8801711000003', email: 'bd@soundcore.example', address: 'Gulshan, Dhaka', notes: 'Electronics, 2 year warranty', createdAt: start },
    { id: 'sup_3', name: 'GlowLab Cosmetics', phone: '+8801711000004', email: 'hello@glowlab.example', address: 'Uttara, Dhaka', notes: 'Skincare, small MOQ', createdAt: start },
    { id: 'sup_4', name: 'Clay & Co Ceramics', phone: '+8801711000005', email: 'sales@clayco.example', address: 'Monohardi', notes: 'Fragile — extra packaging needed', createdAt: start },
  ];

  const supplierFor = (category: string): string => {
    switch (category) {
      case 'Fashion':
        return rand() > 0.5 ? 'sup_0' : 'sup_1';
      case 'Electronics':
        return 'sup_2';
      case 'Beauty':
      case 'Health':
        return 'sup_3';
      case 'Home':
        return 'sup_4';
      default:
        return suppliers[Math.floor(rand() * suppliers.length)].id;
    }
  };

  /* ---- products ---- */
  const products: Product[] = PRODUCT_SEED.map((p, i) => ({
    id: `prd_${i}`,
    sku: p.sku,
    barcode: `880${String(1000000 + i * 137).slice(0, 7)}`,
    name: p.name,
    category: p.category,
    brand: p.brand,
    supplierId: supplierFor(p.category),
    description: `${p.brand} — ${p.category.toLowerCase()} product sourced for online retail.`,
    tags: [p.category.toLowerCase(), p.brand.toLowerCase().split(' ')[0]],
    status: 'active',
    image: null,
    notes: '',
    sellingPrice: money(p.selling),
    buyingPrice: money(p.buying),
    compareAtPrice: money(Math.round(p.selling * 1.2)),
    discountPct: 0,
    minSellingPrice: money(Math.round(p.buying * 1.25)),
    targetMarginPct: 35,
    targetProfit: money(Math.round(p.selling * 0.35)),
    reorderLevel: 12 + Math.floor(rand() * 10),
    reorderQuantity: 30,
    safetyStock: 5,
    weightKg: p.weight,
    packageWeightKg: Number((p.weight + 0.08).toFixed(2)),
    lengthCm: 20 + Math.floor(rand() * 20),
    widthCm: 15 + Math.floor(rand() * 15),
    heightCm: 5 + Math.floor(rand() * 10),
    costs: costs(p.packaging, p.freight),
    costBasis: 'perUnit',
    batchQty: 1,
    createdAt: start,
    updatedAt: now,
  }));

  /* ---- opening stock ---- */
  const movements: InventoryMovement[] = products.map((p, i) => {
    const opening = 20 + Math.floor(rand() * 90) + (i % 5) * 6;
    return {
      id: uid('mov'),
      productId: p.id,
      type: 'opening' as const,
      qty: opening,
      date: start,
      unitCost: p.buyingPrice,
      refType: 'product',
      refId: p.id,
      note: 'Opening stock',
      createdAt: now,
    };
  });

  /* ---- customers ---- */
  const customers: Customer[] = [];
  for (let i = 0; i < 180; i++) {
    const base = CUSTOMER_NAMES[i % CUSTOMER_NAMES.length];
    const suffix = i >= CUSTOMER_NAMES.length ? ` ${Math.floor(i / CUSTOMER_NAMES.length) + 1}` : '';
    const created = addDays(start, Math.floor(rand() * days));
    customers.push({
      id: `cus_${i}`,
      name: `${base}${suffix}`,
      phone: `+8801${String(300000000 + i * 7919).slice(0, 9)}`,
      email: i % 3 === 0 ? `${base.split(' ')[0].toLowerCase()}${i}@example.com` : '',
      address: `House ${1 + Math.floor(rand() * 90)}, Road ${1 + Math.floor(rand() * 20)}`,
      city: CITIES[Math.floor(rand() * CITIES.length)],
      notes: '',
      source: CHANNELS[Math.floor(rand() * CHANNELS.length)],
      tags: [],
      createdAt: created,
    });
  }

  /* ---- purchases (spread over the window, replenishing stock) ---- */
  const purchases: Purchase[] = [];
  const purchaseItems: PurchaseItem[] = [];
  for (let w = 1; w < days / 14; w++) {
    const date = addDays(start, w * 14);
    const purchaseId = `pur_${w}`;
    const supplier = suppliers[w % suppliers.length];
    const chosen = products.filter((p) => p.supplierId === supplier.id).slice(0, 4);
    purchases.push({
      id: purchaseId,
      ref: `PO-${String(1000 + w)}`,
      supplierId: supplier.id,
      date,
      expectedDate: addDays(date, 5 + Math.floor(rand() * 6)),
      receivedDate: addDays(date, 5 + Math.floor(rand() * 8)),
      status: 'received',
      note: '',
      payments: [
        {
          id: uid('pp'),
          date: addDays(date, 7),
          amount: 0,
          method: 'Bank',
        },
      ],
      additionalCosts: {
        importDuty: 0,
        freight: money(1500),
        customs: 0,
        handling: money(400),
        packaging: 0,
        label: 0,
        other: 0,
      },
      createdAt: now,
    });
    let goods = 0;
    for (const p of chosen) {
      const qty = 20 + Math.floor(rand() * 40);
      const received = qty;
      purchaseItems.push({
        id: uid('pi'),
        purchaseId,
        productId: p.id,
        qty,
        receivedQty: received,
        buyingPrice: p.buyingPrice,
      });
      goods += p.buyingPrice * received;
      movements.push({
        id: uid('mov'),
        productId: p.id,
        type: 'purchase',
        qty: received,
        date: addDays(date, 6),
        unitCost: p.buyingPrice,
        refType: 'purchase',
        refId: purchaseId,
        note: `Received ${p.sku}`,
        createdAt: now,
      });
    }
    purchases[purchases.length - 1].payments[0].amount = goods;
  }

  /* ---- orders ---- */
  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  const payments: Payment[] = [];
  const returns: ReturnRecord[] = [];
  let orderSeq = 1000;

  for (let d = 0; d < days; d++) {
    const date = addDays(start, d);
    const dow = new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay();
    // weekly rhythm + gentle upward trend + an Eid-style spike near day 90
    const weekly = dow === 5 || dow === 6 ? 1.5 : dow === 0 ? 1.15 : 1;
    const trend = 1 + (d / days) * 0.55;
    const spike = d > 82 && d < 96 ? 1.9 : 1;
    const count = Math.max(1, Math.round((2 + rand() * 5) * weekly * trend * spike));

    for (let k = 0; k < count; k++) {
      const customer = customers[Math.floor(rand() * Math.min(customers.length, 30 + d))];
      if (!customer) continue;
      const courier = couriers[Math.floor(rand() * couriers.length)];
      const channel = CHANNELS[Math.floor(rand() * CHANNELS.length)];
      const lineCount = rand() > 0.78 ? 2 : 1;
      const orderId = `ord_${d}_${k}`;
      const picked = new Set<number>();
      const lines: { product: Product; qty: number }[] = [];
      for (let l = 0; l < lineCount; l++) {
        const idx = Math.floor(rand() * products.length);
        if (picked.has(idx)) continue;
        picked.add(idx);
        lines.push({ product: products[idx], qty: 1 + (rand() > 0.85 ? 1 : 0) });
      }
      if (lines.length === 0) continue;

      const gross = lines.reduce((a, l) => a + l.product.sellingPrice * l.qty, 0);
      const discount = rand() > 0.72 ? money(Math.round((gross / 100) * 0.05)) : 0;
      const roll = rand();
      const status: Order['status'] =
        roll > 0.94 ? 'cancelled' : roll > 0.9 ? 'failed' : roll > 0.86 ? 'returned' : 'delivered';
      const method = METHODS[Math.floor(rand() * METHODS.length)];
      const advance = method === 'Full Advance' || method === 'bKash' || method === 'Nagad' || method === 'Card';

      const order: Order = {
        id: orderId,
        orderNo: `SO-${orderSeq++}`,
        date,
        customerId: customer.id,
        channel,
        courierId: courier.id,
        trackingId: `${courier.name.slice(0, 2).toUpperCase()}${String(100000 + orderSeq).slice(0, 6)}`,
        notes: '',
        status,
        paymentStatus: advance ? 'paid' : status === 'delivered' ? 'paid' : status === 'cancelled' ? 'unpaid' : 'partial',
        discount,
        shippingCharged: money(60),
        deliveryFee: courier.deliveryFee,
        codFee: advance ? 0 : courier.codFee,
        packagingCost: 0,
        paymentFee: advance ? money(Math.round((gross / 100) * 0.018)) : 0,
        otherCost: 0,
        adSpend: 0,
        attribution: {
          platform: channel === 'Facebook' || channel === 'Instagram' ? 'meta' : channel === 'TikTok' ? 'tiktok' : channel === 'Website' ? 'google' : '',
          campaign: '',
          adset: '',
          ad: '',
          creative: '',
          productId: lines[0].product.id,
          source: channel.toLowerCase(),
          medium: 'social',
          campaignId: '',
          method: 'platform',
        },
        createdAt: now,
        updatedAt: now,
      };
      orders.push(order);

      for (const line of lines) {
        orderItems.push({
          id: uid('oi'),
          orderId,
          productId: line.product.id,
          qty: line.qty,
          unitPrice: line.product.sellingPrice,
          discount: lines.length > 1 ? Math.round(discount / lines.length) : discount,
          unitCost: line.product.buyingPrice,
        });
        movements.push({
          id: uid('mov'),
          productId: line.product.id,
          type: 'sale',
          qty: -line.qty,
          date,
          unitCost: line.product.buyingPrice,
          refType: 'order',
          refId: orderId,
          note: order.orderNo,
          createdAt: now,
        });
      }

      const net = gross - discount + money(60);
      if (status === 'cancelled') continue;
      if (advance) {
        payments.push({
          id: uid('pay'),
          orderId,
          date,
          method,
          type: 'in',
          amount: net,
          note: 'Advance payment',
          createdAt: now,
        });
      } else if (status === 'delivered') {
        payments.push({
          id: uid('pay'),
          orderId,
          date: addDays(date, courier.settlementDays),
          method: 'COD',
          type: 'settlement',
          amount: net - courier.codFee,
          note: `${courier.name} COD settlement`,
          createdAt: now,
        });
      }

      if (status === 'returned') {
        const line = lines[0];
        returns.push({
          id: uid('ret'),
          orderId,
          productId: line.product.id,
          qty: line.qty,
          date: addDays(date, 2 + Math.floor(rand() * 4)),
          reason: RETURN_REASONS[Math.floor(rand() * RETURN_REASONS.length)],
          courierId: courier.id,
          returnFee: money(70),
          refund: advance ? net : 0,
          packagingLoss: money(15),
          adAllocation: 0,
          condition: rand() > 0.25 ? 'resellable' : 'damaged',
          resellable: rand() > 0.25,
          note: '',
          createdAt: now,
        });
        movements.push({
          id: uid('mov'),
          productId: line.product.id,
          type: 'return',
          qty: line.qty,
          date: addDays(date, 4),
          unitCost: line.product.buyingPrice,
          refType: 'return',
          refId: orderId,
          note: 'Customer return',
          createdAt: now,
        });
      }
    }
  }

  /* ---- damages ---- */
  const damages: Damage[] = [];
  for (let i = 0; i < 14; i++) {
    const product = products[Math.floor(rand() * products.length)];
    const qty = 1 + Math.floor(rand() * 3);
    damages.push({
      id: uid('dmg'),
      productId: product.id,
      qty,
      date: addDays(start, Math.floor(rand() * days)),
      reason: ['Warehouse handling', 'Water damage', 'Transit breakage', 'Expired stock'][Math.floor(rand() * 4)],
      unitCost: product.buyingPrice,
      recoverable: rand() > 0.7,
      recoveredAmount: money(Math.round((product.buyingPrice / 100) * 0.2)),
      note: '',
      createdAt: now,
    });
    movements.push({
      id: uid('mov'),
      productId: product.id,
      type: 'damage',
      qty: -qty,
      date: addDays(start, Math.floor(rand() * days)),
      unitCost: product.buyingPrice,
      refType: 'damage',
      refId: null,
      note: 'Written off',
      createdAt: now,
    });
  }

  /* ---- expenses + recurring ---- */
  const expenses: Expense[] = [];
  const recurring: RecurringExpense[] = [
    { name: 'Domain — selleros.shop', category: 'Domain', amount: money(1500), cycle: 'yearly', renewalType: 'Domain renewal' },
    { name: 'Cloud hosting', category: 'Hosting', amount: money(2400), cycle: 'monthly', renewalType: 'Hosting' },
    { name: 'Business email (5 seats)', category: 'Email', amount: money(1200), cycle: 'monthly', renewalType: 'Software' },
    { name: 'SSL certificate', category: 'SSL', amount: money(900), cycle: 'yearly', renewalType: 'SSL renewal' },
    { name: 'Storefront SaaS', category: 'Software', amount: money(3200), cycle: 'monthly', renewalType: 'Subscription' },
  ].map((r, i) => ({
    id: `rec_${i}`,
    ...r,
    intervalDays: 0,
    nextDue: addDays(today, 4 + i * 13),
    note: '',
    active: true,
    createdAt: start,
  })) as RecurringExpense[];

  // Recurring expenses enter the books only when they are actually paid.
  recurring.forEach((r) => {
    const spanDays = r.cycle === 'monthly' ? 30 : 365;
    for (let d = 0; d < days; d += spanDays) {
      const date = addDays(today, -d);
      if (date < start) break;
      expenses.push({
        id: uid('exp'),
        date,
        category: r.category,
        amount: r.amount,
        vendor: r.name,
        note: `${r.name} payment`,
        method: 'bKash',
        recurringId: r.id,
        createdAt: now,
      });
    }
  });

  const salaries = ['Shop assistant', 'Packing staff', 'Customer support'];
  for (let m = 0; m < Math.ceil(days / 30); m++) {
    const date = addDays(today, -m * 30);
    salaries.forEach((s, i) => {
      expenses.push({
        id: uid('exp'),
        date,
        category: 'Salary',
        amount: money([12000, 9000, 11000][i]),
        vendor: s,
        note: `${s} — monthly`,
        method: 'Bank',
        recurringId: null,
        createdAt: now,
      });
    });
    expenses.push({
      id: uid('exp'),
      date,
      category: 'Rent',
      amount: money(18000),
      vendor: 'Warehouse rent',
      note: 'Monthly rent',
      method: 'Bank',
      recurringId: null,
      createdAt: now,
    });
    expenses.push({
      id: uid('exp'),
      date,
      category: 'Utilities',
      amount: money(3200 + Math.floor(rand() * 900)),
      vendor: 'DPDC / WASA',
      note: 'Electricity and water',
      method: 'bKash',
      recurringId: null,
      createdAt: now,
    });
    expenses.push({
      id: uid('exp'),
      date,
      category: 'Internet',
      amount: money(1800),
      vendor: 'Link3',
      note: 'Broadband',
      method: 'bKash',
      recurringId: null,
      createdAt: now,
    });
  }

  const adCategories = DEFAULT_EXPENSE_CATEGORIES.filter((c) => ['Bank Fees', 'Payment Gateway', 'Tax', 'Packaging'].includes(c));
  for (let m = 0; m < Math.ceil(days / 30); m++) {
    const date = addDays(today, -m * 30);
    adCategories.forEach((c) => {
      expenses.push({
        id: uid('exp'),
        date,
        category: c,
        amount: money(c === 'Packaging' ? 4200 + Math.floor(rand() * 1500) : 600 + Math.floor(rand() * 1800)),
        vendor: c,
        note: `${c} — monthly`,
        method: 'Bank',
        recurringId: null,
        createdAt: now,
      });
    });
  }

  /* ---- advertising rows ---- */
  const adRows: AdRow[] = [];
  const platforms = Object.keys(CAMPAIGNS) as (keyof typeof CAMPAIGNS)[];
  for (let d = 0; d < days; d++) {
    const date = addDays(start, d);
    const dow = new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay();
    const weekend = dow === 5 || dow === 6 ? 1.4 : 1;
    const trend = 1 + (d / days) * 0.5;

    for (const platform of platforms) {
      for (const campaign of CAMPAIGNS[platform]) {
        if (rand() > 0.86) continue; // not every campaign runs every day
        const baseSpend = 400 + rand() * 1400;
        const spend = Math.round(baseSpend * weekend * trend);
        const roasNoise = campaign.roas * (0.6 + rand() * 0.9);
        const revenue = Math.round(spend * roasNoise);
        const cpm = platform === 'meta' ? 55 + rand() * 60 : platform === 'google' ? 40 + rand() * 90 : 30 + rand() * 40;
        const impressions = Math.round((spend / cpm) * 1000);
        const ctr = platform === 'google' ? 0.025 + rand() * 0.03 : 0.011 + rand() * 0.022;
        const clicks = Math.round(impressions * ctr);
        const landingViews = Math.round(clicks * (0.72 + rand() * 0.2));
        const atc = Math.round(landingViews * (0.1 + rand() * 0.14));
        const checkout = Math.round(atc * (0.35 + rand() * 0.25));
        const purchases = Math.max(0, Math.round(checkout * (0.45 + rand() * 0.35)));
        const product = products[Math.floor(rand() * products.length)];

        const creativeList = platform === 'meta' ? META_CREATIVES : ['Video 9:16 A', 'Video 1:1 B', 'Carousel C', 'Image D'];
        const textList = platform === 'tiktok' ? TT_TEXTS : META_TEXTS;

        adRows.push({
          id: uid('ad'),
          date,
          platform: platform as AdRow['platform'],
          account: platform === 'meta' ? 'SellerOS BD — Meta' : platform === 'google' ? 'SellerOS BD — Google' : 'SellerOS BD — TikTok',
          campaign: campaign.name,
          campaignType: campaign.type,
          campaignId: `${platform[0].toUpperCase()}${campaign.name.length}${campaign.name.charCodeAt(0)}`,
          adset: campaign.type === 'Performance Max' ? 'Asset Group — All' : `Ad Set ${1 + Math.floor(rand() * 3)}`,
          ad: `Ad ${1 + Math.floor(rand() * 4)}`,
          creative: creativeList[Math.floor(rand() * creativeList.length)],
          creativeType: platform === 'tiktok' ? (rand() > 0.5 ? 'Video' : 'Catalog Video') : rand() > 0.6 ? 'Video' : 'Image',
          text: textList[Math.floor(rand() * textList.length)],
          enhancement: platform === 'tiktok' ? (rand() > 0.6 ? 'CTA' : rand() > 0.3 ? 'Add-ons' : '') : '',
          placement: platform === 'meta' ? ['Facebook Feed', 'Instagram Reels', 'Stories', 'Audience Network'][Math.floor(rand() * 4)] : '',
          network: platform === 'google' ? ['Search', 'Shopping', 'YouTube', 'Display', 'Discover', 'Gmail'][Math.floor(rand() * 6)] : '',
          productId: product.id,
          sku: product.sku,
          spend: money(spend),
          impressions,
          reach: Math.round(impressions / (1.4 + rand() * 1.6)),
          clicks,
          linkClicks: Math.round(clicks * 0.92),
          destinationClicks: Math.round(clicks * 0.85),
          landingViews,
          addToCart: atc,
          initiateCheckout: checkout,
          purchases,
          conversions: purchases,
          conversionValue: money(revenue),
          revenue: money(revenue),
          videoViews: platform === 'tiktok' ? Math.round(impressions * 0.6) : 0,
          videoWatched25: 0,
          videoWatched50: 0,
          videoWatched75: 0,
          videoWatched100: 0,
          createdAt: now,
        });
      }
    }
  }

  /* ---- write ---- */
  await db.transaction(
    'rw',
    [
      db.products,
      db.suppliers,
      db.customers,
      db.couriers,
      db.purchases,
      db.purchaseItems,
      db.inventoryMovements,
      db.orders,
      db.orderItems,
      db.payments,
      db.returns,
      db.damages,
      db.expenses,
      db.recurringExpenses,
      db.adRows,
    ],
    async () => {
      await db.products.bulkPut(products);
      await db.suppliers.bulkPut(suppliers);
      await db.customers.bulkPut(customers);
      await db.couriers.bulkPut(couriers);
      await db.purchases.bulkPut(purchases);
      await db.purchaseItems.bulkPut(purchaseItems);
      await db.inventoryMovements.bulkPut(movements);
      await db.orders.bulkPut(orders);
      await db.orderItems.bulkPut(orderItems);
      await db.payments.bulkPut(payments);
      await db.returns.bulkPut(returns);
      await db.damages.bulkPut(damages);
      await db.expenses.bulkPut(expenses);
      await db.recurringExpenses.bulkPut(recurring);
      await db.adRows.bulkPut(adRows);
    },
  );

  return {
    products: products.length,
    customers: customers.length,
    orders: orders.length,
    adRows: adRows.length,
    expenses: expenses.length,
  };
}

export { defaultSettings };
