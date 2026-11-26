export function playableNodeById(graph, nodeId) {
    return graph.nodes.find((node) => node.id === nodeId);
}
/**
 * A project may have no Nodes, and then its Entry Node names nothing. Once it
 * has Nodes, the Entry Node must be one of them: when it is not, the first
 * Node becomes the Start. The Skill's add-scene script keeps the
 * graph this way.
 */
export function withPlayableEntry(graph) {
    const [first] = graph.nodes;
    if (!first || graph.nodes.some((node) => node.id === graph.entryNodeId))
        return graph;
    return { ...graph, entryNodeId: first.id };
}
export function playableEdgeForSignal(graph, nodeId, signal) {
    return graph.edges.find((edge) => edge.source.nodeId === nodeId && edge.source.signal === signal);
}
export function playableOutgoingEdges(graph, nodeId) {
    return graph.edges.filter((edge) => edge.source.nodeId === nodeId);
}
