export type NeuralLayerGroup = {
  type: string;
  role: string;
  cells: { bodyId: string }[];
};

export function layerNodeIndices(
  groups: NeuralLayerGroup[],
  nodes: { id: string }[],
) {
  const byId = new Map(nodes.map((n, i) => [n.id, i]));
  const seen = new Set<string>();
  const result = groups.map((group) =>
    group.cells.map(({ bodyId }) => {
      const index = byId.get(bodyId);
      if (index === undefined || seen.has(bodyId))
        throw new Error('Neural layer body IDs do not match the model');
      seen.add(bodyId);
      return index;
    }),
  );
  if (seen.size !== nodes.length)
    throw new Error('Neural layers omit modeled neurons');
  return result;
}

export function neuralLayerOpacity(
  indices: readonly number[],
  activity: ArrayLike<number>,
  state: { running: boolean; drive: number; inputHz: number },
  input: boolean,
) {
  if (
    !state.running ||
    !Number.isFinite(state.drive) ||
    state.drive < 0.65 ||
    (input && state.inputHz !== 10)
  )
    return 0;
  if (!indices.length) return 0;
  // Mean modeled spike afterglow, not an assertion that all members fired.
  const mean =
    indices.reduce((sum, i) => {
      const value = activity[i];
      return (
        sum + (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0)
      );
    }, 0) / indices.length;
  return mean * 0.85;
}
