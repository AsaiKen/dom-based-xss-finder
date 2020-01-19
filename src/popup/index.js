import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap";
import "../styles/style.css";
import '@fortawesome/fontawesome-free/js/fontawesome';
import '@fortawesome/fontawesome-free/js/solid';
import '@fortawesome/fontawesome-free/js/regular';
import actions from '../models/extension-ui-actions';
import {name} from '../../package';

class Popup {
  constructor() {
    this.port = chrome.extension.connect({ name });
    this.startButton = document.querySelector('#enable-button');
    this.stopButton = document.querySelector('#disable-button');
    // this.settingButton = document.querySelector('#setting-button');
    this.removeAllButton = document.querySelector('#remove-all-button');

    this.port.postMessage({ action: actions.IS_RUNNING });
    this.port.onMessage.addListener(({ isRunning }) => {
      if (typeof isRunning === 'boolean') {
        if (isRunning) {
          this.showStartButton();
        } else {
          this.showStopButton();
        }
      }
    });

    this.startButton.addEventListener('click', () => {
      this.start();
    });
    this.stopButton.addEventListener('click', () => {
      this.stop();
    });

    // this.settingButton.addEventListener('click', () => {
    //   chrome.runtime.openOptionsPage();
    // });

    this.removeAllButton.addEventListener('click', () => {
      this.removeAll();
    });

    this.loadResults();
  }

  loadResults() {
    chrome.storage.local.get('results', items => {
      const results = items.results || [];
      for (const result of results.sort((a, b) => a.id - b.id)) {
        this.add(result);
      }
    });
  }

  showStartButton() {
    this.startButton.classList.add('d-none');
    this.stopButton.classList.remove('d-none');
  }

  start() {
    this.showStartButton();
    this.port.postMessage({ action: actions.START });
  }

  showStopButton() {
    this.startButton.classList.remove('d-none');
    this.stopButton.classList.add('d-none');
  }

  stop() {
    this.showStopButton();
    this.port.postMessage({ action: actions.STOP });
  }

  removeAll() {
    console.debug('removeAll');
    this.port.postMessage({ action: actions.REMOVE_ALL });
    const results = document.querySelectorAll('.row-result');
    for (const result of results) {
      result.parentElement.removeChild(result);
    }
  }

  add(result) {
    const id = result.id;
    const url = result.url;
    const resultContainer = document.querySelector('#container-result');
    const template = document.querySelector('#row-result-template');
    const content = template.content;
    content.querySelector('.row-result').id = 'result-' + id;
    content.querySelector('.col-result-id').innerText = id;
    const resultUrl = content.querySelector('.col-result-url');
    resultUrl.textContent = url;
    content.querySelector('.result-detail-button').dataset.resultId = id;
    content.querySelector('.result-remove-button').dataset.resultId = id;
    const element = document.importNode(content, true);
    const detailButton = element.querySelector('.result-detail-button');
    detailButton.addEventListener('click', () => {
      this.detail(result.id);
    });
    const removeButton = element.querySelector('.result-remove-button');
    removeButton.addEventListener('click', () => {
      this.remove(result.id);
    });
    resultContainer.appendChild(element);
  }

  detail(resultId) {
    chrome.windows.create({
      url: chrome.runtime.getURL("detail.html") + '?resultId=' + resultId,
      type: "popup"
    });
  }

  remove(resultId) {
    this.port.postMessage({ action: actions.REMOVE, resultId });
    const result = document.getElementById('result-' + resultId);
    if (result) {
      result.parentElement.removeChild(result);
    }
  }
}

window.__dombasedxssfinder_popup = new Popup();
