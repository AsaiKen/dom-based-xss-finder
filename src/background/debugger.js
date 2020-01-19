import EventEmitter from './event-emitter';

const DEBUGGER_PROTOCOL_VERSION = '1.3';

export default class Debugger extends EventEmitter {
  constructor(tabId) {
    super();
    this.tabId = tabId;
    this.boundOnEventHandler = this.onEventHandler.bind(this);
  }

  attach() {
    return new Promise((resolve, reject) => {
      const target = { tabId: this.tabId };
      chrome.debugger.attach(target, DEBUGGER_PROTOCOL_VERSION, () => {
        if (chrome.runtime.lastError) {
          //attached
          reject(chrome.runtime.lastError);
          return;
        }
        chrome.debugger.onEvent.addListener(this.boundOnEventHandler);
        resolve();
      });
    });
  }

  onEventHandler(source, method, params) {
    // console.debug(source, method, params);
    if (source.tabId === this.tabId) {
      this.emit(method, params);
    }
  }

  detach() {
    return new Promise((resolve, reject) => {
      chrome.debugger.onEvent.removeListener(this.boundOnEventHandler);
      const target = { tabId: this.tabId };
      chrome.debugger.detach(target, () => {
        if (chrome.runtime.lastError && chrome.runtime.lastError.message) {
          console.debug(chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  }

  sendCommand(command, params) {
    return new Promise((resolve, reject) => {
      const target = { tabId: this.tabId };
      chrome.debugger.sendCommand(target, command, params, result => {
        if (chrome.runtime.lastError && chrome.runtime.lastError.message) {
          console.debug(chrome.runtime.lastError.message);
        }
        resolve(result);
      });
    });
  }
};