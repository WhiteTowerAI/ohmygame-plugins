export function emptyPlayableSeen() {
    return { version: 1, nodes: {}, edges: {} };
}
/** Reads a stored record; anything unreadable starts over. */
export function parsePlayableSeen(value) {
    if (!isRecord(value) || value.version !== 1 || !isTimes(value.nodes) || !isTimes(value.edges))
        return emptyPlayableSeen();
    return { version: 1, nodes: { ...value.nodes }, edges: { ...value.edges } };
}
function isTimes(value) {
    return isRecord(value) && Object.values(value).every((time) => typeof time === "string");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
