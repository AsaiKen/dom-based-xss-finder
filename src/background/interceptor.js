import Debugger from './debugger';
import convert from './convert';
import iconv from 'iconv-lite';
import Encoding from 'encoding-japanese';

let PRELOAD_SOURCE = null;

export default class Interceptor {
  constructor() {
    this.isRunning = false;
    /** @type {Debugger[]} */
    this.debuggers = [];
    this.sourceMaps = {};
    this.jsCache = {};
    this.bodyMaps = {};

    this.boundOnCreatedHandler = this.onCreatedHandler.bind(this);
    this.boundOnBeforeNavigateHandler = this.onBeforeNavigateHandler.bind(this);
    this.boundOnDOMContentLoadedHandler = this.onDOMContentLoadedHandler.bind(this);
    this.boundOnDetachHandler = this.onDetachHandler.bind(this);
  }

  async start() {
    if (PRELOAD_SOURCE === null) {
      const url = chrome.runtime.getURL("preload.js");
      const response = await fetch(url);
      PRELOAD_SOURCE = await response.text();
    }
    this.isRunning = true;
    chrome.windows.getAll({ populate: true }, async windows => {
      for (const w of windows) {
        for (const tab of w.tabs) {
          // console.debug('tab', tab);
          await this.attach({ tabId: tab.id, url: tab.url });
        }
      }
    });
    chrome.tabs.onCreated.addListener(this.boundOnCreatedHandler);
    chrome.webNavigation.onBeforeNavigate.addListener(this.boundOnBeforeNavigateHandler);
    chrome.webNavigation.onDOMContentLoaded.addListener(this.boundOnDOMContentLoadedHandler);
    chrome.debugger.onDetach.addListener(this.boundOnDetachHandler);
  }

  async onCreatedHandler({ id, url }) {
    console.debug('onCreated', { id, url });
    await this.attach({ tabId: id, url });
  }

  async onBeforeNavigateHandler({ tabId, frameId, url }) {
    console.debug('onBeforeNavigate', { tabId, frameId, url });
    if (frameId === 0) {
      // mainframe navigated
      for (const key of Object.keys(this.sourceMaps)) {
        const o = JSON.parse(key);
        if (o.tabId === tabId) {
          // console.debug('remove sourceMaps', key);
          delete this.sourceMaps[key];
        }
      }
      for (const key of Object.keys(this.bodyMaps)) {
        const o = JSON.parse(key);
        if (o.tabId === tabId) {
          // console.debug('remove sourceMaps', key);
          delete this.bodyMaps[key];
        }
      }
    }
  }

  async onDOMContentLoadedHandler({ tabId, url }) {
    console.debug('onDOMContentLoaded', { tabId, url });
    chrome.tabs.executeScript(tabId, { file: 'content-script.js', allFrames: true });
  }

  async onDetachHandler({ tabId }) {
    console.debug('onDetach', { tabId });
    if (this.isRunning) {
      for (const debugger_ of this.debuggers) {
        if (debugger_.tabId === tabId) {
          chrome.tabs.get(tabId, async() => {
            if (chrome.runtime.lastError) {
              // closed
              return;
            }
            try {
              await debugger_.attach();
              console.debug('re-attached', { tabId });
            } catch (e) {
              console.error(e);
            }
          });
          break;
        }
      }
    }
  }

  async attach({ tabId, url }) {
    if (url === '' || url.startsWith('http://') || url.startsWith('https://')) {
      if (this.debuggers.some(d => d.tabId === tabId)) {
        // already attached
      } else {
        const debugger_ = new Debugger(tabId);
        try {
          await debugger_.attach();
          console.debug('attached', { tabId });
        } catch (e) {
          console.error(e);
          return;
        }
        await this.setInterceptor(debugger_);
        this.debuggers.push(debugger_);
        chrome.tabs.executeScript(tabId, { file: 'content-script.js', allFrames: true }, () => {
          if (chrome.runtime.lastError && chrome.runtime.lastError.message) {
            // console.debug(chrome.runtime.lastError.message);
          }
        });
      }
    }
  };

  async stop() {
    this.isRunning = false;
    for (const debugger_ of this.debuggers) {
      await debugger_.sendCommand('Network.clearBrowserCache');
      await debugger_.detach();
      console.debug('detached', { tabId: debugger_.tabId });
    }
    this.debuggers = [];
    this.sourceMaps = {};
    this.jsCache = {};
    this.bodyMaps = {};
    chrome.tabs.onCreated.removeListener(this.boundOnCreatedHandler);
    chrome.webNavigation.onBeforeNavigate.removeListener(this.boundOnBeforeNavigateHandler);
    chrome.webNavigation.onDOMContentLoaded.removeListener(this.boundOnDOMContentLoadedHandler);
    chrome.debugger.onDetach.removeListener(this.boundOnDetachHandler);
  }

  /**
   * set interception
   * @param debugger_ {Debugger}
   * @returns {Promise<void>}
   */
  async setInterceptor(debugger_) {
    await debugger_.sendCommand('Page.enable');
    await debugger_.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: PRELOAD_SOURCE });

    await debugger_.sendCommand('Network.enable');
    await debugger_.sendCommand('Network.setRequestInterception', {
      patterns: [
        {
          urlPattern: '*',
          resourceType: 'Document',
          interceptionStage: 'HeadersReceived'
        },
        {
          urlPattern: '*',
          resourceType: 'Script',
          interceptionStage: 'HeadersReceived'
        }

      ],
    });
    await debugger_.sendCommand('Network.clearBrowserCache');

    await debugger_.on('Network.requestIntercepted', async({ interceptionId, resourceType, responseStatusCode, responseHeaders, request }) => {
      if (responseStatusCode === 200 && ['Document', 'Script'].includes(resourceType)
          && (request.url.startsWith('http://') || request.url.startsWith('https://'))) {
        // OK
      } else {
        await debugger_.sendCommand('Network.continueInterceptedRequest', { interceptionId });
        return;
      }
      if (resourceType === 'Script' && this.jsCache[request.url]) {
        // console.debug('cache hit', request.url);
        const { start, end, map, rawResponse, body } = this.jsCache[request.url];
        this.setSourceMap(debugger_.tabId, request.url, start, end, map);
        this.setBodyMap(debugger_.tabId, request.url, body);
        await debugger_.sendCommand('Network.continueInterceptedRequest', {
          interceptionId,
          rawResponse,
        });
        return;
      }

      let interceptTime = Date.now();
      const { body, base64Encoded } = await debugger_.sendCommand(
          'Network.getResponseBodyForInterception',
          { interceptionId },
      );
      const headerLines = [];
      for (const key of Object.keys(responseHeaders)) {
        if (key.toLowerCase() === 'content-type') {
          if (responseHeaders[key].toLowerCase().includes('text') || responseHeaders[key].toLowerCase().includes('javascript')) {
            // OK
          } else {
            // not text
            await debugger_.sendCommand('Network.continueInterceptedRequest', { interceptionId });
            return;
          }
        }
        headerLines.push(`${key}: ${responseHeaders[key]}`);
      }
      let originalBodyStr;
      if (base64Encoded) {
        // assume utf8
        originalBodyStr = Buffer.from(body, 'base64').toString();
      } else {
        originalBodyStr = body;
      }

      let encoding = null;
      if (base64Encoded) {
        for (const key of Object.keys(responseHeaders)) {
          const value = responseHeaders[key];
          if (key.toLowerCase() === 'content-type' && value.includes('charset=')) {
            const m = value.match(/charset=['"]?([\w-]+)/);
            if (m) {
              encoding = m[1].trim();
              // console.debug('encoding', encoding);
            }
          }
        }
        if (resourceType === 'Document') {
          if (originalBodyStr.includes(`charset=`)) {
            const m = originalBodyStr.match(/charset=['"]?([\w-]+)/);
            if (m) {
              encoding = m[1].trim();
              // console.debug('encoding', encoding);
            }
          }
        }
        if (!encoding) {
          // auto-detect
          encoding = Encoding.detect(Buffer.from(body, 'base64'));
          // console.debug('encoding', encoding);
        }
        if (encoding) {
          originalBodyStr = iconv.decode(Buffer.from(body, 'base64'), encoding);
        }
      }

      // console.debug('originalBodyStr', originalBodyStr);
      let newBodyStr = null;
      let start = null;
      let end = null;
      let map = null;
      let convertTime = Date.now();
      if (resourceType === 'Document') {
        newBodyStr = originalBodyStr;
        const scriptTagStrs = originalBodyStr.match(/<script[^/>]*?>[\s\S]+?<\/script>/ig);
        for (const scriptTagStr of scriptTagStrs || []) {
          const originalCode = scriptTagStr.match(/<script[^/>]*?>(?:\s*<!--)?\s*(\S[\s\S]+?\S)\s*(?:-->\s*)?<\/script>/)[1];
          const converted = convert(originalCode);
          const code = converted.code;
          start = newBodyStr.indexOf(originalCode);
          end = start + code.length + 1;
          map = converted.map;
          newBodyStr = newBodyStr.replace(originalCode, code);
          this.setSourceMap(debugger_.tabId, request.url, start, end, map);
        }
      } else if (resourceType === 'Script') {
        const converted = convert(originalBodyStr);
        const code = converted.code;
        newBodyStr = code;
        start = 0;
        end = code.length + 1;
        map = converted.map;
        this.setSourceMap(debugger_.tabId, request.url, start, end, map);
      } else {
        throw new Error();
      }
      // console.debug('newBodyStr', newBodyStr);
      convertTime = Date.now() - convertTime;
      console.debug(request.url, 'convert', `${convertTime} ms`);

      let rawResponse;
      if (encoding) {
        const bodyBuf = iconv.encode(newBodyStr, encoding);
        rawResponse = Buffer.concat([Buffer.from(`HTTP/1.1 200 OK\r\n${headerLines.join('\r\n')}\r\n\r\n`), bodyBuf]).toString('base64');
      } else {
        rawResponse = Buffer.from(`HTTP/1.1 200 OK\r\n${headerLines.join('\r\n')}\r\n\r\n${newBodyStr}`).toString('base64');
      }

      if (resourceType === 'Script') {
        this.jsCache[request.url] = { start, end, map, rawResponse, body: newBodyStr };
        setTimeout(() => delete this.jsCache[request.url], 1000 * 60 * 60 * 24);
      }
      this.setBodyMap(debugger_.tabId, request.url, newBodyStr);

      await debugger_.sendCommand('Network.continueInterceptedRequest', {
        interceptionId,
        rawResponse,
      });
      interceptTime = Date.now() - interceptTime;
      console.debug(request.url, 'intercept', `${interceptTime} ms`);
    });
  }

  setSourceMap(tabId, url, start, end, map) {
    const key = JSON.stringify({ tabId, url, start, end });
    this.sourceMaps[key] = map;
  }

  setBodyMap(tabId, url, body) {
    const key = JSON.stringify({ tabId, url });
    this.bodyMaps[key] = body;
  }
};