import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ============================================================
// Types
// ============================================================

interface DataPattern {
  id: string;
  title: string;
  description: string;
  count: number;
  percentage: number;
  category: "cross-sell" | "optimization" | "service" | "renewal";
  severity: "high" | "medium" | "low";
}

function severity(count: number, total: number): "high" | "medium" | "low" {
  const pct = total > 0 ? (count / total) * 100 : 0;
  if (pct >= 10 || count >= 100) return "high";
  if (pct >= 3 || count >= 30) return "medium";
  return "low";
}

function pct(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10; // one decimal
}

// ============================================================
// GET — aggregate-only data patterns (no PII)
// ============================================================

export async function GET() {
  try {
    const totalCustomers = await prisma.customer.count();
    if (totalCustomers === 0) {
      return NextResponse.json({ patterns: [], totalCustomers: 0 });
    }

    // Fetch all active policies (only the fields we need for grouping)
    const activePolicies = await prisma.policy.findMany({
      where: { status: "ACTIVE" },
      select: {
        customerId: true,
        category: true,
        insurer: true,
        startDate: true,
        endDate: true,
        premiumMonthly: true,
        premiumAnnual: true,
      },
    });

    // Fetch customer ages (only age field, no PII)
    const customerAges = await prisma.customer.findMany({
      select: { id: true, age: true, lastReviewDate: true },
    });
    const ageMap = new Map(customerAges.map((c) => [c.id, c]));

    // Build per-customer structures
    const customerCategories = new Map<string, Set<string>>();
    const customerInsurers = new Map<string, Set<string>>();
    const customerPremiums = new Map<string, { total: number; byCategory: Record<string, number> }>();

    for (const p of activePolicies) {
      // Categories
      if (!customerCategories.has(p.customerId)) {
        customerCategories.set(p.customerId, new Set());
      }
      customerCategories.get(p.customerId)!.add(p.category);

      // Insurers
      if (!customerInsurers.has(p.customerId)) {
        customerInsurers.set(p.customerId, new Set());
      }
      customerInsurers.get(p.customerId)!.add(p.insurer);

      // Premiums
      const premium = p.premiumAnnual ?? (p.premiumMonthly ? p.premiumMonthly * 12 : 0);
      if (!customerPremiums.has(p.customerId)) {
        customerPremiums.set(p.customerId, { total: 0, byCategory: {} });
      }
      const entry = customerPremiums.get(p.customerId)!;
      entry.total += premium;
      entry.byCategory[p.category] = (entry.byCategory[p.category] ?? 0) + premium;
    }

    const patterns: DataPattern[] = [];

    // -------------------------------------------------------
    // 1. Single category customers — group by which category
    // -------------------------------------------------------
    const singleCategoryCounts: Record<string, number> = {};
    let totalSingleCategory = 0;
    for (const [, cats] of customerCategories) {
      if (cats.size === 1) {
        const cat = [...cats][0];
        singleCategoryCounts[cat] = (singleCategoryCounts[cat] ?? 0) + 1;
        totalSingleCategory++;
      }
    }

    const categoryHebrew: Record<string, string> = {
      PROPERTY: "רכוש",
      HEALTH: "בריאות",
      LIFE: "חיים",
      PENSION: "פנסיה",
      SAVINGS: "חיסכון",
      RISK: "סיכון",
      PROVIDENT: "קרן השתלמות",
    };

    // Add the biggest single-category group as a standalone pattern
    if (totalSingleCategory > 0) {
      const topCategory = Object.entries(singleCategoryCounts).sort(
        (a, b) => b[1] - a[1]
      )[0];
      patterns.push({
        id: "single-category",
        title: `לקוחות עם ביטוח ${categoryHebrew[topCategory[0]] ?? topCategory[0]} בלבד`,
        description: `לקוחות שיש להם פוליסות פעילות בקטגוריה אחת בלבד (${totalSingleCategory} סה"כ, הגדולה ביותר: ${categoryHebrew[topCategory[0]] ?? topCategory[0]})`,
        count: totalSingleCategory,
        percentage: pct(totalSingleCategory, totalCustomers),
        category: "cross-sell",
        severity: severity(totalSingleCategory, totalCustomers),
      });
    }

    // -------------------------------------------------------
    // 2. No health insurance
    // -------------------------------------------------------
    const customersWithHealth = new Set<string>();
    for (const [cid, cats] of customerCategories) {
      if (cats.has("HEALTH")) customersWithHealth.add(cid);
    }
    const noHealthCount = customerCategories.size - customersWithHealth.size;
    if (noHealthCount > 0) {
      patterns.push({
        id: "no-health",
        title: "לקוחות ללא ביטוח בריאות",
        description: "לקוחות עם פוליסות פעילות אך ללא ביטוח בריאות, סיעוד או תאונות אישיות",
        count: noHealthCount,
        percentage: pct(noHealthCount, totalCustomers),
        category: "cross-sell",
        severity: severity(noHealthCount, totalCustomers),
      });
    }

    // -------------------------------------------------------
    // 3. Old life policies (> 3 years)
    // -------------------------------------------------------
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    const oldLifeCustomers = new Set<string>();
    for (const p of activePolicies) {
      if (p.category === "LIFE" && p.startDate && new Date(p.startDate) < threeYearsAgo) {
        oldLifeCustomers.add(p.customerId);
      }
    }
    if (oldLifeCustomers.size > 0) {
      patterns.push({
        id: "old-life-policy",
        title: "ביטוח חיים ותיק ללא בדיקת מחיר",
        description: "לקוחות עם ביטוח חיים פעיל מעל 3 שנים — כדאי לבדוק תנאים ותמחור מול השוק",
        count: oldLifeCustomers.size,
        percentage: pct(oldLifeCustomers.size, totalCustomers),
        category: "optimization",
        severity: severity(oldLifeCustomers.size, totalCustomers),
      });
    }

    // -------------------------------------------------------
    // 4. High premium concentration (>80% in one category)
    // -------------------------------------------------------
    let highConcentrationCount = 0;
    for (const [, entry] of customerPremiums) {
      if (entry.total <= 0) continue;
      for (const catPremium of Object.values(entry.byCategory)) {
        if (catPremium / entry.total > 0.8) {
          highConcentrationCount++;
          break;
        }
      }
    }
    if (highConcentrationCount > 0) {
      patterns.push({
        id: "high-premium-concentration",
        title: "ריכוז פרמיה גבוה בקטגוריה אחת",
        description: "לקוחות שמעל 80% מהפרמיה שלהם מרוכזת בקטגוריה אחת — הזדמנות לפיזור סיכונים",
        count: highConcentrationCount,
        percentage: pct(highConcentrationCount, totalCustomers),
        category: "optimization",
        severity: severity(highConcentrationCount, totalCustomers),
      });
    }

    // -------------------------------------------------------
    // 5. Age 60+ without recent review
    // -------------------------------------------------------
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    let age60NoReviewCount = 0;
    for (const c of customerAges) {
      if (
        c.age != null &&
        c.age >= 60 &&
        (!c.lastReviewDate || new Date(c.lastReviewDate) < sixMonthsAgo)
      ) {
        age60NoReviewCount++;
      }
    }
    if (age60NoReviewCount > 0) {
      patterns.push({
        id: "age-60-no-review",
        title: "לקוחות בגיל 60+ ללא סקירה אחרונה",
        description: "לקוחות מבוגרים שלא עברו סקירת תיק ב-6 חודשים האחרונים — נדרשת תשומת לב מיוחדת",
        count: age60NoReviewCount,
        percentage: pct(age60NoReviewCount, totalCustomers),
        category: "service",
        severity: severity(age60NoReviewCount, totalCustomers),
      });
    }

    // -------------------------------------------------------
    // 6. Expiring policies (next 90 days)
    // -------------------------------------------------------
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const expiringCustomers = new Set<string>();
    for (const p of activePolicies) {
      if (p.endDate) {
        const end = new Date(p.endDate);
        if (end >= now && end <= in90Days) {
          expiringCustomers.add(p.customerId);
        }
      }
    }
    if (expiringCustomers.size > 0) {
      patterns.push({
        id: "expiring-policies",
        title: "פוליסות שפגות ב-90 יום הקרובים",
        description: "לקוחות עם פוליסות שעומדות לפוג — הזדמנות לחידוש ושיפור תנאים",
        count: expiringCustomers.size,
        percentage: pct(expiringCustomers.size, totalCustomers),
        category: "renewal",
        severity: severity(expiringCustomers.size, totalCustomers),
      });
    }

    // -------------------------------------------------------
    // 7. Multiple insurers (3+ — consolidation opportunity)
    // -------------------------------------------------------
    let multiInsurerCount = 0;
    for (const [, insurers] of customerInsurers) {
      if (insurers.size >= 3) multiInsurerCount++;
    }
    if (multiInsurerCount > 0) {
      patterns.push({
        id: "multiple-insurers",
        title: "לקוחות עם 3+ חברות ביטוח",
        description: "לקוחות מפוזרים בין מספר רב של יצרנים — אפשרות לאיחוד ולהשגת תנאים טובים יותר",
        count: multiInsurerCount,
        percentage: pct(multiInsurerCount, totalCustomers),
        category: "optimization",
        severity: severity(multiInsurerCount, totalCustomers),
      });
    }

    // -------------------------------------------------------
    // 8. Young with pension (under 40) — stock allocation review
    // -------------------------------------------------------
    let youngPensionCount = 0;
    for (const [cid, cats] of customerCategories) {
      if (cats.has("PENSION") || cats.has("PROVIDENT")) {
        const cust = ageMap.get(cid);
        if (cust && cust.age != null && cust.age < 40) {
          youngPensionCount++;
        }
      }
    }
    if (youngPensionCount > 0) {
      patterns.push({
        id: "young-pension",
        title: "צעירים מתחת ל-40 עם פנסיה/השתלמות",
        description: "לקוחות צעירים עם חיסכון פנסיוני — כדאי לבדוק הקצאת מניות ומסלולי השקעה",
        count: youngPensionCount,
        percentage: pct(youngPensionCount, totalCustomers),
        category: "optimization",
        severity: severity(youngPensionCount, totalCustomers),
      });
    }

    // -------------------------------------------------------
    // 9. Cross-file customers (PROPERTY + non-PROPERTY)
    // -------------------------------------------------------
    let crossFileCount = 0;
    for (const [, cats] of customerCategories) {
      if (cats.has("PROPERTY") && cats.size > 1) {
        const nonPropertyCats = [...cats].filter((c) => c !== "PROPERTY");
        if (nonPropertyCats.length > 0) crossFileCount++;
      }
    }
    if (crossFileCount > 0) {
      patterns.push({
        id: "cross-file",
        title: "לקוחות רב-ענפיים (רכוש + חיים)",
        description: "לקוחות עם ביטוח רכוש וגם ביטוח חיים/פנסיוני — לקוחות בעלי ערך גבוה לשימור",
        count: crossFileCount,
        percentage: pct(crossFileCount, totalCustomers),
        category: "service",
        severity: severity(crossFileCount, totalCustomers),
      });
    }

    // -------------------------------------------------------
    // 10. No property insurance (has life/pension but no property)
    // -------------------------------------------------------
    let noPropertyCount = 0;
    for (const [, cats] of customerCategories) {
      if (!cats.has("PROPERTY")) {
        const hasLifeSide = [...cats].some((c) =>
          ["LIFE", "PENSION", "SAVINGS", "PROVIDENT", "HEALTH"].includes(c)
        );
        if (hasLifeSide) noPropertyCount++;
      }
    }
    if (noPropertyCount > 0) {
      patterns.push({
        id: "no-property",
        title: "לקוחות חיים ללא ביטוח רכוש",
        description: "לקוחות עם ביטוח חיים או פנסיה אך ללא ביטוח רכוש — הזדמנות מכירה חוצת ענפים",
        count: noPropertyCount,
        percentage: pct(noPropertyCount, totalCustomers),
        category: "cross-sell",
        severity: severity(noPropertyCount, totalCustomers),
      });
    }

    // Sort: high > medium > low, then by count desc
    const severityOrder = { high: 0, medium: 1, low: 2 };
    patterns.sort(
      (a, b) =>
        severityOrder[a.severity] - severityOrder[b.severity] || b.count - a.count
    );

    return NextResponse.json({ patterns, totalCustomers });
  } catch (error) {
    console.error("Data patterns query failed:", error);
    return NextResponse.json(
      { error: "Failed to compute data patterns" },
      { status: 500 }
    );
  }
}
