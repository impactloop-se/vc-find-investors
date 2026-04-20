import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const NICHE_SUGGESTIONS = [
  "Green Energy",
  "Cleantech",
  "Med Tech",
  "Food Tech",
  "Deep Tech",
  "Mobility",
  "Sustainable Materials",
  "Batteries",
  "Solar Energy",
  "Water",
  "Agri Tech",
  "Green Construction",
  "Social Sustainability",
  "Circular Economy",
  "Defence Tech",
  "Biotech",
  "Life Science",
  "AI",
  "Software/Platforms",
  "Textiles",
  "Carbon Capture",
  "Biodiversity",
  "Waste & Recycling",
  "Food Waste",
  "Packaging",
  "Forestry",
  "Climate Adaptation",
];

const COMMON_SEARCHES = [
  "VC in climate tech",
  "Family office London",
  "Seed investors green energy",
  "VC Berlin sustainability",
  "Impact investors Amsterdam",
  "Investors in food tech",
  "Med tech and life science",
  "Deep tech and AI",
  "Batteries and energy storage",
  "Family office Europe",
  "Growth stage investors",
  "Carbon capture investors",
];

const CITIES = [
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

// ── Fuzzy matching ─────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function fuzzyMatch(
  name: string,
  query: string
): { match: boolean; score: number } {
  const nameLower = name.toLowerCase();
  const qLower = query.toLowerCase();

  if (nameLower.includes(qLower)) {
    const startBonus = nameLower.startsWith(qLower)
      ? 3
      : nameLower.includes(` ${qLower}`)
      ? 2
      : 0;
    return { match: true, score: 100 + startBonus };
  }

  if (qLower.length <= 2) {
    return { match: false, score: 0 };
  }

  const words = nameLower.split(/\s+/);
  for (const word of words) {
    const maxDist = qLower.length <= 5 ? 1 : 2;
    const dist = levenshtein(word.slice(0, qLower.length + maxDist), qLower);
    if (dist <= maxDist) {
      return { match: true, score: 80 - dist * 10 };
    }
  }

  const namePrefix = nameLower.slice(0, qLower.length + 2);
  const prefixDist = levenshtein(namePrefix, qLower);
  if (prefixDist <= (qLower.length <= 4 ? 1 : 2)) {
    return { match: true, score: 70 - prefixDist * 10 };
  }

  return { match: false, score: 0 };
}

// ── Data cache ─────────────────────────────────────────────────────────────────

interface InvestorCacheEntry {
  name: string;
  type: "fo" | "vc";
}

interface PortfolioCompanyCacheEntry {
  companyName: string;
  investorName: string;
  investorType: "fo" | "vc";
}

let nameCache: {
  expiresAt: number;
  investors: InvestorCacheEntry[];
  portfolioCompanies: PortfolioCompanyCacheEntry[];
} | null = null;

async function getSearchData(): Promise<{
  investors: InvestorCacheEntry[];
  portfolioCompanies: PortfolioCompanyCacheEntry[];
}> {
  if (nameCache && nameCache.expiresAt > Date.now()) {
    return nameCache;
  }

  const supabase = createServiceRoleClient();
  const [fo, vc] = await Promise.all([
    supabase
      .from("FamilyOfficeEU")
      .select("name, portfolioCompanies")
      .limit(200),
    supabase
      .from("VCCompanyEU")
      .select("name, portfolioExamples, notableDeals")
      .limit(200),
  ]);

  const investors: InvestorCacheEntry[] = [];
  const portfolioCompanies: PortfolioCompanyCacheEntry[] = [];
  const seenCompanies = new Set<string>();

  for (const row of fo.data || []) {
    if (row.name) investors.push({ name: row.name, type: "fo" });
    if (row.portfolioCompanies) {
      for (const c of row.portfolioCompanies.split(",")) {
        const name = c
          .trim()
          .replace(/\s*\(.*?\)\s*/g, "")
          .trim();
        if (name.length >= 3 && !seenCompanies.has(name.toLowerCase())) {
          seenCompanies.add(name.toLowerCase());
          portfolioCompanies.push({
            companyName: name,
            investorName: row.name,
            investorType: "fo",
          });
        }
      }
    }
  }
  for (const row of vc.data || []) {
    if (row.name) investors.push({ name: row.name, type: "vc" });
    const combined = [row.portfolioExamples, row.notableDeals]
      .filter(Boolean)
      .join(", ");
    if (combined) {
      for (const c of combined.split(",")) {
        const name = c
          .trim()
          .replace(/\s*\(.*?\)\s*/g, "")
          .trim();
        if (name.length >= 3 && !seenCompanies.has(name.toLowerCase())) {
          seenCompanies.add(name.toLowerCase());
          portfolioCompanies.push({
            companyName: name,
            investorName: row.name,
            investorType: "vc",
          });
        }
      }
    }
  }

  nameCache = {
    expiresAt: Date.now() + 30 * 60_000,
    investors,
    portfolioCompanies,
  };
  return nameCache;
}

// ── Route handler ──────────────────────────────────────────────────────────────

interface Suggestion {
  text: string;
  type: "investor" | "niche" | "search" | "city" | "company";
  subtext?: string;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";

  if (q.length < 1) {
    return NextResponse.json({ suggestions: [] }, { headers: CORS_HEADERS });
  }

  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();

  function add(s: Suggestion) {
    const key = s.text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(s);
  }

  const { investors, portfolioCompanies } = await getSearchData();

  // 1. Match investor names
  const investorMatches: { entry: InvestorCacheEntry; score: number }[] = [];
  for (const inv of investors) {
    const { match, score } = fuzzyMatch(inv.name, q);
    if (match) {
      investorMatches.push({ entry: inv, score });
    }
  }
  investorMatches
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .forEach(({ entry }) => {
      add({
        text: entry.name,
        type: "investor",
        subtext: entry.type === "fo" ? "Family Office" : "VC",
      });
    });

  // 2. Match portfolio company names
  if (q.length >= 3) {
    const companyMatches: {
      entry: PortfolioCompanyCacheEntry;
      score: number;
    }[] = [];
    for (const pc of portfolioCompanies) {
      const { match, score } = fuzzyMatch(pc.companyName, q);
      if (match) {
        companyMatches.push({ entry: pc, score });
      }
    }
    companyMatches
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .forEach(({ entry }) => {
        const typeLabel = entry.investorType === "fo" ? "FO" : "VC";
        add({
          text: entry.companyName,
          type: "company",
          subtext: `Portfolio company · ${entry.investorName} (${typeLabel})`,
        });
      });
  }

  // 3. Match niches
  for (const niche of NICHE_SUGGESTIONS) {
    if (suggestions.length >= 8) break;
    if (niche.toLowerCase().includes(q)) {
      add({ text: niche, type: "niche" });
    }
  }

  // 4. Match common searches
  for (const search of COMMON_SEARCHES) {
    if (suggestions.length >= 8) break;
    if (search.toLowerCase().includes(q)) {
      add({ text: search, type: "search" });
    }
  }

  // 5. Match cities
  for (const city of CITIES) {
    if (suggestions.length >= 8) break;
    if (city.toLowerCase().startsWith(q) && q.length >= 2) {
      add({ text: `Investors in ${city}`, type: "city", subtext: city });
    }
  }

  return NextResponse.json(
    { suggestions: suggestions.slice(0, 6) },
    { headers: CORS_HEADERS }
  );
}
