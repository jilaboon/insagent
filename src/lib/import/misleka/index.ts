/**
 * Misleka XML parser facade.
 *
 * Single entry point: `extractFromFile(buffer, fileName)`.
 *
 * Internal flow:
 *   parse → detect metadata → read customer → read products
 *
 * Warnings from each phase are rolled up into the file-level result.
 * The function never throws on tolerable issues — only on hard parser
 * or security failures (which surface as `MislekaParseError` /
 * `MislekaSecurityError`).
 */

import { parseMislekaXmlBuffer } from "./parse-xml";
import { detectMislekaMetadata } from "./detect-metadata";
import { readMislekaCustomer } from "./customer-extractor";
import { readMislekaProducts } from "./product-extractor";
import type { MislekaFileExtraction, MislekaWarning } from "./types";

export { MislekaParseError, MislekaSecurityError } from "./errors";
export { parseMislekaXmlBuffer } from "./parse-xml";
export { detectMislekaMetadata } from "./detect-metadata";
export { readMislekaCustomer } from "./customer-extractor";
export { readMislekaProducts } from "./product-extractor";
export {
  PRODUCT_TYPE_LABELS,
  STATUS_LABELS,
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  IDENTIFIER_TYPE_LABELS,
  PAYMENT_FREQUENCY_LABELS,
  CONTRIBUTION_TYPE_LABELS,
  INTERFACE_TYPE_LABELS,
  INTERFACE_FILENAME_LABELS,
  KNOWN_PROVIDER_SHORT_NAMES,
  resolveLabel,
  resolveYesNo,
} from "./code-maps";
export {
  cleanText,
  findField,
  findAllNodes,
  parseMislekaDate,
  parseMislekaNumber,
  normalizeIsraeliId,
  normalizePhone,
} from "./columns";

/**
 * Parse a Misleka XML buffer end-to-end and return the structured
 * extraction. The function is async only because callers expect a
 * Promise (the persistence layer downstream is async); the parser
 * itself is synchronous.
 */
export async function extractFromFile(
  buffer: Buffer,
  fileName: string,
): Promise<MislekaFileExtraction> {
  const parsed = parseMislekaXmlBuffer(buffer, fileName);

  const metaResult = detectMislekaMetadata(parsed);
  const customerResult = readMislekaCustomer(parsed);
  const productsResult = readMislekaProducts(parsed);

  const warnings: MislekaWarning[] = [
    ...metaResult.warnings,
    ...customerResult.warnings,
    ...productsResult.warnings,
  ];
  // Per-product warnings remain attached to each product. We don't
  // copy them up to file-level to avoid duplication; the import report
  // can roll them up if it wants.

  return {
    metadata: metaResult.metadata,
    customer: customerResult.customer,
    products: productsResult.products,
    warnings,
    errors: [],
  };
}
