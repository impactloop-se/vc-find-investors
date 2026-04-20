import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { getLogoUrl } from "@/lib/utils";
import type { InvestorArticleMention } from "@/lib/investor-article-context";
import type { LinkedInvestorCompany } from "@/lib/investor-linked-companies";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

const SEARCH_CACHE_TTL_MS = 5 * 60_000;
const FILTER_CACHE_TTL_MS = 5 * 60_000;
const ENRICH_LIMIT = 8;
const searchCache = new Map<string, { expiresAt: number; payload: unknown }>();
const filterCache = new Map<
  string,
  { expiresAt: number; filters: InvestorFilters }
>();

// ── Types ────────────────────────────────────────────────────────────────────

export interface InvestorFilters {
  investorType?: "family_office" | "vc" | "angel" | "all";
  niche?: string;
  city?: string;
  country?: string;
  stage?: string;
  minAum?: number;
  ticketSize?: "Small" | "Medium" | "Large";
  searchTerms?: string[];
  niches?: string[];
  /** Minimum deployed capital under the last 12 months (USD). */
  minFundingLast12mUsd?: number;
  /** Preferred investment round (Seed, Series A/B/C, Growth). */
  preferredRound?: string;
  /** Filter to investors whose co_investors list contains this name. */
  coInvestor?: string;
  /** Minimum total investments made. */
  minTotalInvestments?: number;
}

export interface InvestorResult {
  id: string;
  name: string;
  investorType: "family_office" | "vc";
  family?: string;
  vcType?: string;
  description: string;
  impactNiche: string;
  region: string;
  assets?: number;
  aum?: number;
  portfolioCompanies?: string;
  portfolioExamples?: string;
  notableDeals?: string;
  keyPeople?: string;
  keyPeopleImageUrl?: string;
  website?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  logoUrl?: string;
  founded?: number;
  portfolioCount?: number;
  recentTransactions?: {
    companyName: string;
    date: string;
    type?: string;
  }[];
  lastTransactionDate?: string;
  portfolioHoldings?: {
    companyName: string;
    orgNumber?: string;
    percentage?: number;
  }[];
  relevanceScore: number;
  linkedPortfolioCompanies?: LinkedInvestorCompany[];
  linkedNotableDeals?: LinkedInvestorCompany[];
  articleMentions?: InvestorArticleMention[];
  articleMentionCount?: number;
  recentArticleMentionCount?: number;
  verifiedFromArticles?: boolean;
  activeRecently?: boolean;
  activitySummary?: string;
  relevanceLabel?: string;
  currentFocus?: string;
  futurePriorities?: string;
  futureSignalStrength?: string;
  overallImpactDirection?: string;
  likelyCompanyTypes?: string;
  relevanceReason?: string;
  evidenceStrength?: string;
  impactSources?: string;
  investmentStage?: string;
  ticketSize?: string;
  // ── Extra Dealroom-fält för rikare kort ────────────────────────────────
  aumUsd?: number;
  totalInvestments?: number;
  totalExits?: number;
  totalFundingDeployedUsd?: number;
  fundingLast12mUsd?: number;
  preferredRound?: string;
  teamCount?: number;
  latestFund?: {
    name?: string;
    sizeUsd?: number;
    currency?: string;
    year?: number;
  };
  notableInvestments?: string[];
  currentUnicorns?: string[];
  industryExperience?: { industry: string; percentage: number }[];
  roundsExperience?: { round: string; percentage: number }[];
  coInvestors?: string[];
  hqCountry?: string;
  hqCity?: string;
}

// ── Canonical enums ───────────────────────────────────────────────────────────

const NICHE_ENUM = [
  "Climate Adaptation",
  "Agri Tech",
  "Waste & Recycling",
  "Batteries",
  "Biodiversity",
  "Circular Economy",
  "Deep Tech",
  "Defence Tech",
  "E-commerce & Secondhand",
  "Food Tech",
  "Packaging",
  "Green Energy",
  "Sustainable Materials",
  "Carbon Capture",
  "Food Waste",
  "Med Tech",
  "Software/Platforms",
  "Mobility",
  "Green Construction",
  "Forestry",
  "Social Sustainability",
  "Solar Energy",
  "Textiles",
  "Water",
  "AI",
  "Biotech",
] as const;

const NICHE_KEYWORDS = [
  ...NICHE_ENUM,
  // Common synonyms for heuristic matching
  "Cleantech",
  "Greentech",
  "Climate Tech",
  "HealthTech",
  "Health Tech",
  "Life Science",
  "SaaS",
  "FinTech",
];

// Module-level niche synonyms map (shared by heuristics + spelling correction)
const NICHE_SYNONYMS_MAP: Record<string, string> = {
  cleantech: "Green Energy",
  "clean tech": "Green Energy",
  "climate tech": "Green Energy",
  "green tech": "Green Energy",
  "green energy": "Green Energy",
  "renewable energy": "Green Energy",
  energystorage: "Batteries",
  "energy storage": "Batteries",
  battery: "Batteries",
  batteries: "Batteries",
  solar: "Solar Energy",
  "solar energy": "Solar Energy",
  proptech: "Green Construction",
  "green construction": "Green Construction",
  "green building": "Green Construction",
  healthtech: "Med Tech",
  "health tech": "Med Tech",
  medtech: "Med Tech",
  "med tech": "Med Tech",
  "life science": "Med Tech",
  biotech: "Biotech",
  deeptech: "Deep Tech",
  "deep tech": "Deep Tech",
  saas: "Software/Platforms",
  software: "Software/Platforms",
  "software/platforms": "Software/Platforms",
  fintech: "Software/Platforms",
  circular: "Circular Economy",
  "circular economy": "Circular Economy",
  "carbon capture": "Carbon Capture",
  ccs: "Carbon Capture",
  ccu: "Carbon Capture",
  co2: "Carbon Capture",
  "food tech": "Food Tech",
  foodtech: "Food Tech",
  agritech: "Agri Tech",
  "agri tech": "Agri Tech",
  agriculture: "Agri Tech",
  mobility: "Mobility",
  transport: "Mobility",
  water: "Water",
  textiles: "Textiles",
  textile: "Textiles",
  fashion: "Textiles",
  forestry: "Forestry",
  "social sustainability": "Social Sustainability",
  "social impact": "Social Sustainability",
  "impact invest": "Social Sustainability",
  packaging: "Packaging",
  waste: "Waste & Recycling",
  recycling: "Waste & Recycling",
  "food waste": "Food Waste",
  biodiversity: "Biodiversity",
  defence: "Defence Tech",
  defense: "Defence Tech",
  "defence tech": "Defence Tech",
  "defense tech": "Defence Tech",
  ai: "AI",
  "sustainable materials": "Sustainable Materials",
};

const COMMON_CITIES = [
  "London",
  "Berlin",
  "Paris",
  "Amsterdam",
  "Copenhagen",
  "Helsinki",
  "Oslo",
  "Zurich",
  "Munich",
  "Dublin",
  "Barcelona",
  "Lisbon",
  "Vienna",
  "Brussels",
  "Milan",
];

const COMMON_COUNTRIES = [
  "United Kingdom",
  "UK",
  "Germany",
  "France",
  "Netherlands",
  "Sweden",
  "Switzerland",
  "Spain",
  "Belgium",
  "Denmark",
  "Norway",
  "Italy",
  "Finland",
  "Portugal",
  "Luxembourg",
  "Poland",
  "Ireland",
  "Austria",
  "Czech Republic",
  "Turkey",
  "Bulgaria",
  "Romania",
  "Greece",
];

// ── Spelling correction helpers ───────────────────────────────────────────────

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}

function trySpellingCorrection(query: string): string | undefined {
  const lower = query.trim().toLowerCase();
  const words = lower.split(/\s+/);
  if (words.length > 4) return undefined;

  const knownTerms = [
    ...NICHE_ENUM.map((n) => n.toLowerCase()),
    ...Object.keys(NICHE_SYNONYMS_MAP),
    ...COMMON_CITIES.map((c) => c.toLowerCase()),
    ...COMMON_COUNTRIES.map((c) => c.toLowerCase()),
  ];

  for (const word of words) {
    if (word.length < 3) continue;
    // Skip words that already match a known term exactly
    if (knownTerms.includes(word)) continue;

    let bestMatch: string | undefined;
    let bestDist = 3; // max 2 edits
    for (const term of knownTerms) {
      if (Math.abs(word.length - term.length) > 2) continue;
      const dist = editDistance(word, term);
      if (dist > 0 && dist < bestDist) {
        bestDist = dist;
        bestMatch = term;
      }
    }
    if (bestMatch) {
      return query.replace(new RegExp(word, "i"), bestMatch);
    }
  }
  return undefined;
}

// ── Filter parsing ────────────────────────────────────────────────────────────

async function parseInvestorFilters(query: string): Promise<InvestorFilters> {
  const cacheKey = query.trim().toLowerCase();
  const cached = filterCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.filters;
  }

  // Step 0: try spelling correction upfront so heuristics can match
  const correctedUpfront = trySpellingCorrection(query);
  const effectiveQuery = correctedUpfront ?? query;

  // Step 1: heuristics — return early for simple queries
  const heuristicOnly = applyHeuristicInvestorFilters(effectiveQuery, {});
  if (isSimpleInvestorQuery(effectiveQuery, heuristicOnly)) {
    filterCache.set(cacheKey, {
      expiresAt: Date.now() + FILTER_CACHE_TTL_MS,
      filters: heuristicOnly,
    });
    return heuristicOnly;
  }

  // Step 2: GPT-5.4-nano with json_object
  let parsed: InvestorFilters;
  let correctedQuery: string | undefined;
  try {
    const completion = await Promise.race([
      getOpenAI().chat.completions.create({
        model: "gpt-5.4-nano",
        max_completion_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: `You are extracting search filters from a query about European impact investors. Return a JSON object.

Keys:
- investorType: "family_office" | "vc" | "angel" | "all" | null
- niche: ONE of these EXACT values, or null: ${NICHE_ENUM.join(", ")}
  ONLY set niche if the user EXPLICITLY mentions a specific industry/sector. Do NOT guess or infer niches.
- city: city name if mentioned, null otherwise
- country: country name if mentioned (e.g. "Germany", "UK", "Nordic"), null otherwise
- stage: "pre-seed" | "seed" | "series-a" | "series-b" | "series-c" | "growth" | null
- minAum: minimum AUM in EUR if size mentioned, null otherwise
- ticketSize: always null
- searchTerms: array of company names to search in portfolios, [] if none
- minFundingLast12mUsd: minimum capital deployed in the LAST 12 MONTHS in USD. ONLY set this if the query explicitly mentions "last 12 months", "last year", "past year", "recently", "currently active", "most active 2024" etc. Do NOT set it for a plain "invested X million" without a time qualifier.
- preferredRound: "Pre-Seed" | "Seed" | "Series A" | "Series B" | "Series C" | "Growth" if the query asks about preferred/primary round
- coInvestor: a company or investor name if the user asks "invests alongside X", "co-invests with X", "VCs that back X", null otherwise. Preserve original casing.
- minTotalInvestments: minimum number of investments if "most active", "prolific", "seasoned", ">100 deals" etc.
- correctedQuery: if the query has obvious typos, provide a corrected version. null if no typos.

Examples:
"VC in cleantech" → {"investorType":"vc","niche":"Green Energy","city":null,"country":null,"stage":null,"minAum":null,"ticketSize":null,"searchTerms":[],"correctedQuery":null}
"family office London" → {"investorType":"family_office","niche":null,"city":"London","country":null,"stage":null,"minAum":null,"ticketSize":null,"searchTerms":[],"correctedQuery":null}
"seed investor food tech" → {"investorType":"all","niche":"Food Tech","city":null,"country":null,"stage":"seed","minAum":null,"ticketSize":null,"searchTerms":[],"correctedQuery":null}
"investor focused on mobility" → {"investorType":"all","niche":"Mobility","city":null,"country":null,"stage":null,"minAum":null,"ticketSize":null,"searchTerms":[],"correctedQuery":null}
"deep tech and AI" → {"investorType":"all","niche":"Deep Tech","city":null,"country":null,"stage":null,"minAum":null,"ticketSize":null,"searchTerms":[],"correctedQuery":null}
"VC Berlin series A" → {"investorType":"vc","niche":null,"city":"Berlin","country":null,"stage":"series-a","minAum":null,"ticketSize":null,"searchTerms":[],"correctedQuery":null}
"large fund green energy" → {"investorType":"all","niche":"Green Energy","city":null,"country":null,"stage":null,"minAum":500000000,"ticketSize":null,"searchTerms":[],"correctedQuery":null}
"investors in Atomico portfolio" → {"investorType":"all","niche":null,"city":null,"country":null,"stage":null,"minAum":null,"ticketSize":null,"searchTerms":["Atomico"],"correctedQuery":null}
"medteck investors" → {"investorType":"all","niche":"Med Tech","city":null,"country":null,"stage":null,"minAum":null,"ticketSize":null,"searchTerms":[],"correctedQuery":"medtech investors"}
"family office biodiversity" → {"investorType":"family_office","niche":"Biodiversity","city":null,"country":null,"stage":null,"minAum":null,"ticketSize":null,"searchTerms":[],"correctedQuery":null}
"Finnish investor AI" → {"investorType":"all","niche":"AI","city":null,"country":"Finland","stage":null,"minAum":null,"ticketSize":null,"searchTerms":[],"correctedQuery":null}
"series B fund Germany" → {"investorType":"all","niche":null,"city":null,"country":"Germany","stage":"series-b","minAum":null,"ticketSize":null,"searchTerms":[],"correctedQuery":null}
"Nordic cleantech" → {"investorType":"all","niche":"Green Energy","city":null,"country":"Nordic","stage":null,"minAum":null,"ticketSize":null,"searchTerms":[],"correctedQuery":null}

Query: "${query}"`,
          },
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("filter-timeout")), 4000)
      ),
    ]);

    const text = completion.choices[0]?.message?.content || "{}";
    const raw = JSON.parse(text);

    // Extract correctedQuery before cleaning
    correctedQuery =
      typeof raw.correctedQuery === "string" ? raw.correctedQuery : undefined;

    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (key === "correctedQuery") continue;
      if (val !== null) cleaned[key] = val;
    }
    if (
      Array.isArray(cleaned.searchTerms) &&
      (cleaned.searchTerms as string[]).length === 0
    ) {
      delete cleaned.searchTerms;
    }

    // Step 3: post-process — validate niche against NICHE_ENUM
    const gptFilters = cleaned as InvestorFilters;
    if (gptFilters.niche) {
      const validNiche = NICHE_ENUM.find(
        (n) => n.toLowerCase() === gptFilters.niche!.toLowerCase()
      );
      if (validNiche) {
        gptFilters.niche = validNiche; // normalize casing
      } else {
        // Strip if query doesn't actually mention a niche-related word
        const nicheRelatedWords = [
          ...Object.keys(NICHE_SYNONYMS_MAP),
          ...NICHE_ENUM.map((n) => n.toLowerCase()),
        ];
        const queryLower = query.toLowerCase();
        const mentionsNiche = nicheRelatedWords.some((w) =>
          queryLower.includes(w.toLowerCase())
        );
        if (!mentionsNiche) {
          gptFilters.niche = undefined;
        }
      }
    }

    // Step 4: merge heuristics on top of GPT result
    parsed = applyHeuristicInvestorFilters(query, gptFilters);
  } catch {
    parsed = applyHeuristicInvestorFilters(query, {});
  }

  // Step 5: spelling correction — if corrected, re-run heuristics with fixed query
  if (!correctedQuery) {
    correctedQuery = trySpellingCorrection(query);
  }
  if (correctedQuery && correctedQuery !== query) {
    parsed = applyHeuristicInvestorFilters(correctedQuery, parsed);
  }

  filterCache.set(cacheKey, {
    expiresAt: Date.now() + FILTER_CACHE_TTL_MS,
    filters: parsed,
  });
  return parsed;
}

function applyHeuristicInvestorFilters(
  query: string,
  filters: InvestorFilters
): InvestorFilters {
  const next = { ...filters };
  const lower = query.toLowerCase();

  if (!next.investorType) {
    if (/\bfamily office\b/.test(lower)) {
      next.investorType = "family_office";
    } else if (/\bvc\b|venture capital/.test(lower)) {
      next.investorType = "vc";
    }
  }

  if (!next.city) {
    const matchedCity = COMMON_CITIES.find((city) =>
      lower.includes(city.toLowerCase())
    );
    if (matchedCity) next.city = matchedCity;
  }

  if (!next.niche) {
    // Sort by key length descending so more specific keys (e.g. "food waste") match before shorter ones (e.g. "waste")
    const sortedSynonyms = Object.entries(NICHE_SYNONYMS_MAP).sort(
      (a, b) => b[0].length - a[0].length
    );
    for (const [keyword, niche] of sortedSynonyms) {
      if (lower.includes(keyword)) {
        next.niche = niche;
        break;
      }
    }
    if (!next.niche) {
      const matchedNiche = NICHE_KEYWORDS.find((niche) =>
        lower.includes(niche.toLowerCase())
      );
      if (matchedNiche) next.niche = matchedNiche;
    }
  }

  if (!next.stage) {
    const STAGE_SYNONYMS: Record<string, string> = {
      "pre-seed": "pre-seed",
      preseed: "pre-seed",
      seed: "seed",
      "series a": "series-a",
      "series-a": "series-a",
      "series b": "series-b",
      "series-b": "series-b",
      "series c": "series-c",
      "series-c": "series-c",
      "early stage": "seed",
      "early-stage": "seed",
      growth: "growth",
      "growth stage": "growth",
    };
    for (const [keyword, stage] of Object.entries(STAGE_SYNONYMS)) {
      if (lower.includes(keyword)) {
        next.stage = stage;
        break;
      }
    }
  }

  if (!next.country) {
    const COUNTRY_DEMONYMS: Record<string, string> = {
      british: "United Kingdom",
      finnish: "Finland",
      french: "France",
      german: "Germany",
      dutch: "Netherlands",
      swedish: "Sweden",
      swiss: "Switzerland",
      spanish: "Spain",
      belgian: "Belgium",
      danish: "Denmark",
      norwegian: "Norway",
      italian: "Italy",
      portuguese: "Portugal",
      polish: "Poland",
      irish: "Ireland",
      austrian: "Austria",
      greek: "Greece",
      nordic: "Nordic",
      european: "Europe",
    };
    for (const [demonym, country] of Object.entries(COUNTRY_DEMONYMS)) {
      if (lower.includes(demonym)) {
        next.country = country;
        break;
      }
    }
    if (!next.country) {
      // Kräv ord-gränser så att "green" inte matchar "Greece", "france"
      // inte matchar "francophone" osv.
      const matchedCountry = COMMON_COUNTRIES.find((c) => {
        const re = new RegExp(`\\b${c.toLowerCase()}\\b`, "i");
        return re.test(lower);
      });
      if (matchedCountry) next.country = matchedCountry;
    }
  }

  if (!next.minAum) {
    const billionMatch = lower.match(
      /(?:over|above|more than|>\s*)\s*(\d+)\s*billion/
    );
    const millionMatch = lower.match(
      /(?:over|above|more than|>\s*)\s*(\d+)\s*(?:million|m\b)/
    );
    if (billionMatch) {
      next.minAum = parseInt(billionMatch[1], 10) * 1_000_000_000;
    } else if (millionMatch) {
      next.minAum = parseInt(millionMatch[1], 10) * 1_000_000;
    }
    if (!next.minAum && /\blarge fund\b|\bbig fund\b/.test(lower)) {
      next.minAum = 500_000_000;
    }
  }

  if (
    !next.investorType &&
    !next.niche &&
    !next.city &&
    /invest|fund|capital|vc\b/.test(lower)
  ) {
    next.investorType = "all";
  }

  // Activity last 12 months: "active last 12 months", "deployed X last year",
  // "most active 2024", "recent deals"
  if (next.minFundingLast12mUsd == null) {
    const mFund = lower.match(
      /(?:deployed|invested|invested\s+more\s+than|over|>)\s*\$?\s*(\d+)\s*(m|million|bn|billion)\s+(?:in\s+)?(?:last\s+12|last\s+year|past\s+year|last\s+12\s+months)/
    );
    if (mFund) {
      const n = parseInt(mFund[1], 10);
      next.minFundingLast12mUsd = mFund[2].startsWith("b")
        ? n * 1_000_000_000
        : n * 1_000_000;
    }
    if (
      next.minFundingLast12mUsd == null &&
      /\b(?:active\s+(?:last\s+12|last\s+year|recently)|most\s+active|recent\s+deals|deals?\s+last\s+12|very\s+active)\b/.test(
        lower
      )
    ) {
      // Signal: sätt låg tröskel bara för att favorisera aktiva
      next.minFundingLast12mUsd = 1_000_000;
    }
  }

  // Preferred round: "primarily series A", "prefers seed", "focus on Series B"
  if (!next.preferredRound) {
    const roundMatch = lower.match(
      /(?:primarily|mainly|mostly|focus(?:ed)?\s+on|prefer(?:s|red)?)\s+(pre-?seed|seed|series\s*[abc]|growth)/
    );
    if (roundMatch) {
      const r = roundMatch[1].replace(/\s+/g, " ").trim();
      if (r.startsWith("pre")) next.preferredRound = "Pre-Seed";
      else if (r === "seed") next.preferredRound = "Seed";
      else if (r.startsWith("series a")) next.preferredRound = "Series A";
      else if (r.startsWith("series b")) next.preferredRound = "Series B";
      else if (r.startsWith("series c")) next.preferredRound = "Series C";
      else if (r === "growth") next.preferredRound = "Growth";
    }
  }

  // Total investments threshold: "prolific", ">100 deals", "most active"
  if (next.minTotalInvestments == null) {
    const mTotal = lower.match(
      /(?:more\s+than|over|>\s*|at\s+least)\s*(\d+)\s+(?:deals|investments|portfolio\s+companies)/
    );
    if (mTotal) next.minTotalInvestments = parseInt(mTotal[1], 10);
    else if (/\b(?:prolific|seasoned|veteran)\b/.test(lower)) {
      next.minTotalInvestments = 50;
    }
  }

  // Co-investor: "invests alongside X", "co-invests with X", "backs companies
  // with X", "same deals as X"
  if (!next.coInvestor) {
    const coMatch = query.match(
      /(?:alongside|co[-\s]*invests?\s+with|same\s+deals?\s+as|backs?\s+companies\s+with|together\s+with)\s+([A-Z][A-Za-z0-9&\s.'-]{2,})/
    );
    if (coMatch) {
      next.coInvestor = coMatch[1]
        .trim()
        .replace(/[?!.,]+$/, "")
        .split(/\s+(?:and|or|in)\s+/i)[0]
        .trim();
    }
  }

  return next;
}

function isSimpleInvestorQuery(
  query: string,
  filters: InvestorFilters
): boolean {
  const lower = query.toLowerCase();

  if (filters.niche || (filters.investorType && filters.city)) return true;
  if (filters.investorType && filters.niche) return true;

  const words = lower.split(/\s+/).filter(Boolean);
  if (
    words.length <= 2 &&
    (filters.investorType || filters.city || filters.niche)
  ) {
    return true;
  }

  const needsGPT =
    words.length >= 3 &&
    !filters.niche &&
    /who |which |find |that |invested in|backed|portfolio|alongside|co[-\s]*invest|prefer|primarily|recent(?:ly)?|prolific|active last|active in/.test(
      lower
    );

  return (
    !needsGPT &&
    Boolean(
      filters.investorType ||
        filters.city ||
        filters.niche ||
        filters.minAum ||
        filters.minFundingLast12mUsd ||
        filters.preferredRound ||
        filters.coInvestor ||
        filters.minTotalInvestments
    )
  );
}

// ── DB row types ──────────────────────────────────────────────────────────────

interface FamilyOfficeEURow {
  id: string;
  name: string;
  family: string | null;
  description: string | null;
  impactNiche: string | null;
  impactNiches: string[] | null;
  region: string | null;
  city: string | null;
  assets: number | null;
  portfolioCompanies: string | null;
  currentPortfolio: unknown[] | null;
  portfolioTransactions: unknown[] | null;
  keyPeople: string | null;
  keyPeopleImageUrl: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  logoUrl: string | null;
  orgNumber: string | null;
  founded: number | null;
  currentFocus: string | null;
  futurePriorities: string | null;
  futureSignalStrength: string | null;
  overallImpactDirection: string | null;
  likelyCompanyTypes: string | null;
  relevanceReason: string | null;
  evidenceStrength: string | null;
  impactSources: string | null;
  investment_stage: string | null;
  typical_ticket_size: string | null;
  aum_usd: number | null;
  total_investments: number | null;
  total_exits: number | null;
  total_funding_deployed_usd: number | null;
  funding_last_12m_usd: number | null;
  preferred_round: string | null;
  team_count: number | null;
  latest_fund: unknown;
  notable_investments: unknown;
  current_unicorns: unknown;
  industry_experience: unknown;
  rounds_experience: unknown;
  co_investors: unknown;
  hq_country: string | null;
  hq_city: string | null;
}

interface VCCompanyEURow {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
  impactNiche: string | null;
  impactNiches: string[] | null;
  office: string | null;
  city: string | null;
  aum: number | null;
  portfolioExamples: string | null;
  currentPortfolio: unknown[] | null;
  portfolioTransactions: unknown[] | null;
  notableDeals: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  logoUrl: string | null;
  orgNumber: string | null;
  founded: number | null;
  currentFocus: string | null;
  futurePriorities: string | null;
  futureSignalStrength: string | null;
  overallImpactDirection: string | null;
  likelyCompanyTypes: string | null;
  relevanceReason: string | null;
  evidenceStrength: string | null;
  impactSources: string | null;
  keyPeople: string | null;
  keyPeopleImageUrl: string | null;
  investment_stage: string | null;
  typical_ticket_size: string | null;
  aum_usd: number | null;
  total_investments: number | null;
  total_exits: number | null;
  total_funding_deployed_usd: number | null;
  funding_last_12m_usd: number | null;
  preferred_round: string | null;
  team_count: number | null;
  latest_fund: unknown;
  notable_investments: unknown;
  current_unicorns: unknown;
  industry_experience: unknown;
  rounds_experience: unknown;
  co_investors: unknown;
  hq_country: string | null;
  hq_city: string | null;
}

// ── JSONB helpers ─────────────────────────────────────────────────────────────

/** Försök extrahera entitetsnamn från Dealroom jsonb-listor (varierar i
 *  form — ibland array av strängar, ibland objekt med name/companyName). */
function extractNames(value: unknown, limit = 5): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (out.length >= limit) break;
    if (typeof item === "string" && item.trim().length > 0) {
      out.push(item.trim());
    } else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const name =
        (rec.name as string) ||
        (rec.companyName as string) ||
        (rec.company_name as string) ||
        (rec.title as string);
      if (name && typeof name === "string") out.push(name.trim());
    }
  }
  return out;
}

/** Dealroom levererar "rounds_experience" / "industry_experience" antingen
 *  som array av {name,count} eller {label,percentage}. Normalisera till
 *  en homogen form med procent-fördelning baserad på count. */
function extractExperienceBars(
  value: unknown,
  labelKeys: string[] = ["name", "label", "round", "industry"]
): { label: string; percentage: number }[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const items: { label: string; count: number }[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    let label: string | null = null;
    for (const k of labelKeys) {
      if (typeof rec[k] === "string" && (rec[k] as string).trim()) {
        label = (rec[k] as string).trim();
        break;
      }
    }
    if (!label) continue;
    const rawCount = rec.count ?? rec.value ?? rec.percentage ?? rec.percent;
    const count = typeof rawCount === "number" ? rawCount : 0;
    items.push({ label, count });
  }
  const total = items.reduce((s, i) => s + i.count, 0);
  if (total <= 0) return [];
  return items
    .map((i) => ({
      label: i.label,
      percentage: Math.round((i.count / total) * 100),
    }))
    .filter((i) => i.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 6);
}

function extractLatestFund(value: unknown): InvestorResult["latestFund"] {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  const name = (rec.name as string) || (rec.fund_name as string) || undefined;
  const sizeUsd =
    typeof rec.size_usd === "number"
      ? (rec.size_usd as number)
      : typeof rec.sizeUsd === "number"
      ? (rec.sizeUsd as number)
      : typeof rec.amount === "number"
      ? (rec.amount as number)
      : undefined;
  const currency =
    (rec.currency as string) || (rec.size_currency as string) || undefined;
  const rawYear = rec.year ?? rec.vintage ?? rec.launch_year;
  const year = typeof rawYear === "number" ? rawYear : undefined;
  if (!name && !sizeUsd && !year) return undefined;
  return { name, sizeUsd, currency, year };
}

// ── JSONB helpers ─────────────────────────────────────────────────────────────

type PortfolioItem = {
  company_name?: string;
  org_nbr?: string;
  percentage?: number;
};

type TransactionItem = {
  company_name?: string;
  transaction_date?: string;
  transaction_type?: string;
  event_type?: string;
};

function extractPortfolioHoldings(
  portfolio: unknown[] | null,
  fallbackText?: string | null
):
  | { companyName: string; orgNumber?: string; percentage?: number }[]
  | undefined {
  if (Array.isArray(portfolio) && portfolio.length > 0) {
    const items = (portfolio as PortfolioItem[])
      .filter((p) => p.company_name)
      .slice(0, 10)
      .map((p) => ({
        companyName: p.company_name!,
        orgNumber: p.org_nbr || undefined,
        percentage: typeof p.percentage === "number" ? p.percentage : undefined,
      }));
    if (items.length > 0) return items;
  }
  // Fallback: parse comma-separated text field
  if (fallbackText && fallbackText.trim()) {
    const items = fallbackText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length < 80)
      .slice(0, 6)
      .map((name) => ({ companyName: name }));
    if (items.length > 0) return items;
  }
  return undefined;
}

function extractRecentTransactions(transactions: unknown[] | null): {
  recent: { companyName: string; date: string; type?: string }[];
  lastDate: string | undefined;
  activeRecently: boolean;
} {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { recent: [], lastDate: undefined, activeRecently: false };
  }

  const sorted = (transactions as TransactionItem[])
    .filter((t) => t.company_name && t.transaction_date)
    .sort((a, b) =>
      String(b.transaction_date || "").localeCompare(
        String(a.transaction_date || "")
      )
    );

  const recent = sorted.slice(0, 3).map((t) => ({
    companyName: t.company_name!,
    date: t.transaction_date!,
    type: t.transaction_type || t.event_type || undefined,
  }));

  const lastDate = sorted[0]?.transaction_date || undefined;

  let activeRecently = false;
  if (lastDate) {
    const threshold = new Date();
    threshold.setMonth(threshold.getMonth() - 12);
    activeRecently = lastDate >= threshold.toISOString().slice(0, 10);
  }

  return { recent, lastDate, activeRecently };
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function foToResult(row: FamilyOfficeEURow): InvestorResult {
  const txData = extractRecentTransactions(row.portfolioTransactions);
  return {
    id: `fo-${row.id}`,
    name: row.name,
    investorType: "family_office",
    family: row.family ?? undefined,
    description: row.description ?? "",
    impactNiche: row.impactNiche ?? "",
    region: row.region ?? row.city ?? "",
    assets: row.assets ?? undefined,
    portfolioCompanies: row.portfolioCompanies ?? undefined,
    keyPeople: row.keyPeople ?? undefined,
    keyPeopleImageUrl: row.keyPeopleImageUrl ?? undefined,
    website: row.website ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    linkedin: row.linkedin ?? undefined,
    logoUrl:
      row.logoUrl ?? (row.orgNumber ? getLogoUrl(row.orgNumber) : undefined),
    founded: row.founded ?? undefined,
    portfolioCount: Array.isArray(row.currentPortfolio)
      ? row.currentPortfolio.length
      : undefined,
    portfolioHoldings: extractPortfolioHoldings(
      row.currentPortfolio,
      row.portfolioCompanies
    ),
    recentTransactions: txData.recent.length > 0 ? txData.recent : undefined,
    lastTransactionDate: txData.lastDate,
    activeRecently: txData.activeRecently,
    currentFocus: row.currentFocus ?? undefined,
    futurePriorities: row.futurePriorities ?? undefined,
    futureSignalStrength: row.futureSignalStrength ?? undefined,
    overallImpactDirection: row.overallImpactDirection ?? undefined,
    likelyCompanyTypes: row.likelyCompanyTypes ?? undefined,
    relevanceReason: row.relevanceReason ?? undefined,
    evidenceStrength: row.evidenceStrength ?? undefined,
    impactSources: row.impactSources ?? undefined,
    investmentStage: row.investment_stage ?? undefined,
    ticketSize: row.typical_ticket_size ?? undefined,
    aumUsd: row.aum_usd ?? undefined,
    totalInvestments: row.total_investments ?? undefined,
    totalExits: row.total_exits ?? undefined,
    totalFundingDeployedUsd: row.total_funding_deployed_usd ?? undefined,
    fundingLast12mUsd: row.funding_last_12m_usd ?? undefined,
    preferredRound: row.preferred_round ?? undefined,
    teamCount: row.team_count ?? undefined,
    latestFund: extractLatestFund(row.latest_fund),
    notableInvestments: extractNames(row.notable_investments, 5),
    currentUnicorns: extractNames(row.current_unicorns, 5),
    industryExperience: extractExperienceBars(row.industry_experience, [
      "industry",
      "name",
      "label",
    ]).map((i) => ({ industry: i.label, percentage: i.percentage })),
    roundsExperience: extractExperienceBars(row.rounds_experience, [
      "round",
      "name",
      "label",
    ]).map((i) => ({ round: i.label, percentage: i.percentage })),
    coInvestors: extractNames(row.co_investors, 8),
    hqCountry: row.hq_country ?? undefined,
    hqCity: row.hq_city ?? undefined,
    relevanceScore: 0,
  };
}

function vcToResult(row: VCCompanyEURow): InvestorResult {
  const txData = extractRecentTransactions(row.portfolioTransactions);
  return {
    id: `vc-${row.id}`,
    name: row.name,
    investorType: "vc",
    vcType: row.type ?? undefined,
    description: row.description ?? "",
    impactNiche: row.impactNiche ?? "",
    region: row.office ?? row.city ?? "",
    aum: row.aum ?? undefined,
    portfolioExamples: row.portfolioExamples ?? undefined,
    notableDeals: row.notableDeals ?? undefined,
    website: row.website ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    linkedin: row.linkedin ?? undefined,
    logoUrl:
      row.logoUrl ?? (row.orgNumber ? getLogoUrl(row.orgNumber) : undefined),
    founded: row.founded ?? undefined,
    portfolioCount: Array.isArray(row.currentPortfolio)
      ? row.currentPortfolio.length
      : undefined,
    portfolioHoldings: extractPortfolioHoldings(
      row.currentPortfolio,
      row.portfolioExamples
    ),
    recentTransactions: txData.recent.length > 0 ? txData.recent : undefined,
    lastTransactionDate: txData.lastDate,
    activeRecently: txData.activeRecently,
    currentFocus: row.currentFocus ?? undefined,
    futurePriorities: row.futurePriorities ?? undefined,
    futureSignalStrength: row.futureSignalStrength ?? undefined,
    overallImpactDirection: row.overallImpactDirection ?? undefined,
    likelyCompanyTypes: row.likelyCompanyTypes ?? undefined,
    relevanceReason: row.relevanceReason ?? undefined,
    evidenceStrength: row.evidenceStrength ?? undefined,
    impactSources: row.impactSources ?? undefined,
    keyPeople: row.keyPeople ?? undefined,
    keyPeopleImageUrl: row.keyPeopleImageUrl ?? undefined,
    investmentStage: row.investment_stage ?? undefined,
    ticketSize: row.typical_ticket_size ?? undefined,
    aumUsd: row.aum_usd ?? undefined,
    totalInvestments: row.total_investments ?? undefined,
    totalExits: row.total_exits ?? undefined,
    totalFundingDeployedUsd: row.total_funding_deployed_usd ?? undefined,
    fundingLast12mUsd: row.funding_last_12m_usd ?? undefined,
    preferredRound: row.preferred_round ?? undefined,
    teamCount: row.team_count ?? undefined,
    latestFund: extractLatestFund(row.latest_fund),
    notableInvestments: extractNames(row.notable_investments, 5),
    currentUnicorns: extractNames(row.current_unicorns, 5),
    industryExperience: extractExperienceBars(row.industry_experience, [
      "industry",
      "name",
      "label",
    ]).map((i) => ({ industry: i.label, percentage: i.percentage })),
    roundsExperience: extractExperienceBars(row.rounds_experience, [
      "round",
      "name",
      "label",
    ]).map((i) => ({ round: i.label, percentage: i.percentage })),
    coInvestors: extractNames(row.co_investors, 8),
    hqCountry: row.hq_country ?? undefined,
    hqCity: row.hq_city ?? undefined,
    relevanceScore: 0,
  };
}

// ── DB fields ─────────────────────────────────────────────────────────────────

const DEALROOM_EXTRA_FIELDS =
  "aum_usd, total_investments, total_exits, total_funding_deployed_usd, funding_last_12m_usd, preferred_round, team_count, latest_fund, notable_investments, current_unicorns, industry_experience, rounds_experience, co_investors, hq_country, hq_city";
const FO_FIELDS =
  "id, name, family, description, impactNiche, impactNiches, region, city, assets, portfolioCompanies, currentPortfolio, portfolioTransactions, keyPeople, keyPeopleImageUrl, website, email, phone, linkedin, logoUrl, orgNumber, founded, currentFocus, futurePriorities, futureSignalStrength, overallImpactDirection, likelyCompanyTypes, relevanceReason, evidenceStrength, impactSources, investment_stage, typical_ticket_size, " +
  DEALROOM_EXTRA_FIELDS;
const VC_FIELDS =
  "id, name, type, description, impactNiche, impactNiches, office, city, aum, portfolioExamples, currentPortfolio, portfolioTransactions, notableDeals, website, email, phone, linkedin, logoUrl, orgNumber, founded, currentFocus, futurePriorities, futureSignalStrength, overallImpactDirection, likelyCompanyTypes, relevanceReason, evidenceStrength, impactSources, keyPeople, keyPeopleImageUrl, investment_stage, typical_ticket_size, " +
  DEALROOM_EXTRA_FIELDS;

// ── Stage matching ────────────────────────────────────────────────────────────

const STAGE_MATCH_MAP: Record<string, string[]> = {
  "pre-seed": ["Pre-seed", "pre-seed"],
  seed: ["Seed", "seed"],
  "series-a": ["Series A", "series-a"],
  "series-b": ["Series B", "series-b", "Growth"],
  "series-c": ["Series C", "series-c", "Growth"],
  growth: ["Growth", "Series B", "Series C", "growth"],
};

function applyStageFilter(
  investmentStage: string | null | undefined,
  stage: string
): boolean {
  if (!investmentStage) return false;
  const validValues = STAGE_MATCH_MAP[stage.toLowerCase()];
  if (!validValues) return true;
  return validValues.some(
    (v) => v.toLowerCase() === investmentStage.toLowerCase()
  );
}

// ── Pinecone article boost ────────────────────────────────────────────────────

const EU_PINECONE_HOST =
  "https://impactloopeu2026-vs7q5ii.svc.aped-4627-b74a.pinecone.io";

async function findInvestorsMentionedInArticles(
  query: string,
  investorNames: string[]
): Promise<Set<string>> {
  if (!query || investorNames.length === 0) return new Set();
  const pineconeKey = process.env.PINECONE_API_KEY;
  if (!pineconeKey) return new Set();

  try {
    // Embed the query
    const embeddingRes = await getOpenAI().embeddings.create(
      {
        model: "text-embedding-3-large",
        input: query,
      },
      { signal: AbortSignal.timeout(3000) }
    );
    const vector = embeddingRes.data[0]?.embedding;
    if (!vector) return new Set();

    // Query Pinecone for top 12 articles
    const pineconeRes = await fetch(`${EU_PINECONE_HOST}/query`, {
      method: "POST",
      headers: {
        "Api-Key": pineconeKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vector,
        topK: 12,
        includeMetadata: true,
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!pineconeRes.ok) return new Set();

    const pineconeData = (await pineconeRes.json()) as {
      matches?: { metadata?: { headline?: string; text?: string } }[];
    };
    const matches = pineconeData.matches ?? [];

    // Check which investor names appear in article headlines/text
    const mentioned = new Set<string>();
    const articlesText = matches
      .flatMap((m) => [m.metadata?.headline ?? "", m.metadata?.text ?? ""])
      .join(" ")
      .toLowerCase();

    for (const name of investorNames) {
      if (name && articlesText.includes(name.toLowerCase())) {
        mentioned.add(name);
      }
    }

    return mentioned;
  } catch {
    // Best-effort — return empty set on any failure
    return new Set();
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreInvestor(
  inv: InvestorResult,
  filters: InvestorFilters,
  q: string,
  mentionedInArticles = false
) {
  let score = 52;
  const reasons: string[] = [];

  if (
    filters.niche &&
    inv.impactNiche?.toLowerCase().includes(filters.niche.toLowerCase())
  ) {
    score += 18;
    reasons.push(`strong focus on ${filters.niche.toLowerCase()}`);
  }
  if (
    filters.city &&
    inv.region?.toLowerCase().includes(filters.city.toLowerCase())
  ) {
    score += 8;
    reasons.push(`based in ${filters.city}`);
  }
  if (filters.country && inv.region) {
    const regionLower = inv.region.toLowerCase();
    if (filters.country === "Nordic") {
      if (/sweden|norway|denmark|finland/i.test(regionLower)) {
        score += 8;
        reasons.push("Nordic presence");
      }
    } else if (regionLower.includes(filters.country.toLowerCase())) {
      score += 8;
      reasons.push(`based in ${filters.country}`);
    }
  }
  if (
    filters.stage &&
    inv.investmentStage &&
    applyStageFilter(inv.investmentStage, filters.stage)
  ) {
    score += 12;
    const stageLabel =
      STAGE_MATCH_MAP[filters.stage.toLowerCase()]?.[0] ?? filters.stage;
    reasons.push(`invests at ${stageLabel}`);
  }
  if (mentionedInArticles) {
    score += 15;
    reasons.push("mentioned in articles");
  }
  if ((inv.recentArticleMentionCount ?? 0) > 0) {
    score += Math.min(12, (inv.recentArticleMentionCount ?? 0) * 4);
    reasons.push(
      `mentioned recently in ${inv.recentArticleMentionCount} articles`
    );
  }
  if ((inv.articleMentionCount ?? 0) > 1) {
    score += Math.min(8, (inv.articleMentionCount ?? 0) * 2);
    reasons.push("recurring in article feed");
  }
  if ((inv.linkedPortfolioCompanies?.length ?? 0) > 1) {
    score += Math.min(8, (inv.linkedPortfolioCompanies?.length ?? 0) * 2);
    reasons.push(
      `${inv.linkedPortfolioCompanies?.length} matched portfolio companies`
    );
  }
  if ((inv.portfolioCount ?? 0) >= 10) {
    score += 6;
    reasons.push(`${inv.portfolioCount} portfolio companies`);
  } else if ((inv.portfolioCount ?? 0) >= 5) {
    score += 3;
  }
  if (inv.activeRecently) {
    score += 10;
    reasons.push("recently active");
  } else if (inv.lastTransactionDate) {
    const txDate = new Date(inv.lastTransactionDate);
    const monthsAgo =
      (Date.now() - txDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsAgo <= 12) {
      score += 8;
      reasons.push("transaction in past year");
    } else if (monthsAgo <= 24) {
      score += 4;
      reasons.push("transaction in past 2 years");
    }
  }
  if (inv.activitySummary) {
    score += 3;
  }
  if (/europe|eu\b|nordic|pan-europe/i.test(q.toLowerCase())) {
    if (/london|berlin|paris|amsterdam|europe/i.test(inv.region || "")) {
      score += 6;
      reasons.push("European presence");
    }
  }

  const normalized = Math.max(55, Math.min(99, Math.round(score)));
  const reasonText =
    reasons.length > 0 ? reasons.slice(0, 2).join(", ") : "broad match";

  return {
    score: normalized,
    label: `${normalized}% match - ${reasonText}`,
  };
}

function matchesInvestorFilters(
  inv: InvestorResult,
  filters: InvestorFilters
): boolean {
  if (
    filters.investorType &&
    filters.investorType !== "all" &&
    inv.investorType !== filters.investorType
  ) {
    return false;
  }

  if (filters.niche) {
    const nicheLC = inv.impactNiche.toLowerCase();
    const filterNicheLC = filters.niche.toLowerCase();
    let nicheMatch = nicheLC.includes(filterNicheLC);
    if (!nicheMatch) {
      const RELATED: Record<string, string[]> = {
        batteries: ["green energy", "deep tech", "mobility"],
        "solar energy": ["green energy", "green construction"],
        "carbon capture": ["green energy", "sustainable materials"],
        "green energy": ["carbon capture", "solar energy", "batteries"],
        "climate adaptation": [
          "green energy",
          "water",
          "sustainable materials",
        ],
        "defence tech": ["deep tech"],
        "food waste": ["food tech", "circular economy"],
        packaging: ["sustainable materials", "circular economy"],
        textiles: ["sustainable materials", "circular economy"],
        biodiversity: ["water", "agri tech", "forestry"],
        "waste & recycling": ["circular economy", "sustainable materials"],
        mobility: ["green energy", "deep tech", "batteries"],
        water: ["green energy", "biodiversity", "agri tech"],
        forestry: ["biodiversity", "sustainable materials"],
      };
      const relatedNiches = RELATED[filterNicheLC];
      if (relatedNiches) {
        nicheMatch = relatedNiches.some((rn) => nicheLC.includes(rn));
      }
    }
    if (!nicheMatch) return false;
  }

  if (filters.city) {
    const location = [inv.region].filter(Boolean).join(" ").toLowerCase();
    if (!location.includes(filters.city.toLowerCase())) {
      return false;
    }
  }

  if (
    filters.minAum &&
    (inv.investorType === "family_office"
      ? (inv.assets ?? 0) < filters.minAum
      : (inv.aum ?? 0) < filters.minAum)
  ) {
    return false;
  }

  if (filters.searchTerms && filters.searchTerms.length > 0) {
    const haystack = [
      inv.name,
      inv.description,
      inv.impactNiche,
      inv.region,
      inv.family,
      inv.vcType,
      inv.portfolioCompanies,
      inv.portfolioExamples,
      inv.notableDeals,
      ...(inv.linkedPortfolioCompanies ?? []).map((company) => company.name),
      ...(inv.linkedNotableDeals ?? []).map((company) => company.name),
      ...(inv.articleMentions ?? []).flatMap((mention) => [
        mention.headline,
        mention.companyName,
        mention.snippet,
      ]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const hasMatchingSearchTerm = filters.searchTerms.some((term) =>
      haystack.includes(term.toLowerCase())
    );
    if (!hasMatchingSearchTerm) {
      return false;
    }
  }

  if (filters.minFundingLast12mUsd != null) {
    if ((inv.fundingLast12mUsd ?? 0) < filters.minFundingLast12mUsd)
      return false;
  }
  if (filters.minTotalInvestments != null) {
    if ((inv.totalInvestments ?? 0) < filters.minTotalInvestments) return false;
  }
  if (filters.preferredRound) {
    const pr = (inv.preferredRound || "").toLowerCase();
    if (!pr.includes(filters.preferredRound.toLowerCase())) return false;
  }
  if (filters.coInvestor) {
    const target = filters.coInvestor.toLowerCase();
    const matchesCoInvestor =
      (inv.coInvestors || []).some((c) => c.toLowerCase().includes(target)) ||
      (inv.notableInvestments || []).some((c) =>
        c.toLowerCase().includes(target)
      );
    if (!matchesCoInvestor) return false;
  }

  return true;
}

// ── Search ────────────────────────────────────────────────────────────────────

async function searchInvestors(
  supabase: ReturnType<typeof createServiceRoleClient>,
  q: string,
  filters: InvestorFilters
): Promise<InvestorResult[]> {
  const results: InvestorResult[] = [];

  const hasStructuredFilters = !!(
    filters.niche ||
    filters.city ||
    filters.minAum
  );

  // Strip articles and generic corporate suffixes so "EQT Ventures" searches
  // for "eqt" (the distinctive core) rather than requiring the literal
  // substring "eqt ventures" — which would otherwise miss firms whose db name
  // is "EQT Growth" etc. Also prevents bare queries like "Ventures" or "the"
  // from matching every firm that happens to contain those words.
  const cleanedQuery = q
    .toLowerCase()
    .replace(/\b(the|a|an|of|and|or|for|to|in|on|at|by|with|from)\b/g, " ")
    .replace(
      /\b(capital|ventures|venture|partners|partner|fund|funds|group|holding|holdings|investments|investment|management|equity|advisors|advisors|llp|llc|ltd|limited|inc|corp|corporation|gmbh|sa|ab|plc|family|office)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  // If stripping emptied the query, fall back to original q to avoid breaking
  // searches like "Capital" alone (rare, but don't want to block it entirely).
  const searchQ = cleanedQuery.length >= 2 ? cleanedQuery : q;
  const searchText = searchQ.length >= 2 && !hasStructuredFilters;

  const queryFO =
    !filters.investorType ||
    filters.investorType === "family_office" ||
    filters.investorType === "all";
  const queryVC =
    !filters.investorType ||
    filters.investorType === "vc" ||
    filters.investorType === "all";

  const dbPromises: Promise<void>[] = [];

  if (queryFO) {
    let foQuery = supabase.from("FamilyOfficeEU").select(FO_FIELDS);
    if (searchText) {
      foQuery = foQuery.or(
        `name.ilike.%${searchQ}%,description.ilike.%${searchQ}%,impactNiche.ilike.%${searchQ}%,family.ilike.%${searchQ}%,portfolioCompanies.ilike.%${searchQ}%,currentFocus.ilike.%${searchQ}%,likelyCompanyTypes.ilike.%${searchQ}%`
      ) as typeof foQuery;
    }
    if (filters.niche) {
      foQuery = foQuery.ilike(
        "impactNiche",
        `%${filters.niche}%`
      ) as typeof foQuery;
    }
    if (filters.city) {
      foQuery = foQuery.or(
        `region.ilike.%${filters.city}%,city.ilike.%${filters.city}%`
      ) as typeof foQuery;
    }
    if (filters.country === "Nordic") {
      foQuery = foQuery.or(
        "region.ilike.%Sweden%,region.ilike.%Norway%,region.ilike.%Denmark%,region.ilike.%Finland%"
      ) as typeof foQuery;
    } else if (filters.country) {
      foQuery = foQuery.ilike(
        "region",
        `%${filters.country}%`
      ) as typeof foQuery;
    }
    if (filters.minAum) {
      foQuery = foQuery.gte("assets", filters.minAum) as typeof foQuery;
    }
    if (filters.minFundingLast12mUsd) {
      foQuery = foQuery.gte(
        "funding_last_12m_usd",
        filters.minFundingLast12mUsd
      ) as typeof foQuery;
    }
    if (filters.minTotalInvestments) {
      foQuery = foQuery.gte(
        "total_investments",
        filters.minTotalInvestments
      ) as typeof foQuery;
    }
    if (filters.preferredRound) {
      foQuery = foQuery.ilike(
        "preferred_round",
        `%${filters.preferredRound}%`
      ) as typeof foQuery;
    }
    dbPromises.push(
      (
        foQuery.limit(50) as unknown as Promise<{
          data: FamilyOfficeEURow[] | null;
        }>
      ).then(({ data }) => {
        let foResults = (data || []).map(foToResult);
        if (filters.stage) {
          const staged = foResults.filter((inv) =>
            applyStageFilter(inv.investmentStage, filters.stage!)
          );
          if (staged.length > 0) foResults = staged;
        }
        if (filters.ticketSize) {
          foResults = foResults.filter(
            (inv) => inv.ticketSize === filters.ticketSize
          );
        }
        results.push(...foResults);
      })
    );
  }

  if (queryVC) {
    let vcQuery = supabase.from("VCCompanyEU").select(VC_FIELDS);
    if (searchText) {
      vcQuery = vcQuery.or(
        `name.ilike.%${searchQ}%,description.ilike.%${searchQ}%,impactNiche.ilike.%${searchQ}%,type.ilike.%${searchQ}%,portfolioExamples.ilike.%${searchQ}%,currentFocus.ilike.%${searchQ}%,likelyCompanyTypes.ilike.%${searchQ}%`
      ) as typeof vcQuery;
    }
    if (filters.niche) {
      vcQuery = vcQuery.ilike(
        "impactNiche",
        `%${filters.niche}%`
      ) as typeof vcQuery;
    }
    if (filters.city) {
      vcQuery = vcQuery.or(
        `office.ilike.%${filters.city}%,city.ilike.%${filters.city}%`
      ) as typeof vcQuery;
    }
    if (filters.country === "Nordic") {
      vcQuery = vcQuery.or(
        "office.ilike.%Sweden%,office.ilike.%Norway%,office.ilike.%Denmark%,office.ilike.%Finland%"
      ) as typeof vcQuery;
    } else if (filters.country) {
      vcQuery = vcQuery.ilike(
        "office",
        `%${filters.country}%`
      ) as typeof vcQuery;
    }
    if (filters.minAum) {
      vcQuery = vcQuery.gte("aum", filters.minAum) as typeof vcQuery;
    }
    if (filters.minFundingLast12mUsd) {
      vcQuery = vcQuery.gte(
        "funding_last_12m_usd",
        filters.minFundingLast12mUsd
      ) as typeof vcQuery;
    }
    if (filters.minTotalInvestments) {
      vcQuery = vcQuery.gte(
        "total_investments",
        filters.minTotalInvestments
      ) as typeof vcQuery;
    }
    if (filters.preferredRound) {
      vcQuery = vcQuery.ilike(
        "preferred_round",
        `%${filters.preferredRound}%`
      ) as typeof vcQuery;
    }
    dbPromises.push(
      (
        vcQuery.limit(50) as unknown as Promise<{
          data: VCCompanyEURow[] | null;
        }>
      ).then(({ data }) => {
        let vcResults = (data || []).map(vcToResult);
        if (filters.stage) {
          const staged = vcResults.filter((inv) =>
            applyStageFilter(inv.investmentStage, filters.stage!)
          );
          if (staged.length > 0) vcResults = staged;
        }
        if (filters.ticketSize) {
          vcResults = vcResults.filter(
            (inv) => inv.ticketSize === filters.ticketSize
          );
        }
        results.push(...vcResults);
      })
    );
  }

  await Promise.all(dbPromises);

  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

let totalCountCache: { expiresAt: number; count: number } | null = null;

async function getTotalCount(
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<number> {
  if (totalCountCache && totalCountCache.expiresAt > Date.now()) {
    return totalCountCache.count;
  }
  const [{ count: fo }, { count: vc }] = await Promise.all([
    supabase
      .from("FamilyOfficeEU")
      .select("id", { count: "exact", head: true }),
    supabase.from("VCCompanyEU").select("id", { count: "exact", head: true }),
  ]);
  const total = (fo ?? 0) + (vc ?? 0);
  totalCountCache = { expiresAt: Date.now() + 10 * 60_000, count: total };
  return total;
}

// ── Route handlers ────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonCors(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, { ...init, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const supabase = createServiceRoleClient();
  const total = await getTotalCount(supabase);
  return jsonCors({ total });
}

export async function POST(request: NextRequest) {
  try {
    const startTime = Date.now();
    const { query, stage: explicitStage, sessionId } = await request.json();
    const source =
      request.headers.get("referer") ||
      request.headers.get("origin") ||
      "direct";
    const userAgent = request.headers.get("user-agent") || "";

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return jsonCors(
        { error: "Search query must be at least 2 characters" },
        { status: 400 }
      );
    }

    const q = query.trim();
    const stageSuffix = explicitStage ? `:stage=${explicitStage}` : "";
    const cacheKey = `eu:${q.toLowerCase()}${stageSuffix}`;
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return jsonCors(cached.payload);
    }

    const supabase = createServiceRoleClient();

    const filters = await parseInvestorFilters(q);
    if (explicitStage && typeof explicitStage === "string") {
      filters.stage = explicitStage;
    }

    const hasFilters =
      filters.investorType ||
      filters.niche ||
      filters.city ||
      filters.stage ||
      filters.minAum;
    const searches: Promise<InvestorResult[]>[] = [
      searchInvestors(supabase, q, filters),
    ];
    if (hasFilters) {
      searches.push(searchInvestors(supabase, "", filters));
    }
    if (filters.niche) {
      const RELATED_NICHES: Record<string, string[]> = {
        Batteries: ["Green Energy", "Deep Tech", "Mobility"],
        "Solar Energy": ["Green Energy", "Green Construction"],
        "Carbon Capture": ["Green Energy", "Sustainable Materials"],
        "Green Energy": ["Carbon Capture", "Solar Energy", "Batteries"],
        "Climate Adaptation": [
          "Green Energy",
          "Water",
          "Sustainable Materials",
        ],
        "Defence Tech": ["Deep Tech"],
        "Food Waste": ["Food Tech", "Circular Economy"],
        Packaging: ["Sustainable Materials", "Circular Economy"],
        Textiles: ["Sustainable Materials", "Circular Economy"],
        Biodiversity: ["Water", "Agri Tech", "Forestry"],
        "Waste & Recycling": ["Circular Economy", "Sustainable Materials"],
        Mobility: ["Green Energy", "Deep Tech", "Batteries"],
        Water: ["Green Energy", "Biodiversity", "Agri Tech"],
        Forestry: ["Biodiversity", "Sustainable Materials"],
        "Med Tech": ["Biotech", "AI"],
        Biotech: ["Med Tech", "AI"],
        "Food Tech": ["Agri Tech", "Food Waste", "Circular Economy"],
        "Deep Tech": ["AI", "Biotech"],
        "Social Sustainability": ["Circular Economy"],
      };
      const related = RELATED_NICHES[filters.niche];
      if (related) {
        for (const niche of related) {
          searches.push(searchInvestors(supabase, "", { ...filters, niche }));
        }
      }
    }
    if (filters.niches && filters.niches.length > 1) {
      for (const niche of filters.niches.slice(1, 4)) {
        searches.push(searchInvestors(supabase, "", { ...filters, niche }));
      }
    }
    if (filters.searchTerms && filters.searchTerms.length > 0) {
      for (const term of filters.searchTerms.slice(0, 3)) {
        searches.push(searchInvestors(supabase, term, {}));
      }
    }

    const rawWords = q
      .split(/\s+/)
      .filter(
        (w) => w.length >= 3 && !/^(vc|and|with|for|in|on|at|the|a)$/i.test(w)
      );
    if (rawWords.length > 0 && rawWords.length <= 4) {
      searches.push(searchInvestors(supabase, q, {}));
    }

    // Run DB searches and Pinecone article check in parallel
    const [resultArrays, articleMentionsResult] = await Promise.all([
      Promise.all(searches),
      findInvestorsMentionedInArticles(q, []).catch(() => new Set<string>()),
    ]);
    const seen = new Set<string>();
    let investors: InvestorResult[] = [];
    for (const arr of resultArrays) {
      for (const inv of arr) {
        if (!seen.has(inv.id)) {
          seen.add(inv.id);
          investors.push(inv);
        }
      }
    }

    // Now we know all investor names — do the real Pinecone check
    const investorNames = investors.map((inv) => inv.name);
    const mentionedInArticles =
      investorNames.length > 0
        ? await findInvestorsMentionedInArticles(q, investorNames).catch(
            () => new Set<string>()
          )
        : articleMentionsResult;

    // Auto-relax: de nya Dealroom-filterfälten (minFundingLast12mUsd,
    // minTotalInvestments, preferredRound) är glest populerade — om
    // de ger 0 träffar, släpp dem. Behåll övriga filter (niche, city,
    // country, stage) så användaren fortfarande får relevanta resultat.
    if (
      investors.length === 0 &&
      (filters.minFundingLast12mUsd ||
        filters.minTotalInvestments ||
        filters.preferredRound ||
        filters.coInvestor)
    ) {
      const relaxed = {
        ...filters,
        minFundingLast12mUsd: undefined,
        minTotalInvestments: undefined,
        preferredRound: undefined,
        coInvestor: undefined,
      };
      investors = await searchInvestors(supabase, q, relaxed);
    }
    if (investors.length === 0 && filters.minAum) {
      const relaxed = { ...filters, minAum: undefined };
      investors = await searchInvestors(supabase, "", relaxed);
    }
    if (investors.length === 0 && filters.stage) {
      const relaxed = { ...filters, stage: undefined, minAum: undefined };
      investors = await searchInvestors(supabase, "", relaxed);
    }
    if (investors.length === 0 && (filters.niche || filters.city)) {
      const relaxed: InvestorFilters = {
        investorType: filters.investorType || "all",
      };
      investors = await searchInvestors(supabase, "", relaxed);
    }

    const prioritizedInvestors = investors.slice(0, ENRICH_LIMIT);
    const remainingInvestors = investors.slice(ENRICH_LIMIT);
    const baselineEnriched = prioritizedInvestors.map((investor) => ({
      ...investor,
      articleMentions: [],
      articleMentionCount: 0,
      recentArticleMentionCount: 0,
      verifiedFromArticles: false,
      activeRecently: false,
    }));
    const enrichedInvestors = [...baselineEnriched, ...remainingInvestors]
      .filter((inv) => matchesInvestorFilters(inv, filters))
      .map((inv) => {
        const relevance = scoreInvestor(
          inv,
          filters,
          q,
          mentionedInArticles.has(inv.name)
        );
        return {
          ...inv,
          relevanceScore: relevance.score,
          relevanceLabel: relevance.label,
        };
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    const payload = {
      investors: enrichedInvestors,
      count: enrichedInvestors.length,
      filters,
    };

    searchCache.set(cacheKey, {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      payload,
    });

    const responseMs = Date.now() - startTime;
    const typeCounts: Record<string, number> = {};
    for (const inv of enrichedInvestors) {
      typeCounts[inv.investorType] = (typeCounts[inv.investorType] || 0) + 1;
    }
    supabase
      .from("investor_search_logs")
      .insert({
        session_id: sessionId || null,
        query: q,
        filters,
        result_count: enrichedInvestors.length,
        results: enrichedInvestors.map((inv) => ({
          id: inv.id,
          name: inv.name,
          type: inv.investorType,
          niche: inv.impactNiche,
          region: inv.region,
          score: inv.relevanceScore,
          description: inv.description?.slice(0, 200),
        })),
        investor_types: typeCounts,
        response_ms: responseMs,
        source: source.replace(/https?:\/\//, "").split("/")[0],
        user_agent: userAgent.slice(0, 300),
        ranking_version: "eu-v1",
      })
      .then(({ error }) => {
        if (error)
          console.error("[eu-search-log] insert error:", error.message);
      });

    return jsonCors(payload);
  } catch (error) {
    console.error("Find investors search error:", error);
    return jsonCors({ error: "Search failed" }, { status: 500 });
  }
}
