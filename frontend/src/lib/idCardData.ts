import { settingsAPI } from "@/services/api";
import { assetUrl } from "@/components/idcard/IdCardView";
import type { IdCardTemplate, IdCompany } from "@/lib/idCard";
import { normalizeTemplate } from "@/lib/idCardLibrary";

export function companyFromSettings(s: any): IdCompany {
  return {
    name: s?.companyName || "",
    address: s?.companyAddress || "",
    phone: s?.companyPhone || "",
    email: s?.companyEmail || "",
    website: s?.companyWebsite || "",
    logoUrl: assetUrl(s?.logoUrl),
  };
}

/** This company's saved ID-card design and company details (the default design when none is saved yet). */
export async function loadIdCardSetup(): Promise<{
  template: IdCardTemplate;
  company: IdCompany;
  saved: boolean;
}> {
  const res = await settingsAPI.get();
  const s = res?.data;
  return {
    template: normalizeTemplate(s?.idCardTemplate),
    company: companyFromSettings(s),
    saved: !!s?.idCardTemplate,
  };
}
