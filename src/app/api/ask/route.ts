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

  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }

  if (!papers.length) {
    return NextResponse.json({ error: "Select at least one paper." }, { status: 400 });
  }

  const context = papers
    .map((paper, index) => {
      return [
        `[${index + 1}] PMID: ${paper.pmid}`,
        `Title: ${paper.title}`,
        `Journal: ${paper.journal}`,
        `Date: ${paper.pubDate}`,
        `Authors: ${paper.authors.join(", ") || "Unknown"}`,
        `URL: ${paper.url}`,
        `Abstract: ${paper.abstract || "No abstract available."}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const systemPrompt =
    "You are a biomedical research assistant. Answer using only the provided paper context. " +
    "If the context is insufficient, say so clearly. Include a 'Citations' section listing PMID and URL used.";

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
