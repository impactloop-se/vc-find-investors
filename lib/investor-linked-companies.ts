import type { SupabaseClient } from "@supabase/supabase-js";
import { getLogoUrl } from "@/lib/utils";

export interface LinkedInvestorCompany {
  name: string;
  orgNumber?: string;
  href?: string;
  logoUrl?: string;
  isWatched?: boolean;
  city?: string | null;
  employees?: number | null;
  impactNiches?: string[] | null;
}

type InvestorWithLinkedCompanies = {
  portfolioCompanies?: string;
  portfolioExamples?: string;
  notableDeals?: string;
  linkedPortfolioCompanies?: LinkedInvestorCompany[];
  linkedNotableDeals?: LinkedInvestorCompany[];
};

type InvestorLinkedCompanyContext = {
  linkedPortfolioCompanies?: LinkedInvestorCompany[];
  linkedNotableDeals?: LinkedInvestorCompany[];
};

type MatchRow = {
  input_name: string;
  org_number: string;
};

type WatchedCompanyRow = {
  orgNumber: string;
  name: string;
  city: string | null;
  employees: number | null;
  impactNiches: string[] | null;
  logoUrl?: string | null;
};

type DirectoryRow = {
  orgNumber: string;
  name: string;
  city: string | null;
  employees: number | null;
};

function normalizeNameToken(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+\(publ\)$/i, "")
    .replace(/\s+ab$/i, "")
    .trim()
    .toLocaleLowerCase("sv-SE");
}

function parseCompanyList(value?: string): string[] {
  if (!value) return [];

  return value
    .split(/[,;|\n]+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const cleaned = s.replace(/[–—-]/g, "").trim();
      return cleaned.length > 0;
    });
}

function dedupeByOrgOrName(items: LinkedInvestorCompany[]): LinkedInvestorCompany[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.orgNumber
      ? `org:${item.orgNumber}`
      : `name:${normalizeNameToken(item.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function enrichInvestorCompanies<T extends InvestorWithLinkedCompanies>(
  supabase: SupabaseClient,
  investors: T[]
): Promise<Array<T & InvestorLinkedCompanyContext>> {
  const allNames = Array.from(
    new Set(
      investors.flatMap((investor) => [
        ...parseCompanyList(
          investor.portfolioCompanies || investor.portfolioExamples
        ),
        ...parseCompanyList(investor.notableDeals),
      ])
    )
  );

  if (allNames.length === 0) {
    return investors as Array<T & InvestorLinkedCompanyContext>;
  }

  const normalizedToOriginal = new Map<string, string>();
  for (const name of allNames) {
    normalizedToOriginal.set(normalizeNameToken(name), name);
  }

  const { data: matches } = await supabase.rpc("match_company_names", {
    names: allNames,
  });

  const orgByNormalizedName = new Map<string, string>();
  for (const match of (matches || []) as MatchRow[]) {
    orgByNormalizedName.set(
      normalizeNameToken(match.input_name),
      match.org_number.replace(/-/g, "")
    );
  }

  const matchedOrgNumbers = Array.from(new Set(orgByNormalizedName.values()));
  const watchedByOrg = new Map<string, WatchedCompanyRow>();
  const directoryByOrg = new Map<string, DirectoryRow>();

  if (matchedOrgNumbers.length > 0) {
    const [watchedRes, directoryRes] = await Promise.all([
      supabase
        .from("WatchedCompany")
        .select("orgNumber, name, city, employees, impactNiches, logoUrl")
        .in("orgNumber", matchedOrgNumbers),
      supabase
        .from("CompanyDirectory")
        .select("orgNumber, name, city, employees")
        .in("orgNumber", matchedOrgNumbers),
    ]);

    for (const row of (watchedRes.data || []) as WatchedCompanyRow[]) {
      watchedByOrg.set(row.orgNumber.replace(/-/g, ""), row);
    }
    for (const row of (directoryRes.data || []) as DirectoryRow[]) {
      directoryByOrg.set(row.orgNumber.replace(/-/g, ""), row);
    }
  }

  const toLinkedCompanies = (names: string[]): LinkedInvestorCompany[] =>
    dedupeByOrgOrName(
      names.map((name) => {
        const normalizedName = normalizeNameToken(name);
        const orgNumber = orgByNormalizedName.get(normalizedName);
        if (!orgNumber) {
          return { name };
        }

        const watched = watchedByOrg.get(orgNumber);
        const directory = directoryByOrg.get(orgNumber);
        const displayName = watched?.name || directory?.name || name;

        return {
          name: displayName,
          orgNumber,
          href: `/bolag/${orgNumber}`,
          logoUrl: getLogoUrl(orgNumber, watched?.logoUrl ?? undefined),
          isWatched: !!watched,
          city: watched?.city ?? directory?.city ?? null,
          employees: watched?.employees ?? directory?.employees ?? null,
          impactNiches: watched?.impactNiches ?? null,
        };
      })
    );

  return investors.map((investor) => ({
    ...investor,
    linkedPortfolioCompanies: toLinkedCompanies(
      parseCompanyList(investor.portfolioCompanies || investor.portfolioExamples)
    ),
    linkedNotableDeals: toLinkedCompanies(parseCompanyList(investor.notableDeals)),
  }));
}
