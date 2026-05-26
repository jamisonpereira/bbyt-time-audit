const assert = require('node:assert/strict');

async function main() {
  const { updateRangeSelection } = await import(
    '../dist-test/selection/selection.mjs'
  );
  const orderedIds = ['block-1', 'block-2', 'block-3', 'block-4', 'block-5'];

  assert.deepEqual(
    updateRangeSelection({
      orderedIds,
      selectedIds: ['block-1'],
      clickedId: 'block-4',
      anchorId: 'block-1',
      checked: true,
      shiftKey: true,
    }),
    ['block-1', 'block-2', 'block-3', 'block-4'],
  );

  assert.deepEqual(
    updateRangeSelection({
      orderedIds,
      selectedIds: ['block-1', 'block-2', 'block-3', 'block-4'],
      clickedId: 'block-3',
      anchorId: 'block-1',
      checked: false,
      shiftKey: true,
    }),
    ['block-4'],
  );

  assert.deepEqual(
    updateRangeSelection({
      orderedIds,
      selectedIds: ['block-1'],
      clickedId: 'block-3',
      anchorId: null,
      checked: true,
      shiftKey: true,
    }),
    ['block-1', 'block-3'],
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
