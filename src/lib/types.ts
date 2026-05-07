export type PubMedPaper = {
  pmid: string;
  title: string;
  abstract: string;
  journal: string;
  pubDate: string;
  authors: string[];
  url: string;
};

export type TrialStudy = {
  studyId: string;
  title: string;
  status: string;
  phase: string;
  trialStartDate: string;
  trialStartYear: number | null;
  primaryEndpoint: string;
  diseaseNames: string[];
  interventions: string[];
  sponsor: string;
  hasPublications: boolean;
  hasResults: boolean;
  biomarkers: string[];
  url: string;
};

export type ShortlistPaper = PubMedPaper & {
  shortlistScore: number;
  shortlistReasons: string[];
  studySignals: string[];
};

export type AskRequestBody = {
  question: string;
  papers?: PubMedPaper[];
  studies?: TrialStudy[];
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

export type ShortlistRequestBody = {
  query: string;
  limit?: number;
  yearsBack?: number;
  prioritizeRct?: boolean;
  includeReviews?: boolean;
};
