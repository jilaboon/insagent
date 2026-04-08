/**
 * Merger: Groups normalized records by Israeli ID (ת.ז.) and produces
 * merged customer profiles with all their policies from both files.
 */

import type { NormalizedRecord, NormalizedCustomer, NormalizedPolicy } from "./normalizer";

// ============================================================
// Types
// ============================================================

export interface MergedCustomer {
  israeliId: string;
  customer: NormalizedCustomer;
  policies: Array<NormalizedPolicy & { branch: "LIFE" | "ELEMENTARY"; sourceFile: string }>;
  sourceFiles: string[];
  hasLifeBranch: boolean;
  hasElementaryBranch: boolean;
}

// ============================================================
// Merge logic
// ============================================================

export function mergeRecords(records: NormalizedRecord[]): MergedCustomer[] {
  const customerMap = new Map<string, MergedCustomer>();

  for (const record of records) {
    const id = record.customer.israeliId;
    if (!id) continue;

    const existing = customerMap.get(id);

    if (!existing) {
      customerMap.set(id, {
        israeliId: id,
        customer: { ...record.customer },
        policies: [
          {
            ...record.policy,
            branch: record.branch,
            sourceFile: record.sourceFile,
          },
        ],
        sourceFiles: [record.sourceFile],
        hasLifeBranch: record.branch === "LIFE",
        hasElementaryBranch: record.branch === "ELEMENTARY",
      });
    } else {
      // Update customer info if newer data has non-null values
      mergeCustomerData(existing.customer, record.customer);

      // Add policy (deduplicate by policyNumber + insurer)
      const policyKey = `${record.policy.policyNumber}|${record.policy.insurer}`;
      const existingPolicy = existing.policies.find(
        (p) => `${p.policyNumber}|${p.insurer}` === policyKey
      );

      if (!existingPolicy) {
        existing.policies.push({
          ...record.policy,
          branch: record.branch,
          sourceFile: record.sourceFile,
        });
      } else {
        // Update existing policy with newer data if the as-of date is more recent
        Object.assign(existingPolicy, {
          ...record.policy,
          branch: record.branch,
          sourceFile: record.sourceFile,
        });
      }

      // Track source files
      if (!existing.sourceFiles.includes(record.sourceFile)) {
        existing.sourceFiles.push(record.sourceFile);
      }

      if (record.branch === "LIFE") existing.hasLifeBranch = true;
      if (record.branch === "ELEMENTARY") existing.hasElementaryBranch = true;
    }
  }

  return Array.from(customerMap.values());
}

/**
 * Merge customer data: fill in missing fields from newer records.
 * Non-null values in `incoming` overwrite null values in `target`.
 */
function mergeCustomerData(
  target: NormalizedCustomer,
  incoming: NormalizedCustomer
): void {
  if (!target.phone && incoming.phone) target.phone = incoming.phone;
  if (!target.email && incoming.email) target.email = incoming.email;
  if (!target.address && incoming.address) target.address = incoming.address;
  if (!target.dateOfBirth && incoming.dateOfBirth) target.dateOfBirth = incoming.dateOfBirth;
  if (!target.age && incoming.age) target.age = incoming.age;
  if (!target.gender && incoming.gender) target.gender = incoming.gender;
  if (!target.maritalStatus && incoming.maritalStatus) target.maritalStatus = incoming.maritalStatus;
  if (!target.employer && incoming.employer) target.employer = incoming.employer;
  // Prefer Hebrew name from life CSV (has both firstName and fullName)
  if (!target.firstName && incoming.firstName) target.firstName = incoming.firstName;
  if (!target.lastName && incoming.lastName) target.lastName = incoming.lastName;
  if (!target.fullName && incoming.fullName) target.fullName = incoming.fullName;
}
