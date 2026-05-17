import type { AppSettings, Category, MergeSuggestion } from '../shared/types';

const buybackSystemPrompt = `
You summarize time-audit labels into high-level categories for a two-week time audit.

The goal is to help the user see where time is going at a useful level of abstraction, especially the split between personal and work time. Do not decide what should be delegated, replaced, protected, or offloaded. Keep the output descriptive, not judgmental.

Rules:
- Prefer high-level task categories over specific event/person labels.
- Start every canonical category with either "Work -" or "Personal -".
- Use practical categories such as "Work - Email / Admin", "Work - Meetings", "Work - Sales / Business Development", "Work - Deep Work / Development", "Personal - Errands / Logistics", "Personal - Meals / Household", "Personal - Relationships / Social", or "Personal - Health / Exercise".
- Group labels by what the user was actually doing, not by exact wording.
- Keep categories broad enough for summary, but not so broad that everything becomes "Work" or "Personal".
- Do not invent labels that were not provided. Every labels item must exactly match an input label.
- If a label could fit multiple categories, choose the clearest personal and work context from the label.
- Return strict JSON only, with this shape:
{"suggestions":[{"canonical":"Work - Email / Admin","labels":["work email","read emails"]}]}
`.trim();

export async function getMergeSuggestions(
  settings: AppSettings,
  categories: Category[],
): Promise<MergeSuggestion[]> {
  if (!settings.apiKey) {
    return [];
  }

  const labels = categories.map((category) => category.name);
  if (labels.length < 2) {
    return [];
  }

  const response = await fetch(settings.aiEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.aiModel,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: buybackSystemPrompt,
        },
        {
          role: 'user',
          content: JSON.stringify({ labels }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI merge request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return [];
  }

  const parsed = JSON.parse(stripJsonFence(content)) as {
    suggestions?: MergeSuggestion[];
  };
  return (parsed.suggestions ?? []).filter(
    (suggestion) =>
      suggestion.canonical &&
      Array.isArray(suggestion.labels) &&
      suggestion.labels.length > 1,
  );
}

function stripJsonFence(content: string): string {
  return content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}
