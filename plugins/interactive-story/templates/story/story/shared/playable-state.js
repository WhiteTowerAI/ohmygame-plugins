export class PlayableStateError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "PlayableStateError";
    }
}
export function isJsonValue(value) {
    const pending = [{ value }];
    const ancestors = new WeakSet();
    while (pending.length > 0) {
        const item = pending.pop();
        const current = item.value;
        if (item.exiting) {
            ancestors.delete(current);
            continue;
        }
        if (current === null ||
            typeof current === "string" ||
            typeof current === "boolean")
            continue;
        if (typeof current === "number") {
            if (!Number.isFinite(current))
                return false;
            continue;
        }
        if (typeof current !== "object" ||
            (!isPlainObject(current) && !Array.isArray(current)) ||
            ancestors.has(current))
            return false;
        ancestors.add(current);
        pending.push({ value: current, exiting: true });
        if (Array.isArray(current)) {
            if (!hasOnlyJsonArrayProperties(current))
                return false;
            for (let index = 0; index < current.length; index += 1) {
                if (!Object.hasOwn(current, index))
                    return false;
                pending.push({ value: current[index] });
            }
            continue;
        }
        for (const key of Reflect.ownKeys(current)) {
            if (typeof key !== "string")
                return false;
            const descriptor = Object.getOwnPropertyDescriptor(current, key);
            if (!descriptor?.enumerable || !("value" in descriptor))
                return false;
            pending.push({ value: descriptor.value });
        }
    }
    return true;
}
export function isJsonObject(value) {
    return isPlainObject(value) && isJsonValue(value);
}
export function cloneJsonObject(value) {
    if (!isJsonObject(value))
        throw new PlayableStateError("invalid-state", "Project State must be a JSON-serializable object.");
    return structuredClone(value);
}
export function createPlayableState(initialState) {
    return cloneJsonObject(initialState);
}
export function setPlayableState(initialState, state, key, value) {
    return patchPlayableState(initialState, state, { [key]: value });
}
export function patchPlayableState(initialState, state, values) {
    if (!isJsonObject(initialState) ||
        !isJsonObject(state) ||
        !isJsonObject(values)) {
        throw new PlayableStateError("invalid-state", "Project State updates must contain only JSON values.");
    }
    for (const key of new Set([...Object.keys(state), ...Object.keys(values)])) {
        if (!Object.hasOwn(initialState, key)) {
            throw new PlayableStateError("unknown-state-key", `Project State key "${key}" is not declared in initialState.`);
        }
    }
    return structuredClone({ ...state, ...values });
}
function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function hasOnlyJsonArrayProperties(value) {
    return Reflect.ownKeys(value).every((key) => {
        if (key === "length")
            return true;
        if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key))
            return false;
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index >= value.length)
            return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor?.enumerable === true && "value" in descriptor;
    });
}
