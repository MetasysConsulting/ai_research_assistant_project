import { NextRequest, NextResponse } from "next/server";
import type { TrialStudy } from "@/lib/types";

type CtGovStudy = {
  protocolSection?: {
    identificationModule?: {
      nctId?: string;
      briefTitle?: string;
    };
    statusModule?: {
      overallStatus?: string;
      startDateStruct?: { date?: string };
      hasResults?: boolean;
    };
    designModule?: {
      phases?: string[];
    };
    outcomesModule?: {
      primaryOutcomes?: Array<{ measure?: string }>;
    };
    conditionsModule?: {
      conditions?: string[];
      keywords?: string[];
    };
    armsInterventionsModule?: {
      interventions?: Array<{ name?: string }>;
    };
    sponsorCollaboratorsModule?: {
      leadSponsor?: { name?: string };
    };
    referencesModule?: {
      references?: Array<{ citation?: string; pmid?: string }>;
    };
  };
};

function extractYear(value: string): number | null {
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const condition = (searchParams.get("condition") || "").trim();
  const intervention = (searchParams.get("intervention") || "").trim();
  const textSearch = (searchParams.get("textSearch") || "").trim();
  const pageSize = Math.min(Math.max(Number(searchParams.get("limit") || "30"), 5), 100);

  if (!condition && !intervention && !textSearch) {
    return NextResponse.json(
      { error: "At least one search input is required." },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    format: "json",
    pageSize: String(pageSize),
  });
  if (condition) params.set("query.cond", condition);
  if (intervention) params.set("query.intr", intervention);
  if (textSearch) params.set("query.term", textSearch);

  try {
    const res = await fetch(`https://clinicaltrials.gov/api/v2/studies?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`ClinicalTrials.gov search failed with ${res.status}`);
    }

    const data = (await res.json()) as { studies?: CtGovStudy[] };
    const studies = data.studies ?? [];

    const normalized: TrialStudy[] = studies
      .map((study) => {
        const protocol = study.protocolSection;
        const idMod = protocol?.identificationModule;
        const statusMod = protocol?.statusModule;
        const designMod = protocol?.designModule;
        const outcomes = protocol?.outcomesModule?.primaryOutcomes ?? [];
        const conditions = protocol?.conditionsModule?.conditions ?? [];
        const keywords = protocol?.conditionsModule?.keywords ?? [];
        const interventionNames =
          protocol?.armsInterventionsModule?.interventions
            ?.map((item) => item.name?.trim())
            .filter((x): x is string => Boolean(x)) ?? [];
        const refs = protocol?.referencesModule?.references ?? [];

        const studyId = idMod?.nctId?.trim() || "";
        if (!studyId) return null;

        const trialStartDate = statusMod?.startDateStruct?.date || "Unknown";
        const trialStartYear = extractYear(trialStartDate);
        const phase = designMod?.phases?.join(", ") || "N/A";
        const primaryEndpoint =
          outcomes
            .map((x) => x.measure?.trim())
            .filter((x): x is string => Boolean(x))
            .slice(0, 1)[0] || "N/A";

        const biomarkers = keywords.filter((k) =>
          /(marker|biomarker|glp|hba1c|bmi|insulin|c-reactive)/i.test(k),
        );

        return {
          studyId,
          title: idMod?.briefTitle || "Untitled Study",
          status: statusMod?.overallStatus || "Unknown",
          phase,
          trialStartDate,
          trialStartYear,
          primaryEndpoint,
          diseaseNames: conditions,
          interventions: interventionNames,
          sponsor: protocol?.sponsorCollaboratorsModule?.leadSponsor?.name || "Unknown",
          hasPublications: refs.length > 0,
          hasResults: Boolean(statusMod?.hasResults),
          biomarkers,
          url: `https://clinicaltrials.gov/study/${studyId}`,
        };
      })
      .filter((item): item is TrialStudy => item !== null);

    return NextResponse.json({
      studies: normalized,
      total: normalized.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
