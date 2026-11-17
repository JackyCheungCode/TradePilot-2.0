import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGuardrails } from "./guardrails.ts";

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  enabled: {
    keywords: false, websites: false, companies: false, geography: false,
    products: false, contacts: false, people: false, quality: false,
  },
  rules: {},
  ...overrides,
});

test("whole-word keyword matching does not match a longer token", () => {
  const result = evaluateGuardrails(
    { name: "Manufacturer Solutions" },
    snapshot({
      enabled: { keywords: true },
      rules: { keywords: "manu" },
      selectedPositions: [{ id: "company" }],
      selectedModes: [{ id: "whole" }],
    }),
  );
  assert.equal(result.blocked, false);
});

test("website type preset excludes a known social-media domain", () => {
  const result = evaluateGuardrails(
    { name: "Example Page", website: "https://www.facebook.com/example" },
    snapshot({
      enabled: { websites: true },
      selectedWebsiteTypes: [{ id: "2", text: "社交媒体" }],
    }),
  );
  assert.equal(result.blocked, true);
  assert.match(result.reasons.join(" "), /网站类型排除/);
});

test("job title and non-decision role exclusions are enforced", () => {
  const explicit = evaluateGuardrails(
    { name: "Alex", raw: { jobTitle: "Procurement Intern" } },
    snapshot({
      enabled: { people: true },
      rules: { jobTitles: "intern" },
    }),
  );
  assert.equal(explicit.blocked, true);

  const heuristic = evaluateGuardrails(
    { name: "Taylor", raw: { position: "Customer Support Agent" } },
    snapshot({
      enabled: { people: true },
      excludeNonDecisionRoles: true,
    }),
  );
  assert.equal(heuristic.blocked, true);
});

test("internal and competitor employee exclusions require configured evidence", () => {
  const internal = evaluateGuardrails(
    { name: "Alex", email: "alex@mycompany.com" },
    snapshot({
      enabled: { people: true },
      excludeInternalStaff: true,
      rules: { internalStaffDomains: "mycompany.com" },
    }),
  );
  assert.equal(internal.blocked, true);

  const competitor = evaluateGuardrails(
    { name: "Jordan", raw: { currentEmployer: "Rival Electronics Ltd" } },
    snapshot({
      enabled: { people: true },
      excludeCompetitorStaff: true,
      rules: { competitorCompanies: "Rival Electronics" },
    }),
  );
  assert.equal(competitor.blocked, true);
});

test("company aliases and group names are respected only when enabled", () => {
  const record = { name: "Example Holdings", raw: { aliases: ["Old Example Ltd"], parentCompany: "Excluded Group" } };
  const aliasMatch = evaluateGuardrails(
    record,
    snapshot({ enabled: { companies: true }, rules: { companies: "Old Example Ltd" } }),
  );
  assert.equal(aliasMatch.blocked, true);

  const groupMatch = evaluateGuardrails(
    record,
    snapshot({
      enabled: { companies: true },
      matchCompanyAliases: false,
      matchGroupEntities: true,
      rules: { companies: "Excluded Group" },
    }),
  );
  assert.equal(groupMatch.blocked, true);
});

test("DNC toggle is independent from the contact rule category", () => {
  const record = { name: "Example", email: "blocked@example.com" };
  const disabled = evaluateGuardrails(
    record,
    snapshot({
      enabled: { contacts: true },
      doNotContact: false,
      contactEntries: { emails: "blocked@example.com" },
    }),
  );
  assert.equal(disabled.blocked, false);

  const enabled = evaluateGuardrails(
    record,
    snapshot({
      enabled: { contacts: true },
      doNotContact: true,
      contactEntries: { emails: "blocked@example.com" },
    }),
  );
  assert.equal(enabled.blocked, true);
});

test("unknown employee evidence follows the pending policy", () => {
  const result = evaluateGuardrails(
    { name: "Unknown Size Ltd", website: "https://example.com" },
    snapshot({
      enabled: { quality: true },
      employeeFloor: "10",
      unknownPolicy: "pending",
    }),
  );
  assert.equal(result.blocked, false);
  assert.equal(result.review, true);
});
