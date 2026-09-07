// Copy the shape into frontend/src/modules/<your-module>/index.js.
// Preview with /?preview=resume#resume (replace resume with your module key).
export function mount(container, { api, getState, subscribe, signal }) {
  const heading = document.createElement("h1");
  heading.textContent = "模块接入示例";
  const text = document.createElement("p");
  const update = (state) => {
    text.textContent = state.resumeId ? "已选择简历，可以继续本模块操作。" : "请先在工作台完成一次诊断。";
  };
  container.replaceChildren(heading, text);
  update(getState());
  const unsubscribe = subscribe(update);
  signal.addEventListener("abort", unsubscribe, { once: true });
  // Call public endpoints with api.request(...) when implementing your own feature.
  // Never inject resume/JD/API text through innerHTML.
  return unsubscribe;
}
