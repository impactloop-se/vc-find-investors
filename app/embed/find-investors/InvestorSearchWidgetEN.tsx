"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useWebHaptics } from "web-haptics/react";
import dynamic from "next/dynamic";
import "../investerare/embed-search.css";
import HeroBlock from "./components/HeroBlock";

const InvestorMiniMap = dynamic(() => import("./components/InvestorMiniMap"), {
  ssr: false,
});

// ── Types ──────────────────────────────────────────────────────────────────

interface InvestorResult {
  id: string;
  name: string;
  investorType: "family_office" | "vc" | "angel";
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
  linkedin?: string;
  logoUrl?: string;
  founded?: number;
  portfolioCount?: number;
  portfolioHoldings?: {
    companyName: string;
    orgNumber?: string;
    percentage?: number;
  }[];
  recentTransactions?: { companyName: string; date: string; type?: string }[];
  lastTransactionDate?: string;
  relevanceScore: number;
  linkedPortfolioCompanies?: { name: string; href?: string }[];
  articleMentions?: {
    headline: string;
    url: string | null;
    date: string | null;
  }[];
  articleMentionCount?: number;
  activeRecently?: boolean;
  activitySummary?: string;
  relevanceLabel?: string;
  currentFocus?: string;
  futurePriorities?: string;
  futureSignalStrength?: string;
  overallImpactDirection?: string;
  likelyCompanyTypes?: string;
  relevanceReason?: string;
  impactSources?: string;
  investmentCompany?: {
    name: string;
    orgNumber?: string;
    role?: string;
    logoUrl?: string;
  };
  investorProfile?: string;
  impactSustainability?: string;
  investmentStage?: string;
  geographyFocus?: string;
  ticketSize?: string;
  handsOnLevel?: string;
  currentRole?: string;
  previousRoles?: string;
  latestTransaction?: string;
  // ── Dealroom-enriched fields ───────────────────────────────────────────
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

interface SearchResponse {
  investors: InvestorResult[];
  count: number;
}

interface ImpactLoopArticle {
  title: string;
  url: string;
  excerpt?: string;
  publishedDate?: string;
  imageUrl?: string;
  author?: string;
  relevanceBullets?: string[];
  mentionedInvestors?: string[];
}

type TypeFilter = "all" | "family_office" | "vc" | "angel";

// ── Author Byline Images ──────────────────────────────────────────────────

const AUTHOR_IMAGES: Record<string, string> = {
  "andreas jennische":
    "https://cdn.prod.website-files.com/645be47849d91a307c966abf/6835cca250d59f2b1df0d9e7_Andreas%20Jennische%20-%20Impact%20Loop%20byline%20(2).png",
  "johann bernövall":
    "https://cdn.prod.website-files.com/645be47849d91a307c966abf/6835ccabc4b8c6558af47142_Johann%20Berno%CC%88vall%20-%20Impact%20Loop%20byline%20(3).png",
  "johann bernovall":
    "https://cdn.prod.website-files.com/645be47849d91a307c966abf/6835ccabc4b8c6558af47142_Johann%20Berno%CC%88vall%20-%20Impact%20Loop%20byline%20(3).png",
  "jenny kjellén":
    "https://cdn.prod.website-files.com/645be47849d91a307c966abf/67336fd6df6319c8c742ae67_Jenny%20Kjellen%20byline%20Impact%20Loop.avif",
  "jenny kjellen":
    "https://cdn.prod.website-files.com/645be47849d91a307c966abf/67336fd6df6319c8c742ae67_Jenny%20Kjellen%20byline%20Impact%20Loop.avif",
  "camilla bergman":
    "https://cdn.prod.website-files.com/645be47849d91a307c966abf/660d3a1f5d5a9742c9e36b46_Camilla%20Bergman.avif",
  "diana demin":
    "https://cdn.prod.website-files.com/645be47849d91a307c966abf/660d3a1497e6e9a883a98fe5_Diana%20Demin.avif",
  "sandra norberg":
    "https://cdn.prod.website-files.com/645be47849d91a307c966abf/691ef1d784d276bf9ece52be_Sandra%20Norberg%20-%20byline.png",
  "christian von essen":
    "https://cdn.prod.website-files.com/645be47849d91a307c966abf/664b4df66f92bea6669db700_Christian%20von%20Essen%20-%20byline%20Impact%20Loop.avif",
};

function getAuthorImage(author: string | undefined): string | null {
  if (!author) return null;
  const lower = author.toLowerCase().trim();
  if (AUTHOR_IMAGES[lower]) return AUTHOR_IMAGES[lower];
  const clean = lower.replace(/^by\s+/i, "");
  if (AUTHOR_IMAGES[clean]) return AUTHOR_IMAGES[clean];
  for (const [name, url] of Object.entries(AUTHOR_IMAGES)) {
    if (clean.includes(name.split(" ")[0])) return url;
  }
  return null;
}

// ── City coordinates for mini-maps ───────────────────────────────────────
const CITY_COORDS: Record<string, [number, number]> = {
  london: [51.5074, -0.1278],
  berlin: [52.52, 13.405],
  paris: [48.8566, 2.3522],
  amsterdam: [52.3676, 4.9041],
  stockholm: [59.3293, 18.0686],
  zurich: [47.3769, 8.5417],
  munich: [48.1351, 11.582],
  madrid: [40.4168, -3.7038],
  barcelona: [41.3874, 2.1686],
  copenhagen: [55.6761, 12.5683],
  oslo: [59.9139, 10.7522],
  helsinki: [60.1699, 24.9384],
  brussels: [50.8503, 4.3517],
  vienna: [48.2082, 16.3738],
  dublin: [53.3498, -6.2603],
  milan: [45.4642, 9.19],
  rome: [41.9028, 12.4964],
  lisbon: [38.7223, -9.1393],
  luxembourg: [49.6117, 6.1319],
  warsaw: [52.2297, 21.0122],
  prague: [50.0755, 14.4378],
  budapest: [47.4979, 19.0402],
  bucharest: [44.4268, 26.1025],
  sofia: [42.6977, 23.3219],
  athens: [37.9838, 23.7275],
  zagreb: [45.815, 15.9819],
  tallinn: [59.437, 24.7536],
  riga: [56.9496, 24.1052],
  vilnius: [54.6872, 25.2797],
  bratislava: [48.1486, 17.1077],
  ljubljana: [46.0569, 14.5058],
  edinburgh: [55.9533, -3.1883],
  manchester: [53.4808, -2.2426],
  hamburg: [53.5511, 9.9937],
  frankfurt: [50.1109, 8.6821],
  düsseldorf: [51.2277, 6.7735],
  cologne: [50.9375, 6.9603],
  gothenburg: [57.7089, 11.9746],
  malmö: [55.604, 13.003],
  geneva: [46.2044, 6.1432],
  basel: [47.5596, 7.5886],
  antwerp: [51.2194, 4.4025],
  rotterdam: [51.9244, 4.4777],
  lyon: [45.764, 4.8357],
  marseille: [43.2965, 5.3698],
  istanbul: [41.0082, 28.9784],
  ankara: [39.9334, 32.8597],
  "the hague": [52.0705, 4.3007],
  eindhoven: [51.4416, 5.4697],
  "tel aviv": [32.0853, 34.7818],
  dubai: [25.2048, 55.2708],
  "new york": [40.7128, -74.006],
  "san francisco": [37.7749, -122.4194],
  cambridge: [52.2053, 0.1218],
  oxford: [51.752, -1.2577],
  singapore: [1.3521, 103.8198],
  tokyo: [35.6762, 139.6503],
  montpellier: [43.6108, 3.8767],
  toulouse: [43.6047, 1.4442],
  nice: [43.7102, 7.262],
  glasgow: [55.8642, -4.2518],
  birmingham: [52.4862, -1.8904],
  leeds: [53.8008, -1.5491],
  bristol: [51.4545, -2.5879],
  belfast: [54.5973, -5.9301],
  stuttgart: [48.7758, 9.1829],
  leipzig: [51.3397, 12.3731],
  hannover: [52.3759, 9.732],
  bremen: [53.0793, 8.8017],
  bonn: [50.7374, 7.0982],
  bordeaux: [44.8378, -0.5792],
  nantes: [47.2184, -1.5536],
  strasbourg: [48.5734, 7.7521],
  lille: [50.6292, 3.0573],
  turin: [45.0703, 7.6869],
  florence: [43.7696, 11.2558],
  naples: [40.8518, 14.2681],
  bologna: [44.4949, 11.3426],
  genoa: [44.4056, 8.9463],
  porto: [41.1579, -8.6291],
  malaga: [36.7213, -4.4214],
  valencia: [39.4699, -0.3763],
  bilbao: [43.263, -2.935],
  seville: [37.3891, -5.9845],
  bern: [46.948, 7.4474],
  lausanne: [46.5197, 6.6323],
  zug: [47.1724, 8.5174],
  utrecht: [52.0907, 5.1214],
  groningen: [53.2194, 6.5665],
  aarhus: [56.1572, 10.2107],
  bergen: [60.3913, 5.3221],
  trondheim: [63.4305, 10.3951],
  lund: [55.7047, 13.191],
  uppsala: [59.8586, 17.6389],
};

// Common spelling variants (DB uses "ue" for "ü", etc.)
const CITY_ALIASES: Record<string, string> = {
  zuerich: "zurich",
  zürich: "zurich",
  dusseldorf: "düsseldorf",
  malmo: "malmö",
  goteborg: "gothenburg",
  göteborg: "gothenburg",
  koeln: "cologne",
  köln: "cologne",
  muenchen: "munich",
  münchen: "munich",
  linkoping: "linköping",
  linkoeping: "linköping",
};

// Country capital fallbacks
const COUNTRY_CAPITAL_COORDS: Record<string, [number, number]> = {
  sweden: [59.3293, 18.0686],
  norway: [59.9139, 10.7522],
  denmark: [55.6761, 12.5683],
  finland: [60.1699, 24.9384],
  germany: [52.52, 13.405],
  france: [48.8566, 2.3522],
  netherlands: [52.3676, 4.9041],
  belgium: [50.8503, 4.3517],
  switzerland: [47.3769, 8.5417],
  austria: [48.2082, 16.3738],
  spain: [40.4168, -3.7038],
  portugal: [38.7223, -9.1393],
  italy: [41.9028, 12.4964],
  ireland: [53.3498, -6.2603],
  poland: [52.2297, 21.0122],
  "united kingdom": [51.5074, -0.1278],
  uk: [51.5074, -0.1278],
  luxembourg: [49.6117, 6.1319],
  greece: [37.9838, 23.7275],
  turkey: [41.0082, 28.9784],
  "czech republic": [50.0755, 14.4378],
  hungary: [47.4979, 19.0402],
  romania: [44.4268, 26.1025],
  bulgaria: [42.6977, 23.3219],
  croatia: [45.815, 15.9819],
  estonia: [59.437, 24.7536],
  latvia: [56.9496, 24.1052],
  lithuania: [54.6872, 25.2797],
};

function getCityCoords(region: string | undefined): [number, number] | null {
  if (!region) return null;
  const lower = region.toLowerCase();

  // Direct city match
  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    if (lower.includes(city)) return coords;
  }

  // Alias match (zuerich → zurich, etc.)
  for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
    if (lower.includes(alias) && CITY_COORDS[canonical]) {
      return CITY_COORDS[canonical];
    }
  }

  // Country fallback — use capital coordinates
  for (const [country, coords] of Object.entries(COUNTRY_CAPITAL_COORDS)) {
    if (lower.includes(country)) return coords;
  }

  return null;
}

// ── Country flag helpers ───────────────────────────────────────────────────

const COUNTRY_TO_ISO: Record<string, string> = {
  "United Kingdom": "GB",
  UK: "GB",
  Germany: "DE",
  France: "FR",
  Netherlands: "NL",
  Sweden: "SE",
  Switzerland: "CH",
  Spain: "ES",
  Belgium: "BE",
  Denmark: "DK",
  Norway: "NO",
  Italy: "IT",
  Finland: "FI",
  Portugal: "PT",
  Luxembourg: "LU",
  Poland: "PL",
  Ireland: "IE",
  Austria: "AT",
  "Czech Republic": "CZ",
  Turkey: "TR",
  Bulgaria: "BG",
  Romania: "RO",
  Greece: "GR",
  Hungary: "HU",
  Croatia: "HR",
  Estonia: "EE",
  Latvia: "LV",
  Lithuania: "LT",
  Slovakia: "SK",
  Slovenia: "SI",
  Iceland: "IS",
  Malta: "MT",
  Cyprus: "CY",
  Israel: "IL",
  Singapore: "SG",
  USA: "US",
  "United States": "US",
  Canada: "CA",
  Japan: "JP",
};

function getCountryCodeEmbed(region: string | undefined): string | null {
  if (!region) return null;
  const parts = region.split(",").map((s) => s.trim());
  for (const part of parts.reverse()) {
    const code = COUNTRY_TO_ISO[part];
    if (code) return code;
    const found = Object.entries(COUNTRY_TO_ISO).find(
      ([name]) => name.toLowerCase() === part.toLowerCase()
    );
    if (found) return found[1];
  }
  return null;
}

function CountryFlagEmbed({ region }: { region?: string }) {
  const code = getCountryCodeEmbed(region);
  if (!code) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://purecatamphetamine.github.io/country-flag-icons/3x2/${code}.svg`}
      alt=""
      width={18}
      height={12}
      className="inv-country-flag"
    />
  );
}

// ── ESG / Sector helpers ───────────────────────────────────────────────────

const ESG_KEYWORDS = [
  "esg",
  "impact",
  "sustainability",
  "sustainable",
  "climate",
  "green",
  "clean",
];

function getEsgBadges(currentFocus?: string): string[] {
  if (!currentFocus) return [];
  const lower = currentFocus.toLowerCase();
  const badges: string[] = [];
  if (ESG_KEYWORDS.some((kw) => lower.includes(kw))) badges.push("ESG");
  if (lower.includes("impact")) badges.push("Impact");
  if (
    lower.includes("climate") ||
    lower.includes("green") ||
    lower.includes("clean")
  )
    badges.push("Climate");
  // deduplicate
  return [...new Set(badges)].slice(0, 2);
}

function getStagePillsFromFocus(currentFocus?: string): string[] {
  if (!currentFocus) return [];
  const lower = currentFocus.toLowerCase();
  const stages: string[] = [];
  if (lower.includes("pre-seed") || lower.includes("preseed"))
    stages.push("Pre-seed");
  if (lower.includes("seed") && !lower.includes("pre-seed"))
    stages.push("Seed");
  if (lower.includes("series a")) stages.push("Series A");
  if (lower.includes("series b")) stages.push("Series B");
  if (lower.includes("growth")) stages.push("Growth");
  if (lower.includes("early-stage") || lower.includes("early stage"))
    stages.push("Early-stage");
  if (lower.includes("late-stage") || lower.includes("late stage"))
    stages.push("Late-stage");
  return [...new Set(stages)].slice(0, 3);
}

function extractDomain(website?: string): string | null {
  if (!website) return null;
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

const EMBED_CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  SEK: "",
  NOK: "",
  CHF: "CHF ",
  DKK: "",
};
const EMBED_CURRENCY_SUFFIXES: Record<string, string> = {
  SEK: " SEK",
  NOK: " NOK",
  DKK: " DKK",
};

function formatAssets(
  value: number | undefined,
  currency = "EUR",
  rate = 1
): string | null {
  if (!value) return null;
  const converted = value * rate;
  const sym = EMBED_CURRENCY_SYMBOLS[currency] ?? "";
  const suf = EMBED_CURRENCY_SUFFIXES[currency] ?? "";
  const bn = converted / 1_000_000_000;
  if (bn >= 1) return `${sym}${bn.toFixed(bn >= 10 ? 0 : 1)}B${suf}`;
  const mn = converted / 1_000_000;
  if (mn >= 1) return `${sym}${mn.toFixed(0)}M${suf}`;
  return null;
}

/** Kompakt USD-formatering för Dealroom-fält (alltid "$Xm"/"$Xbn"). */
function formatUsdShort(value: number | undefined | null): string | null {
  if (!value || value <= 0) return null;
  const bn = value / 1_000_000_000;
  if (bn >= 1) return `$${bn.toFixed(bn >= 10 ? 0 : 1)}B`;
  const mn = value / 1_000_000;
  if (mn >= 1) return `$${mn.toFixed(0)}M`;
  const tk = value / 1_000;
  if (tk >= 1) return `$${tk.toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

/** Clean text for display: strip sources, internal tags, fix punctuation */
function cleanText(text: string): string {
  if (!text) return text;
  return text
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "")
    .replace(/\s*\(CONTACT\)/gi, "")
    .replace(/,?\s*keyPeople:\s*[^)]+/gi, "")
    .replace(
      /[,;]\s*(LinkedIn|Nordic9|Nordic 9|Impactloop|Impact Loop|Foxway|Crunchbase)\b\.?/gi,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .replace(/([,;.])\s*[,;.]/g, "$1")
    .replace(/[,;]\s*$/g, "")
    .replace(/^\s*[,;.]\s*/, "")
    .trim();
}

function highlightMatch(text: string, terms: string[]): React.ReactNode {
  if (!text || terms.length === 0) return text;
  const escaped = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean);
  if (escaped.length === 0) return text;
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    escaped.some((t) => part.toLowerCase() === t.toLowerCase()) ? (
      <mark
        key={i}
        style={{
          background: "var(--loop-yellow)",
          color: "#000",
          borderRadius: 2,
          padding: "0 2px",
        }}
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// Normalize non-English city names to English
const CITY_NAME_EN: Record<string, string> = {
  Zuerich: "Zurich",
  Zürich: "Zurich",
  Muenchen: "Munich",
  München: "Munich",
  Koeln: "Cologne",
  Köln: "Cologne",
  Göteborg: "Gothenburg",
  Goeteborg: "Gothenburg",
  Malmoe: "Malmö",
  Koebenhavn: "Copenhagen",
  København: "Copenhagen",
  Warszawa: "Warsaw",
  Praha: "Prague",
  Bucuresti: "Bucharest",
  Wien: "Vienna",
  Bruxelles: "Brussels",
  Genève: "Geneva",
  Genf: "Geneva",
  "Den Haag": "The Hague",
  Firenze: "Florence",
  Napoli: "Naples",
  Milano: "Milan",
  Roma: "Rome",
  Lisboa: "Lisbon",
  Sevilla: "Seville",
};

function normalizeRegionEN(region: string): string {
  let result = region;
  for (const [local, english] of Object.entries(CITY_NAME_EN)) {
    if (result.includes(local)) {
      result = result.replace(local, english);
    }
  }
  return result;
}

function shortenRegion(region: string): string {
  const normalized = normalizeRegionEN(region);
  const cities = [
    "Stockholm",
    "Gothenburg",
    "Malmö",
    "Uppsala",
    "Lund",
    "Linköping",
    "Helsingborg",
    "Norrköping",
    "Örebro",
    "Västerås",
    "Umeå",
    "Jönköping",
    "London",
    "Berlin",
    "Amsterdam",
    "Helsinki",
    "Copenhagen",
    "Oslo",
    "Zurich",
    "Munich",
    "Paris",
    "Madrid",
    "Barcelona",
    "Dublin",
    "Brussels",
    "Vienna",
    "Milan",
    "Lisbon",
    "Warsaw",
    "Prague",
    "Geneva",
    "Frankfurt",
    "Hamburg",
    "Edinburgh",
    "Glasgow",
    "Montpellier",
  ];
  for (const city of cities) {
    if (normalized.includes(city)) return city;
  }
  if (normalized.length > 30 && normalized.includes(",")) {
    const parts = normalized.split(",").map((s) => s.trim());
    return (
      parts[parts.length - 1].replace(/^\d{3}\s?\d{2}\s*/, "").trim() ||
      parts[parts.length - 1]
    );
  }
  return normalized;
}

const NICHE_RELATIONS: Record<string, string[]> = {
  battery: ["Green energy", "Deeptech", "Mobility"],
  solar: ["Green energy", "Proptech/green buildings"],
  climate: ["Green energy", "Sustainable materials", "Carbon capture"],
  carbon: ["Green energy", "Sustainable materials", "Climate investors"],
  co2: ["Green energy", "Carbon capture"],
  plastic: ["Sustainable materials", "Circular/rental", "Packaging"],
  health: ["Medtech", "Healthtech"],
  construction: ["Proptech/green buildings", "Sustainable materials"],
  ai: ["Deeptech", "Software/platforms"],
  defence: ["Defence tech", "Deeptech"],
  water: ["Water", "Green energy"],
  energy: ["Green energy", "Batteries", "Solar energy"],
  forest: ["Forestry", "Biodiversity"],
  food: ["Foodtech", "Circular/rental"],
  circular: ["Circular/rental", "Sustainable materials"],
  transport: ["Mobility", "Green energy"],
  mobility: ["Mobility", "Green energy", "Deeptech"],
};

function getSuggestedSearches(query: string): string[] {
  const lower = query.toLowerCase();
  const suggestions: string[] = [];
  for (const [keyword, niches] of Object.entries(NICHE_RELATIONS)) {
    if (lower.includes(keyword)) {
      for (const niche of niches) {
        if (!suggestions.includes(niche)) suggestions.push(niche);
      }
    }
  }
  if (suggestions.length > 0) return suggestions.slice(0, 4);
  if (/invest|capital|fund/.test(lower)) {
    return [
      "VC within cleantech",
      "Family office Stockholm",
      "Seed VC foodtech",
      "Green energy",
    ];
  }
  return [
    "Cleantech Stockholm",
    "Medtech",
    "VC within foodtech",
    "Family office industry",
  ];
}

// ── Infinite Scroll Sentinel ───────────────────────────────────────────────

function InfiniteScrollSentinel({ onIntersect }: { onIntersect: () => void }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onIntersect);
  callbackRef.current = onIntersect;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          callbackRef.current();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={sentinelRef}
      style={{ height: 1, width: "100%", opacity: 0 }}
      aria-hidden
    />
  );
}

// ── Scroll-reveal hook ─────────────────────────────────────────────────────

function useScrollReveal(containerRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const stagger = parseInt(el.dataset.revealIdx || "0", 10) * 50;
            timers.push(
              setTimeout(() => el.classList.add("es-reveal--visible"), stagger)
            );
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    const items = container.querySelectorAll(".es-reveal");
    items.forEach((item) => observer.observe(item));
    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  });
}

// ── Intent-aware related searches ─────────────────────────────────────────

const INTENT_SUGGESTIONS: Record<string, string[]> = {
  carbon: [
    "CCS investors",
    "Carbon capture Stockholm",
    "Climate funds",
    "Green energy VC",
  ],
  climate: [
    "Carbon capture",
    "Green energy",
    "Sustainable materials",
    "Batteries and energy",
  ],
  cleantech: [
    "Green energy Stockholm",
    "Climate investors",
    "Batteries",
    "Sustainable materials",
  ],
  energy: [
    "Solar energy",
    "Batteries",
    "Green energy VC",
    "Wind power investors",
  ],
  battery: ["Green energy", "Deeptech", "Mobility investors", "Energy storage"],
  food: ["Foodtech VC", "Agritech", "Food waste investors", "Sustainable food"],
  health: [
    "Medtech",
    "Healthtech Stockholm",
    "Life science VC",
    "Digital health",
  ],
  medtech: [
    "Life science",
    "Healthtech",
    "Medtech Stockholm",
    "Biotech investors",
  ],
  ai: ["Deeptech", "Software/platforms", "AI Stockholm", "Tech VC"],
  construction: [
    "Proptech",
    "Green buildings",
    "Sustainable materials",
    "Real estate investors",
  ],
  circular: [
    "Circular Stockholm",
    "Sustainable materials",
    "Textiles",
    "Waste and recycling",
  ],
  forest: [
    "Biodiversity",
    "Sustainable materials",
    "Forestry VC",
    "Green energy",
  ],
  water: ["Biodiversity", "Green energy", "Water Stockholm", "Agritech"],
  mobility: [
    "EV investors",
    "Mobility Stockholm",
    "Green energy VC",
    "Deeptech",
  ],
};

function getRelatedSearches(
  results: InvestorResult[],
  currentQuery: string
): string[] {
  const lower = currentQuery.toLowerCase();

  for (const [keyword, intentSuggestions] of Object.entries(
    INTENT_SUGGESTIONS
  )) {
    if (lower.includes(keyword)) {
      return intentSuggestions
        .filter((s) => !lower.includes(s.toLowerCase()))
        .slice(0, 5);
    }
  }

  const nicheCount = new Map<string, number>();
  for (const inv of results) {
    if (!inv.impactNiche) continue;
    for (const n of inv.impactNiche.split(",")) {
      const niche = n.trim();
      if (!niche || lower.includes(niche.toLowerCase())) continue;
      nicheCount.set(niche, (nicheCount.get(niche) || 0) + 1);
    }
  }
  const regionCount = new Map<string, number>();
  for (const inv of results) {
    if (!inv.region) continue;
    const city = shortenRegion(inv.region);
    if (city && !lower.includes(city.toLowerCase())) {
      regionCount.set(city, (regionCount.get(city) || 0) + 1);
    }
  }
  const sortedNiches = [...nicheCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([n]) => n);
  const topRegion = [...regionCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1)
    .map(([r]) => r);
  const suggestions: string[] = [];
  for (const n of sortedNiches) {
    if (suggestions.length < 3) suggestions.push(n);
  }
  if (topRegion[0] && sortedNiches[0]) {
    suggestions.push(`${sortedNiches[0]} ${topRegion[0]}`);
  }
  if (!/vc|family office|angel/i.test(lower) && sortedNiches[0]) {
    suggestions.push(`VC within ${sortedNiches[0].toLowerCase()}`);
  }
  return suggestions.slice(0, 5);
}

// ── Search History (localStorage) ──────────────────────────────────────────

const HISTORY_KEY = "es-search-history-en";
const MAX_HISTORY = 5;

function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addToSearchHistory(q: string) {
  try {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    const history = getSearchHistory().filter(
      (h) => h.toLowerCase() !== trimmed.toLowerCase()
    );
    history.unshift(trimmed);
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(history.slice(0, MAX_HISTORY))
    );
  } catch {
    // localStorage unavailable
  }
}

function removeFromSearchHistory(q: string) {
  try {
    const history = getSearchHistory().filter(
      (h) => h.toLowerCase() !== q.toLowerCase()
    );
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

// ── Similar Investors ─────────────────────────────────────────────────────

function findSimilarInvestors(
  current: InvestorResult,
  allResults: InvestorResult[]
): InvestorResult[] {
  const currentNiches = new Set(
    (current.impactNiche || "")
      .split(",")
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean)
  );
  if (currentNiches.size === 0) return [];

  return allResults
    .filter((inv) => inv.id !== current.id)
    .map((inv) => {
      const invNiches = (inv.impactNiche || "")
        .split(",")
        .map((n) => n.trim().toLowerCase())
        .filter(Boolean);
      const overlap = invNiches.filter((n) => currentNiches.has(n)).length;
      const sameType = inv.investorType === current.investorType ? 1 : 0;
      return { inv, score: overlap * 2 + sameType };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.inv);
}

// ── Analytics logging ─────────────────────────────────────────────────────

const LOG_URL = "/api/find-investors/log";
const SESSION_KEY = "loopdesk-session-id-en";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

const VISITOR_KEY = "loopdesk-visitor-id-en";
function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

function logEvent(
  event: string,
  data?: {
    investorId?: string;
    investorName?: string;
    query?: string;
    metadata?: Record<string, unknown>;
    dwellTimeMs?: number;
    scrollDepthPct?: number;
  }
) {
  const body = {
    sessionId: getSessionId(),
    event,
    ...data,
    screenWidth: typeof window !== "undefined" ? window.innerWidth : null,
    screenHeight: typeof window !== "undefined" ? window.innerHeight : null,
    visitorId: getVisitorId(),
  };
  if (event === "session_end" && navigator.sendBeacon) {
    navigator.sendBeacon(LOG_URL, JSON.stringify(body));
  } else {
    fetch(LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  }
}

// ── Animated counter ──────────────────────────────────────────────────────

function AnimatedCount({ target }: { target: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const duration = 600;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);
  return <span ref={ref}>{count}</span>;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function InvestorSearchWidgetEN({
  preview = false,
}: { preview?: boolean } = {}) {
  const { trigger: haptic } = useWebHaptics();
  const hapticRef = useRef(haptic);
  hapticRef.current = haptic;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InvestorResult[]>([]);
  const [articles, setArticles] = useState<ImpactLoopArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [visibleCount, setVisibleCount] = useState(4);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sharecopied, setShareCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [suggestions, setSuggestions] = useState<
    { text: string; type: string; subtext?: string }[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const [resultsReady, setResultsReady] = useState(false);
  const [showBrandedLoader, setShowBrandedLoader] = useState(false);
  const [loaderExiting, setLoaderExiting] = useState(false);
  const [cameFromLoader, setCameFromLoader] = useState(false);
  const [lightboxMap, setLightboxMap] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);
  const prefetchCache = useRef<{
    query: string;
    investors: InvestorResult[];
    articles: ImpactLoopArticle[];
  } | null>(null);
  const prefetchRef = useRef<NodeJS.Timeout | null>(null);
  const suggestRef = useRef<NodeJS.Timeout | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const resultsTopRef = useRef<HTMLDivElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [stageFilter, setStageFilter] = useState("");
  const stageFilterRef = useRef("");
  const [ticketFilter, setTicketFilter] = useState("");
  const [nicheFilter, setNicheFilter] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    SEK: 10.88,
    NOK: 10.5,
    CHF: 0.88,
    DKK: 6.87,
  });
  const currencyRate = exchangeRates[currency] ?? 1;
  useScrollReveal(gridRef);

  // Read URL params and apply as CSS custom properties for embed customization
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const root = document.documentElement;
    const PARAM_MAP: Record<string, string> = {
      bg: "--embed-hero-bg",
      "title-size": "--embed-title-size",
      "subtitle-size": "--embed-subtitle-size",
      "input-size": "--embed-input-size",
      "chip-size": "--embed-chip-size",
      "title-color": "--embed-title-color",
      "text-color": "--embed-text-color",
      "input-radius": "--embed-input-radius",
      "hero-padding": "--embed-hero-padding",
      "hero-align": "--embed-hero-align",
      "max-width": "--embed-max-width",
      accent: "--embed-accent",
      theme: "--embed-theme",
    };
    for (const [param, cssVar] of Object.entries(PARAM_MAP)) {
      const val = params.get(param);
      if (val) root.style.setProperty(cssVar, val.startsWith("#") ? val : val);
    }
    if (params.get("theme") === "dark") {
      document.documentElement.classList.add("dark");
    }
  }, []);

  // Fetch exchange rates on mount
  useEffect(() => {
    fetch("/api/find-investors/exchange-rates")
      .then((r) => r.json())
      .then((d) => {
        if (d.rates) setExchangeRates(d.rates);
      })
      .catch(() => {});
  }, []);

  // Dwell time + scroll depth tracking
  const sessionStart = useRef(Date.now());
  const maxScrollDepth = useRef(0);
  useEffect(() => {
    const trackScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        const pct = Math.round((scrollTop / docHeight) * 100);
        if (pct > maxScrollDepth.current) maxScrollDepth.current = pct;
      }
    };
    window.addEventListener("scroll", trackScroll, { passive: true });
    const handleUnload = () => {
      logEvent("session_end", {
        query: query || undefined,
        dwellTimeMs: Date.now() - sessionStart.current,
        scrollDepthPct: maxScrollDepth.current,
      });
    };
    window.addEventListener("beforeunload", handleUnload);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") handleUnload();
    });
    return () => {
      window.removeEventListener("scroll", trackScroll);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Post height to parent for iframe auto-resize + send ready signal
  useEffect(() => {
    if (typeof window === "undefined" || window === window.parent) return;
    window.parent.postMessage({ type: "loopdesk-ready" }, "*");
    const sendHeight = () => {
      const h = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: "loopdesk-resize", height: h }, "*");
    };
    sendHeight();
    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  // Also post height when results change
  useEffect(() => {
    if (typeof window === "undefined" || window === window.parent) return;
    const timer = setTimeout(() => {
      const h = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: "loopdesk-resize", height: h }, "*");
    }, 100);
    return () => clearTimeout(timer);
  }, [results, visibleCount, expandedId, hasSearched]);

  // Show back-to-top button when scrolled down
  useEffect(() => {
    const container = document.querySelector(".es-container");
    if (!container) return;
    const handler = () => {
      const top = container.scrollTop || window.scrollY;
      setShowBackToTop(top > 300);
    };
    container.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("scroll", handler, { passive: true });
    return () => {
      container.removeEventListener("scroll", handler);
      window.removeEventListener("scroll", handler);
    };
  }, [hasSearched]);

  const searchTerms = useMemo(
    () =>
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 3),
    [query]
  );

  // Prefetch data in background without showing results
  const prefetchSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) return;
    try {
      const stage = stageFilterRef.current || undefined;
      const investorPromise = fetch("/api/find-investors/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, stage, sessionId: getSessionId() }),
      });
      const articlePromise = fetch(
        `/api/find-investors/impactloop-search?q=${encodeURIComponent(
          q
        )}&limit=8`
      ).catch(() => null);

      const searchRes = await investorPromise;
      let investors: InvestorResult[] = [];
      if (searchRes.ok) {
        const data: SearchResponse = await searchRes.json();
        investors = data.investors;
      }

      let arts: ImpactLoopArticle[] = [];
      const articlesRes = await articlePromise;
      if (articlesRes?.ok) {
        const data = await articlesRes.json();
        arts = data.articles || [];
      }

      prefetchCache.current = {
        query: q.trim().toLowerCase(),
        investors,
        articles: arts,
      };
    } catch {
      // Prefetch failed silently — will fetch on commit
    }
  }, []);

  // Show results — uses prefetch cache if available, otherwise fetches fresh
  const commitSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) return;
    if (prefetchRef.current) clearTimeout(prefetchRef.current);
    if (suggestRef.current) clearTimeout(suggestRef.current);
    setShowSuggestions(false);
    setSuggestions([]);
    setResultsReady(false);
    setHasSearched(true);
    setVisibleCount(4);
    setExpandedId(null);
    setShowHistory(false);
    addToSearchHistory(q);

    // Auto-detect investor type from query
    const lower = q.toLowerCase();
    if (/\bangel\b|\bbusiness angel\b/.test(lower)) {
      setTypeFilter("angel");
    } else if (/\bfamily office\b/.test(lower)) {
      setTypeFilter("family_office");
    } else if (/\bvc\b|\bventure capital\b/.test(lower)) {
      setTypeFilter("vc");
    } else {
      setTypeFilter("all");
    }

    try {
      const url = new URL(window.location.href);
      url.searchParams.set("q", q);
      window.history.replaceState({}, "", url.toString());
    } catch {}

    const cached = prefetchCache.current;
    if (cached && cached.query === q.trim().toLowerCase()) {
      setShowBrandedLoader(true);
      setLoaderExiting(false);
      setCameFromLoader(true);
      setLoading(true);

      await new Promise((r) => setTimeout(r, 400));

      setResults(cached.investors);
      setArticles(cached.articles);
      setLoading(false);

      logEvent("search_results", {
        query: q,
        metadata: {
          top5: cached.investors
            .slice(0, 5)
            .map((inv: InvestorResult) => ({ id: inv.id, name: inv.name })),
        },
      });

      setLoaderExiting(true);
      await new Promise((r) => setTimeout(r, 400));
      setShowBrandedLoader(false);
      setLoaderExiting(false);

      setTimeout(() => {
        setResultsReady(true);
        resultsTopRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
      return;
    }

    // No cache — fetch fresh with branded loader
    setShowBrandedLoader(true);
    setLoaderExiting(false);
    setCameFromLoader(true);
    setLoading(true);

    const minDisplayTime = new Promise((r) => setTimeout(r, 1200));

    let fetchedInvestors: InvestorResult[] = [];
    let fetchedArticles: ImpactLoopArticle[] = [];

    try {
      const stage = stageFilterRef.current || undefined;
      const investorPromise = fetch("/api/find-investors/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, stage, sessionId: getSessionId() }),
      });
      const articlePromise = fetch(
        `/api/find-investors/impactloop-search?q=${encodeURIComponent(
          q
        )}&limit=8`
      ).catch(() => null);

      const [searchRes, articlesRes] = await Promise.all([
        investorPromise,
        articlePromise,
        minDisplayTime,
      ]);

      if (searchRes.ok) {
        const data: SearchResponse = await searchRes.json();
        fetchedInvestors = data.investors;
      }
      if (articlesRes?.ok) {
        const data = await articlesRes.json();
        fetchedArticles = data.articles || [];
      }
    } catch {
      // search failed
    }

    setResults(fetchedInvestors);
    setArticles(fetchedArticles);
    setLoading(false);
    if (fetchedInvestors.length > 0) {
      hapticRef.current?.("success");
    }

    logEvent("search_results", {
      query: q,
      metadata: {
        top5: fetchedInvestors
          .slice(0, 5)
          .map((inv: InvestorResult) => ({ id: inv.id, name: inv.name })),
      },
    });

    setLoaderExiting(true);
    await new Promise((r) => setTimeout(r, 500));
    setShowBrandedLoader(false);
    setLoaderExiting(false);

    setTimeout(() => {
      setResultsReady(true);
      resultsTopRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (prefetchRef.current) clearTimeout(prefetchRef.current);
    if (suggestRef.current) clearTimeout(suggestRef.current);
    if (value.trim().length >= 2) {
      prefetchRef.current = setTimeout(() => {
        prefetchSearch(value);
      }, 400);
      suggestRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/find-investors/autocomplete?q=${encodeURIComponent(
              value.trim()
            )}`
          );
          if (res.ok) {
            const data = await res.json();
            setSuggestions(data.suggestions || []);
          }
        } catch {}
      }, 150);
    } else {
      setResults([]);
      setArticles([]);
      setHasSearched(false);
      setVisibleCount(4);
      setTypeFilter("all");
      setSuggestions([]);
      setShowSuggestions(false);
      setResultsReady(false);
      prefetchCache.current = null;
    }
  };

  const selectSuggestion = (text: string) => {
    setQuery(text);
    setShowSuggestions(false);
    setSuggestions([]);
    commitSearch(text);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlQuery = params.get("q");
    if (urlQuery && urlQuery.trim().length >= 2) {
      setQuery(urlQuery);
      commitSearch(urlQuery);
    }
    return () => {
      if (prefetchRef.current) clearTimeout(prefetchRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(
    () =>
      results
        .filter(
          (inv) => typeFilter === "all" || inv.investorType === typeFilter
        )
        .filter((inv) => {
          if (!stageFilter) return true;
          if (!inv.investmentStage) return false;
          const STAGE_MATCH: Record<string, string[]> = {
            "pre-seed": ["Pre-seed"],
            seed: ["Seed"],
            "series-a": ["Series A", "Serie A"],
            "series-b": ["Series B", "Serie B"],
            "series-c": ["Series C", "Serie C"],
            growth: ["Growth", "Series B", "Series C", "Serie B", "Serie C"],
          };
          const valid = STAGE_MATCH[stageFilter];
          if (!valid) return true;
          return valid.some(
            (v) => v.toLowerCase() === inv.investmentStage!.toLowerCase()
          );
        })
        .filter((inv) => {
          if (!ticketFilter) return true;
          return inv.ticketSize === ticketFilter;
        })
        .filter((inv) => {
          if (!nicheFilter) return true;
          return (inv.impactNiche || "")
            .toLowerCase()
            .includes(nicheFilter.toLowerCase());
        })
        .sort((a, b) => b.relevanceScore - a.relevanceScore),
    [results, typeFilter, stageFilter, ticketFilter, nicheFilter]
  );
  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const visibleArticles = useMemo(() => articles.slice(0, 6), [articles]);
  const totalMerged = visible.length + visibleArticles.length;

  const relatedSearches = useMemo(
    () => getRelatedSearches(filtered, query),
    [filtered, query]
  );

  useEffect(() => {
    if (!loading && hasSearched && totalMerged > 0 && !resultsReady) {
      setTimeout(() => setResultsReady(true), 50);
    }
  }, [loading, hasSearched, totalMerged, resultsReady]);

  return (
    <div className="es-container">
      {/* Hero — always rendered, collapses on search, expands when query cleared */}
      <HeroBlock
        query={query}
        onQueryChange={handleInput}
        onSearch={commitSearch}
        onSuggestionsFetch={handleInput}
        loading={loading}
        suggestions={suggestions}
        showSuggestions={showSuggestions}
        suggestIndex={suggestIndex}
        onSuggestIndexChange={setSuggestIndex}
        onSelectSuggestion={selectSuggestion}
        onCloseSuggestions={() => setShowSuggestions(false)}
        searchHistory={getSearchHistory()}
        showHistory={showHistory}
        onShowHistory={setShowHistory}
        onRemoveHistory={(q) => {
          removeFromSearchHistory(q);
          setShowHistory(false);
          setTimeout(() => setShowHistory(true), 0);
        }}
        collapsed={hasSearched}
        hasSearched={hasSearched}
        onClear={() => {
          setQuery("");
          setResults([]);
          setArticles([]);
          setHasSearched(false);
          setResultsReady(false);
          setTypeFilter("all");
          setStageFilter("");
          stageFilterRef.current = "";
          setTicketFilter("");
          setNicheFilter("");
          setVisibleCount(4);
          setExpandedId(null);
          haptic?.("light");
        }}
        filterContent={
          !showBrandedLoader ? (
            <div
              className={`es-filters${
                cameFromLoader ? " es-filters--from-loader" : ""
              }`}
            >
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(
                    e.target.value as "all" | "family_office" | "vc" | "angel"
                  );
                  haptic?.("selection");
                }}
                className="es-filter-select"
              >
                <option value="all">Investors</option>
                <option value="family_office">Family Office</option>
                <option value="vc">VC</option>
                <option value="angel">Angel</option>
              </select>
              <select
                value={stageFilter}
                onChange={(e) => {
                  setStageFilter(e.target.value);
                  stageFilterRef.current = e.target.value;
                  haptic?.("selection");
                }}
                className="es-filter-select"
              >
                <option value="">Stage</option>
                <option value="pre-seed">Pre-seed</option>
                <option value="seed">Seed</option>
                <option value="series-a">Series A</option>
                <option value="series-b">Series B</option>
                <option value="series-c">Series C</option>
                <option value="growth">Growth</option>
              </select>
              <select
                value={ticketFilter}
                onChange={(e) => {
                  setTicketFilter(e.target.value);
                  haptic?.("selection");
                }}
                className="es-filter-select"
              >
                <option value="">Ticket size</option>
                <option value="Liten">Small (&lt; €2M)</option>
                <option value="Mellan">Medium (€2–20M)</option>
                <option value="Stor">Large (&gt; €20M)</option>
              </select>
              <select
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  haptic?.("selection");
                }}
                className="es-filter-select"
              >
                {["EUR", "USD", "GBP", "SEK", "NOK", "CHF", "DKK"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ) : null
        }
      />

      {/* Scroll target for smooth scroll-to-results */}
      <div ref={resultsTopRef} />
      {hasSearched && !showBrandedLoader && !loading && filtered.length > 0 && (
        <div className="es-filters-meta">
          <span className="es-result-count">
            {filtered.length} results
            {articles.length > 0 && ` · ${articles.length} articles`}
          </span>
          <button
            className={`es-share-btn${
              sharecopied ? " es-share-btn--copied" : ""
            }`}
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("q", query);
              navigator.clipboard.writeText(url.toString()).then(() => {
                setShareCopied(true);
                setTimeout(() => setShareCopied(false), 2000);
              });
            }}
            title="Copy link to search"
          >
            {sharecopied ? "✓ Copied" : "⎘ Share search"}
          </button>
        </div>
      )}

      {/* Branded loader — shown while fetching investors + articles */}
      {showBrandedLoader && (
        <div
          className={`es-branded-loader${
            loaderExiting ? " es-branded-loader--exiting" : ""
          }`}
        >
          <svg
            className="es-branded-loader__logo"
            width={80}
            height={80}
            viewBox="0 0 80 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="40"
              cy="40"
              r="36"
              stroke="currentColor"
              strokeWidth="3"
              opacity="0.1"
            />
            <circle
              cx="40"
              cy="40"
              r="36"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="60 166"
            >
              <animate
                attributeName="stroke"
                values="#E5FF00;#5BE87A;#D0C4DE;#E2BABA;#E5FF00"
                dur="2.5s"
                repeatCount="indefinite"
              />
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 40 40"
                to="360 40 40"
                dur="1s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
          <div className="es-branded-loader__text">
            Searching investors &amp; articles
          </div>
          <div className="es-branded-loader__bar-wrap">
            <div className="es-branded-loader__bar" />
          </div>
          <div className="es-branded-loader__dots">
            <span className="es-branded-loader__dot" />
            <span className="es-branded-loader__dot" />
            <span className="es-branded-loader__dot" />
          </div>
        </div>
      )}

      {/* Skeleton loading — shimmer cards while loading without branded loader */}
      {loading && !showBrandedLoader && hasSearched && (
        <div className="es-skeleton-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="es-skeleton-card">
              <div className="es-skeleton-top">
                <div className="es-skeleton-avatar" />
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div className="es-skeleton-bar es-skeleton-bar--title" />
                  <div className="es-skeleton-bar es-skeleton-bar--subtitle" />
                </div>
              </div>
              <div className="es-skeleton-bar--tags">
                <div className="es-skeleton-bar es-skeleton-bar--tag" />
                <div className="es-skeleton-bar es-skeleton-bar--tag" />
              </div>
              <div className="es-skeleton-bar es-skeleton-bar--text" />
              <div className="es-skeleton-bar es-skeleton-bar--short" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {hasSearched &&
        !loading &&
        !showBrandedLoader &&
        filtered.length === 0 && (
          <div className="es-empty">
            <svg
              className="es-empty__loop-icon"
              width="100"
              height="100"
              viewBox="0 0 100 100"
              fill="none"
            >
              <circle
                cx="42"
                cy="42"
                r="28"
                stroke="var(--loop-yellow)"
                strokeWidth="4"
                fill="none"
                opacity="0.3"
              />
              <circle
                cx="42"
                cy="42"
                r="28"
                stroke="var(--loop-yellow)"
                strokeWidth="4"
                fill="none"
                strokeDasharray="40 136"
                strokeLinecap="round"
                opacity="0.8"
              />
              <line
                x1="63"
                y1="63"
                x2="88"
                y2="88"
                stroke="var(--es-text-muted)"
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.4"
              />
              <circle
                cx="30"
                cy="30"
                r="2"
                fill="var(--loop-green)"
                opacity="0.6"
              />
              <circle
                cx="54"
                cy="28"
                r="1.5"
                fill="var(--loop-lilac)"
                opacity="0.5"
              />
              <circle
                cx="32"
                cy="52"
                r="1.5"
                fill="var(--loop-sage)"
                opacity="0.5"
              />
            </svg>
            <p className="es-empty__title">
              {typeFilter !== "all"
                ? `No ${
                    typeFilter === "family_office"
                      ? "family offices"
                      : typeFilter === "vc"
                      ? "VC firms"
                      : "angel investors"
                  } matched \u201C${query}\u201D`
                : `No investors matched \u201C${query}\u201D`}
            </p>
            {typeFilter !== "all" && results.length > 0 && (
              <p className="es-empty__subtitle">
                {results.length} results found in other categories.{" "}
                <button
                  onClick={() => setTypeFilter("all")}
                  style={{
                    color: "var(--loop-yellow)",
                    textDecoration: "underline",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  Show all
                </button>
              </p>
            )}
            <p className="es-empty__subtitle">
              {articles.length > 0
                ? "Scroll down for relevant news articles. Also try:"
                : "Try one of these searches instead:"}
            </p>
            <div
              className="es-hero__chips"
              style={{ justifyContent: "center" }}
            >
              {getSuggestedSearches(query).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setQuery(s);
                    commitSearch(s);
                  }}
                  className="es-hero__chip"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

      {/* List view */}
      {viewMode === "list" && !showBrandedLoader && visible.length > 0 && (
        <div className="es-list">
          <div className="es-list__header">
            <span>Investor</span>
            <span>Type</span>
            <span>Portfolio</span>
            <span>Capital</span>
          </div>
          {filtered.slice(0, 20).map((inv) => (
            <div
              key={inv.id}
              className="es-list__row"
              onClick={() => {
                setViewMode("cards");
              }}
            >
              <span style={{ fontWeight: 600 }}>{inv.name}</span>
              <span
                className={`es-card__badge ${
                  inv.investorType === "vc"
                    ? "es-card__badge--vc"
                    : inv.investorType === "angel"
                    ? "es-card__badge--angel"
                    : "es-card__badge--fo"
                }`}
              >
                {inv.investorType === "family_office"
                  ? "FO"
                  : inv.investorType === "vc"
                  ? "VC"
                  : "A"}
              </span>
              <span style={{ color: "var(--es-text-secondary)", fontSize: 12 }}>
                {inv.portfolioCount ?? "—"}
              </span>
              <span style={{ color: "var(--es-text-secondary)", fontSize: 12 }}>
                {formatAssets(inv.assets || inv.aum, currency, currencyRate) ||
                  "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Results layout: split — investors left, articles right */}
      {viewMode === "cards" &&
        !showBrandedLoader &&
        (visible.length > 0 || visibleArticles.length > 0) && (
          <div
            className={`es-results-split${
              visible.length > 0 && visibleArticles.length > 0
                ? ""
                : " es-results-split--single"
            }${cameFromLoader ? " es-results-split--from-loader" : ""}`}
            ref={gridRef}
          >
            {/* Left column: Investors */}
            <div className="es-results-split__investors">
              {preview && filtered.length > 0 && (
                <div className="es-preview-match-count">
                  <strong>
                    <AnimatedCount target={filtered.length} /> investors
                  </strong>{" "}
                  match your search
                </div>
              )}
              <div className="es-results-grid">
                {visible.map((inv, idx) => {
                  const revealClass = `es-reveal${
                    resultsReady ? " es-reveal--visible" : ""
                  }`;
                  const staggerStyle: React.CSSProperties = {
                    transitionDelay: `${idx * 80}ms`,
                  };
                  const assets = formatAssets(
                    inv.assets || inv.aum,
                    currency,
                    currencyRate
                  );
                  const desc = inv.description
                    ? inv.description.length > 100
                      ? inv.description.substring(0, 97) + "…"
                      : inv.description
                    : "";
                  const niches = inv.impactNiche
                    ? inv.impactNiche
                        .split(",")
                        .map((n) => {
                          const trimmed = n.trim();
                          if (!trimmed) return "";
                          const words = trimmed.split(/(\s+\/\s+|\s+)/);
                          return words
                            .map((w, i) => {
                              if (/^\s+$/.test(w) || w === "/" || w === " / ")
                                return w;
                              if (/^[A-ZÅÄÖ]{2,}$/.test(w)) return w;
                              if (i === 0)
                                return (
                                  w.charAt(0).toUpperCase() +
                                  w.slice(1).toLowerCase()
                                );
                              return w.toLowerCase();
                            })
                            .join("");
                        })
                        .filter(Boolean)
                        .map((n) =>
                          n.includes("/") ? n.split("/")[0].trim() : n
                        )
                        .filter((n) => n.length > 0)
                        .slice(0, 3)
                    : [];

                  const isExpanded = expandedId === inv.id;
                  const similar = isExpanded
                    ? findSimilarInvestors(inv, filtered)
                    : [];

                  const isBlurred = preview;
                  if (preview && idx >= 4) return null;

                  const blurLevel = preview ? Math.min(2 + idx * 2.5, 10) : 0;
                  const isLastPreviewCard = preview && idx === 3;

                  return (
                    <div
                      key={inv.id}
                      id={`inv-${inv.id}`}
                      className={`es-card es-card--uniform es-card--expandable ${
                        isExpanded ? "es-card--expanded " : ""
                      }${
                        inv.investorType === "family_office"
                          ? "es-card--fo"
                          : inv.investorType === "vc"
                          ? "es-card--vc"
                          : "es-card--angel"
                      } ${revealClass}${isBlurred ? " es-card--blurred" : ""}${
                        isLastPreviewCard ? " es-card--half-cut" : ""
                      }`}
                      data-reveal-idx={idx % 4}
                      style={{
                        ...staggerStyle,
                        ...(isBlurred
                          ? ({
                              "--blur-level": `${blurLevel}px`,
                            } as React.CSSProperties)
                          : {}),
                      }}
                      onClick={() => {
                        if (isBlurred) return;
                        setExpandedId(isExpanded ? null : inv.id);
                        haptic?.(isExpanded ? "light" : "medium");
                        logEvent(isExpanded ? "collapse_card" : "expand_card", {
                          investorId: inv.id,
                          investorName: inv.name,
                          query,
                        });
                      }}
                    >
                      {isBlurred && (
                        <a
                          href="https://www.impactloop.com/pricing"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="es-card__blur-overlay"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="es-card__blur-cta">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect
                                x="3"
                                y="11"
                                width="18"
                                height="11"
                                rx="2"
                                ry="2"
                              />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            Unlock — become a Builder or Investor member
                          </div>
                        </a>
                      )}
                      {/* Card content */}
                      <div className="es-card__inv-body">
                        {/* Badge top-right */}
                        <span
                          className={`es-card__badge es-card__badge-corner ${
                            inv.investorType === "vc"
                              ? "es-card__badge--vc"
                              : inv.investorType === "angel"
                              ? "es-card__badge--angel"
                              : "es-card__badge--fo"
                          }`}
                        >
                          {inv.investorType === "family_office"
                            ? "FAMILY OFFICE"
                            : inv.investorType === "vc"
                            ? "VC"
                            : "ANGEL"}
                          {inv.activeRecently && (
                            <span
                              className="es-card__pulse"
                              style={{ marginLeft: 6 }}
                              title="Active last 12 months"
                            />
                          )}
                        </span>

                        {/* Top: logo + name/meta side by side */}
                        <div className="es-card__inv-top">
                          {(() => {
                            const domain = extractDomain(inv.website);
                            const faviconUrl = domain
                              ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
                              : null;
                            if (inv.logoUrl) {
                              return (
                                <img
                                  src={inv.logoUrl}
                                  alt=""
                                  className="es-card__logo-lg"
                                  onError={(e) => {
                                    const el = e.target as HTMLImageElement;
                                    if (faviconUrl) {
                                      el.src = faviconUrl;
                                    } else {
                                      el.style.display = "none";
                                    }
                                  }}
                                />
                              );
                            }
                            if (faviconUrl) {
                              return (
                                <img
                                  src={faviconUrl}
                                  alt=""
                                  className="es-card__logo-lg"
                                  onError={(e) => {
                                    (
                                      e.target as HTMLImageElement
                                    ).style.display = "none";
                                  }}
                                />
                              );
                            }
                            return (
                              <span className="es-card__initial-lg">
                                {inv.name.charAt(0)}
                              </span>
                            );
                          })()}
                          <div className="es-card__inv-info">
                            <h3 className="es-card__inv-name">
                              {highlightMatch(inv.name, searchTerms)}
                            </h3>
                            <div className="es-card__meta">
                              {inv.region && (
                                <span
                                  className="es-card__meta-item"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 3,
                                  }}
                                >
                                  📍 <CountryFlagEmbed region={inv.region} />
                                  {shortenRegion(inv.region)}
                                </span>
                              )}
                              {assets && (
                                <span className="es-card__meta-item">
                                  {assets}
                                </span>
                              )}
                              {inv.founded && (
                                <span
                                  className="es-card__meta-item"
                                  style={{ fontFamily: "var(--font-mono)" }}
                                >
                                  Est. {inv.founded}
                                </span>
                              )}
                            </div>
                            {(() => {
                              const pills: string[] = [];
                              if (
                                inv.investmentStage &&
                                inv.investmentStage !== "Oklar"
                              ) {
                                pills.push(inv.investmentStage);
                              }
                              if (
                                inv.investorType === "angel" &&
                                inv.ticketSize &&
                                inv.ticketSize !== "Oklar"
                              ) {
                                pills.push(
                                  inv.ticketSize === "Stor"
                                    ? "Large ticket"
                                    : inv.ticketSize === "Liten"
                                    ? "Small ticket"
                                    : inv.ticketSize === "Mellan"
                                    ? "Mid ticket"
                                    : inv.ticketSize
                                );
                              }
                              if (
                                inv.investorType === "angel" &&
                                inv.handsOnLevel === "hög"
                              ) {
                                pills.push("Hands-on");
                              }
                              return pills.length > 0 ? (
                                <div className="es-card__meta-pills">
                                  {pills.map((p, i) => (
                                    <span
                                      key={i}
                                      className="es-card__meta-pill"
                                    >
                                      {p}
                                    </span>
                                  ))}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </div>

                        {niches.length > 0 && (
                          <div className="es-card__tags">
                            {niches.map((n, i) => (
                              <span
                                key={i}
                                className={`es-card__tag ${
                                  searchTerms.some((t) =>
                                    n.toLowerCase().includes(t)
                                  )
                                    ? "es-card__tag--highlight"
                                    : "es-card__tag--default"
                                }`}
                              >
                                {n}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Key metrics row: AUM / Investments / Exits / Activity */}
                        {(() => {
                          const aum =
                            formatUsdShort(inv.aumUsd) ||
                            formatAssets(inv.aum) ||
                            formatAssets(inv.assets);
                          const invs = inv.totalInvestments;
                          const exits = inv.totalExits;
                          const act = formatUsdShort(inv.fundingLast12mUsd);
                          const cells: { label: string; value: string }[] = [];
                          if (aum) cells.push({ label: "AUM", value: aum });
                          if (invs && invs > 0)
                            cells.push({
                              label: "Investments",
                              value: String(invs),
                            });
                          if (exits && exits > 0)
                            cells.push({
                              label: "Exits",
                              value: String(exits),
                            });
                          if (act)
                            cells.push({ label: "Last 12 mo", value: act });
                          if (cells.length === 0) return null;
                          return (
                            <div className="es-card__inv-metrics">
                              {cells.map((c) => (
                                <div
                                  key={c.label}
                                  className="es-card__inv-metric"
                                >
                                  <div className="es-card__inv-metric-label">
                                    {c.label}
                                  </div>
                                  <div className="es-card__inv-metric-value">
                                    {c.value}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Latest fund chip */}
                        {inv.latestFund &&
                          (() => {
                            const f = inv.latestFund!;
                            const size = formatUsdShort(f.sizeUsd);
                            const parts = [
                              f.name,
                              size,
                              f.year ? String(f.year) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ");
                            if (!parts) return null;
                            return (
                              <div className="es-card__latest-fund">
                                <span className="es-card__latest-fund-label">
                                  Latest fund
                                </span>
                                <span className="es-card__latest-fund-text">
                                  {parts}
                                </span>
                              </div>
                            );
                          })()}

                        {/* Notable investments / unicorns */}
                        {(() => {
                          const list = [
                            ...(inv.currentUnicorns || []),
                            ...(inv.notableInvestments || []),
                          ];
                          const unique = Array.from(new Set(list)).slice(0, 4);
                          if (unique.length === 0) return null;
                          return (
                            <div className="es-card__notable">
                              <span className="es-card__notable-label">
                                Notable
                              </span>
                              <div className="es-card__notable-list">
                                {unique.map((n) => (
                                  <span
                                    key={n}
                                    className="es-card__notable-chip"
                                  >
                                    {n}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Industry focus + Preferred rounds side-by-side */}
                        {((inv.industryExperience &&
                          inv.industryExperience.length > 0) ||
                          (inv.roundsExperience &&
                            inv.roundsExperience.length > 0)) && (
                          <div className="es-card__experience-pair">
                            {inv.industryExperience &&
                              inv.industryExperience.length > 0 && (
                                <div className="es-card__experience">
                                  <span className="es-card__experience-label">
                                    Industry focus
                                  </span>
                                  <div className="es-card__experience-bars">
                                    {inv
                                      .industryExperience!.slice(0, 4)
                                      .map((b) => (
                                        <div
                                          key={b.industry}
                                          className="es-card__experience-row"
                                          title={`${b.industry}: ${b.percentage}%`}
                                        >
                                          <span className="es-card__experience-name">
                                            {b.industry}
                                          </span>
                                          <div className="es-card__experience-track">
                                            <div
                                              className="es-card__experience-fill"
                                              style={{
                                                width: `${Math.min(
                                                  100,
                                                  b.percentage
                                                )}%`,
                                              }}
                                            />
                                          </div>
                                          <span className="es-card__experience-pct">
                                            {b.percentage}%
                                          </span>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}
                            {inv.roundsExperience &&
                              inv.roundsExperience.length > 0 && (
                                <div className="es-card__experience">
                                  <span className="es-card__experience-label">
                                    Preferred rounds
                                  </span>
                                  <div className="es-card__experience-bars">
                                    {inv
                                      .roundsExperience!.slice(0, 4)
                                      .map((b) => (
                                        <div
                                          key={b.round}
                                          className="es-card__experience-row"
                                          title={`${b.round}: ${b.percentage}%`}
                                        >
                                          <span className="es-card__experience-name">
                                            {b.round}
                                          </span>
                                          <div className="es-card__experience-track">
                                            <div
                                              className="es-card__experience-fill es-card__experience-fill--alt"
                                              style={{
                                                width: `${Math.min(
                                                  100,
                                                  b.percentage
                                                )}%`,
                                              }}
                                            />
                                          </div>
                                          <span className="es-card__experience-pct">
                                            {b.percentage}%
                                          </span>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        )}

                        {/* ESG badges */}
                        {(() => {
                          const esgBadges = getEsgBadges(inv.currentFocus);
                          if (esgBadges.length === 0) return null;
                          return (
                            <div className="es-card__esg-badges">
                              {esgBadges.map((b) => (
                                <span key={b} className="es-card__esg-badge">
                                  {b}
                                </span>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Stage pills derived from currentFocus */}
                        {(() => {
                          const stagePills = getStagePillsFromFocus(
                            inv.currentFocus
                          );
                          if (stagePills.length === 0) return null;
                          return (
                            <div className="es-card__stage-pills">
                              {stagePills.map((s) => (
                                <span key={s} className="es-card__stage-pill">
                                  {s}
                                </span>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Portfolio section */}
                        {inv.portfolioHoldings &&
                          inv.portfolioHoldings.length > 0 &&
                          (() => {
                            const items = inv.portfolioHoldings!.slice(0, 6);
                            const useGrid = items.length > 3;
                            return (
                              <div className="es-card__portfolio-section">
                                <span className="es-card__portfolio-heading">
                                  Portfolio companies (selection)
                                </span>
                                <div
                                  className={
                                    useGrid
                                      ? "es-card__portfolio-grid"
                                      : "es-card__portfolio-row"
                                  }
                                >
                                  {items.map((h, i) => {
                                    const cleanName = h.companyName
                                      .replace(
                                        /\s+(AB|Aktiebolag|aktiebolag)(\s*\(publ\))?\s*$/gi,
                                        ""
                                      )
                                      .trim();
                                    const orgClean = h.orgNumber?.replace(
                                      /-/g,
                                      ""
                                    );
                                    const orgFormatted = h.orgNumber
                                      ? h.orgNumber.includes("-")
                                        ? h.orgNumber
                                        : h.orgNumber.replace(
                                            /^(\d{6})(\d{4})$/,
                                            "$1-$2"
                                          )
                                      : null;
                                    const Wrapper = orgFormatted ? "a" : "div";
                                    const wrapperProps = orgFormatted
                                      ? {
                                          href: `https://www.loopdesk.se/bolag/${orgFormatted}`,
                                          target: "_blank",
                                          rel: "noopener noreferrer",
                                          onClick: (e: React.MouseEvent) =>
                                            e.stopPropagation(),
                                        }
                                      : {};
                                    const guessedDomain = `${cleanName
                                      .toLowerCase()
                                      .replace(/\s+/g, "")
                                      .replace(/[^a-z0-9]/g, "")}.com`;
                                    const portfolioFavicon = `https://www.google.com/s2/favicons?domain=${guessedDomain}&sz=128`;
                                    return (
                                      <Wrapper
                                        key={i}
                                        className="es-card__portfolio-item"
                                        {...wrapperProps}
                                      >
                                        {orgClean ? (
                                          <img
                                            src={`https://rpjmsncjnhtnjnycabys.supabase.co/storage/v1/object/public/company-assets/logos/${orgClean}.png`}
                                            alt=""
                                            className="es-card__portfolio-logo"
                                            onError={(e) => {
                                              const el =
                                                e.target as HTMLImageElement;
                                              el.src = portfolioFavicon;
                                              el.onerror = () => {
                                                el.style.display = "none";
                                                const fb =
                                                  el.nextElementSibling as HTMLElement;
                                                if (fb)
                                                  fb.style.display = "flex";
                                              };
                                            }}
                                          />
                                        ) : (
                                          <img
                                            src={portfolioFavicon}
                                            alt=""
                                            className="es-card__portfolio-logo"
                                            onError={(e) => {
                                              const el =
                                                e.target as HTMLImageElement;
                                              el.style.display = "none";
                                              const fb =
                                                el.nextElementSibling as HTMLElement;
                                              if (fb) fb.style.display = "flex";
                                            }}
                                          />
                                        )}
                                        <span
                                          className="es-card__portfolio-initial"
                                          style={{
                                            display: "none",
                                          }}
                                        >
                                          {cleanName.charAt(0)}
                                        </span>
                                        <span className="es-card__portfolio-name">
                                          {cleanName}
                                        </span>
                                      </Wrapper>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}

                        {(() => {
                          if (
                            inv.description &&
                            inv.investorType === "angel" &&
                            inv.description.length > 30
                          ) {
                            return (
                              <div className="es-card__relevance">
                                <p
                                  style={{
                                    fontSize: "12.5px",
                                    lineHeight: 1.5,
                                    color: "var(--es-text-secondary)",
                                    margin: 0,
                                    display: "-webkit-box",
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                  }}
                                >
                                  {inv.description}
                                </p>
                              </div>
                            );
                          }
                          const bullets: string[] = [];
                          if (inv.notableDeals && bullets.length < 2) {
                            const deals = inv.notableDeals
                              .split(",")
                              .map((d) =>
                                d
                                  .trim()
                                  .replace(/\s*\(.*?\)\s*/g, "")
                                  .replace(
                                    /\s+(AB|Aktiebolag|aktiebolag)(\s*\(publ\))?\s*$/gi,
                                    ""
                                  )
                                  .trim()
                              )
                              .filter(
                                (d) =>
                                  d && d !== "—" && d !== "-" && d.length > 1
                              )
                              .slice(0, 2);
                            if (deals.length > 0) {
                              bullets.push(`Invested in ${deals.join(", ")}`);
                            }
                          }
                          if (inv.recentTransactions?.length) {
                            const tx = inv.recentTransactions[0];
                            const verb =
                              tx.type === "exit" ? "Exited" : "Invested in";
                            bullets.push(
                              `${verb} ${tx.companyName}${
                                tx.date
                                  ? ` (${new Date(tx.date).toLocaleDateString(
                                      "en-GB",
                                      { year: "numeric", month: "short" }
                                    )})`
                                  : ""
                              }`
                            );
                          }
                          const matchingNiches = niches.filter((n) =>
                            searchTerms.some((t) => n.toLowerCase().includes(t))
                          );
                          if (matchingNiches.length > 0) {
                            bullets.push(
                              `Active in ${matchingNiches
                                .join(", ")
                                .toLowerCase()}`
                            );
                          }
                          if (
                            inv.portfolioCount &&
                            inv.portfolioCount > 0 &&
                            bullets.length < 2
                          ) {
                            const activeText = inv.activeRecently
                              ? ", active past year"
                              : "";
                            bullets.push(
                              `${inv.portfolioCount} ${
                                inv.investorType === "angel"
                                  ? inv.portfolioCount === 1
                                    ? "investment"
                                    : "investments"
                                  : "portfolio companies"
                              }${activeText}`
                            );
                          }
                          if (bullets.length === 0 && desc) bullets.push(desc);
                          if (bullets.length === 0) {
                            const typeName =
                              inv.investorType === "family_office"
                                ? "family office"
                                : inv.investorType === "angel"
                                ? "angel investor"
                                : "VC firm";
                            const regionText = inv.region
                              ? ` based in ${shortenRegion(inv.region)}`
                              : "";
                            if (niches.length > 0) {
                              bullets.push(
                                `${
                                  typeName[0].toUpperCase() + typeName.slice(1)
                                } focused on ${niches
                                  .slice(0, 2)
                                  .join(" and ")
                                  .toLowerCase()}`
                              );
                            } else {
                              bullets.push(
                                `${
                                  typeName[0].toUpperCase() + typeName.slice(1)
                                }${regionText}`
                              );
                            }
                          }
                          return (
                            <div className="es-card__relevance">
                              {bullets.slice(0, 2).map((b, i) => (
                                <div
                                  key={i}
                                  className="es-card__relevance-item"
                                >
                                  <span className="es-card__relevance-arrow" />
                                  <span>{highlightMatch(b, searchTerms)}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Card footer: contact + person */}
                        <div className="es-card__card-footer">
                          {(inv.website || inv.email || inv.linkedin) && (
                            <div className="es-card__company-links">
                              {inv.website && (
                                <a
                                  href={inv.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="es-card__contact-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    logEvent("click_website", {
                                      investorId: inv.id,
                                      investorName: inv.name,
                                      query,
                                      metadata: { url: inv.website },
                                    });
                                  }}
                                >
                                  <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="2" y1="12" x2="22" y2="12" />
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                  </svg>
                                  Website
                                </a>
                              )}
                              {inv.email && (
                                <a
                                  href={`mailto:${
                                    inv.email
                                  }?subject=${encodeURIComponent(
                                    `Contact via Impact Loop — ${inv.name}`
                                  )}&body=${encodeURIComponent(
                                    `Hi,\n\nI found ${inv.name} via Impact Loop's investor search and would love to learn more about your investment opportunities.\n\nBest regards`
                                  )}`}
                                  className="es-card__contact-btn"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <rect
                                      x="2"
                                      y="4"
                                      width="20"
                                      height="16"
                                      rx="2"
                                    />
                                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                                  </svg>
                                  Email
                                </a>
                              )}
                              {inv.linkedin && (
                                <a
                                  href={inv.linkedin}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="es-card__contact-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    logEvent("click_linkedin", {
                                      investorId: inv.id,
                                      investorName: inv.name,
                                      query,
                                    });
                                  }}
                                >
                                  <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                  >
                                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                  </svg>
                                  LinkedIn
                                </a>
                              )}
                              {isExpanded &&
                                (() => {
                                  const coords = getCityCoords(inv.region);
                                  if (!coords) return null;
                                  return (
                                    <div
                                      className="es-card__minimap-inline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setLightboxMap({
                                          lat: coords[0],
                                          lng: coords[1],
                                          name: inv.name,
                                        });
                                      }}
                                    >
                                      <InvestorMiniMap
                                        lat={coords[0]}
                                        lng={coords[1]}
                                        height={36}
                                        interactive={false}
                                        zoom={9}
                                      />
                                    </div>
                                  );
                                })()}
                            </div>
                          )}

                          {inv.keyPeople &&
                            (() => {
                              const raw = inv.keyPeople.split(",")[0].trim();
                              const titleMatch = raw.match(
                                /^(.+?)\s*\((.+?)\)\s*$/
                              );
                              const personName = titleMatch
                                ? titleMatch[1].trim()
                                : raw;
                              const title = titleMatch
                                ? titleMatch[2].trim()
                                : inv.investorType === "family_office"
                                ? "Key person"
                                : inv.investorType === "angel"
                                ? "Contact"
                                : "Partner";
                              return (
                                <div className="es-card__contact-card es-card__contact-card--prominent">
                                  <div className="es-card__contact-card-top">
                                    {inv.keyPeopleImageUrl ? (
                                      /* eslint-disable-next-line @next/next/no-img-element */
                                      <img
                                        src={inv.keyPeopleImageUrl}
                                        alt={personName}
                                        className="es-card__key-person-avatar es-card__key-person-avatar--lg"
                                        onError={(e) => {
                                          const el = e.currentTarget;
                                          el.style.display = "none";
                                          const fallback =
                                            el.nextElementSibling as HTMLElement;
                                          if (fallback)
                                            fallback.style.display = "flex";
                                        }}
                                      />
                                    ) : null}
                                    <span
                                      className="es-card__key-person-initial es-card__key-person-initial--lg"
                                      style={
                                        inv.keyPeopleImageUrl
                                          ? { display: "none" }
                                          : undefined
                                      }
                                    >
                                      {personName.charAt(0)}
                                    </span>
                                    <div className="es-card__key-person-info">
                                      <span className="es-card__key-person-role">
                                        {title}
                                      </span>
                                      <span className="es-card__key-person-name">
                                        {personName}
                                      </span>
                                    </div>
                                  </div>
                                  {inv.linkedin && (
                                    <a
                                      href={inv.linkedin}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="es-card__person-linkedin"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                      >
                                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                      </svg>
                                    </a>
                                  )}
                                </div>
                              );
                            })()}

                          {/* Investment company — hide for "Privatperson" */}
                          {inv.investmentCompany &&
                            !inv.investmentCompany.name
                              .toLowerCase()
                              .includes("privatperson") && (
                              <div className="es-card__investment-company">
                                <span className="es-card__investment-company-label">
                                  Invests through
                                </span>
                                <a
                                  href={
                                    inv.investmentCompany.orgNumber
                                      ? `https://www.loopdesk.se/bolag/${
                                          inv.investmentCompany.orgNumber.includes(
                                            "-"
                                          )
                                            ? inv.investmentCompany.orgNumber
                                            : inv.investmentCompany.orgNumber.replace(
                                                /^(\d{6})(\d{4})$/,
                                                "$1-$2"
                                              )
                                        }`
                                      : "#"
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="es-card__investment-company-card"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {inv.investmentCompany.logoUrl ? (
                                    <img
                                      src={inv.investmentCompany.logoUrl}
                                      alt=""
                                      className="es-card__investment-company-logo"
                                      onError={(e) => {
                                        const el = e.target as HTMLImageElement;
                                        el.style.display = "none";
                                        const fb =
                                          el.nextElementSibling as HTMLElement;
                                        if (fb) fb.style.display = "flex";
                                      }}
                                    />
                                  ) : null}
                                  <span
                                    className="es-card__investment-company-initial"
                                    style={{
                                      display: inv.investmentCompany.logoUrl
                                        ? "none"
                                        : "flex",
                                    }}
                                  >
                                    {inv.investmentCompany.name.charAt(0)}
                                  </span>
                                  <span className="es-card__investment-company-info">
                                    <span className="es-card__investment-company-name">
                                      {inv.investmentCompany.name.replace(
                                        /\s+(AB|Aktiebolag|aktiebolag)(\s*\(publ\))?\s*$/gi,
                                        ""
                                      )}
                                    </span>
                                    {inv.investmentCompany.role && (
                                      <span className="es-card__investment-company-role">
                                        {inv.investmentCompany.role}
                                      </span>
                                    )}
                                  </span>
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ opacity: 0.4, flexShrink: 0 }}
                                  >
                                    <path d="M7 17l9.2-9.2M17 17V7H7" />
                                  </svg>
                                </a>
                              </div>
                            )}
                        </div>

                        {/* Expandable section */}
                        <div className="es-card__expand-section">
                          <div className="es-card__expand-divider" />
                          <div className="es-card__expand-grid">
                            {(inv.investorProfile || inv.description) && (
                              <div
                                className="es-card__expand-item"
                                style={{ gridColumn: "1 / -1" }}
                              >
                                <span className="es-card__expand-item-label">
                                  {inv.investorProfile
                                    ? "Investor profile"
                                    : "Description"}
                                </span>
                                {cleanText(
                                  inv.investorProfile || inv.description || ""
                                )}
                              </div>
                            )}
                            {inv.impactSustainability && (
                              <div
                                className="es-card__expand-item"
                                style={{ gridColumn: "1 / -1" }}
                              >
                                <span className="es-card__expand-item-label">
                                  Sustainability &amp; impact
                                </span>
                                {cleanText(inv.impactSustainability)}
                              </div>
                            )}
                            {inv.currentRole && (
                              <div className="es-card__expand-item">
                                <span className="es-card__expand-item-label">
                                  Current role
                                </span>
                                {inv.currentRole}
                              </div>
                            )}
                            {inv.previousRoles && (
                              <div className="es-card__expand-item">
                                <span className="es-card__expand-item-label">
                                  Background
                                </span>
                                {cleanText(
                                  inv.previousRoles
                                    .split(";")
                                    .slice(0, 3)
                                    .map((r) => r.trim())
                                    .join(", ")
                                )}
                              </div>
                            )}
                            {inv.geographyFocus && (
                              <div className="es-card__expand-item">
                                <span className="es-card__expand-item-label">
                                  Geography
                                </span>
                                {inv.geographyFocus.charAt(0).toUpperCase() +
                                  inv.geographyFocus.slice(1)}
                              </div>
                            )}
                            {inv.founded && (
                              <div className="es-card__expand-item">
                                <span className="es-card__expand-item-label">
                                  Founded
                                </span>
                                {inv.founded}
                              </div>
                            )}
                            {inv.notableDeals && (
                              <div className="es-card__expand-item">
                                <span className="es-card__expand-item-label">
                                  Notable deals
                                </span>
                                {inv.notableDeals}
                              </div>
                            )}
                            {/* currentFocus contains raw search keywords — used for backend matching only */}
                            {(inv.recentTransactions?.length ||
                              inv.activitySummary) && (
                              <div
                                className="es-card__expand-item"
                                style={{ gridColumn: "1 / -1" }}
                              >
                                <span className="es-card__expand-item-label">
                                  Recent activity
                                </span>
                                {inv.recentTransactions &&
                                inv.recentTransactions.length > 0 ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 2,
                                    }}
                                  >
                                    {inv.recentTransactions
                                      .slice(0, 3)
                                      .map((tx, i) => {
                                        const verb =
                                          tx.type === "exit"
                                            ? "Exit"
                                            : "Investment";
                                        const dateStr = tx.date
                                          ? new Date(
                                              tx.date
                                            ).toLocaleDateString("en-GB", {
                                              year: "numeric",
                                              month: "short",
                                            })
                                          : null;
                                        return (
                                          <span
                                            key={i}
                                            style={{ fontSize: "12px" }}
                                          >
                                            {verb}: {tx.companyName}
                                            {dateStr && (
                                              <span
                                                style={{
                                                  color: "var(--es-text-muted)",
                                                  marginLeft: 4,
                                                }}
                                              >
                                                ({dateStr})
                                              </span>
                                            )}
                                          </span>
                                        );
                                      })}
                                  </div>
                                ) : (
                                  inv.activitySummary
                                )}
                              </div>
                            )}
                          </div>

                          {/* Similar investors */}
                          {similar.length > 0 && (
                            <div className="es-card__similar">
                              <div className="es-card__similar-label">
                                Similar investors
                              </div>
                              <div className="es-card__similar-items">
                                {similar.map((s) => (
                                  <button
                                    key={s.id}
                                    className="es-card__similar-chip"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedId(null);
                                      const el = document.getElementById(
                                        `inv-${s.id}`
                                      );
                                      if (el) {
                                        el.scrollIntoView({
                                          behavior: "smooth",
                                          block: "center",
                                        });
                                        el.style.boxShadow =
                                          "0 0 0 2px var(--loop-yellow)";
                                        setTimeout(() => {
                                          el.style.boxShadow = "";
                                        }, 2000);
                                      }
                                    }}
                                  >
                                    {s.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Expand toggle */}
                        <div className="es-card__expand-toggle">
                          <span>{isExpanded ? "Less" : "More info"}</span>
                          <span className="es-card__expand-arrow">▼</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Preview mode: "...and X more" CTA */}
              {preview && filtered.length > 4 && (
                <a
                  href="https://www.impactloop.com/pricing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="es-preview-more-cta"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="es-preview-more-cta__lock"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  ...and {filtered.length - 4} more, incl.{" "}
                  {filtered
                    .slice(4, 7)
                    .map((inv) => inv.name)
                    .join(", ")}{" "}
                  — Unlock — become a Builder or Investor member
                </a>
              )}

              {/* Infinite scroll sentinel */}
              {!preview && hasMore && (
                <InfiniteScrollSentinel
                  onIntersect={() => {
                    setVisibleCount((v) => v + 4);
                  }}
                />
              )}
            </div>

            {/* Right column: Articles */}
            {visibleArticles.length > 0 && (
              <div className="es-results-split__articles">
                <div className="es-results-grid">
                  {visibleArticles.map((article, idx) => {
                    const revealClass = `es-reveal${
                      resultsReady ? " es-reveal--visible" : ""
                    }`;
                    const staggerStyle: React.CSSProperties = {
                      transitionDelay: `${idx * 80}ms`,
                    };
                    return (
                      <a
                        key={`art-${idx}`}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`es-card es-card--article es-card--uniform ${revealClass}`}
                        data-reveal-idx={idx % 4}
                        style={staggerStyle}
                      >
                        <div className="es-card__article-img-wrap">
                          {article.imageUrl && (
                            <img
                              src={article.imageUrl}
                              alt=""
                              className="es-card__article-img"
                              onError={(e) => {
                                (
                                  e.target as HTMLImageElement
                                ).parentElement!.style.display = "none";
                              }}
                            />
                          )}
                          <span className="es-card__article-source-overlay">
                            IMPACT LOOP
                          </span>
                        </div>
                        <div className="es-card__article-body">
                          <div className="es-card__article-title">
                            {article.title}
                          </div>
                          {article.excerpt && (
                            <p
                              className="es-card__desc"
                              style={{ fontSize: 13 }}
                            >
                              {article.excerpt}
                            </p>
                          )}
                          <div className="es-card__article-footer">
                            <div className="es-card__byline">
                              {(() => {
                                const img = getAuthorImage(article.author);
                                if (img)
                                  return (
                                    <img
                                      src={img}
                                      alt={article.author || ""}
                                      className="es-card__byline-img"
                                    />
                                  );
                                if (article.author) {
                                  const initials = article.author
                                    .split(" ")
                                    .map((w) => w[0])
                                    .join("")
                                    .toUpperCase()
                                    .slice(0, 2);
                                  return (
                                    <span className="es-card__byline-initials">
                                      {initials}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                              <span className="es-card__byline-text">
                                {article.author && (
                                  <span>By {article.author}</span>
                                )}
                                {article.author && article.publishedDate && (
                                  <span> · </span>
                                )}
                                {article.publishedDate && (
                                  <span
                                    style={{ fontFamily: "var(--font-mono)" }}
                                  >
                                    {new Date(
                                      article.publishedDate
                                    ).toLocaleDateString("en-GB", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </span>
                                )}
                              </span>
                            </div>
                            <span className="es-card__read-link">Read →</span>
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      {/* Related searches */}
      {hasSearched &&
        !loading &&
        filtered.length > 0 &&
        relatedSearches.length > 0 && (
          <div className="es-related">
            <span className="es-related__label">Related</span>
            {relatedSearches.map((s) => (
              <button
                key={s}
                className="es-related__chip"
                onClick={() => {
                  setQuery(s);
                  commitSearch(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

      {/* Back to top button */}
      {hasSearched && showBackToTop && (
        <button
          className="es-back-to-top"
          onClick={() => {
            const container = document.querySelector(".es-container");
            if (container && container.scrollHeight > container.clientHeight) {
              container.scrollTo({ top: 0, behavior: "smooth" });
            } else {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
          aria-label="Back to top"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3L3 8.5H6V13H10V8.5H13L8 3Z" fill="currentColor" />
          </svg>
        </button>
      )}

      {/* Map lightbox */}
      {lightboxMap && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setLightboxMap(null)}
        >
          <div
            style={{
              width: "90vw",
              maxWidth: 800,
              height: "70vh",
              background: "#fff",
              borderRadius: 12,
              overflow: "hidden",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                zIndex: 10,
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "#fff",
                border: "1px solid #e5e5e5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 18,
              }}
              onClick={() => setLightboxMap(null)}
            >
              ✕
            </button>
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                zIndex: 10,
                background: "#fff",
                padding: "4px 12px",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                border: "1px solid #e5e5e5",
              }}
            >
              {lightboxMap.name}
            </div>
            <InvestorMiniMap
              lat={lightboxMap.lat}
              lng={lightboxMap.lng}
              height="100%"
              interactive={true}
              zoom={13}
            />
          </div>
        </div>
      )}
    </div>
  );
}
