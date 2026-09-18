// utils/CalculationUtils.js
// ============================================================
// SERVER-SIDE CalculationUtils (backend)
// Authoritative COGS resolver — reads transaction.cost when present,
// else falls back to item-level cost → buyingPrice → product lookup.
// ============================================================
const CalculationUtils = {
  // ---------------------------------------------------------
  // Safe numeric coercion
  // ---------------------------------------------------------
  safeNumber: (v, d = 0) => {
    if (v === null || v === undefined || v === '') return d;
    const n = Number(v);
    return isNaN(n) ? d : n;
  },

  // ---------------------------------------------------------
  // Profit margin
  // ---------------------------------------------------------
  calculateProfitMargin: (revenue, profit) => {
    const r = CalculationUtils.safeNumber(revenue);
    return r > 0 ? (CalculationUtils.safeNumber(profit) / r) * 100 : 0;
  },

  // ---------------------------------------------------------
  // Item-level cost resolver (defensive)
  // Order of preference:
  //   1. item.cost       (line-level, already multiplied by qty — usually)
  //   2. item.buyingPrice (per-unit)
  //   3. item.costPrice  (per-unit)
  //   4. item.unitCost   (per-unit)
  //   5. item.productId.buyingPrice  (populated object)
  //   6. products[] lookup by productId  (if passed)
  //   7. products[] lookup by productName  (if passed)
  // ---------------------------------------------------------
  resolveItemUnitCost: (item, products = []) => {
    if (!item || typeof item !== 'object') return 0;

    // 2. item.buyingPrice (per-unit — primary source after backend fix)
    if (item.buyingPrice !== undefined && item.buyingPrice !== null) {
      const v = CalculationUtils.safeNumber(item.buyingPrice, -1);
      if (v > 0) return v;
    }

    // 3. item.costPrice (per-unit alias)
    if (item.costPrice !== undefined && item.costPrice !== null) {
      const v = CalculationUtils.safeNumber(item.costPrice, -1);
      if (v > 0) return v;
    }

    // 4. item.unitCost (per-unit alias)
    if (item.unitCost !== undefined && item.unitCost !== null) {
      const v = CalculationUtils.safeNumber(item.unitCost, -1);
      if (v > 0) return v;
    }

    // 5. populated product object
    if (item.productId && typeof item.productId === 'object') {
      const v = CalculationUtils.safeNumber(item.productId.buyingPrice, -1);
      if (v > 0) return v;
    }

    // 6. products[] lookup by productId
    if (Array.isArray(products) && products.length > 0 && item.productId) {
      const idStr =
        typeof item.productId === 'object'
          ? item.productId._id?.toString()
          : item.productId.toString();
      const found = products.find((p) => p && p._id && p._id.toString() === idStr);
      if (found) {
        const v = CalculationUtils.safeNumber(found.buyingPrice, -1);
        if (v > 0) return v;
      }
    }

    // 7. products[] lookup by productName
    if (Array.isArray(products) && products.length > 0 && item.productName) {
      const found = products.find((p) => p && p.name === item.productName);
      if (found) {
        const v = CalculationUtils.safeNumber(found.buyingPrice, -1);
        if (v > 0) return v;
      }
    }

    return 0;
  },

  // ---------------------------------------------------------
  // Item-level cost total (unit cost × quantity)
  // ---------------------------------------------------------
  calculateCostFromItems: (transaction, products = []) => {
    if (!transaction || typeof transaction !== 'object') return 0;

    const items = Array.isArray(transaction.items) ? transaction.items : [];
    let total = 0;
    let resolved = false;

    for (const item of items) {
      if (!item) continue;
      const qty = CalculationUtils.safeNumber(item.quantity, 1);
      const unitCost = CalculationUtils.resolveItemUnitCost(item, products);
      if (unitCost > 0) resolved = true;
      total += unitCost * qty;
    }

    return resolved ? total : 0;
  },

  // ---------------------------------------------------------
  // COGS — THE AUTHORITATIVE RESOLVER
  //
  // Priority:
  //   1. Sum of t.cost IF > 0  (fast path — post-backend-fix data)
  //   2. Sum of item-level costs (old data with cost: 0 at top level)
  //   3. products[] lookup for full accuracy on legacy data
  // ---------------------------------------------------------
  calculateCOGS: (txs, products = []) => {
    if (!Array.isArray(txs)) return 0;

    return txs.reduce((sum, t) => {
      if (!t) return sum;

      // 1. Fast path — server-stored cost
      const stored = CalculationUtils.safeNumber(t.cost);
      if (stored > 0) return sum + stored;

      // 1b. Alternative stored field
      const storedTotal = CalculationUtils.safeNumber(t.totalCost);
      if (storedTotal > 0) return sum + storedTotal;

      // 2. Sum per-item costs
      const fromItems = CalculationUtils.calculateCostFromItems(t, products);
      if (fromItems > 0) return sum + fromItems;

      // Nothing available
      return sum;
    }, 0);
  },

  // ---------------------------------------------------------
  // Revenue — same as before
  // ---------------------------------------------------------
  calculateRevenue: (txs) =>
    Array.isArray(txs)
      ? txs.reduce((s, t) => s + CalculationUtils.safeNumber(t.totalAmount), 0)
      : 0,

  // ---------------------------------------------------------
  // Payment composition — same as before
  // ---------------------------------------------------------
  calculatePaymentComposition: (txs = []) => {
    const comp = {
      cash: 0,
      mpesa_bank: 0,
      total: 0,
      transactions: txs.length,
      cashPercentage: 0,
      mpesaBankPercentage: 0,
    };

    txs.forEach((t) => {
      if (!t) return;
      if (t.paymentSplit) {
        comp.cash += CalculationUtils.safeNumber(t.paymentSplit.cash);
        comp.mpesa_bank += CalculationUtils.safeNumber(t.paymentSplit.mpesa_bank);
      } else {
        const amt = CalculationUtils.safeNumber(t.totalAmount);
        if (t.paymentMethod === 'cash') comp.cash += amt;
        else comp.mpesa_bank += amt;
      }
    });

    comp.total = comp.cash + comp.mpesa_bank;
    comp.cashPercentage = comp.total > 0 ? (comp.cash / comp.total) * 100 : 0;
    comp.mpesaBankPercentage = comp.total > 0 ? (comp.mpesa_bank / comp.total) * 100 : 0;

    return comp;
  },

  // ---------------------------------------------------------
  // Performance metrics — unchanged, but now uses fixed COGS
  // ---------------------------------------------------------
  calculatePerformanceMetrics: (txs = [], products = []) => {
    if (!txs.length) {
      return {
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        totalTransactions: 0,
        totalItemsSold: 0,
        profitMargin: 0,
        performanceScore: 0,
        paymentMethods: { cash: 0, mpesa_bank: 0 },
        digitalPaymentRatio: 0,
        cashPaymentRatio: 0,
        averageTransactionValue: 0,
        totalCash: 0,
        totalBankMpesa: 0,
        cashPercentage: 0,
        mpesaBankPercentage: 0,
      };
    }

    const totalRevenue = txs.reduce(
      (s, t) => s + CalculationUtils.safeNumber(t.totalAmount),
      0
    );
    const totalCost = CalculationUtils.calculateCOGS(txs, products);
    const totalProfit = totalRevenue - totalCost;
    const totalItemsSold = txs.reduce(
      (s, t) => s + CalculationUtils.safeNumber(t.itemsCount || 0),
      0
    );
    const profitMargin = CalculationUtils.calculateProfitMargin(totalRevenue, totalProfit);

    const paymentMethods = { cash: 0, mpesa_bank: 0 };
    txs.forEach((t) => {
      if (t.paymentSplit) {
        paymentMethods.cash += CalculationUtils.safeNumber(t.paymentSplit.cash);
        paymentMethods.mpesa_bank += CalculationUtils.safeNumber(t.paymentSplit.mpesa_bank);
      } else {
        const amt = CalculationUtils.safeNumber(t.totalAmount);
        if (t.paymentMethod === 'cash') paymentMethods.cash += amt;
        else paymentMethods.mpesa_bank += amt;
      }
    });

    const digitalPaymentRatio =
      totalRevenue > 0 ? (paymentMethods.mpesa_bank / totalRevenue) * 100 : 0;
    const cashPaymentRatio =
      totalRevenue > 0 ? (paymentMethods.cash / totalRevenue) * 100 : 0;

    let score = 0;
    score += Math.min(40, (totalRevenue / 10000) * 40);
    score += Math.min(30, (txs.length / 50) * 30);
    score += Math.min(15, digitalPaymentRatio * 0.15);
    score += Math.min(15, (Math.max(0, profitMargin) / 50) * 15);

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      totalTransactions: txs.length,
      totalItemsSold,
      profitMargin,
      performanceScore: Math.round(Math.min(100, score)),
      paymentMethods,
      digitalPaymentRatio,
      cashPaymentRatio,
      averageTransactionValue: txs.length > 0 ? totalRevenue / txs.length : 0,
      totalCash: paymentMethods.cash,
      totalBankMpesa: paymentMethods.mpesa_bank,
      cashPercentage: cashPaymentRatio,
      mpesaBankPercentage: digitalPaymentRatio,
    };
  },

  // ---------------------------------------------------------
  // Daily breakdown — unchanged
  // ---------------------------------------------------------
  generateDailyBreakdown: (txs) => {
    const map = new Map();
    txs.forEach((t) => {
      const key = new Date(t.saleDate || t.createdAt).toISOString().split('T')[0];
      if (!map.has(key)) {
        map.set(key, {
          date: new Date(key),
          revenue: 0,
          transactions: 0,
          profit: 0,
          cash: 0,
          mpesa_bank: 0,
        });
      }
      const d = map.get(key);
      d.revenue += CalculationUtils.safeNumber(t.totalAmount);
      d.transactions += 1;
      d.profit += CalculationUtils.safeNumber(t.profit);
      if (t.paymentSplit) {
        d.cash += CalculationUtils.safeNumber(t.paymentSplit.cash);
        d.mpesa_bank += CalculationUtils.safeNumber(t.paymentSplit.mpesa_bank);
      } else if (t.paymentMethod === 'cash') {
        d.cash += CalculationUtils.safeNumber(t.totalAmount);
      } else {
        d.mpesa_bank += CalculationUtils.safeNumber(t.totalAmount);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.date - b.date);
  },

  // ---------------------------------------------------------
  // Top products — unchanged, but with name fallbacks
  // ---------------------------------------------------------
  generateTopProducts: (txs, limit = 10) => {
    const map = new Map();
    txs.forEach((t) =>
      t.items?.forEach((i) => {
        const key = i.productId?.toString() || i.productName || 'Unknown';
        if (!map.has(key)) {
          map.set(key, {
            productName: i.productName || i.name || 'Unknown Item',
            productId: i.productId,
            quantitySold: 0,
            revenue: 0,
            profit: 0,
          });
        }
        const p = map.get(key);
        p.quantitySold += CalculationUtils.safeNumber(i.quantity);
        p.revenue += CalculationUtils.safeNumber(i.totalPrice);
        p.profit += CalculationUtils.safeNumber(i.profit);
      })
    );
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  },
};

module.exports = { CalculationUtils };