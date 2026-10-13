let currentPage = 1;
let currentStatus = 'all';
let currentSearch = '';
let totalPages = 1;

async function login() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errBox = document.getElementById('login-error');
  errBox.textContent = '';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      errBox.textContent = data.error || 'Login failed';
      return;
    }
    initDashboard(data.username);
  } catch (e) {
    errBox.textContent = 'Network error';
  }
}

document.getElementById('login-pass').addEventListener('keypress', e => {
  if (e.key === 'Enter') login();
});

async function checkSession() {
  try {
    const res = await fetch('/api/admin/me');
    if (res.ok) {
      const data = await res.json();
      initDashboard(data.username);
    }
  } catch (e) {}
}

function initDashboard(username) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'flex';
  document.getElementById('admin-name').textContent = username;
  loadStats();
  loadOrders();
}

async function logout() {
  await fetch('/api/admin/logout', { method: 'POST' });
  location.reload();
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelector(`[data-tab="${name}"]`).classList.add('active');
}

async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const d = await res.json();
    document.getElementById('stat-total').textContent = d.total_orders || 0;
    document.getElementById('stat-paid').textContent = d.paid_orders || 0;
    document.getElementById('stat-pending').textContent = d.pending_orders || 0;
    document.getElementById('stat-revenue').textContent = '₹' + (d.total_revenue || 0).toFixed(2);
    document.getElementById('stat-today').textContent = '₹' + (d.today_revenue || 0).toFixed(2);
  } catch (e) { console.error(e); }
}

async function loadOrders() {
  currentSearch = document.getElementById('search-input').value.trim();
  currentStatus = document.getElementById('status-filter').value;

  try {
    const res = await fetch(
      `/api/admin/orders?page=${currentPage}&limit=20&status=${currentStatus}&search=${encodeURIComponent(currentSearch)}`
    );
    const data = await res.json();
    renderOrders(data.orders);
    totalPages = data.totalPages || 1;

    document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prev-btn').disabled = currentPage <= 1;
    document.getElementById('next-btn').disabled = currentPage >= totalPages;
  } catch (e) { console.error(e); }
}

function renderOrders(orders) {
  const tbody = document.getElementById('orders-tbody');
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">No orders found</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><b>${o.order_id}</b></td>
      <td>${o.customer_name || '-'}</td>
      <td>${o.customer_email || '-'}</td>
      <td>₹${parseFloat(o.amount).toFixed(2)}</td>
      <td><span class="badge ${o.status}">${o.status}</span></td>
      <td>${o.utr || '-'}</td>
      <td>${new Date(o.created_at).toLocaleString('en-IN')}</td>
      <td class="actions">
        ${o.status === 'pending'
          ? `<button class="btn-paid" onclick="markPaid('${o.order_id}')">✔ Paid</button>`
          : `<button class="btn-pending" onclick="markPending('${o.order_id}')">↺ Pending</button>`
        }
        <button class="btn-del" onclick="deleteOrder('${o.order_id}')">🗑</button>
      </td>
    </tr>
  `).join('');
}

async function markPaid(orderId) {
  const utr = prompt('UTR / Reference number (optional):') || '';
  await fetch(`/api/admin/orders/${orderId}/mark-paid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ utr })
  });
  loadOrders();
  loadStats();
}

async function markPending(orderId) {
  if (!confirm('Mark as pending?')) return;
  await fetch(`/api/admin/orders/${orderId}/mark-pending`, { method: 'POST' });
  loadOrders();
  loadStats();
}

async function deleteOrder(orderId) {
  if (!confirm('Delete this order permanently?')) return;
  await fetch(`/api/admin/orders/${orderId}`, { method: 'DELETE' });
  loadOrders();
  loadStats();
}

function prevPage() {
  if (currentPage > 1) { currentPage--; loadOrders(); }
}
function nextPage() {
  if (currentPage < totalPages) { currentPage++; loadOrders(); }
}

function exportCSV() {
  window.location.href = '/api/admin/orders/export/csv';
}

async function changePassword() {
  const oldPassword = document.getElementById('old-pass').value;
  const newPassword = document.getElementById('new-pass').value;
  const confirm = document.getElementById('confirm-pass').value;
  const msg = document.getElementById('pwd-msg');

  if (newPassword !== confirm) {
    msg.style.color = '#ef4444';
    msg.textContent = 'New passwords do not match';
    return;
  }
  if (newPassword.length < 6) {
    msg.style.color = '#ef4444';
    msg.textContent = 'Password must be at least 6 characters';
    return;
  }

  const res = await fetch('/api/admin/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword, newPassword })
  });
  const data = await res.json();

  if (res.ok) {
    msg.style.color = '#10b981';
    msg.textContent = '✅ Password updated!';
    document.getElementById('old-pass').value = '';
    document.getElementById('new-pass').value = '';
    document.getElementById('confirm-pass').value = '';
  } else {
    msg.style.color = '#ef4444';
    msg.textContent = data.error;
  }
}

checkSession();