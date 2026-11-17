export type GuardrailSnapshot = Record<string, unknown>;
export type GuardrailDecision = { blocked: boolean; review: boolean; reasons: string[] };

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const lines = (value: unknown): string[] =>
  typeof value === "string" ? value.split(/\r?\n/).map(item => item.trim()).filter(Boolean) : [];
const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : "";

function keywordMatches(haystack: string, keyword: string, modes: string[]): boolean {
  const value = keyword.trim().toLocaleLowerCase();
  if (!value) return false;
  const target = haystack.toLocaleLowerCase();
  if (modes.includes("regex")) {
    try { if (value.length <= 120 && new RegExp(value, "i").test(target)) return true; } catch { /* Ignore invalid user regex safely. */ }
  }
  if (modes.includes("whole")) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp("(^|[^\\p{L}\\p{N}])" + escaped + "($|[^\\p{L}\\p{N}])", "iu").test(target)) return true;
  }
  if (modes.includes("prefix") && target.split(/[^\p{L}\p{N}]+/u).some(token => token.startsWith(value))) return true;
  return target.includes(value);
}

function websiteMatches(website: string, rules: Array<Record<string, unknown>>): string[] {
  if (!website) return [];
  let url: URL | null = null;
  try { url = new URL(/^https?:\/\//i.test(website) ? website : "https://" + website); } catch { return []; }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return rules.filter(rule => {
    const value = text(rule.value).trim().toLowerCase();
    if (!value) return false;
    switch (rule.type) {
      case "exact_url": return website.toLowerCase() === value || url?.toString().toLowerCase() === value;
      case "domain": return host === value.replace(/^www\./, "") || host.endsWith("." + value.replace(/^www\./, ""));
      case "suffix": return host.endsWith(value.startsWith(".") ? value : "." + value);
      case "subdomain": return host.endsWith("." + value) && host !== value;
      case "path": return url?.pathname.toLowerCase().includes(value) ?? false;
      case "pattern": {
        const escaped = value.replace(/[.+^$${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
        try { return new RegExp(escaped, "i").test(website); } catch { return false; }
      }
      default: return false;
    }
  }).map(rule => "网站排除：" + text(rule.value));
}

export function evaluateGuardrails(record: {
  name?: unknown; country?: unknown; address?: unknown; website?: unknown; phone?: unknown; email?: unknown;
  businessType?: unknown; title?: unknown; description?: unknown; content?: unknown; social?: unknown;
  employeeCount?: unknown; raw?: unknown;
}, snapshotValue: unknown): GuardrailDecision {
  const snapshot = object(snapshotValue);
  const enabled = object(snapshot.enabled);
  const rules = object(snapshot.rules);
  const reasons: string[] = [];
  let review = false;
  const raw = object(record.raw);
  const rawText = JSON.stringify(raw).slice(0, 12000);
  const fields = [record.name, record.address, record.website, record.phone, record.email, record.businessType, record.title, record.description, record.content, record.social, rawText].map(text).join("\n");
  const positionValues: Record<string, string> = {
    title: text(record.title), snippet: text(record.description), url: text(record.website),
    meta: [raw.metaTitle, raw.metaDescription, raw.meta_title, raw.meta_description].map(text).join("\n"),
    content: [record.content, record.description, raw.content, raw.text, raw.biography].map(text).join("\n"),
    company: text(record.name),
  };
  const selectedPositions = Array.isArray(snapshot.selectedPositions) ? snapshot.selectedPositions.map(item => text(object(item).id)).filter(Boolean) : [];
  const keywordText = selectedPositions.length ? selectedPositions.map(key => positionValues[key] ?? "").join("\n") : fields;
  const keywordList = lines(rules.keywords);
  if (enabled.keywords === true && keywordList.length) {
    const modes = Array.isArray(snapshot.selectedModes) ? snapshot.selectedModes.map(item => text(object(item).id)) : ["whole", "phrase"];
    if (keywordList.some(keyword => keywordMatches(keywordText, keyword, modes))) reasons.push("命中关键词排除规则");
  }
  if (enabled.websites === true) {
    const websiteRules = Array.isArray(snapshot.websiteRows) ? snapshot.websiteRows.map(object) : [];
    reasons.push(...websiteMatches(text(record.website), websiteRules));
  }
  if (enabled.companies === true && lines(rules.companies).some(value => text(record.name).toLowerCase().includes(value.toLowerCase()))) reasons.push("命中企业主体排除名单");
  if (enabled.geography === true) {
    const excluded = Array.isArray(snapshot.excludedCountries) ? snapshot.excludedCountries.map(item => text(object(item).id).toUpperCase()) : [];
    if (excluded.includes(text(record.country).toUpperCase())) reasons.push("命中排除国家");
    const regions = lines(rules.geography);
    if (regions.some(value => (text(record.address) + " " + text(record.raw)).toLowerCase().includes(value.toLowerCase()))) reasons.push("命中排除地区");
  }
  if (enabled.products === true && lines(rules.products).some(value => (text(record.businessType) + " " + text(record.description) + " " + rawText).toLowerCase().includes(value.toLowerCase()))) reasons.push("命中产品或业务排除规则");
  if (enabled.contacts === true) {
    const contacts = object(snapshot.contactEntries);
    const contactValues = [record.email, record.phone, record.social, record.address].map(text).join("\n").toLowerCase();
    if (Object.values(contacts).some(value => lines(value).some(item => contactValues.includes(item.toLowerCase())))) reasons.push("命中联系方式排除名单");
  }
  if (enabled.people === true && lines(rules.people).some(value => (text(record.title) + " " + text(record.name)).toLowerCase().includes(value.toLowerCase()))) reasons.push("命中人员排除规则");
  if (enabled.quality === true) {
    if (lines(rules.quality).some(value => fields.toLowerCase().includes(value.toLowerCase()))) reasons.push("命中数据质量排除规则");
    const floor = Number(snapshot.employeeFloor);
    const employees = Number(record.employeeCount ?? raw.employee_count ?? raw.employees ?? raw.company_size);
    if (Number.isFinite(floor) && floor > 0 && (!Number.isFinite(employees) || employees < floor)) {
      if (!Number.isFinite(employees) && snapshot.unknownPolicy === "pending") review = true;
      else if (!Number.isFinite(employees) && snapshot.unknownPolicy === "block") reasons.push("员工规模未知，按严格策略拦截");
      else if (Number.isFinite(employees)) reasons.push("员工人数低于门槛");
    }
    if (snapshot.requireIndependentSite === true && !text(record.website)) {
      if (snapshot.unknownPolicy === "pending") review = true;
      else if (snapshot.unknownPolicy === "block") reasons.push("缺少独立企业官网");
    }
  }
  return { blocked: reasons.length > 0, review, reasons };
}
