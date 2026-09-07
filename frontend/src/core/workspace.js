export function createWorkspace() {
  let state = { resumeId: null, jdId: null, result: null, isMock: true };
  const listeners = new Set();
  const getState = () => structuredClone(state);
  return {
    getState,
    updateSelection(update) {
      const allowed = ["resumeId", "jdId", "result", "isMock"];
      if (Object.keys(update).some((key) => !allowed.includes(key))) throw new Error("Unknown workspace field");
      state = { ...state, ...structuredClone(update) };
      listeners.forEach((listener) => listener(getState()));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
