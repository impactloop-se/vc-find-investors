import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const RIKSBANK_KEY = "af40de8eb14e4d27863edd7b944ff4d4";
const RIKSBANK_URL =
  "https://api.riksbank.se/swea/v1/Observations/Latest/ByGroup/130";

// Cache rates for 12 hours (rates update once daily at 16:15 CET)
let ratesCache: {
  expiresAt: number;
  rates: Record<string, number>;
  date: string;
} | null = null;

const CURRENCY_SERIES: Record<string, string> = {
  SEKEURPMI: "EUR",
  SEKUSDPMI: "USD",
  SEKGBPPMI: "GBP",
  SEKNOKPMI: "NOK",
  SEKDKKPMI: "DKK",
  SEKCHFPMI: "CHF",
};

export async function GET() {
  if (ratesCache && ratesCache.expiresAt > Date.now()) {
    return NextResponse.json(ratesCache);
  }

  try {
    const res = await fetch(RIKSBANK_URL, {
      headers: { "Ocp-Apim-Subscription-Key": RIKSBANK_KEY },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      throw new Error(`Riksbank API: ${res.status}`);
    }

    const data = (await res.json()) as Array<{
      seriesId: string;
      date: string;
      value: number;
    }>;

    // Build rates object: SEK per 1 unit of foreign currency
    // We also need cross-rates from USD (since DB amounts are in USD)
    const sekRates: Record<string, number> = { SEK: 1 };
    let date = "";

    for (const obs of data) {
      const currency = CURRENCY_SERIES[obs.seriesId];
      if (currency) {
        sekRates[currency] = obs.value;
        if (!date) date = obs.date;
      }
    }

    // Convert to: 1 USD = X of target currency
    // DB values are in USD, so we need USD-based conversion factors
    const usdToSek = sekRates.USD || 9.3;
    const fromUSD: Record<string, number> = { USD: 1 };

    for (const [currency, sekPerUnit] of Object.entries(sekRates)) {
      if (currency === "USD") continue;
      if (currency === "SEK") {
        fromUSD.SEK = usdToSek;
      } else {
        // 1 USD = usdToSek SEK, 1 EUR = eurToSek SEK
        // So 1 USD = usdToSek / eurToSek EUR
        fromUSD[currency] = usdToSek / sekPerUnit;
      }
    }

    const result = {
      rates: fromUSD,
      date,
      expiresAt: Date.now() + 12 * 60 * 60_000,
    };
    ratesCache = result;

    return NextResponse.json(result);
  } catch (error) {
    console.error("Exchange rate fetch error:", error);

    // Fallback rates if API fails
    const fallback = {
      rates: {
        USD: 1,
        EUR: 0.92,
        GBP: 0.79,
        SEK: 10.88,
        NOK: 10.5,
        CHF: 0.88,
        DKK: 6.87,
      },
      date: new Date().toISOString().slice(0, 10),
      expiresAt: Date.now() + 60 * 60_000, // Only cache fallback for 1 hour
    };
    return NextResponse.json(fallback);
  }
}
