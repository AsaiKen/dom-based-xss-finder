import Debugger from './debugger';

export default class PocChecker {
  constructor(windowId, tabId, url, keyword) {
    this.windowId = windowId;
    this.tabId = tabId;
    this.debugger_ = new Debugger(tabId);
    this.url = url;
    this.keyword = keyword;
    this.detect = false;
    this._isIdle = false;
  }

  async start() {
    const debugger_ = this.debugger_;
    try {
      await debugger_.attach();
      console.debug('attached', { tabId: this.tabId });
    } catch (e) {
      console.error(e);
      return;
    }

    await debugger_.sendCommand('Page.enable');
    await debugger_.on('Page.javascriptDialogOpening', async({ message }) => {
      console.debug('message', message);
      if (message.includes(this.keyword)) {
        this.detect = true;
      }
      await debugger_.sendCommand('Page.handleJavaScriptDialog', { accept: true });
    });
    await debugger_.sendCommand('Page.setLifecycleEventsEnabled', { enabled: true });
    await debugger_.on('Page.lifecycleEvent', async({ name }) => {
      console.debug('lifecycleEvent', name);
      if (name === 'networkAlmostIdle') {
        await this.setIdle();
      }
    });
    await debugger_.sendCommand('Page.navigate', { url: this.url });
    console.debug('start', this.windowId);
  }

  isIdle() {
    return this._isIdle;
  }

  async setIdle() {
    console.debug('setIdle');
    this._isIdle = true;
  }

  stop() {
    return new Promise(async resolve => {
      chrome.windows.remove(this.windowId, () => {
        console.debug('remove', this.windowId);
        resolve();
      });
    });
  }
};