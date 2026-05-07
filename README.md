## Research Assistant AI (PubMed MVP)

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy env file and add your OpenAI key:

```bash
cp .env.example .env.local
```

3. Start development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## What This MVP Does

- Searches PubMed using NCBI E-utilities
- Shows paper metadata and abstract (when available)
- Lets users select papers as evidence
- Sends selected context to an LLM for Q&A
- Returns an answer expected to include citations

## API Routes

- `GET /api/pubmed/search?query=...&limit=10`
- `POST /api/ask` with JSON body:

```json
{
  "question": "What are safety concerns?",
  "papers": [
    {
      "pmid": "123",
      "title": "Paper title",
      "abstract": "Paper abstract",
      "journal": "Journal",
      "pubDate": "2024",
      "authors": ["A Author"],
      "url": "https://pubmed.ncbi.nlm.nih.gov/123/"
    }
  ]
}
```

## Deploying to Vercel

1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Add environment variables in Vercel project settings:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional, defaults to `gpt-4o-mini`)
4. Deploy.

## Notes

- This is an MVP and currently uses abstract-level context.
- For stronger answers, next step is fetching/ingesting full text from PMC and uploaded PDFs.
