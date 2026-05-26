export type RangeSelectionInput = {
  orderedIds: string[];
  selectedIds: string[];
  clickedId: string;
  anchorId: string | null;
  checked: boolean;
  shiftKey: boolean;
};

export const updateRangeSelection = ({
  orderedIds,
  selectedIds,
  clickedId,
  anchorId,
  checked,
  shiftKey,
}: RangeSelectionInput): string[] => {
  const selectedSet = new Set(selectedIds);
  const clickedIndex = orderedIds.indexOf(clickedId);
  const anchorIndex = anchorId ? orderedIds.indexOf(anchorId) : -1;

  if (shiftKey && anchorIndex >= 0 && clickedIndex >= 0) {
    const startIndex = Math.min(anchorIndex, clickedIndex);
    const endIndex = Math.max(anchorIndex, clickedIndex);
    const rangeIds = orderedIds.slice(startIndex, endIndex + 1);

    for (const id of rangeIds) {
      if (checked) {
        selectedSet.add(id);
      } else {
        selectedSet.delete(id);
      }
    }
  } else if (checked) {
    selectedSet.add(clickedId);
  } else {
    selectedSet.delete(clickedId);
  }

  return orderedIds.filter((id) => selectedSet.has(id));
};
