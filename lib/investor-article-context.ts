import OpenAI from "openai";

export interface InvestorArticleMention {
  id: string;
  headline: string;
  url: string | null;
  date: string | null;
  companyName: string | null;
  snippet: string;
  relevance?: "high" | "medium";
}

export interface InvestorArticleContext {
  articleMentions: InvestorArticleMention[];
  articleMentionCount: number;
  recentArticleMentionCount: number;
  verifiedFromArticles: boolean;
  activeRecently: boolean;
  activitySummary?: string;
}

type PineconeMatch = {
  id: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

type InvestorInput = {
  id: string;
  name: string;
  family?: string;
  linkedPortfolioCompanies?: Array<{ name: string }>;
};

const DEFAULT_PINECONE_HOST = process.env.PINECONE_HOSTNAME
  ? `https://${process.env.PINECONE_HOSTNAME}`
  : "https://impactloopeu2026-vs7q5ii.svc.aped-4627-b74a.pinecone.io";
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const DEFAULT_ARTICLE_BASE_URL = "https://www.impactloop.se/artikel/";

export interface ArticleContextConfig {
  pineconeHost?: string;
  articleBaseUrl?: string;
}

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

const SEMANTIC_CACHE_TTL_MS = 5 * 60_000;
const semanticQueryCache = new Map<
  string,
  { expiresAt: number; mentions: InvestorArticleMention[] }
>();

function normalizeText(value: string): string {
  return value.toLocaleLowerCase("sv-SE").replace(/\s+/g, " ").trim();
}

function includesTerm(haystack: string, needle: string): boolean {
  return haystack.includes(normalizeText(needle));
}

function pickSnippet(text: string, terms: string[]): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";

  const lower = clean.toLocaleLowerCase("sv-SE");
  const matchTerm = terms
    .map((term) => term.trim())
    .find((term) => term && lower.includes(term.toLocaleLowerCase("sv-SE")));

  if (!matchTerm) return clean.slice(0, 180);

  const index = lower.indexOf(matchTerm.toLocaleLowerCase("sv-SE"));
  const start = Math.max(0, index - 80);
  const end = Math.min(clean.length, index + 120);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < clean.length ? "..." : "";
  return `${prefix}${clean.slice(start, end).trim()}${suffix}`;
}

function sortByDateDesc<T extends { date: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")),
  );
}

const INVESTMENT_SIGNAL_PATTERNS = [
  /\binvester/i,
  /\bkapitalrunda/i,
  /\brunda\b/i,
  /\bfinansiering/i,
  /\btagit in\b/i,
  /\btar in\b/i,
  /\bleds av\b/i,
  /\bbackas av\b/i,
  /\bbackat\b/i,
  /\bägare\b/i,
  /\bco-?invester/i,
  /\bfond\b/i,
];

function scoreSignalStrength(text: string): number {
  const haystack = normalizeText(text);
  return INVESTMENT_SIGNAL_PATTERNS.reduce(
    (count, pattern) => count + (pattern.test(haystack) ? 1 : 0),
    0,
  );
}

function isLikelyInvestorContext(text: string): boolean {
  return scoreSignalStrength(text) > 0;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function fetchArticlesForCompanies(
  companyNames: string[],
  pineconeHost: string,
  articleBaseUrl: string,
): Promise<Record<string, InvestorArticleMention[]>> {
  const result: Record<string, InvestorArticleMention[]> = {};
  if (companyNames.length === 0 || !PINECONE_API_KEY) return result;

  const uniqueNames = Array.from(
    new Set(
      companyNames.map((name) => String(name || "").trim()).filter(Boolean),
    ),
  );
  const slugMap = uniqueNames.map((name) => ({
    name,
    slug: toSlug(name),
  }));

  const listings = await Promise.all(
    slugMap.map(({ name, slug }) =>
      fetch(`${pineconeHost}/vectors/list?limit=4&prefix=${slug}`, {
        headers: { "Api-Key": PINECONE_API_KEY },
        signal: AbortSignal.timeout(1800),
      })
        .then((r) => r.json())
        .then((d) => ({
          name,
          ids: (d.vectors || []).map((v: { id: string }) => v.id) as string[],
        }))
        .catch(() => ({ name, ids: [] as string[] })),
    ),
  );

  const allIds = Array.from(
    new Set(listings.flatMap(({ ids }) => ids).filter(Boolean)),
  );
  if (allIds.length === 0) return result;

  const idsParam = allIds
    .map((id) => `ids=${encodeURIComponent(id)}`)
    .join("&");

  let metadata: Record<
    string,
    {
      metadata?: {
        headline?: string;
        title?: string;
        published_on?: string;
        publication_date?: string;
        company_name?: string;
        company?: string;
        text?: string;
        chunk_text?: string;
        notice_text?: string;
      };
    }
  > = {};

  try {
    const res = await fetch(`${pineconeHost}/vectors/fetch?${idsParam}`, {
      headers: { "Api-Key": PINECONE_API_KEY },
      signal: AbortSignal.timeout(2200),
    });
    const data = await res.json();
    metadata = data.vectors || {};
  } catch {
    return result;
  }

  for (const { name, ids } of listings) {
    const mentions: InvestorArticleMention[] = [];
    for (const id of ids) {
      const vec = metadata[id];
      const meta = vec?.metadata;
      const headline = String(meta?.headline || meta?.title || id || "").trim();
      if (!headline) continue;
      const dateStr = String(
        meta?.published_on || meta?.publication_date || "",
      ).trim();
      const text = String(
        meta?.text || meta?.chunk_text || meta?.notice_text || headline,
      ).trim();
      const combinedText = `${headline} ${text}`;
      if (!isLikelyInvestorContext(combinedText)) continue;
      mentions.push({
        id,
        headline,
        url: `${articleBaseUrl}${id}`,
        date: dateStr ? new Date(dateStr).toISOString().slice(0, 10) : null,
        companyName:
          String(meta?.company_name || meta?.company || name || "").trim() ||
          name,
        snippet: pickSnippet(text, [name]),
        relevance: scoreSignalStrength(combinedText) >= 2 ? "high" : "medium",
      });
    }
    if (mentions.length > 0) {
      result[name] = sortByDateDesc(dedupeMentions(mentions)).slice(0, 3);
    }
  }

  return result;
}

async function fetchSemanticArticleMatches(
  query: string,
  pineconeHost: string,
  articleBaseUrl: string,
): Promise<InvestorArticleMention[]> {
  if (!query.trim() || !PINECONE_API_KEY) return [];

  const cacheKey = query.trim().toLowerCase();
  const cached = semanticQueryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.mentions;
  }

  try {
    const embedding = await Promise.race([
      getOpenAI().embeddings.create({
        model: "text-embedding-3-large",
        input: query,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("embedding-timeout")), 2500),
      ),
    ]);

    const vector = embedding.data[0]?.embedding;
    if (!vector || vector.length === 0) return [];

    const res = await fetch(`${pineconeHost}/query`, {
      method: "POST",
      headers: {
        "Api-Key": PINECONE_API_KEY,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(2500),
      body: JSON.stringify({
        vector,
        topK: 24,
        includeMetadata: true,
      }),
    });

    if (!res.ok) return [];

    const json = (await res.json()) as { matches?: PineconeMatch[] };
    const matches = json.matches || [];

    const mentions = matches
      .map((match): InvestorArticleMention | null => {
        const metadata = match.metadata || {};
        const headline = String(
          metadata.headline || metadata.title || "",
        ).trim();
        if (!headline) return null;

        const date = String(
          metadata.published_on || metadata.publication_date || "",
        ).trim();
        const companyName = String(
          metadata.company_name || metadata.company || metadata.name || "",
        ).trim();
        const text = String(
          metadata.brodtext ||
            metadata.text ||
            metadata.chunk_text ||
            metadata.notice_text ||
            metadata.ingress ||
            headline,
        ).trim();
        const combinedText = `${headline} ${text}`;
        if (!isLikelyInvestorContext(combinedText)) return null;

        return {
          id: match.id,
          headline,
          url: `${articleBaseUrl}${match.id}`,
          date: date ? new Date(date).toISOString().slice(0, 10) : null,
          companyName: companyName || null,
          snippet: pickSnippet(text, query.split(/\s+/)),
          relevance: scoreSignalStrength(combinedText) >= 2 ? "high" : "medium",
        } satisfies InvestorArticleMention;
      })
      .filter((item): item is InvestorArticleMention => item !== null);
    semanticQueryCache.set(cacheKey, {
      expiresAt: Date.now() + SEMANTIC_CACHE_TTL_MS,
      mentions,
    });
    return mentions;
  } catch {
    return [];
  }
}

function dedupeMentions(
  mentions: InvestorArticleMention[],
): InvestorArticleMention[] {
  const seen = new Set<string>();
  return mentions.filter((mention) => {
    const key = mention.url || mention.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function enrichInvestorsWithArticleContext<
  T extends InvestorInput,
>(
  investors: T[],
  query: string,
  config?: ArticleContextConfig,
): Promise<Array<T & InvestorArticleContext>> {
  if (investors.length === 0) return [] as Array<T & InvestorArticleContext>;

  const pineconeHost = config?.pineconeHost || DEFAULT_PINECONE_HOST;
  const articleBaseUrl = config?.articleBaseUrl || DEFAULT_ARTICLE_BASE_URL;

  const recentThreshold = new Date();
  recentThreshold.setMonth(recentThreshold.getMonth() - 12);

  const semanticMentions = await fetchSemanticArticleMatches(
    query,
    pineconeHost,
    articleBaseUrl,
  );
  const portfolioArticleMap = await fetchArticlesForCompanies(
    investors.flatMap((investor) =>
      (investor.linkedPortfolioCompanies || []).map((company) => company.name),
    ),
    pineconeHost,
    articleBaseUrl,
  );

  const contexts = await Promise.all(
    investors.map(async (investor) => {
      const portfolioNames = (investor.linkedPortfolioCompanies || [])
        .map((company) => company.name)
        .slice(0, 6);
      const queryTerms = Array.from(
        new Set([investor.name, investor.family].filter(Boolean)),
      ) as string[];
      if (queryTerms.length === 0) {
        return {
          ...investor,
          articleMentions: [],
          articleMentionCount: 0,
          recentArticleMentionCount: 0,
          verifiedFromArticles: false,
          activeRecently: false,
        };
      }

      const semanticForInvestor = semanticMentions.filter((mention) => {
        const combined = normalizeText(
          `${mention.headline} ${mention.companyName || ""} ${mention.snippet}`,
        );
        const explicitInvestorHit = queryTerms.some((term) =>
          includesTerm(combined, term),
        );
        const portfolioHit = portfolioNames.some((name) =>
          includesTerm(combined, name),
        );
        return explicitInvestorHit || portfolioHit;
      });

      const companyMentions = portfolioNames.flatMap(
        (name) => portfolioArticleMap[name] || [],
      );

      const combinedMentions = sortByDateDesc(
        dedupeMentions([...companyMentions, ...semanticForInvestor]),
      );

      const recentMentions = combinedMentions.filter(
        (mention) =>
          mention.date &&
          mention.date >= recentThreshold.toISOString().slice(0, 10),
      );

      const recentPortfolioNames = new Set(
        combinedMentions
          .map((mention) => mention.companyName)
          .filter(
            (name): name is string =>
              Boolean(name) &&
              portfolioNames.some(
                (portfolioName) =>
                  normalizeText(portfolioName) === normalizeText(name || ""),
              ),
          ),
      );

      const activitySummary =
        combinedMentions.length > 0
          ? `Omnämnd i ${combinedMentions.length} Pinecone-artiklar, ${recentPortfolioNames.size} matchande portföljbolag i kontext.`
          : undefined;

      return {
        ...investor,
        articleMentions: combinedMentions.slice(0, 3),
        articleMentionCount: combinedMentions.length,
        recentArticleMentionCount: recentMentions.length,
        verifiedFromArticles: combinedMentions.length > 0,
        activeRecently: recentMentions.length > 0,
        activitySummary,
      };
    }),
  );

  return contexts;
}
