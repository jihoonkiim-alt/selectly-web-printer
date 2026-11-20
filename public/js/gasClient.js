// JSONP client for the Google Apps Script backend — ported from the proven
// `sheetsReq` pattern in ~/shanes-shop-groupware/index.html (Shane's Online
// Shop order-management app), which already works in production. JSONP
// (script-tag injection) sidesteps GAS Web Apps' CORS limitations entirely.
//
// The Web App URL + shared token are NOT hardcoded here — this file ships
// in a public GitHub repo, so secrets live only in this browser's
// localStorage (set via settings.html), same as Shane's Shop's SCRIPT_URL
// field. Whoever views the public page source sees no secret.
const CONFIG_KEY = 'selectly_gas_config'; // {url, token}
let _reqN = 0;

export function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function sheetsReq(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const config = getConfig();
    if (!config || !config.url || !config.token) {
      reject(new Error('GAS 설정이 안 되어 있습니다 (GAS not configured) — settings.html에서 설정하세요.'));
      return;
    }

    const cb = 'gs_' + Date.now() + '_' + ++_reqN;
    const params = new URLSearchParams({ action, callback: cb, token: config.token });
    if (payload.sheet) params.set('sheet', payload.sheet);
    if (payload.id !== undefined) params.set('id', payload.id);
    if (payload.row) params.set('row', JSON.stringify(payload.row));

    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('GAS 요청 시간 초과 (request timed out)'));
    }, 10000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[cb];
      if (script.parentNode) script.remove();
    }

    window[cb] = (data) => {
      cleanup();
      if (!data) {
        reject(new Error('GAS 응답 없음 (no response)'));
      } else if (data.ok === false) {
        reject(new Error(data.error || 'GAS 에러 (GAS error)'));
      } else {
        resolve(data);
      }
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('GAS 요청 실패 (request failed)'));
    };
    script.src = config.url + '?' + params.toString();
    document.head.appendChild(script);
  });
}
