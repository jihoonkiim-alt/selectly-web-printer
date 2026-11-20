import { getConfig, setConfig, sheetsReq } from './gasClient.js';

const urlInput = document.getElementById('urlInput');
const tokenInput = document.getElementById('tokenInput');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const resultText = document.getElementById('resultText');

const existing = getConfig();
if (existing) {
  urlInput.value = existing.url || '';
  tokenInput.value = existing.token || '';
}

saveBtn.addEventListener('click', () => {
  setConfig({ url: urlInput.value.trim(), token: tokenInput.value.trim() });
  resultText.textContent = '저장됨 (Saved).';
});

testBtn.addEventListener('click', async () => {
  setConfig({ url: urlInput.value.trim(), token: tokenInput.value.trim() });
  resultText.textContent = '테스트 중... (Testing...)';
  try {
    const res = await sheetsReq('getAll', { sheet: 'Orders' });
    resultText.textContent = `연결 성공 (Connected) — 주문 ${res.rows.length}건 (orders) 확인됨.`;
  } catch (e) {
    resultText.textContent = `연결 실패 (Connection failed): ${e.message}`;
  }
});
