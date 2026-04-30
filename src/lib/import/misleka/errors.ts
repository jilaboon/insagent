/**
 * Error classes for the Misleka XML parser.
 *
 * Both errors carry safe Hebrew messages. They never embed raw XML content,
 * national IDs, account numbers, balances, names, phones, or any other
 * sensitive value in their `message` — by design. Optional structured
 * `context` is provided for log enrichment, but callers should treat that
 * as internal-only and never echo it to UI text.
 */

export interface MislekaErrorContext {
  fileName?: string;
  // Line number when the underlying parser surfaced one (XML structural
  // errors typically include this).
  line?: number;
  // Generic stable code for grouping in logs / audit ("ENCODING_UNSUPPORTED",
  // "FILE_TOO_LARGE", "XML_INVALID", etc.).
  code?: string;
}

/**
 * Raised when the XML cannot be parsed — malformed structure, unsupported
 * encoding, or a tag the parser couldn't read.
 *
 * The Hebrew message is safe to surface to the operator. The line number,
 * when known, is included as a separate property — never inlined into the
 * message string with file content.
 */
export class MislekaParseError extends Error {
  readonly context: MislekaErrorContext;

  constructor(messageHebrew: string, context: MislekaErrorContext = {}) {
    super(messageHebrew);
    this.name = "MislekaParseError";
    this.context = context;
  }
}

/**
 * Raised when a security control rejects a file before or during parsing
 * — oversized buffer, suspicious DTD reference, depth cap hit, etc.
 *
 * Treated as a hard fail. The Hebrew message must not leak the offending
 * content; a generic explanation plus the failing control code is enough.
 */
export class MislekaSecurityError extends Error {
  readonly context: MislekaErrorContext;

  constructor(messageHebrew: string, context: MislekaErrorContext = {}) {
    super(messageHebrew);
    this.name = "MislekaSecurityError";
    this.context = context;
  }
}
