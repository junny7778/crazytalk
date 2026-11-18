import type { DemoState } from "./model";

export function packagePurchases(data: DemoState) {
  const packages = new Map((data.orders ?? []).map(pack => [pack.id, pack]));
  const represented = new Set<string>();
  const purchases = data.credits.flatMap(entry => {
    const pack = entry.orderId && packages.get(entry.orderId);
    if (!pack || !["新购", "购课", "充值", "续费"].includes(entry.type)) return [];
    if (entry.purchaseId === pack.id || (!entry.purchaseId && entry.type === pack.kind &&
      entry.units === pack.units && entry.date === pack.date)) represented.add(pack.id);
    return [{
      id: entry.purchaseId ?? entry.id, packageId: pack.id,
      date: entry.date, units: entry.units, kind: entry.type,
      studentIds: entry.purchaseStudentIds ?? pack.studentIds,
    }];
  });
  // Older imports can contain a purchase order without its matching ledger row.
  for (const pack of packages.values()) {
    if (!represented.has(pack.id) && ["新购", "购课", "充值", "续费"].includes(pack.kind)) {
      purchases.push({ id: pack.id, packageId: pack.id, date: pack.date,
        units: pack.units, kind: pack.kind, studentIds: pack.studentIds });
    }
  }
  return purchases;
}
