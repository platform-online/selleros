import Dexie, { type Table } from 'dexie';
import type {
  AdRow,
  AuditEntry,
  Business,
  Courier,
  Customer,
  Damage,
  Expense,
  Goal,
  InventoryMovement,
  LedgerEntry,
  ManualLedgerEntry,
  NotificationState,
  Order,
  OrderItem,
  Payment,
  Product,
  Purchase,
  PurchaseItem,
  RecurringExpense,
  ReturnRecord,
  Settings,
  Supplier,
} from '../domain/types';

/**
 * Schema version.
 * Bump this when the shape changes and add a `.version(n).stores(...)` entry
 * with an `upgrade()` that migrates existing rows. Upgrades never drop a table
 * that holds user data — they transform it in place.
 */
export const SCHEMA_VERSION = 1;

export const DB_NAME = 'selleros';

/**
 * Table → index definitions. `&` = unique, `*` = multi-entry, `[a+b]` = compound.
 * Indexed fields are the only ones we may query by; everything else is read
 * from the record.
 */
export const STORES = {
  business: '&id',
  settings: '&id',
  products: '&id, &sku, name, category, status, updatedAt',
  inventoryMovements: '&id, productId, date, type, [productId+date]',
  purchases: '&id, supplierId, date, status',
  purchaseItems: '&id, purchaseId, productId',
  suppliers: '&id, name',
  customers: '&id, name, phone, createdAt',
  orders: '&id, &orderNo, date, customerId, courierId, status, channel, [customerId+date]',
  orderItems: '&id, orderId, productId',
  payments: '&id, orderId, date, type',
  couriers: '&id, name',
  returns: '&id, orderId, productId, date',
  damages: '&id, productId, date',
  expenses: '&id, date, category',
  recurringExpenses: '&id, nextDue, category',
  manualLedger: '&id, date',
  ledger: '&id, date, [date+direction]',
  adRows: '&id, date, platform, campaign, productId, [platform+date]',
  goals: '&id, metric',
  audit: '&id, at, entity',
  notificationStates: '&id',
} as const;

export class SellerOSDB extends Dexie {
  business!: Table<Business, string>;
  settings!: Table<Settings, string>;
  products!: Table<Product, string>;
  inventoryMovements!: Table<InventoryMovement, string>;
  purchases!: Table<Purchase, string>;
  purchaseItems!: Table<PurchaseItem, string>;
  suppliers!: Table<Supplier, string>;
  customers!: Table<Customer, string>;
  orders!: Table<Order, string>;
  orderItems!: Table<OrderItem, string>;
  payments!: Table<Payment, string>;
  couriers!: Table<Courier, string>;
  returns!: Table<ReturnRecord, string>;
  damages!: Table<Damage, string>;
  expenses!: Table<Expense, string>;
  recurringExpenses!: Table<RecurringExpense, string>;
  manualLedger!: Table<ManualLedgerEntry, string>;
  ledger!: Table<LedgerEntry, string>;
  adRows!: Table<AdRow, string>;
  goals!: Table<Goal, string>;
  audit!: Table<AuditEntry, string>;
  notificationStates!: Table<NotificationState, string>;

  constructor(name = DB_NAME) {
    super(name);

    // v1 — initial schema.
    this.version(1).stores({ ...STORES });

    // Future versions are declared here so upgrades stay explicit and auditable:
    //
    // this.version(2)
    //   .stores({ ...STORES, newTable: '&id' })
    //   .upgrade((tx) => tx.table('products').toCollection().modify((p) => { ... }));
  }
}

/** Tables that hold *business data* (cleared by scoped reset). */
export const DATA_TABLES = [
  'products',
  'inventoryMovements',
  'purchases',
  'purchaseItems',
  'suppliers',
  'customers',
  'orders',
  'orderItems',
  'payments',
  'couriers',
  'returns',
  'damages',
  'expenses',
  'recurringExpenses',
  'manualLedger',
  'ledger',
  'adRows',
  'goals',
  'audit',
] as const;

/** Tables that define the workspace itself — a reset NEVER touches these. */
export const WORKSPACE_TABLES = ['business', 'settings', 'notificationStates'] as const;

export type DataTable = (typeof DATA_TABLES)[number];
export type WorkspaceTable = (typeof WORKSPACE_TABLES)[number];

/**
 * Scoped reset groups (spec §9). Each group lists the tables it clears plus the
 * derived projections that must be recomputed afterwards.
 */
export const RESET_SCOPES = {
  orders: { tables: ['orders', 'orderItems', 'payments'] as DataTable[], rebuild: ['ledger'] },
  customers: { tables: ['customers'] as DataTable[], rebuild: ['ledger'] },
  products: { tables: ['products'] as DataTable[], rebuild: ['inventoryMovements', 'ledger'] },
  inventory: { tables: ['inventoryMovements'] as DataTable[], rebuild: [] },
  purchases: { tables: ['purchases', 'purchaseItems'] as DataTable[], rebuild: ['ledger'] },
  suppliers: { tables: ['suppliers'] as DataTable[], rebuild: ['ledger'] },
  expenses: { tables: ['expenses', 'recurringExpenses'] as DataTable[], rebuild: ['ledger'] },
  ledger: { tables: ['manualLedger', 'ledger'] as DataTable[], rebuild: ['ledger'] },
  ads: { tables: ['adRows'] as DataTable[], rebuild: [] },
  returns: { tables: ['returns'] as DataTable[], rebuild: ['ledger'] },
  damages: { tables: ['damages'] as DataTable[], rebuild: [] },
} as const;

export type ResetScope = keyof typeof RESET_SCOPES;
