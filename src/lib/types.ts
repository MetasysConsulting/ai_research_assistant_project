export type PubMedPaper = {
  pmid: string;
  title: string;
  abstract: string;
  journal: string;
  pubDate: string;
  authors: string[];
  url: string;
};

export type AskRequestBody = {
  question: string;
  papers: PubMedPaper[];
};
