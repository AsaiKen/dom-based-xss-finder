import actions from '../models/extension-ui-actions';
import Interceptor from './interceptor';
import PocChecker from './poc-checker';
import {name} from '../../package';
import sourceMap from 'source-map';

sourceMap.SourceMapConsumer.initialize({
  "lib/mappings.wasm": "https://unpkg.com/source-map@0.7.3/lib/mappings.wasm"
});

const KEYWORD = '11111111';

class Background {
  constructor() {
    this.interceptor = new Interceptor();

    chrome.extension.onConnect.addListener(port => {
      if (port.name === name) {
        console.debug('port connected');
        port.onMessage.addListener(msg => {
          console.debug('port message received', msg);
          if (msg && msg.action) {
            if (msg.action === actions.IS_RUNNING) {
              port.postMessage({ isRunning: this.isRunning() });
              console.debug('isRunning', this.isRunning());
            } else if (msg.action === actions.START) {
              this.start();
            } else if (msg.action === actions.STOP) {
              this.stop();
            } else if (msg.action === actions.REMOVE) {
              this.remove(msg);
            } else if (msg.action === actions.REMOVE_ALL) {
              this.removeAll();
            }
          }
        });
      }
    });
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      console.debug('message received', msg);
      if (msg.action === actions.ADD_ALL) {
        msg.tabId = sender.tab.id;
        this.addAll(msg);
      } else if (msg.action === actions.REMOVE) {
        this.remove(msg);
      } else if (msg.action === actions.CHECK_AND_GENERATE_POC) {
        this.checkAndGeneratePoc(msg);
      }
      sendResponse();
    });
  }

  async checkAndGeneratePoc({ resultId }) {
    console.debug('checkAndGeneratePoc', resultId);
    const isRunning = this.isRunning();
    if (isRunning) {
      await this.stop();
    }
    const result = await this.getResult(resultId);
    result.pocUrl = null;
    console.debug('result', result);
    const urls = this.getPocUrls(result);
    for (const url of urls) {
      const detect = await this.checkOne(url);
      if (detect) {
        result.pocUrl = url;
        break;
      }
    }
    await this.updateResult(result);
    if (isRunning) {
      await this.start();
    }
  }

  updateResult(result) {
    return new Promise(resolve => {
      chrome.storage.local.get(['results'], async items => {
        const results = items.results || [];
        results.forEach(r => {
          if (r.id === result.id) {
            Object.assign(r, result);
          }
        });
        chrome.storage.local.set({ results }, async() => {
          chrome.runtime.sendMessage({ action: actions.SET_POC, resultId: result.id, pocUrl: result.pocUrl });
          resolve();
        });
      });
    });
  }

  getPocUrls({ url, source: { label } }) {
    const urls = [];

    const prefixes = [`javascript://alert(${KEYWORD})//`, `//katagaitai.net/${KEYWORD}/`];
    const suffixes = [`'-alert(${KEYWORD})-'`, `"-alert(${KEYWORD})-"`, `-alert(${KEYWORD})-`, `'"><img src=x onerror=alert(${KEYWORD})>`];

    if (label.includes('referrer')) {
      for (const suffix of suffixes) {
        urls.push(`https://katagaitai.net/302.php?src=${encodeURIComponent(url)}&${suffix}`);
      }
    } else {
      const o = new URL(url);
      let query = o.search.slice(1);
      if (!query) {
        o.search = 'dummy=dummy';
      }
      query = o.search.slice(1);
      if (query) {
        const namedValues = query.split('&');
        const params = [];
        for (const namedValue of namedValues) {
          const elems = namedValue.split('=');
          const name = elems[0];
          const value = elems.slice(1).join('=');
          params.push({ name, value });
        }
        for (let i = 0; i < params.length; i++) {
          const { name, value } = params[i];
          for (const prefix of prefixes) {
            const newParams = JSON.parse(JSON.stringify(params));
            newParams[i] = { name, value: prefix + value };
            const o2 = new URL(url);
            o2.search = newParams.map(({ name, value }) => `${name}=${value}`).join('&');
            urls.push(o2.toString());
          }
          for (const suffix of suffixes) {
            const newParams = JSON.parse(JSON.stringify(params));
            newParams[i] = { name, value: value + suffix };
            const o2 = new URL(url);
            o2.search = newParams.map(({ name, value }) => `${name}=${value}`).join('&');
            urls.push(o2.toString());
          }
        }
      }
      let hash = o.hash.slice(1);
      if (!hash) {
        o.hash = 'dummy';
      }
      hash = o.hash.slice(1);
      if (hash) {
        for (const prefix of prefixes) {
          const o2 = new URL(url);
          o2.hash = prefix + hash;
          urls.push(o2.toString());
        }
        for (const suffix of suffixes) {
          const o2 = new URL(url);
          o2.hash = hash + suffix;
          urls.push(o2.toString());
        }
      }
    }
    console.debug('urls', urls);
    return urls;
  }

  checkOne(url) {
    return new Promise(resolve => {
      console.debug('checkOne', url);
      chrome.windows.create({ url: 'about:blank' }, async window => {
        const tab = window.tabs[0];
        if (tab) {
          const checker = new PocChecker(window.id, tab.id, url, KEYWORD);
          await checker.start();
          const timeoutTimer = setTimeout(() => {
            console.debug('timeout', window.id);
            checker.setIdle();
          }, 5000);
          const checkTimer = setInterval(async() => {
            if (checker.isIdle()) {
              console.debug('idle', window.id);
              await checker.stop();
              clearTimeout(timeoutTimer);
              clearInterval(checkTimer);
              console.debug('checkOne done', url, checker.detect);
              resolve(checker.detect);
            }
          }, 100);
        }
      });
    });
  }

  getResult(resultId) {
    return new Promise(resolve => {
      chrome.storage.local.get('results', async items => {
        const results = items.results || [];
        resolve(results.find(r => r.id === Number(resultId)));
      });
    });
  }

  isRunning() {
    return this.interceptor.isRunning;
  }

  async start() {
    await this.interceptor.start();
    chrome.browserAction.setIcon({ path: './images/icon-green.png' });
    chrome.browserAction.setBadgeBackgroundColor({ color: '#FF0000' });
    await this.setCountBadge();
    console.debug('start');
  }

  async stop() {
    await this.interceptor.stop();
    chrome.browserAction.setIcon({ path: './images/icon-black.png' });
    chrome.browserAction.setBadgeBackgroundColor({ color: '#45C8F1' });
    await this.setCountBadge();
    console.debug('stop');
  }

  setCountBadge() {
    return new Promise(resolve => {
      chrome.storage.local.get('results', items => {
        const results = items.results || [];
        // console.debug('results', results);
        const count = Object.keys(results).length;
        if (count > 0) {
          chrome.browserAction.setBadgeText({ text: String(count) });
        } else {
          chrome.browserAction.setBadgeText({ text: this.isRunning() ? 'ON' : '' });
        }
        resolve();
      });
    });
  }

  remove({ resultId }) {
    return new Promise(resolve => {
      chrome.storage.local.get('results', async items => {
        let results = items.results || [];
        results = results.filter(r => r.id !== Number(resultId));
        chrome.storage.local.set({ results }, async() => {
          console.debug('remove', resultId);
          await this.setCountBadge();
          resolve();
        });
      });
    });
  }

  removeAll() {
    return new Promise(resolve => {
      chrome.storage.local.remove('results', async() => {
        console.debug('removeAll');
        await this.setCountBadge();
        resolve();
      });
    });
  }

  addAll({ tabId, results }) {
    return new Promise(resolve => {
      chrome.storage.local.get(['results', 'nextId'], async items => {
        const oldResults = items.results || [];
        let nextId = items.nextId || 1;
        for (const result of results) {
          result.id = nextId++;
          await this.setOriginalStacktrace({ tabId, result });
        }

        // remove same results
        function toJSON(r) {
          return JSON.stringify({
            url: r.url,
            source: {
              label: r.source.label,
              stacktrace: r.source.stacktrace.map(t => ({ url: t.url, line: t.line, column: t.column }))
            },
            sink: {
              label: r.sink.label,
              stacktrace: r.sink.stacktrace.map(t => ({ url: t.url, line: t.line, column: t.column }))
            },
          });
        }

        const oldJsons = oldResults.map(r => toJSON(r));
        console.debug('oldResults', oldResults);
        const diffResults = results.filter(r => !oldJsons.includes(toJSON(r)));
        console.debug('diffResults', diffResults);
        const newResults = [...oldResults, ...diffResults];
        chrome.storage.local.set({ results: newResults, nextId }, async() => {
          console.debug('newResults', newResults, 'nextId', nextId);
          await this.setCountBadge();
          resolve();
        });
      });
    });
  }

  setOriginalStacktrace({ tabId, result }) {
    return new Promise(async resolve => {
      await this.resolveStackTrace(result.source.stacktrace, tabId);
      await this.resolveStackTrace(result.sink.stacktrace, tabId);
      resolve();
    });
  }

  async resolveStackTrace(stacktrace, tabId) {
    const sourceMaps = this.interceptor.sourceMaps;
    const bodyMaps = this.interceptor.bodyMaps;
    for (let i = 0; i < stacktrace.length; i++) {
      const trace = stacktrace[i];
      // console.debug('trace', trace);
      const { url, line, column } = trace;
      const body = bodyMaps[JSON.stringify({ tabId, url })];
      if (body) {
        const offset = body.match(new RegExp(`^([^\n]*\n){${line - 1}}[^\n]{${column - 1}}`))[0].length;
        if (offset) {
          for (const key of Object.keys(sourceMaps)) {
            const sourceMapMeta = JSON.parse(key);
            if (sourceMapMeta.tabId === tabId && sourceMapMeta.url === url && sourceMapMeta.start <= offset && offset < sourceMapMeta.end) {
              const map = sourceMaps[key];
              // console.debug('resolveStackTrace', key, map);
              stacktrace[i] = await this.getOriginalTrace(trace, map, body.slice(0, sourceMapMeta.start).split('\n').length);
              break;
            }
          }
        } else {
          console.debug('no offset', { trace, body });
          stacktrace[i] = { url, line: 0, column: 0, code: 'unknown' };
        }
      } else {
        console.debug('no body', { trace });
        stacktrace[i] = { url, line: 0, column: 0, code: 'unknown' };
      }
    }
  }

  async getOriginalTrace(trace, map, startLine) {
    const { url, line, column } = trace;
    const consumer = await new sourceMap.SourceMapConsumer(map);
    try {
      // column start from 1
      // Position.column start from 0
      const pos = consumer.originalPositionFor({ line: line - startLine + 1, column: column - 1 });
      // console.debug('pos', pos);
      let code = map.sourcesContent[0].split('\n')[pos.line - 1].slice(pos.column);
      if (code.length > 255) {
        code = code.slice(0, 255) + '...';
      }
      return { url, line: pos.line + startLine - 1, column: pos.column + 1, code };
    } finally {
      consumer.destroy();
    }
  }
}

//mock
// import Result from '../models/result';
// import Source from "../models/source";
// import Sink from "../models/sink";
// const urls = [
//   'http://scan.example.com:3333/shop?keyword=aaa',
//   'http://scan.example.com:3333/shop?keyword=aaa',
//   'http://scan.example.com:3333/shop?keyword=aaa',
//   'http://scan.example.com:3333/shop?keyword=aaa',
// ];
// const results = [];
// for (let i = 0; i < urls.length; i++) {
//   const result = new Result({
//     id: i + 1,
//     url: urls[i],
//     source: new Source({
//       label: 'window.location.href',
//       stacktrace: ['http://scan.example.com:3333/shop?keyword=aaa:490:253', 'http://scan.example.com:3333/shop?keyword=aaa:409:1']
//     }),
//     sink: new Sink({
//       label: 'Element.innerHTML',
//       stacktrace: ['http://scan.example.com:3333/shop?keyword=aaa:490:5', 'http://scan.example.com:3333/shop?keyword=aaa:409:1']
//     })
//   });
//   results.push(result);
// }
// chrome.storage.local.set({ results, nextId: 5 }, () => {
//   console.debug('mock added');
// });

(async() => {
  const bg = new Background();
  await bg.setCountBadge();
  window.__dombasedxssfinder_background = bg;
})();
