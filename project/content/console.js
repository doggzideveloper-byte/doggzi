// Doggzi Console — shared demo auth + helpers (mock only; real app uses the Auth service + JWT `user.id`).
export const SESSION_KEY = 'dz.console.session';
export const SESSION_HOURS = 12;

export const DEMO_USERS = [
  { phone: '9000000001', id: 'u-prov-01', name: 'Ravi Kumar', roles: ['PROVIDER'] },
  { phone: '9000000002', id: 'u-vend-01', name: 'Meera Shah', roles: ['VENDOR'] },
  { phone: '9000000003', id: 'u-admin-01', name: 'Abhiyash', roles: ['ADMIN'] },
  { phone: '9000000004', id: 'u-ops-01', name: 'Neha Gupta', roles: ['OPS'] },
  { phone: '9000000005', id: 'u-multi-01', name: 'Arjun Mehta', roles: ['PROVIDER', 'VENDOR'] },
];

export const PANELS = {
  PROVIDER: { file: 'Console-Provider.dc.html', label: 'Provider', color: '#09A460' },
  VENDOR: { file: 'Console-Vendor.dc.html', label: 'Vendor', color: '#F989EF' },
  ADMIN: { file: 'Console-Admin.dc.html', label: 'Admin', color: '#141210' },
  OPS: { file: 'Console-Admin.dc.html', label: 'Ops', color: '#141210' },
};

export function panelsFor(roles) {
  const out = [];
  roles.forEach(r => { const p = PANELS[r]; if (p && !out.find(x => x.file === p.file)) out.push({ role: r, ...p }); });
  return out;
}

export function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!s || !s.expires_at || new Date(s.expires_at).getTime() < Date.now()) return null;
    return s;
  } catch (e) { return null; }
}

export function writeSession(user, activeRole) {
  const s = { user_id: user.id, name: user.name, phone: user.phone, roles: user.roles, role: activeRole, expires_at: new Date(Date.now() + SESSION_HOURS * 3600e3).toISOString() };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
  return s;
}

export function setActiveRole(role) {
  const s = readSession(); if (!s || !s.roles.includes(role)) return null;
  s.role = role; try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
  return s;
}

export function logout() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} window.location.href = 'Console-Login.dc.html'; }

// Guard: returns the session, or redirects to login and returns null.
export function guard(allowedRoles) {
  const s = readSession();
  if (!s) { window.location.replace('Console-Login.dc.html?reason=signin'); return null; }
  const role = allowedRoles.find(r => r === s.role) || allowedRoles.find(r => s.roles.includes(r));
  if (!role) { window.location.replace('Console-Login.dc.html?reason=noaccess'); return null; }
  if (s.role !== role) setActiveRole(role);
  return { ...s, role };
}

export const maskPhone = p => { const d = String(p).replace(/\D/g, '').slice(-10); return d.length === 10 ? `${d.slice(0, 2)}xxxxxx${d.slice(8)}` : 'xxxxxxxxxx'; };
export const inr = paise => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
export const istTime = d => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(new Date(d));
export const istDate = d => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d));
export const istDateTime = d => `${istDate(d)}, ${istTime(d)}`;

export function beep(muted) {
  if (muted) return;
  try {
    const C = window.AudioContext || window.webkitAudioContext; const ctx = window.__dzAudio || (window.__dzAudio = new C());
    [0, 0.16].forEach((t, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = i ? 880 : 660; g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.14); o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.16); });
  } catch (e) {}
}

export function downloadCsv(name, rows) {
  const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = rows.map(r => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
