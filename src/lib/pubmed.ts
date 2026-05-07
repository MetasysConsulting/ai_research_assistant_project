import type { PubMedPaper } from "@/lib/types";

const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

type ESearchResponse = {
  esearchresult: {
    idlist: string[];
  };
};

function decodeXmlEntities(input: string): string {
  return input
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function readTagValue(input: string, tagName: string): string {
  const match = input.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`));
  if (!match?.[1]) {
    return "";
  }
  return decodeXmlEntities(match[1].replace(/<[^>]+>/g, "").trim());
}

function readTagValues(input: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "g");
  const values: string[] = [];
  let match = regex.exec(input);
  while (match) {
    values.push(decodeXmlEntities(match[1].replace(/<[^>]+>/g, "").trim()));
    match = regex.exec(input);
  }
  return values.filter(Boolean);
}

export async function fetchPubMedPapers(query: string, limit: number): Promise<PubMedPaper[]> {
  const searchUrl = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${Math.min(
    Math.max(limit, 1),
    50,
  )}&term=${encodeURIComponent(query)}`;

  const searchRes = await fetch(searchUrl, {
    cache: "no-store",
  });

  if (!searchRes.ok) {
    throw new Error(`PubMed search failed with ${searchRes.status}`);
  }

  const searchJson = (await searchRes.json()) as ESearchResponse;
  const ids = searchJson.esearchresult?.idlist ?? [];

  if (!ids.length) {
    return [];
  }

  const fetchUrl = `${PUBMED_BASE}/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml&rettype=abstract`;
  const fetchRes = await fetch(fetchUrl, {
    cache: "no-store",
  });

  if (!fetchRes.ok) {
    throw new Error(`PubMed fetch failed with ${fetchRes.status}`);
  }

  const rawXml = await fetchRes.text();
  const articleBlocks = rawXml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) ?? [];

  return articleBlocks
    .map((block) => {
      const pmid = readTagValue(block, "PMID");
      if (!pmid) {
        return null;
      }

      const title = readTagValue(block, "ArticleTitle") || "Untitled";
      const journal = readTagValue(block, "Title") || "Unknown Journal";
      const abstract = readTagValues(block, "AbstractText").join("\n\n");

      const year = readTagValue(block, "Year");
      const month = readTagValue(block, "Month");
      const day = readTagValue(block, "Day");
      const medlineDate = readTagValue(block, "MedlineDate");
      const pubDate = [year, month, day].filter(Boolean).join(" ") || medlineDate || "Unknown";

      const authorBlocks = block.match(/<Author[\s\S]*?<\/Author>/g) ?? [];
      const authors = authorBlocks
        .map((authorBlock) => {
          const collectiveName = readTagValue(authorBlock, "CollectiveName");
          if (collectiveName) {
            return collectiveName;
          }
          const foreName = readTagValue(authorBlock, "ForeName");
          const lastName = readTagValue(authorBlock, "LastName");
          return [foreName, lastName].filter(Boolean).join(" ").trim();
        })
        .filter(Boolean);

      return {
        pmid,
        title,
        abstract,
        journal,
        pubDate,
        authors,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      };
    })
    .filter((paper): paper is PubMedPaper => paper !== null);
}
