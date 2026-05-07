import { NextRequest, NextResponse } from "next/server";
import { fetchPubMedPapers } from "@/lib/pubmed";
import type { PubMedPaper, ShortlistPaper, ShortlistRequestBody } from "@/lib/types";

function extractYear(pubDate: string): number | null {
  const match = pubDate.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function keywordHits(text: string, keywords: string[]): number {
  const lowered = text.toLowerCase();
  return keywords.reduce((sum, token) => sum + (lowered.includes(token) ? 1 : 0), 0);
}

function scorePaper(
  paper: PubMedPaper,
  keywords: string[],
  currentYear: number,
  yearsBack: number,
  prioritizeRct: boolean,
  includeReviews: boolean,
): ShortlistPaper {
  const title = paper.title.toLowerCase();
  const abstract = paper.abstract.toLowerCase();
  const combined = `${title} ${abstract}`;

  let score = 0;
  const reasons: string[] = [];
  const signals: string[] = [];

  const titleHits = keywordHits(title, keywords);
  const abstractHits = keywordHits(abstract, keywords);
  score += titleHits * 4 + abstractHits * 2;
  if (titleHits > 0) reasons.push(`Title keyword matches: ${titleHits}`);
  if (abstractHits > 0) reasons.push(`Abstract keyword matches: ${abstractHits}`);

  const year = extractYear(paper.pubDate);
  if (year) {
    const age = currentYear - year;
    if (age <= yearsBack) {
      score += 6;
      reasons.push(`Recent publication (${year})`);
    }
  }

  const hasRct = /(randomized|randomised|double-blind|placebo-controlled|phase 3|phase iii)/.test(
    combined,
  );
  const hasMeta = /(meta-analysis|systematic review|pooled analysis)/.test(combined);
  const hasReview = /\breview\b/.test(combined);

  if (hasRct) {
    signals.push("RCT/controlled-trial signal");
    score += prioritizeRct ? 8 : 4;
    reasons.push("Contains randomized or controlled-trial signal");
  }
  if (hasMeta) {
    signals.push("Meta-analysis signal");
    score += includeReviews ? 7 : 3;
    reasons.push("Contains meta-analysis/systematic-review signal");
  } else if (hasReview && includeReviews) {
    signals.push("Review signal");
    score += 3;
    reasons.push("Contains review signal");
  }

  return {
    ...paper,
    shortlistScore: score,
    shortlistReasons: reasons,
    studySignals: signals,
  };
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ShortlistRequestBody;
  const query = body.query?.trim();
  const limit = Math.min(Math.max(body.limit ?? 10, 3), 20);
  const yearsBack = Math.min(Math.max(body.yearsBack ?? 8, 1), 25);
  const prioritizeRct = body.prioritizeRct ?? true;
  const includeReviews = body.includeReviews ?? true;

  if (!query) {
    return NextResponse.json({ error: "Query is required." }, { status: 400 });
  }

  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .map((x) => x.replace(/[^a-z0-9-]/g, ""))
    .filter((x) => x.length > 2)
    .slice(0, 12);

  try {
    const papers = await fetchPubMedPapers(query, 35);
    const currentYear = new Date().getFullYear();

    const scored = papers
      .map((paper) =>
        scorePaper(paper, keywords, currentYear, yearsBack, prioritizeRct, includeReviews),
      )
      .sort((a, b) => b.shortlistScore - a.shortlistScore);

    return NextResponse.json({
      shortlist: scored.slice(0, limit),
      totalCandidates: papers.length,
      scoringProfile: { yearsBack, prioritizeRct, includeReviews },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
