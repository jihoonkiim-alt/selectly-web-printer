import { getOrders, deleteOrder, updateOrder } from './api.js';
import { groupByCustomer, shippingFee, buildCsv } from './invoiceService.js';
import * as ble from './bleClient.js';
import { buildReceiptTspl } from './tsplBuilder.js';

const fromDateInput = document.getElementById('fromDate');
const toDateInput = document.getElementById('toDate');
const resetFilterBtn = document.getElementById('resetFilter');
const downloadExcelBtn = document.getElementById('downloadExcelBtn');
const rowsEl = document.getElementById('customerRows');
const receiptContainer = document.getElementById('receiptContainer');
const summaryEl = document.getElementById('summary');
const headerCells = document.querySelectorAll('th[data-sort]');

let allOrders = [];
let sortKey = 'subtotal';
let sortDesc = true;
let openCustomerKey = null;
let editingItemId = null;
const islandFlags = new Map(); // displayName -> boolean

function dateOnly(isoString) {
  return isoString.slice(0, 10);
}

function filteredOrders() {
  const from = fromDateInput.value;
  const to = toDateInput.value;
  return allOrders.filter((o) => {
    const d = dateOnly(o.printedAt);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

async function refreshOrders() {
  allOrders = await getOrders();
  render();
}

function render() {
  const orders = filteredOrders();
  const customers = groupByCustomer(orders);

  customers.sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sortDesc ? -cmp : cmp;
  });

  summaryEl.textContent = `${customers.length}명 (customers) / 주문 ${orders.length}건 (orders)`;

  rowsEl.innerHTML = '';
  for (const customer of customers) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(customer.displayName)}</td>
      <td>${customer.count}</td>
      <td>${customer.subtotal.toLocaleString()}</td>
    `;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      openCustomerKey = openCustomerKey === customer.displayName ? null : customer.displayName;
      editingItemId = null;
      renderReceipt(customers);
    });
    rowsEl.appendChild(tr);
  }
  renderReceipt(customers);
}

function renderReceipt(customers) {
  receiptContainer.innerHTML = '';
  if (!openCustomerKey) return;
  const customer = customers.find((c) => c.displayName === openCustomerKey);
  if (!customer) return;

  const isIsland = islandFlags.get(customer.displayName) || false;
  const shipping = shippingFee({ isIsland });
  const total = customer.subtotal + shipping;

  const today = new Date().toISOString().slice(0, 10);

  const box = document.createElement('div');
  box.className = 'receipt';
  box.innerHTML = `
    <img class="r-logo" src="assets/selectly-logo.png" alt="Selectly" />
    <div class="r-sub">주문 영수증 (Order Receipt)</div>
    <div class="r-row"><span>고객 (Customer)</span><b>${escapeHtml(customer.displayName)}</b></div>
    <div class="r-row"><span>발행일 (Date)</span><span>${today}</span></div>
    <hr class="r-divider" />
    <table>
      <thead><tr><th>내용 (Item)</th><th>금액 (KRW)</th><th class="non-printable">작업</th></tr></thead>
      <tbody id="itemRows"></tbody>
    </table>
    <label class="non-printable"><input type="checkbox" id="islandCheck" ${isIsland ? 'checked' : ''} /> 도서산간 배송 (Island shipping)</label>
    <div class="r-totals">
      <div class="r-row"><span>소계 (Subtotal)</span><span>${customer.subtotal.toLocaleString()}원</span></div>
      <div class="r-row"><span>배송비 (Shipping)</span><span>${shipping.toLocaleString()}원</span></div>
    </div>
    <div class="r-total"><span class="label">합계 (Total)</span><span class="amount">${total.toLocaleString()}원</span></div>
    <div class="r-thanks">감사합니다 (Thank you for your order!)</div>
    <div class="actions non-printable">
      <button id="downloadCsvBtn">CSV 다운로드 (Download CSV)</button>
      <button id="downloadImageBtn">이미지 다운로드 (Download Image)</button>
      <button id="printReceiptBtn">인쇄/PDF 저장 (Print/Save PDF)</button>
    </div>
  `;
  receiptContainer.appendChild(box);

  const itemRowsEl = box.querySelector('#itemRows');
  for (const item of customer.items) {
    itemRowsEl.appendChild(renderItemRow(item, customer, customers));
  }

  document.getElementById('islandCheck').addEventListener('change', (e) => {
    islandFlags.set(customer.displayName, e.target.checked);
    renderReceipt(customers);
  });

  document.getElementById('downloadCsvBtn').addEventListener('click', () => {
    const csv = buildCsv(customer.items);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${customer.displayName}-영수증.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('downloadImageBtn').addEventListener('click', async () => {
    const hidden = box.querySelectorAll('.non-printable');
    hidden.forEach((el) => (el.style.display = 'none'));
    try {
      const canvas = await html2canvas(box, { backgroundColor: null, scale: 2 });
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${customer.displayName}-영수증.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    } catch (e) {
      alert(`이미지 생성 실패 (Image generation failed): ${e.message}`);
    } finally {
      hidden.forEach((el) => (el.style.display = ''));
    }
  });

  document.getElementById('printReceiptBtn').addEventListener('click', () => {
    window.print();
  });
}

function renderItemRow(item, customer, customers) {
  const tr = document.createElement('tr');

  if (editingItemId === item.id) {
    const tdContent = document.createElement('td');
    const contentInput = document.createElement('input');
    contentInput.type = 'text';
    contentInput.value = item.content;
    tdContent.appendChild(contentInput);

    const tdAmount = document.createElement('td');
    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.value = item.amountWon;
    amountInput.style.width = '90px';
    tdAmount.appendChild(amountInput);

    const tdActions = document.createElement('td');
    tdActions.className = 'non-printable r-item-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'primary';
    saveBtn.title = '저장 (Save)';
    saveBtn.textContent = '✔';
    const cancelBtn = document.createElement('button');
    cancelBtn.title = '취소 (Cancel)';
    cancelBtn.textContent = '✕';
    tdActions.append(saveBtn, cancelBtn);

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try {
        await updateOrder(item.id, {
          content: contentInput.value,
          amountWon: Number(amountInput.value) || 0,
        });
        editingItemId = null;
        await refreshOrders();
      } catch (e) {
        alert(`수정 실패 (Update failed): ${e.message}`);
        saveBtn.disabled = false;
      }
    });
    cancelBtn.addEventListener('click', () => {
      editingItemId = null;
      renderReceipt(customers);
    });

    tr.append(tdContent, tdAmount, tdActions);
    return tr;
  }

  tr.innerHTML = `
    <td>${escapeHtml(item.content)}</td>
    <td>${item.amountWon.toLocaleString()}</td>
  `;
  const tdActions = document.createElement('td');
  tdActions.className = 'non-printable r-item-actions';
  const editBtn = document.createElement('button');
  editBtn.title = '수정 (Edit)';
  editBtn.textContent = '✎';
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'danger';
  deleteBtn.title = '삭제 (Delete)';
  deleteBtn.textContent = '🗑';
  const reprintBtn = document.createElement('button');
  reprintBtn.title = '재인쇄 (Reprint)';
  reprintBtn.textContent = '🖨';
  tdActions.append(editBtn, deleteBtn, reprintBtn);
  tr.appendChild(tdActions);

  editBtn.addEventListener('click', () => {
    editingItemId = item.id;
    renderReceipt(customers);
  });

  deleteBtn.addEventListener('click', async () => {
    if (!confirm('이 주문을 삭제하시겠습니까? (Delete this order?)')) return;
    deleteBtn.disabled = true;
    try {
      await deleteOrder(item.id);
      await refreshOrders();
    } catch (e) {
      alert(`삭제 실패 (Delete failed): ${e.message}`);
      deleteBtn.disabled = false;
    }
  });

  reprintBtn.addEventListener('click', async () => {
    reprintBtn.disabled = true;
    try {
      if (!ble.isConnected()) await ble.connect();
      const tspl = buildReceiptTspl({
        authorName: item.authorName,
        printedAt: new Date(),
        content: item.content,
      });
      await ble.writeTspl(tspl);
    } catch (e) {
      alert(`재인쇄 실패 (Reprint failed): ${e.message}`);
    } finally {
      reprintBtn.disabled = false;
    }
  });

  return tr;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function buildAllOrdersWorkbook(orders, customers) {
  const orderRows = orders
    .slice()
    .sort((a, b) => a.printedAt.localeCompare(b.printedAt))
    .map((o) => ({
      '날짜 (Date)': dateOnly(o.printedAt),
      '고객명 (Customer)': o.authorName,
      '내용 (Content)': o.content,
      '금액 (Amount, KRW)': o.amountWon,
      '인쇄시각 (Printed At)': o.printedAt,
    }));
  const customerRows = customers.map((c) => ({
    '고객명 (Customer)': c.displayName,
    '건수 (Orders)': c.count,
    '소계 (Subtotal, KRW)': c.subtotal,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orderRows), 'Orders');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(customerRows), '고객별 합계');
  return wb;
}

downloadExcelBtn.addEventListener('click', () => {
  const orders = filteredOrders();
  const customers = groupByCustomer(orders);
  const wb = buildAllOrdersWorkbook(orders, customers);
  const from = fromDateInput.value;
  const to = toDateInput.value;
  const label = from || to ? `${from || '처음'}~${to || '오늘'}` : '전체';
  XLSX.writeFile(wb, `주문내역_${label}.xlsx`);
});

headerCells.forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sortKey === key) {
      sortDesc = !sortDesc;
    } else {
      sortKey = key;
      sortDesc = true;
    }
    render();
  });
});

fromDateInput.addEventListener('change', render);
toDateInput.addEventListener('change', render);
resetFilterBtn.addEventListener('click', () => {
  fromDateInput.value = '';
  toDateInput.value = '';
  render();
});

refreshOrders().catch((e) => {
  summaryEl.textContent = `주문 내역 로드 실패 (Failed to load orders): ${e.message}`;
});
