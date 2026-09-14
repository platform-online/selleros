import { describe, expect, it } from 'vitest';
import { money, roundMinor, add, sub, allocate } from '../../lib/money';
import {
  directCostPerUnit,
  landedCost,
  trueUnitCost,
  orderEconomics,
  returnEconomics,
  breakEven,
  profitAndLoss,
  cashFlow,
  stockFromMovements,
} from '../finance';
import { EMPTY_DIRECT_COSTS } from '../finance';
import type { Order, OrderItem, Product, ReturnRecord, InventoryMovement } from '../types';

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  sku: 'SKU-1',
  barcode: '',
  name: 'Widget',
  category: 'Test',
  brand: '',
  supplierId: null,
  description: '',
  tags: [],
  status: 'active',
  image: null,
  notes: '',
  sellingPrice: money('1000'),
  buyingPrice: money('600'),
  compareAtPrice: 0,
  discountPct: 0,
  minSellingPrice: 0,
  targetMarginPct: 30,
  targetProfit: 0,
  reorderLevel: 5,
  reorderQuantity: 10,
  safetyStock: 2,
  weightKg: 0,
  packageWeightKg: 0,
  lengthCm: 0,
  widthCm: 0,
  heightCm: 0,
  costs: { ...EMPTY_DIRECT_COSTS, freight: money('50'), packaging: money('10') },
  costBasis: 'perUnit',
  batchQty: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

describe('landed / true unit cost', () => {
  it('adds direct costs to buying price (perUnit basis)', () => {
    // 600 buying + 50 freight + 10 packaging = 660
    expect(landedCost(product())).toBe(66000);
    expect(trueUnitCost(product())).toBe(66000);
  });

  it('percentOfBuying basis scales with buying price', () => {
    const p = product({ costBasis: 'percentOfBuying', costs: { ...EMPTY_DIRECT_COSTS, freight: 10 } });
    // 10% of 600 = 60 per unit
    expect(directCostPerUnit(p)).toBe(6000);
  });

  it('batch basis divides total batch cost by quantity', () => {
    const p = product({ costBasis: 'batch', batchQty: 10, costs: { ...EMPTY_DIRECT_COSTS, freight: money('100') } });
    // 100 major / 10 = 10 per unit
    expect(directCostPerUnit(p)).toBe(1000);
  });
});

describe('order economics', () => {
  const order: Order = {
    id: 'o1',
    orderNo: 'SO-1',
    date: '2026-09-01',
    customerId: null,
    channel: 'Facebook',
    courierId: null,
    trackingId: '',
    notes: '',
    status: 'delivered',
    paymentStatus: 'paid',
    discount: money('50'),
    shippingCharged: money('80'),
    deliveryFee: money('60'),
    codFee: money('10'),
    packagingCost: money('20'),
    paymentFee: money('15'),
    otherCost: 0,
    adSpend: 0,
    attribution: {
      platform: '',
      campaign: '',
      adset: '',
      ad: '',
      creative: '',
      productId: null,
      source: '',
      medium: '',
      campaignId: '',
      method: 'manual',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const item: OrderItem = {
    id: 'i1',
    orderId: 'o1',
    productId: 'p1',
    qty: 2,
    unitPrice: money('1000'),
    discount: 0,
    unitCost: 66000,
  };

  const eco = orderEconomics(order, [item], {
    productById: new Map([['p1', product()]]),
    courierById: new Map(),
  });

  it('net revenue = gross − discounts + shipping', () => {
    // gross 2000 − 50 + 80 = 2030
    expect(eco.grossRevenue).toBe(200000);
    expect(eco.netRevenue).toBe(203000);
  });

  it('profit deducts the full cost stack, not just buying price', () => {
    // revenue 2030 − cogs 1320 − courier 70 − packaging 20 − payment 15 = 605
    expect(eco.cogs).toBe(132000);
    expect(eco.contributionProfit).toBe(60500);
  });
});

describe('returns: cash cost vs recovered stock stay separate', () => {
  const unitCost = 66000;
  const resellable: ReturnRecord = {
    id: 'r1',
    orderId: 'o1',
    productId: 'p1',
    qty: 1,
    date: '2026-09-02',
    reason: 'changed mind',
    courierId: null,
    returnFee: money('50'),
    refund: 0,
    packagingLoss: 0,
    adAllocation: 0,
    condition: 'resellable',
    resellable: true,
    note: '',
    createdAt: new Date().toISOString(),
  };
  const damaged: ReturnRecord = { ...resellable, id: 'r2', condition: 'damaged', resellable: false };

  it('cash cost counts fees; recovered stock is reported separately', () => {
    const econ = returnEconomics([resellable, damaged], { unitCostOf: () => unitCost });
    // cash cost = returnFee 50 (resellable) + returnFee 50 + writeoff 660 (damaged)
    expect(econ.cashCost).toBe(5000 + 5000 + 66000);
    // recovered = 1 unit at cost
    expect(econ.recoveredStockValue).toBe(unitCost);
  });
});

describe('break-even never shows infinity', () => {
  const pl = profitAndLoss({
    orders: [],
    orderItems: [],
    returns: [],
    damages: [],
    expenses: [],
    adRows: [],
    unitCostOf: () => 0,
  });

  it('returns null with a reason when there is no contribution', () => {
    const be = breakEven({ ...pl, netRevenue: money('1000'), contributionMarginPct: -5 }, 10000);
    expect(be.breakEvenRevenue).toBeNull();
    expect(be.unavailableReason).toBe('no-contribution');
    expect(Number.isFinite(be.breakEvenRevenue ?? 0)).toBe(true);
  });

  it('computes finite break-even when margin is positive', () => {
    const be = breakEven({ ...pl, netRevenue: money('1000'), contributionMarginPct: 40 }, money('400'));
    // 400 / 0.40 = 1000
    expect(be.breakEvenRevenue).toBe(money('1000'));
  });
});

describe('cash flow separates operating / investing / financing', () => {
  it('classifies expenses by category', () => {
    const cf = cashFlow({
      openingBalance: 0,
      priorNetCash: 0,
      payments: [],
      purchasePayments: [],
      expenses: [
        { id: 'e1', date: '2026-09-01', category: 'Equipment', amount: 10000, vendor: '', note: '', method: '', recurringId: null, createdAt: '' },
        { id: 'e2', date: '2026-09-01', category: 'Rent', amount: 5000, vendor: '', note: '', method: '', recurringId: null, createdAt: '' },
      ],
      manual: [],
    });
    expect(cf.investingOut).toBe(10000);
    expect(cf.operatingOut).toBe(5000);
    expect(cf.closingCash).toBe(-15000);
  });
});

describe('stock is derived from movements', () => {
  it('onHand = in − out, value = onHand × cost', () => {
    const moves: InventoryMovement[] = [
      { id: 'm1', productId: 'p1', type: 'opening', qty: 10, date: '2026-09-01', unitCost: 66000, refType: null, refId: null, note: '', createdAt: '' },
      { id: 'm2', productId: 'p1', type: 'sale', qty: -3, date: '2026-09-02', unitCost: 66000, refType: 'order', refId: 'o1', note: '', createdAt: '' },
    ];
    const pos = stockFromMovements('p1', moves, 66000);
    expect(pos.onHand).toBe(7);
    expect(pos.inventoryValue).toBe(roundMinor(7 * 66000));
  });
});

describe('money engine', () => {
  it('parses and allocates exactly', () => {
    expect(money('249.99')).toBe(24999);
    expect(add(money('1'), money('2'))).toBe(300);
    expect(sub(money('5'), money('2'))).toBe(300);
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
  });
});
