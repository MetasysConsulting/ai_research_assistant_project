import { NextRequest, NextResponse } from "next/server";
import { fetchPubMedPapers } from "@/lib/pubmed";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") || "").trim();
  const limit = Number(searchParams.get("limit") || "8");

  if (!query) {
    return NextResponse.json(
      { error: "Missing required query parameter: query" },
      { status: 400 },
    );
  }

  try {
    const papers = await fetchPubMedPapers(query, Math.min(Math.max(limit, 1), 20));
    return NextResponse.json({ papers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
