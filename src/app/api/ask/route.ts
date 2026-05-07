import { NextRequest, NextResponse } from "next/server";
import type { AskRequestBody } from "@/lib/types";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY in environment variables." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as AskRequestBody;
  const question = body.question?.trim();
  const papers = Array.isArray(body.papers) ? body.papers.slice(0, 10) : [];
  const studies = Array.isArray(body.studies) ? body.studies.slice(0, 10) : [];

  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }

  if (!papers.length && !studies.length) {
    return NextResponse.json({ error: "Select at least one paper or study." }, { status: 400 });
  }

  const paperContext = papers.map((paper, index) =>
    [
      `[Paper ${index + 1}] PMID: ${paper.pmid}`,
      `Title: ${paper.title}`,
      `Journal: ${paper.journal}`,
      `Date: ${paper.pubDate}`,
      `Authors: ${paper.authors.join(", ") || "Unknown"}`,
      `URL: ${paper.url}`,
      `Abstract: ${paper.abstract || "No abstract available."}`,
    ].join("\n"),
  );

  const studyContext = studies.map((study, index) =>
    [
      `[Study ${index + 1}] Study ID: ${study.studyId}`,
      `Title: ${study.title}`,
      `Status: ${study.status}`,
      `Phase: ${study.phase}`,
      `Trial Start Date: ${study.trialStartDate}`,
      `Primary Endpoint: ${study.primaryEndpoint}`,
      `Conditions: ${study.diseaseNames.join(", ") || "N/A"}`,
      `Interventions: ${study.interventions.join(", ") || "N/A"}`,
      `Sponsor: ${study.sponsor}`,
      `Biomarkers: ${study.biomarkers.join(", ") || "N/A"}`,
      `Publications linked: ${study.hasPublications ? "Yes" : "No"}`,
      `Results linked: ${study.hasResults ? "Yes" : "No"}`,
      `URL: ${study.url}`,
    ].join("\n"),
  );

  const context = [...paperContext, ...studyContext].join("\n\n---\n\n");

  const systemPrompt =
    "You are a biomedical research assistant. Answer using only the provided paper/study context. " +
    "If context is insufficient, say so clearly. Include a 'Citations' section listing Study IDs/PMIDs and URLs used.";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Question:\n${question}\n\nPaper context:\n${context}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string };
      }>;
    };

    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error("No answer returned from model.");
    }

    return NextResponse.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
