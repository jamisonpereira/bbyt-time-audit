const assert = require('node:assert/strict');

async function main() {
  const { getMergeSuggestions } = await import('../dist-test/ai-merge/aiMerge.mjs');
  let requestBody = null;

  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestions: [
                    {
                      canonical: 'Work - Email / Admin',
                      labels: ['work email', 'read emails'],
                    },
                  ],
                }),
              },
            },
          ],
        };
      },
    };
  };

  const result = await getMergeSuggestions(
    {
      apiKey: 'test-key',
      aiEndpoint: 'https://example.test',
      aiModel: 'test-model',
      intervalMinutes: 15,
      activeDays: [1],
      startTime: '09:00',
      endTime: '17:00',
      promptingEnabled: true,
      launchAtLogin: false,
      snoozeMinutes: 5,
    },
    [
      {
        id: '1',
        name: 'work email',
        normalizedName: 'work email',
        useCount: 1,
        lastUsedAt: '2026-05-16T00:00:00.000Z',
      },
      {
        id: '2',
        name: 'read emails',
        normalizedName: 'read emails',
        useCount: 1,
        lastUsedAt: '2026-05-16T00:00:00.000Z',
      },
    ],
  );

  const systemPrompt = requestBody.messages[0].content;
  assert.match(systemPrompt, /high-level/i);
  assert.match(systemPrompt, /Work -/i);
  assert.match(systemPrompt, /Personal -/i);
  assert.match(systemPrompt, /personal and work/i);
  assert.doesNotMatch(systemPrompt, /DRIP Matrix/i);
  assert.doesNotMatch(systemPrompt, /Delegation/i);
  assert.doesNotMatch(systemPrompt, /Production/i);
  assert.equal(result[0].canonical, 'Work - Email / Admin');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
