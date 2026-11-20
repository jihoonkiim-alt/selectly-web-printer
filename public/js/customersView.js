import { getOrders } from './api.js';
import { groupByCustomer, shippingFee, buildCsv } from './invoiceService.js';

const fromDateInput = document.getElementById('fromDate');
const toDateInput = document.getElementById('toDate');
const resetFilterBtn = document.getElementById('resetFilter');
const rowsEl = document.getElementById('customerRows');
const receiptContainer = document.getElementById('receiptContainer');
const summaryEl = document.getElementById('summary');
const headerCells = document.querySelectorAll('th[data-sort]');

let allOrders = [];
let sortKey = 'subtotal';
let sortDesc = true;
let openCustomerKey = null;
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

  const box = document.createElement('div');
  box.className = 'receipt';
  box.innerHTML = `
    <h3>${escapeHtml(customer.displayName)} 영수증 (Receipt)</h3>
    <table>
      <thead><tr><th>내용 (Item)</th><th>금액 (Amount, 원/KRW)</th></tr></thead>
      <tbody>
        ${customer.items
          .map(
            (item) =>
              `<tr><td>${escapeHtml(item.content)}</td><td>${item.amountWon.toLocaleString()}</td></tr>`
          )
          .join('')}
      </tbody>
    </table>
    <label class="non-printable"><input type="checkbox" id="islandCheck" ${isIsland ? 'checked' : ''} /> 도서산간 배송 (Island shipping)</label>
    <div>소계 (Subtotal): ${customer.subtotal.toLocaleString()}원</div>
    <div>배송비 (Shipping): ${shipping.toLocaleString()}원</div>
    <div class="total">합계 (Total): ${total.toLocaleString()}원</div>
    <div class="actions non-printable">
      <button id="downloadCsvBtn">CSV 다운로드 (Download CSV)</button>
      <button id="printReceiptBtn">인쇄/PDF 저장 (Print/Save PDF)</button>
    </div>
  `;
  receiptContainer.appendChild(box);

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

  document.getElementById('printReceiptBtn').addEventListener('click', () => {
    window.print();
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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

getOrders()
  .then((orders) => {
    allOrders = orders;
    render();
  })
  .catch((e) => {
    summaryEl.textContent = `주문 내역 로드 실패 (Failed to load orders): ${e.message}`;
  });
