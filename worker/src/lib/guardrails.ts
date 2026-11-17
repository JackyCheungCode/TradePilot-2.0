export type GuardrailSnapshot = Record<string, unknown>;
export type GuardrailDecision = { blocked: boolean; review: boolean; reasons: string[] };
export type DuplicatePolicy = "merge" | "skip" | "review";

export function getDuplicatePolicy(snapshotValue: unknown): DuplicatePolicy {
  const value = text(object(snapshotValue).duplicatePolicy);
  return value === "skip" || value === "review" ? value : "merge";
}

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
  if ((modes.includes("phrase") || modes.includes("contains")) && target.includes(value)) return true;
  if (modes.includes("prefix") && target.split(/[^\p{L}\p{N}]+/u).some(token => token.startsWith(value))) return true;
  return false;
}
function normalizedHost(value: string): string {
  try { return new URL(/^https?:\/\//i.test(value) ? value : "https://" + value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}
function websiteTypeMatches(website: string, raw: Record<string, unknown>, selected: string[]): string[] {
  if (!selected.length) return [];
  const host = normalizedHost(website);
  const metadata = [raw.websiteType, raw.website_type, raw.siteType, raw.site_type, raw.platformType, raw.platform_type, raw.category, raw.pageCategory, raw.record_type, raw.type, raw.types].map(text).join(" ").toLowerCase();
  const definitions: Array<{label:string; hosts:string[]; terms:string[]}> = [
    {label:"电商零售平台",hosts:["amazon.","ebay.","walmart.","alibaba.","aliexpress.","etsy.","shopify."],terms:["marketplace","e-commerce","ecommerce","shopping platform"]},
    {label:"B2C 零售商城",hosts:["store.","shop."],terms:["online store","retail store","b2c retailer"]},
    {label:"社交媒体",hosts:["facebook.com","instagram.com","linkedin.com","tiktok.com","youtube.com","x.com","twitter.com"],terms:["social media","social network"]},
    {label:"论坛与社区",hosts:["reddit.com","quora.com","stackoverflow.com","discourse."],terms:["forum","community","discussion board"]},
    {label:"博客与内容平台",hosts:["medium.com","wordpress.com","blogspot.","substack.com","tumblr.com"],terms:["blog","publisher","content platform"]},
    {label:"黄页与企业目录",hosts:["yellowpages.","yelp.","crunchbase.com","kompass.com","dnb.com"],terms:["business directory","yellow pages","company directory"]},
    {label:"招聘与求职网站",hosts:["indeed.","glassdoor.","monster.","ziprecruiter.","careerbuilder."],terms:["job board","recruitment","careers site"]},
    {label:"新闻与媒体",hosts:["reuters.com","bbc.","cnn.com","bloomberg.com","apnews.com"],terms:["news","media outlet","press"]},
    {label:"政府及公共机构网站",hosts:[".gov",".gov."],terms:["government","public institution","municipality"]},
  ];
  return selected.filter(label => {
    const definition = definitions.find(item => item.label === label);
    if (!definition) return false;
    return definition.hosts.some(part => host.includes(part)) || definition.terms.some(term => metadata.includes(term));
  }).map(label => "网站类型排除：" + label);
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
    const selectedTypes = Array.isArray(snapshot.selectedWebsiteTypes)
      ? snapshot.selectedWebsiteTypes.map(item => text(object(item).text)).filter(Boolean)
      : [];
    reasons.push(...websiteTypeMatches(text(record.website), raw, selectedTypes));
  }
  if (enabled.companies === true) {
    const primaryName = text(record.name).toLowerCase();
    const aliases = snapshot.matchCompanyAliases === false ? [] : [
      raw.aliases, raw.alternateNames, raw.alternate_names, raw.formerNames, raw.former_names, raw.brands,
    ].flatMap(value => Array.isArray(value) ? value.map(text) : lines(value));
    const groupNames = snapshot.matchGroupEntities === true
      ? [raw.parentCompany, raw.parent_company, raw.groupName, raw.group_name, raw.parentName].map(text)
      : [];
    const companyNames = [primaryName, ...aliases, ...groupNames].join("\\n").toLowerCase();
    if (lines(rules.companies).some(value => companyNames.includes(value.toLowerCase()))) reasons.push("命中企业主体、别名或集团排除名单");
  }
  if (enabled.geography === true) {
    const excluded = Array.isArray(snapshot.excludedCountries) ? snapshot.excludedCountries.map(item => text(object(item).id).toUpperCase()) : [];
    if (excluded.includes(text(record.country).toUpperCase())) reasons.push("命中排除国家");
    const regions = lines(rules.geography);
    if (regions.some(value => (text(record.address) + " " + rawText).toLowerCase().includes(value.toLowerCase()))) reasons.push("命中排除地区");
  }
  if (enabled.products === true && lines(rules.products).some(value => (text(record.businessType) + " " + text(record.description) + " " + rawText).toLowerCase().includes(value.toLowerCase()))) reasons.push("命中产品或业务排除规则");
  if (enabled.contacts === true && snapshot.doNotContact !== false) {
    const contacts = object(snapshot.contactEntries);
    const contactValues = [record.email, record.phone, record.social, record.address].map(text).join("\n").toLowerCase();
    if (Object.values(contacts).some(value => lines(value).some(item => contactValues.includes(item.toLowerCase())))) reasons.push("命中联系方式排除名单");
  }
  if (enabled.people === true) {
    const role = [raw.jobTitle, raw.job_title, raw.position, raw.currentPosition, raw.current_position, raw.role, raw.headline].map(text).join(" ");
    const personName = [record.title, record.name, raw.fullName, raw.full_name, raw.username].map(text).join(" ");
    if (lines(rules.people).some(value => personName.toLowerCase().includes(value.toLowerCase()))) reasons.push("命中人员姓名或账号排除规则");
    if (lines(rules.jobTitles).some(value => role.toLowerCase().includes(value.toLowerCase()))) reasons.push("命中指定职位排除规则");
    if (snapshot.excludeNonDecisionRoles === true) {
      const nonDecision = ["intern", "internship", "assistant", "coordinator", "operator", "technician", "support agent", "客服", "助理", "实习", "技术员", "操作员", "客服专员"];
      if (nonDecision.some(value => role.toLowerCase().includes(value))) reasons.push("命中非决策岗位排除规则");
    }
    if (snapshot.excludeInternalStaff === true) {
      const email = text(record.email || raw.email || raw.businessEmail || raw.business_email).toLowerCase();
      const emailHost = email.includes("@") ? email.split("@").pop() ?? "" : "";
      const internalDomains = lines(rules.internalStaffDomains).map(value => value.toLowerCase().replace(/^@/, "").replace(/^www\./, ""));
      if (emailHost && internalDomains.some(domain => emailHost === domain || emailHost.endsWith("." + domain))) reasons.push("命中内部员工邮箱域名");
    }
    if (snapshot.excludeCompetitorStaff === true) {
      const employer = [raw.currentEmployer, raw.current_employer, raw.employer, raw.company, raw.companyName, raw.company_name].map(text).join(" ").toLowerCase();
      if (lines(rules.competitorCompanies).some(value => employer.includes(value.toLowerCase()))) reasons.push("命中竞争对手员工排除规则");
    }
  }
  if (enabled.quality === true) {
    if (lines(rules.quality).some(value => fields.toLowerCase().includes(value.toLowerCase()))) reasons.push("命中数据质量排除规则");
    const floor = Number(snapshot.employeeFloor);
    const employeeValue = record.employeeCount ?? raw.employee_count ?? raw.employees ?? raw.company_size;
    const employees = employeeValue === null || employeeValue === undefined || employeeValue === "" ? Number.NaN : Number(employeeValue);
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
