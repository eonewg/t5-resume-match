// DOM-only presentation helpers. Never transform submitted values or model output.
export function fieldStatus(value, protectedField, reviewed) {
  const filled = Array.isArray(value) ? value.some(item => item.trim()) : Boolean(value.trim());
  if (!filled) return {text: '未填写', tone: 'neutral'};
  if (reviewed) return {text: '已确认', tone: 'success'};
  return protectedField ? {text: '已修改', tone: 'neutral'} : {text: '待核对', tone: 'neutral'};
}

export function renderChips(container, values, empty = '暂未提供') {
  const items = values.map(value => {
    const item = document.createElement('span'); item.className = 'chip'; item.textContent = value; return item;
  });
  if (!items.length) {
    const item = document.createElement('span'); item.className = 'helper-text'; item.textContent = empty; items.push(item);
  }
  container.replaceChildren(...items);
}

export function setFeedback(element, {busy = false, error = false, success = false} = {}) {
  element.dataset.state = error ? 'error' : busy ? 'busy' : success ? 'success' : 'neutral';
  element.dataset.error = String(Boolean(error));
}

export function suggestionText(element, text) {
  // Highlight only explicit model placeholders, preserving every character and XSS safety.
  element.replaceChildren();
  for (const part of text.split(/(【(?:待补充|待核实|待确认)[^】]*】)/g)) {
    const child = document.createElement(/^【(?:待补充|待核实|待确认)[^】]*】$/.test(part) ? 'mark' : 'span');
    child.textContent = part; element.append(child);
  }
}
