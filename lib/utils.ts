const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://rpjmsncjnhtnjnycabys.supabase.co";

export function getLogoUrl(orgNumber: string, logoUrl?: string): string {
  if (logoUrl && !logoUrl.includes("undefined")) return logoUrl;
  const cleanOrg = orgNumber.replace(/-/g, "");
  if (cleanOrg) {
    return `${SUPABASE_URL}/storage/v1/object/public/company-assets/logos/${cleanOrg}.png`;
  }
  return "";
}
