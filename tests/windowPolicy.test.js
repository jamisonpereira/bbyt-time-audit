const assert = require('node:assert/strict');

async function main() {
  const {
    shouldOpenSummaryForAppActivation,
    shouldOpenSummaryForStartup,
    shouldOpenSummaryForTrayRequest,
  } = await import('../dist-test/window-policy/windowPolicy.mjs');

  assert.equal(shouldOpenSummaryForStartup(), true);
  assert.equal(shouldOpenSummaryForTrayRequest(), true);
  assert.equal(shouldOpenSummaryForAppActivation(), false);

  console.log('window policy tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
