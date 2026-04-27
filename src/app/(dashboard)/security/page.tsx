"use client";

import { Card } from "@/components/ui/card";
import {
  Shield,
  Lock,
  Sparkles,
  ClipboardList,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-surface-900 flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary-600" />
          אבטחה ופרטיות
        </h1>
        <p className="mt-1 text-sm text-surface-500">
          מדיניות הגנת המידע של InsAgent
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Section 1: Data Storage */}
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                <Shield className="h-4 w-4 text-blue-600" />
              </div>
              <h2 className="text-sm font-bold text-surface-900">
                אחסון נתונים
              </h2>
            </div>
            <ul className="space-y-2 text-sm text-surface-700 leading-relaxed">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                כל הנתונים מאוחסנים בבסיס נתונים מוצפן (PostgreSQL) המנוהל ב־Supabase על תשתית AWS באירופה (פרנקפורט)
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                גיבויים אוטומטיים מתבצעים באופן יומי
              </li>
            </ul>
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <h3 className="mb-2 text-xs font-bold text-blue-800">הצפנה בתעבורה (Data in Transit)</h3>
              <ul className="space-y-1.5 text-xs text-blue-900">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                  דפדפן ↔ שרת: HTTPS/TLS מוצפן (תעודת SSL של Vercel)
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                  שרת ↔ בסיס נתונים: חיבור SSL מוצפן דרך Connection Pooler
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                  שרת ↔ AI: HTTPS מוצפן לשרתי Anthropic
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                  אין תעבורת מידע לא מוצפנת — כל הנתונים מוגנים בכל רגע
                </li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Section 2: Access Control */}
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                <Lock className="h-4 w-4 text-amber-600" />
              </div>
              <h2 className="text-sm font-bold text-surface-900">
                בקרת גישה
              </h2>
            </div>
            <ul className="space-y-2 text-sm text-surface-700 leading-relaxed">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                כל כניסה למערכת דורשת אימות מאובטח (אימייל וסיסמה)
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                הרשאות מוגדרות לפי תפקיד: בעלים, מנהל, סוכן, תפעול
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                כל פעולה רגישה מתועדת ביומן ביקורת
              </li>
            </ul>
          </div>
        </Card>

        {/* Section 3: AI Usage — KEY SECTION (spans full width) */}
        <Card className="lg:col-span-2 border-2 border-primary-200 bg-primary-50/20">
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100">
                <Sparkles className="h-4 w-4 text-primary-600" />
              </div>
              <h2 className="text-sm font-bold text-surface-900">
                מדיניות שימוש בבינה מלאכותית
              </h2>
            </div>

            <p className="text-sm text-surface-700 leading-relaxed">
              המערכת משתמשת ב-Claude (Anthropic) ליצירת הודעות ותובנות
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* What IS sent to AI */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                <h3 className="mb-3 text-sm font-bold text-emerald-800">
                  מה נשלח ל-AI:
                </h3>
                <ul className="space-y-1.5 text-sm text-emerald-900">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    {"שם פרטי בלבד (ללא שם משפחה)"}
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    {"גיל ומין (לדקדוק נכון בעברית)"}
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    קטגוריות פוליסות ושמות חברות ביטוח
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    {"טווחי פרמיה (נמוך/בינוני/גבוה \u2014 לא סכומים מדויקים)"}
                  </li>
                </ul>
              </div>

              {/* What is NOT sent to AI */}
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                <h3 className="mb-3 text-sm font-bold text-red-800">
                  {"מה לא נשלח ל-AI \u2014 לעולם:"}
                </h3>
                <ul className="space-y-1.5 text-sm text-red-900">
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    תעודת זהות
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    מספר טלפון
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    {"כתובת דוא\u05F4ל"}
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    כתובת מגורים
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    מספרי פוליסה
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    לוחיות רכב
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    סכומי חיסכון מדויקים
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    דמי ניהול מדויקים
                  </li>
                </ul>
              </div>
            </div>

            {/* Anthropic Policy */}
            <div className="rounded-lg border border-surface-200 bg-surface-50 p-4">
              <h3 className="mb-3 text-sm font-bold text-surface-800">
                מדיניות Anthropic:
              </h3>
              <ul className="space-y-1.5 text-sm text-surface-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  נתוני API לא משמשים לאימון מודלים
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  נתונים נשמרים עד 30 יום לניטור בטיחות, ואז נמחקים
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  Anthropic מוסמכת SOC 2 Type II
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  הנתונים לא משותפים עם צדדים שלישיים
                </li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Section 4: Audit Log */}
        <Card className="lg:col-span-2">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
                <ClipboardList className="h-4 w-4 text-violet-600" />
              </div>
              <h2 className="text-sm font-bold text-surface-900">
                יומן ביקורת
              </h2>
            </div>
            <p className="text-sm text-surface-700">
              כל הפעולות הבאות מתועדות באופן אוטומטי:
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                "יבוא נתונים",
                "יצירת תובנות",
                "יצירת הודעות",
                "שינוי סטטוס הודעה",
                "יצירת/עדכון/מחיקת חוקים",
                "הוספת/מחיקת ידע מקצועי",
              ].map((action) => (
                <span
                  key={action}
                  className="inline-flex items-center rounded-full border border-surface-200 bg-surface-50 px-3 py-1 text-xs font-medium text-surface-700"
                >
                  {action}
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
