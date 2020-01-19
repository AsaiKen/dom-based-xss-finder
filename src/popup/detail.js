import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap";
import "../styles/style.css";
import actions from '../models/extension-ui-actions';

const resultId = new URL(location.href).searchParams.get('resultId');

const pocButton = document.querySelector('#poc-button');
pocButton.addEventListener('click', function() {
  chrome.runtime.sendMessage({ action: actions.CHECK_AND_GENERATE_POC, resultId });
});

function setPocUrl(url) {
  const pocDiv = document.getElementById('poc');
  pocDiv.classList.remove('d-none');
  const pocUrlDiv = document.getElementById('poc-url');
  if (url) {
    [...pocUrlDiv.children].forEach(c => pocUrlDiv.removeChild(c));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.textContent = url;
    pocUrlDiv.appendChild(anchor);
  } else {
    pocUrlDiv.textContent = 'Not Found';
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === actions.SET_POC && msg.resultId === Number(resultId)) {
    const pocUrl = msg.pocUrl;
    setPocUrl(pocUrl);
    sendResponse();
  }
});

const removeButton = document.querySelector('#remove-button');
removeButton.addEventListener('click', function() {
  chrome.runtime.sendMessage({ action: actions.REMOVE, resultId }, () => {
    window.close();
  });
});

chrome.storage.local.get('results', async items => {
  let results = items.results || [];
  const result = results.find(r => r.id === Number(resultId));
  if (result) {
    document.title = `#${result.id} ${result.url}`;

    const sourceDiv = document.getElementById('source');
    const source = result.source;
    document.getElementById('source-label').textContent = source.label;
    const sourceStacktrace = source.stacktrace;
    for (let i = 0; i < sourceStacktrace.length; i++) {
      const trace = sourceStacktrace[i];
      const posDiv = document.createElement('li');
      posDiv.textContent = `at ${trace.url}:${trace.line}:${trace.column}`;
      sourceDiv.appendChild(posDiv);
      const codeDiv = document.createElement('code');
      codeDiv.textContent = `${trace.code}`;
      sourceDiv.appendChild(codeDiv);
    }

    const sinkDiv = document.getElementById('sink');
    const sink = result.sink;
    document.getElementById('sink-label').textContent = sink.label;
    const sinkStacktrace = sink.stacktrace;
    for (let i = 0; i < sinkStacktrace.length; i++) {
      const trace = sinkStacktrace[i];
      const posDiv = document.createElement('li');
      posDiv.textContent = `at ${trace.url}:${trace.line}:${trace.column}`;
      sinkDiv.appendChild(posDiv);
      const codeDiv = document.createElement('code');
      codeDiv.textContent = `${trace.code}`;
      sinkDiv.appendChild(codeDiv);
    }

    if (Object.keys(result).includes('pocUrl')) {
      setPocUrl(result.pocUrl);
    }
  }
});
