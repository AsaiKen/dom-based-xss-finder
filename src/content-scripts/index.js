import actions from '../models/extension-ui-actions';

if (!window.__dombasedxssfinder_contentscript) {
  window.__dombasedxssfinder_contentscript = true;
  setInterval(() => {
    const elements = document.querySelectorAll('.__dombasedxssfinder_result');
    if (elements.length > 0) {
      console.debug(elements);
    }
    const results = [];
    for (const e of elements) {
      const result = JSON.parse(e.textContent);
      if (/jquery|google/.test(result.source.stacktrace[0].url)) {
        continue;
      }
      results.push(result);
    }
    for (const e of elements) {
      e.parentElement.removeChild(e);
    }
    if (results.length > 0) {
      chrome.runtime.sendMessage({ action: actions.ADD_ALL, results });
    }
  }, 100);
  console.debug(`content-scripts at ${location.href}`);
}