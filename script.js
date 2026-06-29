'use strict';

// ── State ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'subscription-audit-data';

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

let subscriptions = load();

// ── Pure logic functions ───────────────────────────────────────────────────

function normalizeToMonthly(amount, cycle) {
  switch (cycle) {
    case 'weekly':    return amount * 52 / 12;
    case 'quarterly': return amount / 3;
    case 'yearly':    return amount / 12;
    default:          return amount; // monthly
  }
}

function getTotals(subs) {
  const monthly = subs.reduce((sum, s) => sum + normalizeToMonthly(s.amount, s.cycle), 0);
  return { monthly, annual: monthly * 12 };
}

function daysUntil(renewalDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(renewalDate + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function countRenewingSoon(subs) {
  return subs.filter(s => {
    const d = daysUntil(s.renewalDate);
    return d >= 0 && d <= 7;
  }).length;
}

function formatCycle(cycle) {
  return { weekly: 'wk', monthly: 'mo', quarterly: 'qtr', yearly: 'yr' }[cycle];
}

function formatMoney(n) {
  return '$' + n.toFixed(2);
}

function sortedSubscriptions(subs, sortBy) {
  const copy = subs.slice();
  if (sortBy === 'monthly') {
    copy.sort((a, b) => normalizeToMonthly(b.amount, b.cycle) - normalizeToMonthly(a.amount, a.cycle));
  } else {
    copy.sort((a, b) => daysUntil(a.renewalDate) - daysUntil(b.renewalDate));
  }
  return copy;
}

// ── DOM helpers ────────────────────────────────────────────────────────────

function buildRenewalLabel(days) {
  if (days < 0) return { text: 'overdue', cls: 'overdue' };
  if (days === 0) return { text: 'renews today', cls: 'soon' };
  if (days <= 7) return { text: `renews in ${days}d ⚠`, cls: 'soon' };
  return { text: `renews in ${days}d`, cls: '' };
}

function createSubscriptionItem(sub, originalIndex) {
  const days = daysUntil(sub.renewalDate);
  const monthly = normalizeToMonthly(sub.amount, sub.cycle);
  const renewal = buildRenewalLabel(days);

  const li = document.createElement('li');
  li.className = 'sub-item' + (days >= 0 && days <= 7 ? ' warning' : '');
  li.dataset.index = originalIndex;

  const left = document.createElement('div');
  left.className = 'sub-left';

  const name = document.createElement('span');
  name.className = 'sub-name';
  name.textContent = sub.name;

  const renewalEl = document.createElement('span');
  renewalEl.className = 'sub-renewal' + (renewal.cls ? ' ' + renewal.cls : '');
  renewalEl.textContent = renewal.text;

  left.append(name, renewalEl);

  const raw = document.createElement('span');
  raw.className = 'sub-raw';
  raw.textContent = `${formatMoney(sub.amount)}/${formatCycle(sub.cycle)}`;

  const norm = document.createElement('span');
  norm.className = 'sub-monthly';
  norm.textContent = `${formatMoney(monthly)}/mo`;

  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.textContent = '×';
  del.setAttribute('aria-label', `Delete ${sub.name}`);
  del.addEventListener('click', () => deleteSubscription(originalIndex));

  li.append(left, raw, norm, del);
  return li;
}

// ── Render ─────────────────────────────────────────────────────────────────

function render() {
  const list = document.getElementById('subscription-list');
  const sortBy = document.getElementById('sort-select').value;

  list.innerHTML = '';

  if (subscriptions.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.innerHTML = '<p>No subscriptions yet</p><p>Add one above to start tracking your spending.</p>';
    list.appendChild(empty);
  } else {
    const sorted = sortedSubscriptions(subscriptions, sortBy);
    sorted.forEach(sub => {
      const originalIndex = subscriptions.indexOf(sub);
      list.appendChild(createSubscriptionItem(sub, originalIndex));
    });
  }

  const { monthly, annual } = getTotals(subscriptions);
  const soon = countRenewingSoon(subscriptions);

  document.getElementById('total-monthly').textContent = formatMoney(monthly);
  document.getElementById('total-annual').textContent = formatMoney(annual);
  document.getElementById('renewing-soon').textContent = soon;

  const renewalCard = document.getElementById('renewal-card');
  renewalCard.classList.toggle('has-renewals', soon > 0);
}

// ── Mutations ──────────────────────────────────────────────────────────────

function addSubscription(name, amount, cycle, renewalDate) {
  subscriptions.push({ name, amount, cycle, renewalDate });
  save();
  render();
}

function deleteSubscription(index) {
  subscriptions.splice(index, 1);
  save();
  render();
}

function resetAll() {
  subscriptions = [];
  save();
  render();
}

// ── Validation ─────────────────────────────────────────────────────────────

function validateAndAdd(name, rawAmount, cycle, renewalDate) {
  const errorEl = document.getElementById('form-error');
  errorEl.textContent = '';

  const trimmedName = name.trim();
  if (!trimmedName) {
    errorEl.textContent = 'Name is required.';
    return false;
  }

  const amount = parseFloat(rawAmount);
  if (rawAmount.trim() === '' || isNaN(amount) || amount <= 0) {
    errorEl.textContent = 'Amount must be a positive number.';
    return false;
  }

  if (!renewalDate) {
    errorEl.textContent = 'Renewal date is required.';
    return false;
  }

  addSubscription(trimmedName, amount, cycle, renewalDate);
  return true;
}

// ── Event wiring ───────────────────────────────────────────────────────────

document.getElementById('add-form').addEventListener('submit', e => {
  e.preventDefault();
  const name      = document.getElementById('input-name').value;
  const amount    = document.getElementById('input-amount').value;
  const cycle     = document.getElementById('input-cycle').value;
  const renewal   = document.getElementById('input-renewal').value;

  if (validateAndAdd(name, amount, cycle, renewal)) {
    document.getElementById('input-name').value = '';
    document.getElementById('input-amount').value = '';
    document.getElementById('input-cycle').value = 'monthly';
    document.getElementById('input-renewal').value = '';
    document.getElementById('form-error').textContent = '';
  }
});

document.getElementById('sort-select').addEventListener('change', render);

document.getElementById('reset-btn').addEventListener('click', () => {
  if (subscriptions.length === 0) return;
  const btn = document.getElementById('reset-btn');
  if (btn.dataset.confirming === 'true') {
    resetAll();
    btn.textContent = 'Reset all';
    delete btn.dataset.confirming;
  } else {
    btn.dataset.confirming = 'true';
    btn.textContent = 'Confirm reset?';
    setTimeout(() => {
      btn.textContent = 'Reset all';
      delete btn.dataset.confirming;
    }, 3000);
  }
});

// ── Init ───────────────────────────────────────────────────────────────────

render();
