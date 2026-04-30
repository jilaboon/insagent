/**
 * Read `MislekaProductRecord[]` from a parsed Misleka file.
 *
 * Tree shape:
 *   Mimshak / YeshutYatzran / Mutzarim / Mutzar*
 *     NetuneiMutzar
 *       SUG-MUTZAR, KIDOD-ACHID, employer block, customer block, ...
 *     HeshbonotOPolisot / HeshbonOPolisa*
 *       MISPAR-POLISA-O-HESHBON, SHEM-TOCHNIT, STATUS-POLISA-O-CHESHBON,
 *       PirteiTaktziv (with PerutMasluleiHashkaa for track balances and
 *       BlockItrot/Yitrot for block balances), PerutMeyupeKoach, NetuneiSheerim
 *
 * One `MislekaProductRecord` is produced per `HeshbonOPolisa` — that is
 * the unit the agent reasons about ("a policy / account at a provider").
 * Each Mutzar can carry multiple HeshbonOPolisa nodes (Meitav file 1 has
 * 5; the Altshuler studies-fund file has many).
 *
 * Balance snapshots are extracted per-track from PerutMasluleiHashkaa and
 * per-line from BlockItrot/Yitrot.
 */

import type {
  MislekaBalanceRecord,
  MislekaParsedFile,
  MislekaProductRecord,
  MislekaWarning,
} from "./types";
import {
  ACTIVE_STATUS_CODES,
  PRODUCT_TYPE_LABELS,
  STATUS_LABELS,
  resolveLabel,
  resolveYesNo,
} from "./code-maps";
import {
  cleanText,
  findAllNodes,
  findField,
  parseMislekaDate,
  parseMislekaNumber,
} from "./columns";

export interface MislekaProductsResult {
  products: MislekaProductRecord[];
  warnings: MislekaWarning[];
}

export function readMislekaProducts(
  parsed: MislekaParsedFile,
): MislekaProductsResult {
  const warnings: MislekaWarning[] = [];
  const root = parsed.root;
  const mimshak = (root as Record<string, unknown>)["Mimshak"] ?? root;
  const yeshut = readObject(mimshak, "YeshutYatzran");
  const mutzarim = readObject(yeshut, "Mutzarim");
  if (!mutzarim) return { products: [], warnings };

  const mutzarNodes = findAllNodes(mutzarim, "Mutzar");
  const products: MislekaProductRecord[] = [];

  for (let i = 0; i < mutzarNodes.length; i++) {
    const mutzar = mutzarNodes[i];
    const netunei = readObject(mutzar, "NetuneiMutzar");
    if (!netunei) {
      warnings.push({
        code: "MISSING_NETUNEI_MUTZAR",
        message: "מבנה הקובץ אינו תקין — חסר בלוק NetuneiMutzar",
        path: pathOfMutzar(i),
      });
      continue;
    }

    const productTypeCode = findField(netunei, "SUG-MUTZAR") ?? "";
    if (!productTypeCode) {
      warnings.push({
        code: "MISSING_PRODUCT_TYPE",
        message: "קוד סוג מוצר חסר",
        path: pathOfMutzar(i),
      });
    }
    const productTypeRes = resolveLabel(PRODUCT_TYPE_LABELS, productTypeCode);
    if (productTypeCode && !productTypeRes.isKnown) {
      warnings.push({
        code: "UNKNOWN_PRODUCT_TYPE_CODE",
        message: "קוד סוג מוצר לא מוכר",
        value: productTypeCode,
        path: pathOfMutzar(i),
      });
    }

    const employerBlock = readObject(netunei, "YeshutMaasik");
    const employerName = cleanText(findField(employerBlock, "SHEM-MAASIK"));
    const employerCode = cleanText(
      findField(employerBlock, "MPR-MAASIK-BE-YATZRAN"),
    );

    const heshbonotBlock = readObject(mutzar, "HeshbonotOPolisot");
    const heshbonNodes = findAllNodes(heshbonotBlock, "HeshbonOPolisa");

    if (heshbonNodes.length === 0) {
      warnings.push({
        code: "MISSING_HESHBON",
        message: "לא נמצאה פוליסה / חשבון תחת המוצר",
        path: pathOfMutzar(i),
      });
      continue;
    }

    for (let j = 0; j < heshbonNodes.length; j++) {
      const heshbon = heshbonNodes[j];
      const product = readSingleProduct({
        mutzarIndex: i,
        heshbonIndex: j,
        heshbon,
        productTypeCode,
        productTypeLabel: productTypeRes.label,
        productTypeKnown: productTypeRes.isKnown,
        employerName,
        employerCode,
      });
      products.push(product);
    }
  }

  return { products, warnings };
}

// Per-product reader ---------------------------------------------

interface SingleProductInput {
  mutzarIndex: number;
  heshbonIndex: number;
  heshbon: Record<string, unknown>;
  productTypeCode: string;
  productTypeLabel: string;
  productTypeKnown: boolean;
  employerName: string | null;
  employerCode: string | null;
}

function readSingleProduct(input: SingleProductInput): MislekaProductRecord {
  const { heshbon } = input;
  const warnings: MislekaWarning[] = [];
  const path = pathOfHeshbon(input.mutzarIndex, input.heshbonIndex);

  const planName = cleanText(findField(heshbon, "SHEM-TOCHNIT"));
  const policyOrAccountNumber = cleanText(
    findField(heshbon, "MISPAR-POLISA-O-HESHBON"),
  );
  const unifiedProductCode = cleanText(findField(heshbon, "KIDOD-ACHID"));
  const statusCode = findField(heshbon, "STATUS-POLISA-O-CHESHBON");
  const statusRes = resolveLabel(STATUS_LABELS, statusCode);
  if (statusCode && !statusRes.isKnown) {
    warnings.push({
      code: "UNKNOWN_STATUS_CODE",
      message: "קוד סטטוס לא מוכר",
      value: statusCode,
      path: `${path}/STATUS-POLISA-O-CHESHBON`,
    });
  }
  const isActive = statusCode ? ACTIVE_STATUS_CODES.has(statusCode) : false;

  // Dates
  const joinDate = parseMislekaDate(findField(heshbon, "TAARICH-HITZTARFUT-MUTZAR"));
  const firstJoinDate = parseMislekaDate(
    findField(heshbon, "TAARICH-HITZTARFUT-RISHON"),
  );
  const lastUpdatedDate = parseMislekaDate(
    findField(heshbon, "TAARICH-IDKUN-STATUS"),
  );
  const valuationDate = parseMislekaDate(findField(heshbon, "TAARICH-NECHONUT"));

  // Yes/no flags. Each is 1=yes, 2=no in מבנה אחיד.
  const halvaaBlock = readObject(heshbon, "Halvaa");
  const hasLoanRes = resolveYesNo(findField(halvaaBlock, "YESH-HALVAA-BAMUTZAR"));
  if (
    !hasLoanRes.isKnown &&
    findField(halvaaBlock, "YESH-HALVAA-BAMUTZAR") !== null
  ) {
    warnings.push({
      code: "UNKNOWN_YESNO_CODE",
      message: "קוד כן/לא לא תקני בשדה YESH-HALVAA-BAMUTZAR",
      path: `${path}/Halvaa/YESH-HALVAA-BAMUTZAR`,
    });
  }

  const hasArrears = hasAnyArrearsFlag(heshbon);
  const externalCoverageRaw = findField(heshbon, "KAYAM-KISUY-HIZONI");
  const hasExternalRes = resolveYesNo(externalCoverageRaw);
  if (!hasExternalRes.isKnown && externalCoverageRaw !== null) {
    warnings.push({
      code: "UNKNOWN_YESNO_CODE",
      message: "קוד כן/לא לא תקני בשדה KAYAM-KISUY-HIZONI",
      path: `${path}/KAYAM-KISUY-HIZONI`,
    });
  }

  const meyupeBlock = readObject(heshbon, "PerutMeyupeKoach");
  const attorneyRes = resolveYesNo(findField(meyupeBlock, "KAYAM-MEYUPE-KOACH"));

  const hasBeneficiaries = detectBeneficiaries(heshbon);

  // Balances --------------------------------------------------------
  const taktziv = readObject(heshbon, "PirteiTaktziv");

  const balances: MislekaBalanceRecord[] = [];
  // Track-level balances
  const trackNodes = findAllNodes(taktziv, "PerutMasluleiHashkaa");
  for (const track of trackNodes) {
    const trackCode = cleanText(findField(track, "KOD-MASLUL-HASHKAA"));
    const trackName = cleanText(findField(track, "SHEM-MASLUL-HASHKAA"));
    const balanceAmount = parseMislekaNumber(
      findField(track, "SCHUM-TZVIRA-BAMASLUL"),
    );
    const ytdReturn = parseMislekaNumber(findField(track, "TSUA-NETO"));
    if (
      balanceAmount === null &&
      ytdReturn === null &&
      !trackCode &&
      !trackName
    ) {
      // Skip entirely empty tracks.
      continue;
    }
    if (!valuationDate) continue; // Need a date to anchor the snapshot.
    balances.push({
      snapshotDate: valuationDate,
      snapshotKind: "TRACK_BALANCE",
      trackCode,
      trackName,
      balanceAmount,
      redemptionAmount: null,
      monthlyContribution: null,
      employeeContribution: null,
      employerContribution: null,
      compensationComponent: null,
      ytdReturn,
      rawJson: null,
    });
  }

  // BlockItrot / Yitrot — block-level balances and redemption values.
  const blockItrot = readObject(taktziv, "BlockItrot");
  const yitrotNodes = findAllNodes(blockItrot, "Yitrot");
  for (const yitrot of yitrotNodes) {
    const blockDate = parseMislekaDate(
      findField(yitrot, "TAARICH-ERECH-TZVIROT"),
    );
    if (!blockDate) continue;
    const perutNodes = findAllNodes(yitrot, "PerutYitrot");
    for (const perut of perutNodes) {
      const balance = parseMislekaNumber(
        findField(perut, "TOTAL-CHISACHON-MTZBR"),
      );
      const redemption = parseMislekaNumber(
        findField(perut, "TOTAL-ERKEI-PIDION"),
      );
      if (balance === null && redemption === null) continue;
      balances.push({
        snapshotDate: blockDate,
        snapshotKind: "BLOCK",
        trackCode: cleanText(findField(perut, "KOD-SUG-HAFRASHA")),
        trackName: null,
        balanceAmount: balance,
        redemptionAmount: redemption,
        monthlyContribution: null,
        employeeContribution: null,
        employerContribution: null,
        compensationComponent: null,
        ytdReturn: null,
        rawJson: null,
      });
    }
  }

  // Sanitized debug snapshot ------------------------------------------
  // Deliberately excludes: israeli IDs, account / policy numbers,
  // names, contact info, employer details, balance amounts, addresses.
  // Includes: codes and dates only — values useful for rule debugging
  // that don't expose PII or financial data.
  const rawImportantFieldsJson: Record<string, unknown> = {
    productTypeCode: input.productTypeCode,
    statusCode: statusCode ?? null,
    interfaceVersion: findField(heshbon, "MISPAR-GIRSAT-XML") ?? null,
    pensionFundType: findField(heshbon, "SUG-KEREN-PENSIA") ?? null,
    pensionLegacyFlag: findField(heshbon, "PENSIA-VATIKA-O-HADASHA") ?? null,
    sugTochnitOCheshbon: findField(heshbon, "SUG-TOCHNIT-O-CHESHBON") ?? null,
    sugPolisa: findField(heshbon, "SUG-POLISA") ?? null,
    kolelZakautAgach: findField(heshbon, "KOLEL-ZAKAUT-AGACH") ?? null,
    tikun190: findField(heshbon, "TIKUN-190") ?? null,
    joinDateRaw: findField(heshbon, "TAARICH-HITZTARFUT-MUTZAR") ?? null,
    firstJoinDateRaw: findField(heshbon, "TAARICH-HITZTARFUT-RISHON") ?? null,
    valuationDateRaw: findField(heshbon, "TAARICH-NECHONUT") ?? null,
    statusUpdateRaw: findField(heshbon, "TAARICH-IDKUN-STATUS") ?? null,
  };

  return {
    sourceRecordPath: path,
    productTypeCode: input.productTypeCode,
    // The label is always populated — known codes give the Hebrew label;
    // unknown codes give the "קוד לא מזוהה (N)" placeholder so the UI can
    // still display something. The unknown-code warning was already
    // pushed to file-level warnings above.
    productTypeLabel: input.productTypeLabel,
    planName,
    policyOrAccountNumber,
    unifiedProductCode,
    statusCode,
    statusLabel: statusCode ? statusRes.label : null,
    isActive,
    joinDate,
    firstJoinDate,
    lastUpdatedDate,
    valuationDate,
    hasLoan: hasLoanRes.value,
    hasArrears,
    hasExternalCoverage: hasExternalRes.value,
    hasBeneficiaries,
    hasAttorney: attorneyRes.value,
    employerName: input.employerName,
    employerCode: input.employerCode,
    rawImportantFieldsJson,
    balances,
    warnings,
  };
}

// Helpers --------------------------------------------------------

function readObject(
  parent: unknown,
  tagName: string,
): Record<string, unknown> | null {
  if (typeof parent !== "object" || parent === null || Array.isArray(parent)) {
    return null;
  }
  const child = (parent as Record<string, unknown>)[tagName];
  if (typeof child === "object" && child !== null && !Array.isArray(child)) {
    return child as Record<string, unknown>;
  }
  return null;
}

function pathOfMutzar(index: number): string {
  return `Mutzarim/Mutzar[${index + 1}]`;
}

function pathOfHeshbon(mutzarIndex: number, heshbonIndex: number): string {
  return `${pathOfMutzar(mutzarIndex)}/HeshbonotOPolisot/HeshbonOPolisa[${heshbonIndex + 1}]`;
}

function hasAnyArrearsFlag(heshbon: Record<string, unknown>): boolean {
  // PirteiTaktziv / ChovotPigurim / ChovPigur* / KAYAM-CHOV-O-PIGUR (1 = yes)
  const taktziv = readObject(heshbon, "PirteiTaktziv");
  const chovotBlock = readObject(taktziv, "ChovotPigurim");
  const chovNodes = findAllNodes(chovotBlock, "ChovPigur");
  for (const chov of chovNodes) {
    const code = findField(chov, "KAYAM-CHOV-O-PIGUR");
    if (code === "1") return true;
  }
  return false;
}

/**
 * `hasBeneficiaries` is true iff any Sheer entry under NetuneiSheerim has a
 * populated SHEM-PRATI-SHEERIM. All 8 sample files report empty
 * NetuneiSheerim — but the schema is in place for when real beneficiary
 * data lands.
 */
function detectBeneficiaries(heshbon: Record<string, unknown>): boolean {
  const block = readObject(heshbon, "NetuneiSheerim");
  if (!block) return false;
  const sheerim = findAllNodes(block, "Sheer");
  for (const s of sheerim) {
    const name = cleanText(findField(s, "SHEM-PRATI-SHEERIM"));
    if (name) return true;
  }
  return false;
}
