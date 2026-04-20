import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonCors(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, { ...init, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

interface Article {
  title: string;
  url: string;
  excerpt?: string;
  publishedDate?: string;
  imageUrl?: string;
  author?: string;
  authorImageUrl?: string;
  mentionedInvestors?: string[];
}

// Map Pinecone slug → display name + avatar CDN URL
// Source: https://www.impactloop.com/contact
const AUTHOR_MAP: Record<string, { name: string; imageUrl: string }> = {
  "sion-lawrence-geschwindt": {
    name: "Siôn Lawrence-Geschwindt",
    imageUrl:
      "https://cdn.prod.website-files.com/66d5acd22425b4dd284c1f4f/6899c9eef0a4b3aa049bb7cf_Sio%CC%82n%20Geschwindt%20-%20Impact%20Loop%20byline.png",
  },
  "camilla-bergman": {
    name: "Camilla Bergman",
    imageUrl:
      "https://cdn.prod.website-files.com/66d5acd22425b4dd284c1f4f/66d5acd22425b4dd284c20ed_Camilla%20Bergman.avif",
  },
  "diana-demin": {
    name: "Diana Demin",
    imageUrl:
      "https://cdn.prod.website-files.com/66d5acd22425b4dd284c1f4f/6735c194319f92b32d48eea4_Diana%20Demin%20-%20byline%20Impact%20Loop.avif",
  },
  "johann-bernovall": {
    name: "Johann Bernövall",
    imageUrl:
      "https://cdn.prod.website-files.com/66d5acd22425b4dd284c1f4f/6735c181ad2295c0f91e774f_Johann%20Berno%CC%88vall%20-%20Impact%20Loop%20byline.avif",
  },
  "andreas-jennische": {
    name: "Andreas Jennische",
    imageUrl:
      "https://cdn.prod.website-files.com/66d5acd22425b4dd284c1f4f/68cd79b66eeb7c8cf98402fa_Andreas%20Jennische%20-%20Impact%20Loop%20byline%20(3).png",
  },
  "jenny-kjellen": {
    name: "Jenny Kjellén",
    imageUrl:
      "https://cdn.prod.website-files.com/66d5acd22425b4dd284c1f4f/6734bfde3c05e5d0973aab65_Jenny%20Kjellen%20-%20Impact%20Loop%20byline.avif",
  },
  "frey-lindsay": {
    name: "Frey Lindsay",
    imageUrl:
      "https://cdn.prod.website-files.com/66d5acd22425b4dd284c1f4f/6809f1e9ce2648551cbff625_Frey%20Lindsay%20-%20byline.png",
  },
  "mattias-karen": {
    name: "Mattias Karén",
    imageUrl:
      "https://cdn.prod.website-files.com/66d5acd22425b4dd284c1f4f/6807b6b3691a1937324ebd9e_mattias%20karen.png",
  },
  "maddy-savage": {
    name: "Maddy Savage",
    imageUrl:
      "https://cdn.prod.website-files.com/66d5acd22425b4dd284c1f4f/674ecd37c538806bb17e2827_Maddy%20Savage-%20Impact%20Loop.avif",
  },
  "christian-von-essen": {
    name: "Christian von Essen",
    imageUrl:
      "https://cdn.prod.website-files.com/66d5acd22425b4dd284c1f4f/66d5acd22425b4dd284c2112_Christian%20von%20Essen%20-%20byline%20Impact%20Loop.avif",
  },
};

function resolveAuthor(
  rawSlug: string
): { name: string; imageUrl?: string } | null {
  if (!rawSlug) return null;
  const slug = rawSlug.toLowerCase().trim();

  // Direct match
  if (AUTHOR_MAP[slug]) return AUTHOR_MAP[slug];

  // Try prefix match (handles "mattias-karen-1784c" → "mattias-karen")
  for (const [key, val] of Object.entries(AUTHOR_MAP)) {
    if (slug.startsWith(key)) return val;
  }

  // Fallback: capitalize kebab-case, filter out hash suffixes
  const parts = slug.split("-").filter((p) => !/^\d+[a-z]*$/.test(p));
  if (parts.length === 0) return null;
  const name = parts
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { name };
}

interface MentionedInvestor {
  name: string;
  type: "family_office" | "vc";
  articleTitle: string;
  articleUrl: string;
}

const PINECONE_HOST =
  "https://impactloopeu2026-vs7q5ii.svc.aped-4627-b74a.pinecone.io";
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const ARTICLE_BASE_URL = "https://www.impactloop.com/artikel/";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

const searchCache = new Map<
  string,
  {
    expiresAt: number;
    articles: Article[];
    mentionedInvestors: MentionedInvestor[];
  }
>();

let investorNamesCache: {
  expiresAt: number;
  names: { name: string; type: "family_office" | "vc" }[];
} | null = null;

async function getInvestorNames(): Promise<
  { name: string; type: "family_office" | "vc" }[]
> {
  if (investorNamesCache && investorNamesCache.expiresAt > Date.now()) {
    return investorNamesCache.names;
  }

  const supabase = createServiceRoleClient();
  const [foResult, vcResult] = await Promise.all([
    supabase.from("FamilyOfficeEU").select("name").limit(200),
    supabase.from("VCCompanyEU").select("name").limit(200),
  ]);

  const names: { name: string; type: "family_office" | "vc" }[] = [];
  for (const row of foResult.data || []) {
    if (row.name && row.name.length >= 3) {
      names.push({ name: row.name, type: "family_office" });
    }
  }
  for (const row of vcResult.data || []) {
    if (row.name && row.name.length >= 3) {
      names.push({ name: row.name, type: "vc" });
    }
  }

  investorNamesCache = { expiresAt: Date.now() + 30 * 60_000, names };
  return names;
}

function findInvestorMentions(
  text: string,
  headline: string,
  articleUrl: string,
  investorNames: { name: string; type: "family_office" | "vc" }[]
): MentionedInvestor[] {
  const combined = `${headline} ${text}`.toLowerCase();
  const found: MentionedInvestor[] = [];
  const seen = new Set<string>();

  for (const inv of investorNames) {
    if (inv.name.length < 4) continue;
    const nameLower = inv.name.toLowerCase();
    if (combined.includes(nameLower) && !seen.has(nameLower)) {
      seen.add(nameLower);
      found.push({
        name: inv.name,
        type: inv.type,
        articleTitle: headline,
        articleUrl,
      });
    }
  }
  return found;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q") || "";
  const limit = parseInt(searchParams.get("limit") || "8", 10);

  if (!query) {
    return jsonCors(
      {
        articles: [],
        mentionedInvestors: [],
        error: "Missing query parameter",
      },
      { status: 400 }
    );
  }

  const cacheKey = `${query.trim().toLowerCase()}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return jsonCors({
      articles: cached.articles,
      mentionedInvestors: cached.mentionedInvestors,
      source: "pinecone",
      total: cached.articles.length,
    });
  }

  if (!PINECONE_API_KEY) {
    return jsonCors({
      articles: [],
      mentionedInvestors: [],
      source: "pinecone",
      error: "Pinecone not configured",
    });
  }

  try {
    const [investorNames, embedding] = await Promise.all([
      getInvestorNames(),
      Promise.race([
        getOpenAI().embeddings.create({
          model: "text-embedding-3-large",
          input: `${query} investment impact company`,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("embedding-timeout")), 4000)
        ),
      ]),
    ]);

    const vector = embedding.data[0]?.embedding;
    if (!vector || vector.length === 0) {
      return jsonCors({
        articles: [],
        mentionedInvestors: [],
        source: "pinecone",
        error: "No embedding",
      });
    }

    const res = await fetch(`${PINECONE_HOST}/query`, {
      method: "POST",
      headers: {
        "Api-Key": PINECONE_API_KEY,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        vector,
        topK: limit * 2,
        includeMetadata: true,
      }),
    });

    if (!res.ok) {
      console.error("Pinecone EU query failed:", res.status);
      return jsonCors({
        articles: [],
        mentionedInvestors: [],
        source: "pinecone",
        error: "Query failed",
      });
    }

    type PineconeMatch = {
      id: string;
      score?: number;
      metadata?: Record<string, unknown>;
    };

    const json = (await res.json()) as { matches?: PineconeMatch[] };
    const matches = json.matches || [];

    const debugScores = matches.slice(0, 16).map((m) => ({
      score: m.score?.toFixed(4),
      title: String(m.metadata?.headline || m.metadata?.title || "").slice(
        0,
        50
      ),
    }));
    console.log(
      `[impactloop-eu-search] query="${query}":`,
      JSON.stringify(debugScores)
    );

    const seenUrls = new Set<string>();
    const articles: Article[] = [];
    const allMentionedInvestors: MentionedInvestor[] = [];
    const seenInvestors = new Set<string>();

    const MIN_SCORE = 0.32;

    for (const match of matches) {
      if (articles.length >= limit) break;
      if (typeof match.score === "number" && match.score < MIN_SCORE) continue;

      const meta = match.metadata || {};
      const headline = String(meta.headline || meta.title || "").trim();
      if (!headline || headline.length < 10) continue;

      const url = `${ARTICLE_BASE_URL}${match.id}`;
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      const dateStr = String(
        meta.published_on || meta.publication_date || ""
      ).trim();
      let publishedDate: string | undefined;
      if (dateStr) {
        try {
          publishedDate = new Date(dateStr).toISOString().slice(0, 10);
        } catch {
          // skip invalid dates
        }
      }

      const text = String(
        meta.ingress || meta.brodtext || meta.text || meta.chunk_text || ""
      ).trim();
      let excerpt: string | undefined;
      if (text) {
        const clean = text.replace(/\s+/g, " ").trim();
        excerpt = clean.length > 300 ? clean.substring(0, 297) + "…" : clean;
      }

      const mentions = findInvestorMentions(text, headline, url, investorNames);
      const articleInvestorNames = mentions.map((m) => m.name);

      for (const mention of mentions) {
        if (!seenInvestors.has(mention.name.toLowerCase())) {
          seenInvestors.add(mention.name.toLowerCase());
          allMentionedInvestors.push(mention);
        }
      }

      const imageUrl =
        String(meta.bild || meta.image || "").trim() || undefined;
      const rawAuthor = String(meta.skribent || meta.author || "").trim();
      const resolved = resolveAuthor(rawAuthor);

      articles.push({
        title: headline,
        url,
        excerpt,
        publishedDate,
        imageUrl,
        author: resolved?.name,
        authorImageUrl: resolved?.imageUrl,
        mentionedInvestors:
          articleInvestorNames.length > 0 ? articleInvestorNames : undefined,
      });
    }

    searchCache.set(cacheKey, {
      expiresAt: Date.now() + 5 * 60_000,
      articles,
      mentionedInvestors: allMentionedInvestors,
    });

    return jsonCors({
      articles,
      mentionedInvestors: allMentionedInvestors,
      source: "pinecone",
      total: articles.length,
    });
  } catch (error) {
    console.error("Impact Loop EU Pinecone search error:", error);
    return jsonCors({
      articles: [],
      mentionedInvestors: [],
      source: "pinecone",
      error: "Search failed",
    });
  }
}
