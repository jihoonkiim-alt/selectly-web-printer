import { parseComments } from './commentParser.js';
import { detectAmount, buildContent } from './printDecision.js';
import { buildReceiptTspl, buildTestLabelTspl } from './tsplBuilder.js';
import * as ble from './bleClient.js';
import { addOrder } from './api.js';
import { todayKey, saveSession, loadSession, listDates, pruneOld } from './sessionStore.js';

const rawInput = document.getElementById('rawInput');
const parseBtn = document.getElementById('parseBtn');
const clearBtn = document.getElementById('clearBtn');
const listEl = document.getElementById('list');
const modalRoot = document.getElementById('modalRoot');
const connectBtn = document.getElementById('connectBtn');
const testPrintBtn = document.getElementById('testPrintBtn');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('statusText');
const historySelect = document.getElementById('historySelect');
const backToTodayBtn = document.getElementById('backToTodayBtn');
const historyBanner = document.getElementById('historyBanner');

let comments = []; // {authorName, content, printed}
let viewedDate = todayKey();
let readOnly = false;

function updateStatus() {
  const connected = ble.isConnected();
  statusEl.classList.toggle('connected', connected);
  statusText.textContent = connected ? '프린터 연결됨 (Connected)' : '연결 안 됨 (Not connected)';
}

connectBtn.addEventListener('click', async () => {
  try {
    const info = await ble.connect();
    updateStatus();
    alert(`연결됨 (Connected): ${info.deviceName}`);
  } catch (e) {
    updateStatus();
    alert(`연결 실패 (Connection failed): ${e.message}`);
  }
});

testPrintBtn.addEventListener('click', async () => {
  try {
    if (!ble.isConnected()) await ble.connect();
    await ble.writeTspl(buildTestLabelTspl());
    updateStatus();
  } catch (e) {
    updateStatus();
    alert(`테스트 인쇄 실패 (Test print failed): ${e.message}`);
  }
});

parseBtn.addEventListener('click', () => {
  if (readOnly) return;
  const parsed = parseComments(rawInput.value);
  comments = parsed.map((c) => ({ ...c, printed: false }));
  renderList();
  persistCurrent();
});

clearBtn.addEventListener('click', () => {
  if (readOnly) return;
  rawInput.value = '';
  comments = [];
  renderList();
  persistCurrent();
});

rawInput.addEventListener('input', () => {
  if (readOnly) return;
  persistCurrent();
});

function persistCurrent() {
  if (readOnly) return;
  saveSession(viewedDate, { rawText: rawInput.value, comments });
  refreshHistoryOptions();
}

function renderList() {
  listEl.innerHTML = '';
  if (comments.length === 0) {
    listEl.innerHTML = '<p style="color:#888;">파싱된 댓글이 없습니다. (No parsed comments.)</p>';
    return;
  }
  comments.forEach((c, index) => {
    const row = document.createElement('div');
    row.className = 'comment-row' + (c.printed ? ' printed' : '');
    row.innerHTML = `
      <div class="text">
        <div class="author">${escapeHtml(c.authorName)}</div>
        <div class="content">${escapeHtml(c.content)}</div>
      </div>
      ${c.printed ? '<span class="badge">인쇄됨 (Printed)</span>' : ''}
    `;
    if (!readOnly) {
      row.addEventListener('click', () => openModal(index));
    } else {
      row.style.cursor = 'default';
    }
    listEl.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openModal(index) {
  const comment = comments[index];
  const detected = detectAmount(comment.content);

  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <h3>인쇄 확인 (Confirm Print)</h3>
        <label>이름 (Name)</label>
        <input type="text" id="modalName" value="${escapeAttr(comment.authorName)}" />
        <label>금액 (Amount, K단위 / in thousands — 예: 7 = 7000원) — 댓글에 이미 있으면 비워두세요 (leave blank if already in the comment)</label>
        <input type="number" id="modalAmount" value="${detected ?? ''}" ${detected ? 'disabled' : ''} />
        <label>미리보기 (Preview)</label>
        <div class="preview" id="modalPreview"></div>
        <div class="error-text" id="modalError"></div>
        <div class="modal-actions">
          <button id="modalCancel">취소 (Cancel)</button>
          <button id="modalPrint" class="primary">인쇄 (Print)</button>
        </div>
      </div>
    </div>
  `;

  const nameInput = document.getElementById('modalName');
  const amountInput = document.getElementById('modalAmount');
  const previewEl = document.getElementById('modalPreview');
  const errorEl = document.getElementById('modalError');

  function refreshPreview() {
    const finalContent = buildContent({
      message: comment.content,
      enteredAmount: amountInput.disabled ? null : amountInput.value,
    });
    previewEl.textContent = finalContent;
  }
  refreshPreview();
  amountInput.addEventListener('input', refreshPreview);

  document.getElementById('modalCancel').addEventListener('click', closeModal);

  document.getElementById('modalPrint').addEventListener('click', async () => {
    errorEl.textContent = '';
    const authorName = nameInput.value.trim();
    if (!authorName) {
      errorEl.textContent = '이름을 입력해주세요. (Please enter a name.)';
      return;
    }
    const finalContent = buildContent({
      message: comment.content,
      enteredAmount: amountInput.disabled ? null : amountInput.value,
    });

    let printedAt;
    try {
      if (!ble.isConnected()) {
        errorEl.textContent = '프린터 연결 중... (Connecting to printer...)';
        await ble.connect();
        updateStatus();
      }
      printedAt = new Date();
      const tspl = buildReceiptTspl({ authorName, printedAt, content: finalContent });
      await ble.writeTspl(tspl);
    } catch (e) {
      errorEl.textContent = `인쇄 실패 (Print failed): ${e.message}`;
      updateStatus();
      return;
    }

    // The label is physically printed at this point — mark it printed and
    // close the modal regardless of what happens next, so the operator
    // never sees "print failed" (and re-clicks, printing a duplicate
    // label) for something that's actually a record-saving problem.
    comment.printed = true;
    renderList();
    persistCurrent();
    closeModal();

    try {
      const detectedFinal = detectAmount(finalContent);
      const amountWon = detectedFinal ? Math.round(parseFloat(detectedFinal) * 1000) : 0;

      await addOrder({
        authorName,
        content: finalContent,
        amountWon,
        printedAt: printedAt.toISOString(),
      });
    } catch (e) {
      alert(
        `라벨은 출력됐지만 주문 기록 저장에 실패했습니다 (Label printed, but failed to save the order record): ${e.message}\n` +
          '고객목록 매출 집계에서 빠지니 수동으로 확인해주세요. (This order will be missing from customer totals — please note it down manually.)'
      );
    }
  });
}

function escapeAttr(str) {
  return str.replaceAll('"', '&quot;');
}

function closeModal() {
  modalRoot.innerHTML = '';
}

// --- 지난 기록 (past records) ---

function refreshHistoryOptions() {
  const dates = listDates();
  const today = todayKey();
  if (!dates.includes(today)) dates.unshift(today);
  dates.sort().reverse();

  const previousValue = historySelect.value || viewedDate;
  historySelect.innerHTML = '';
  for (const d of dates) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d === today ? `오늘 (Today) — ${d}` : d;
    historySelect.appendChild(opt);
  }
  historySelect.value = dates.includes(previousValue) ? previousValue : today;
}

function setReadOnlyUI(isReadOnly) {
  readOnly = isReadOnly;
  rawInput.disabled = readOnly;
  parseBtn.disabled = readOnly;
  clearBtn.disabled = readOnly;
  backToTodayBtn.style.display = readOnly ? '' : 'none';
  historyBanner.style.display = readOnly ? '' : 'none';
}

function loadDate(dateKey) {
  viewedDate = dateKey;
  const saved = loadSession(dateKey);
  rawInput.value = saved?.rawText || '';
  comments = saved?.comments || [];
  setReadOnlyUI(dateKey !== todayKey());
  renderList();
}

historySelect.addEventListener('change', () => {
  loadDate(historySelect.value);
});

backToTodayBtn.addEventListener('click', () => {
  historySelect.value = todayKey();
  loadDate(todayKey());
});

pruneOld();
refreshHistoryOptions();
loadDate(todayKey());
updateStatus();
