/**
 * Shared mock data for the Studio variants.
 * Every aesthetic preview renders the SAME customers so you can
 * honestly judge the design, not the data.
 */

export interface StudioInsight {
  title: string;
  category: string;
  score: number;
}

export interface StudioQueueEntry {
  rank: number;
  customerName: string;
  age: number;
  policyCount: number;
  savings: string;          // "₪812,000"
  whyToday: string;         // "הלקוח הגיע לגיל 60 לאחרונה"
  reasonCategory: string;   // "אבן דרך גילית"
  reasonIcon: string;       // emoji
  primaryInsight: StudioInsight;
  supporting: StudioInsight[];
  phone: string;
  gender: "male" | "female";
}

export const STUDIO_QUEUE: StudioQueueEntry[] = [
  {
    rank: 1,
    customerName: "דוד כהן",
    age: 66,
    policyCount: 8,
    savings: "₪812,000",
    whyToday: "הלקוח הגיע לגיל 66 לאחרונה",
    reasonCategory: "אבן דרך גילית",
    reasonIcon: "🎯",
    primaryInsight: {
      title: "תכנון פרישה",
      category: "AGE_MILESTONE",
      score: 92,
    },
    supporting: [
      { title: "דמי ניהול חריגים בקרן השתלמות", category: "COST_OPTIMIZATION", score: 78 },
      { title: "חסר ביטוח סיעודי", category: "COVERAGE_GAP", score: 64 },
    ],
    phone: "052-7141975",
    gender: "male",
  },
  {
    rank: 2,
    customerName: "שירה לוי",
    age: 47,
    policyCount: 4,
    savings: "₪1,240,000",
    whyToday: "לקוח בעל ערך גבוה (₪1,240,000)",
    reasonCategory: "לקוח משמעותי",
    reasonIcon: "💎",
    primaryInsight: {
      title: "סקירת השקעות וחשיפה לשוק ההון",
      category: "HIGH_VALUE",
      score: 88,
    },
    supporting: [
      { title: "ביטוח חיים לא נבדק 4 שנים", category: "POLICY_AGE_REVIEW", score: 71 },
    ],
    phone: "054-8823311",
    gender: "female",
  },
  {
    rank: 3,
    customerName: "יואב בן-דוד",
    age: 52,
    policyCount: 3,
    savings: "₪340,000",
    whyToday: "דמי ניהול חריגים על חיסכון של ₪340,000",
    reasonCategory: "אופטימיזציית עלות",
    reasonIcon: "💰",
    primaryInsight: {
      title: "העברת קרן השתלמות — חיסכון ₪4,200/שנה",
      category: "COST_OPTIMIZATION",
      score: 85,
    },
    supporting: [
      { title: "אין ביטוח בריאות פרטי", category: "COVERAGE_GAP", score: 62 },
      { title: "לא נוצר קשר 14 חודשים", category: "SERVICE", score: 48 },
    ],
    phone: "050-3317788",
    gender: "male",
  },
  {
    rank: 4,
    customerName: "מיכל אברהם",
    age: 38,
    policyCount: 2,
    savings: "₪95,000",
    whyToday: "חסר כיסוי בריאות",
    reasonCategory: "פער כיסוי",
    reasonIcon: "🛡️",
    primaryInsight: {
      title: "הצעת ביטוח בריאות פרטי",
      category: "COVERAGE_GAP",
      score: 74,
    },
    supporting: [],
    phone: "052-9904411",
    gender: "female",
  },
  {
    rank: 5,
    customerName: "אבישי שרון",
    age: 61,
    policyCount: 6,
    savings: "₪620,000",
    whyToday: "הלקוח הגיע לגיל 61 לאחרונה",
    reasonCategory: "אבן דרך גילית",
    reasonIcon: "🎯",
    primaryInsight: {
      title: "תכנון פרישה + סקירת פנסיות",
      category: "AGE_MILESTONE",
      score: 86,
    },
    supporting: [
      { title: "3 קופות גמל בחברות שונות — איחוד", category: "COST_OPTIMIZATION", score: 70 },
    ],
    phone: "054-1192833",
    gender: "male",
  },
];

export const STUDIO_STATS = {
  totalCustomers: 8003,
  totalInsights: 17256,
  queueToday: 20,
  pendingApprovals: 4,
  completedToday: 3,
  lastRebuild: "לפני 2 שעות",
};

export const STUDIO_VARIANTS = [
  {
    slug: "editorial",
    title: "Editorial",
    titleHe: "כתב עת",
    tagline: "Like reading a financial magazine",
    taglineHe: "כמו לקרוא מגזין פיננסי",
    palette: ["#0A0A0A", "#FAF7F2", "#D97706"],
  },
  {
    slug: "terminal",
    title: "Terminal",
    titleHe: "מסוף",
    tagline: "Bloomberg-meets-Linear, built for operators",
    taglineHe: "בלומברג פוגש את Linear",
    palette: ["#0B0D12", "#1B1F2A", "#00D4A0"],
  },
  {
    slug: "atelier",
    title: "Atelier",
    titleHe: "אטלייה",
    tagline: "Warm paper, curated, museum-grade",
    taglineHe: "נייר חם, מוקפד, ברמה מוזיאלית",
    palette: ["#F5F0E8", "#2C1810", "#C2410C"],
  },
  {
    slug: "prism",
    title: "Prism",
    titleHe: "פריזמה",
    tagline: "Glass, depth, motion — Apple Vision territory",
    taglineHe: "זכוכית, עומק, תנועה",
    palette: ["#E0E7FF", "#818CF8", "#F0ABFC"],
  },
];
