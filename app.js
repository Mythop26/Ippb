
// ╔══════════════════════════════════════════════════╗
// ║   FIREBASE CONFIG — paste your config here       ║
// ╚══════════════════════════════════════════════════╝
const FB_CONFIG = {
  apiKey:            "AIzaSyAuUJwr7auGmIaG50wh-vRo3OhFsA81pCw",
  authDomain:        "deploymenttracker-3220d.firebaseapp.com",
  projectId:         "deploymenttracker-3220d",
  storageBucket:     "deploymenttracker-3220d.firebasestorage.app",
  messagingSenderId: "374280387664",
  appId:             "1:374280387664:web:510274e2148d4459eba555",
  measurementId:     "G-D3542L2556"
};

// ── STATE ──
let fbReady = false, db = null, auth = null;
let currentUser = null;
let currentEnv = 'CUG', currentQ = 'ALL', searchVal = '', editingId = null;
let selectedRole = 'admin';   // role chosen on login screen
let allRows = [];

// ── DEMO DATA (financial year quarters Apr–Mar) ──
let demoRows = [
  { id:'d1', env:'CUG', crNo:'CR-2025-001', application:'Mobile Banking App',
    purpose:'Login flow enhancement v2', approvalDate:'2025-04-10', deployDate:'2025-04-15',
    status:'Deployed', reattemptDate:'', impactInProd:'None', reason:'All sanity checks passed',
    uatDate:'2025-04-08', passLog:'Yes', prodFix:'', apkVersion:'v3.1.0',
    remarks:'Smooth deployment', createdBy:'admin' },
  { id:'d2', env:'CUG', crNo:'CR-2025-002', application:'UPI Module',
    purpose:'UPI 2.0 protocol upgrade', approvalDate:'2025-04-20', deployDate:'2025-04-25',
    status:'Rollback', reattemptDate:'2025-04-28', impactInProd:'Minor 2hr downtime',
    reason:'DB connection timeout during migration', uatDate:'2025-04-18', passLog:'Yes',
    prodFix:'Hotfix CF-001', apkVersion:'v3.1.1', remarks:'Reattempt done successfully', createdBy:'vendor' },
  { id:'d3', env:'PROD', crNo:'CR-2025-003', application:'Net Banking Portal',
    purpose:'SSL certificate renewal & security patch', approvalDate:'2025-05-01', deployDate:'2025-05-05',
    status:'Deployed', reattemptDate:'', impactInProd:'None', reason:'Security compliance achieved',
    uatDate:'2025-04-30', passLog:'Yes', prodFix:'', apkVersion:'v5.0.2', remarks:'', createdBy:'admin' },
  { id:'d4', env:'CUG', crNo:'CR-2025-004', application:'Mobile Banking App',
    purpose:'Dark mode + UI refresh', approvalDate:'2025-07-05', deployDate:'2025-07-10',
    status:'Pending', reattemptDate:'', impactInProd:'', reason:'',
    uatDate:'2025-07-01', passLog:'No', prodFix:'', apkVersion:'v3.2.0',
    remarks:'Waiting for bank sign-off', createdBy:'vendor' },
  { id:'d5', env:'PROD', crNo:'CR-2025-005', application:'NACH Module',
    purpose:'NACH mandate processing fix', approvalDate:'2025-10-01', deployDate:'2025-10-05',
    status:'Deployed', reattemptDate:'', impactInProd:'None', reason:'Bug fix validated in UAT',
    uatDate:'2025-09-28', passLog:'Yes', prodFix:'', apkVersion:'v2.4.1', remarks:'', createdBy:'admin' },
  { id:'d6', env:'UAT', crNo:'CR-2025-006', application:'Loan Module',
    purpose:'Credit score integration testing', approvalDate:'2025-08-01', deployDate:'2025-08-03',
    status:'Deployed', reattemptDate:'', impactInProd:'N/A', reason:'UAT passed all test cases',
    uatDate:'2025-08-03', passLog:'Yes', prodFix:'', apkVersion:'v1.5.0', remarks:'Ready for PROD', createdBy:'admin' },
  { id:'d7', env:'CUG', crNo:'CR-2026-001', application:'Mobile Banking App',
    purpose:'Q4 RBI regulatory compliance update', approvalDate:'2026-01-10', deployDate:'2026-01-15',
    status:'Deployed', reattemptDate:'', impactInProd:'None', reason:'Completed within window',
    uatDate:'2026-01-08', passLog:'Yes', prodFix:'', apkVersion:'v3.3.0', remarks:'RBI compliance patch', createdBy:'admin' },
];

// Demo users — in real app these are in Firebase Auth + Firestore
const DEMO_USERS = [
  { email:'admin@demo.com',  password:'admin123',  name:'Admin User',  role:'admin'  },
  { email:'vendor@demo.com', password:'vendor123', name:'Vendor User', role:'vendor' },
  { email:'admin2@demo.com', password:'admin456',  name:'Admin Two',   role:'admin'  },
];

// ── FIREBASE INIT ──
async function initFB() {
  try {
    if (FB_CONFIG.apiKey === 'YOUR_API_KEY') {
      document.getElementById('demo-banner').style.display = 'block';
      return;
    }
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
    const A = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    const F = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const app = initializeApp(FB_CONFIG);
    auth = A.getAuth(app);
    db   = F.getFirestore(app);
    fbReady = true;
    window._fb = { ...A, ...F, auth, db };

    A.onAuthStateChanged(auth, async user => {
      if (user) {
        // Load user record from Firestore to get name + role
        const snap = await F.getDocs(F.query(F.collection(db,'users'), F.where('uid','==',user.uid)));
        const ud = snap.empty ? { name: user.email, role: 'vendor' } : snap.docs[0].data();
        // Validate role matches what user selected on login
        if (ud.role !== selectedRole) {
          await A.signOut(auth);
          showErr(`Role mismatch. Your account role is "${ud.role}". Please select the correct role.`);
          return;
        }
        currentUser = { ...ud, email: user.email, uid: user.uid };
        showApp(); loadRows();
      } else {
        showAuth();
      }
    });
  } catch(e) {
    console.error(e);
    document.getElementById('demo-banner').style.display = 'block';
  }
}

// ── ROLE SELECT ──
window.selectRole = role => {
  selectedRole = role;
  document.getElementById('rc-admin').className  = 'role-card' + (role==='admin'  ? ' sel-admin'  : '');
  document.getElementById('rc-vendor').className = 'role-card' + (role==='vendor' ? ' sel-vendor' : '');
};

// ── AUTH ──
const showErr = m => { const e = document.getElementById('auth-error'); e.innerHTML = m; e.style.display = 'block'; };
const clearErr = () => document.getElementById('auth-error').style.display = 'none';

window.doLogin = async () => {
  const email = document.getElementById('l-email').value.trim();
  const pwd   = document.getElementById('l-pwd').value;
  if (!email || !pwd) return showErr('Please enter your email and password.');
  clearErr();
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.innerHTML = '<span class="loader"></span>&nbsp; Signing in...';

  if (!fbReady) {
    // Demo mode: match email + password + role
    const u = DEMO_USERS.find(u => u.email === email && u.password === pwd);
    if (!u) {
      btn.disabled=false; btn.textContent='Sign In →';
      return showErr('Invalid credentials.<br/>Demo: <b>admin@demo.com</b> / admin123 &nbsp;|&nbsp; <b>vendor@demo.com</b> / vendor123');
    }
    if (u.role !== selectedRole) {
      btn.disabled=false; btn.textContent='Sign In →';
      return showErr(`Role mismatch. Your account is registered as <b>${u.role}</b>. Please select the correct role above.`);
    }
    currentUser = u;
    showApp(); renderTable();
    btn.disabled=false; btn.textContent='Sign In →';
    return;
  }

  try {
    await window._fb.signInWithEmailAndPassword(auth, email, pwd);
    // onAuthStateChanged handles the rest
  } catch(e) {
    btn.disabled=false; btn.textContent='Sign In →';
    const msg = e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password'
      ? 'Invalid email or password.' : e.message.replace('Firebase: ','').replace(/\(.*\)/,'').trim();
    showErr(msg);
  }
};

window.doLogout = async () => {
  if (fbReady) await window._fb.signOut(auth);
  else { currentUser = null; showAuth(); }
};

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('hdr-name').textContent = currentUser.name || currentUser.email;
  const rp = document.getElementById('hdr-role');
  rp.textContent = (currentUser.role||'vendor').toUpperCase();
  rp.className = 'role-pill ' + (currentUser.role==='admin' ? 'admin' : 'vendor');
}
function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-btn').textContent = 'Sign In →';
  document.getElementById('login-btn').disabled = false;
}

// ── QUARTER / FY LOGIC (Financial year Apr–Mar) ──
function getQ(dateStr) {
  if (!dateStr) return 'Q1';
  const m = new Date(dateStr).getMonth() + 1;
  if (m>=4 && m<=6)  return 'Q1';
  if (m>=7 && m<=9)  return 'Q2';
  if (m>=10 && m<=12) return 'Q3';
  return 'Q4'; // Jan-Mar
}
function getFY(dateStr) {
  if (!dateStr) return new Date().getFullYear();
  const d = new Date(dateStr), y = d.getFullYear(), m = d.getMonth()+1;
  return m >= 4 ? y : y-1;
}
function fyLabel(fy) { return `FY ${fy}–${(fy+1).toString().slice(2)}`; }

// ── DATA ──
async function loadRows() {
  if (!fbReady) { renderTable(); return; }
  try {
    const snap = await window._fb.getDocs(window._fb.collection(db,'deployments'));
    allRows = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderTable();
  } catch(e) { toast('Error loading data','err'); }
}

function getFiltered() {
  let rows = (fbReady ? allRows : demoRows).filter(r => r.env === currentEnv);
  if (currentQ !== 'ALL') {
    rows = rows.filter(r => getQ(r.deployDate || r.approvalDate || '') === currentQ);
  }
  if (searchVal) {
    const s = searchVal.toLowerCase();
    rows = rows.filter(r =>
      (r.application||'').toLowerCase().includes(s) ||
      (r.crNo||'').toLowerCase().includes(s) ||
      (r.purpose||'').toLowerCase().includes(s) ||
      (r.remarks||'').toLowerCase().includes(s) ||
      (r.reason||'').toLowerCase().includes(s)
    );
  }
  return rows;
}

function renderTable() {
  const rows   = getFiltered();
  const src    = fbReady ? allRows : demoRows;
  const envAll = src.filter(r => r.env === currentEnv);

  // Stats
  document.getElementById('st-total').textContent = envAll.length;
  document.getElementById('st-dep').textContent   = envAll.filter(r=>r.status==='Deployed').length;
  document.getElementById('st-roll').textContent  = envAll.filter(r=>r.status==='Rollback').length;
  document.getElementById('st-pend').textContent  = envAll.filter(r=>r.status==='Pending').length;
  document.getElementById('st-reat').textContent  = envAll.filter(r=>r.reattemptDate).length;

  // FY label from first filtered row's deploy date
  if (rows.length) {
    const ref = rows[0].deployDate || rows[0].approvalDate || '';
    document.getElementById('fy-label').textContent = fyLabel(getFY(ref));
  }

  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty-state');
  if (!rows.length) { tbody.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display = 'none';

  const isAdmin = currentUser?.role === 'admin';

  tbody.innerHTML = rows.map((r,i) => {
    const st  = (r.status||'pending').toLowerCase().replace(/\s/g,'');
    const pl  = r.passLog || 'N/A';
    const plc = pl.toLowerCase()==='yes' ? 'yes' : pl.toLowerCase()==='no' ? 'no' : 'na';
    const dash = '<span style="color:var(--muted)">—</span>';
    return `<tr>
      <td class="td-sr">${i+1}</td>
      <td class="td-cr">${esc(r.crNo||'—')}</td>
      <td class="td-app">${esc(r.application||'—')}</td>
      <td class="td-trunc"><span title="${esc(r.purpose||'')}">${esc(r.purpose||'—')}</span></td>
      <td class="td-date">${fmt(r.approvalDate)}</td>
      <td class="td-date">${fmt(r.deployDate)}</td>
      <td><span class="badge ${st}">${esc(r.status||'Pending')}</span></td>
      <td class="td-date">${r.reattemptDate ? fmt(r.reattemptDate) : dash}</td>
      <td class="td-trunc"><span title="${esc(r.impactInProd||'')}">${esc(r.impactInProd||'—')}</span></td>
      <td class="td-trunc"><span title="${esc(r.reason||'')}">${esc(r.reason||'—')}</span></td>
      <td class="td-date">${fmt(r.uatDate)}</td>
      <td><span class="yn ${plc}">${esc(pl)}</span></td>
      <td style="font-size:11px;color:var(--muted)">${esc(r.prodFix||'—')}</td>
      <td style="font-family:var(--mono);font-size:11px;color:var(--accent)">${esc(r.apkVersion||'—')}</td>
      <td class="td-trunc"><span title="${esc(r.remarks||'')}">${esc(r.remarks||'—')}</span></td>
      <td style="font-size:10px;color:var(--muted);font-family:var(--mono)">${esc(r.createdBy||'—')}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" onclick="editRow('${r.id}')" ${!isAdmin?'disabled title="Admin only"':''}>✎ Edit</button>
          <button class="btn-icon del" onclick="delRow('${r.id}')" ${!isAdmin?'disabled title="Admin only"':''}>✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── MODAL ──
window.openModal = (id=null) => {
  editingId = id;
  const isAdmin = currentUser?.role === 'admin';
  document.getElementById('modal-title').textContent = id ? 'Edit Deployment' : 'Add Deployment';
  document.getElementById('modal-env-tag').textContent = currentEnv;
  document.getElementById('vendor-notice').style.display = !isAdmin ? 'block' : 'none';

  const clear = () => {
    ['f-cr','f-app','f-apk','f-purpose','f-approval','f-deploy',
     'f-reattempt','f-impact','f-reason','f-uat','f-profix','f-remarks']
      .forEach(x => document.getElementById(x).value='');
    document.getElementById('f-status').value  = 'Pending';
    document.getElementById('f-passlog').value = 'N/A';
    document.getElementById('f-deploy').value  = new Date().toISOString().split('T')[0];
  };

  if (id) {
    const src = fbReady ? allRows : demoRows;
    const r = src.find(r => r.id === id);
    if (r) {
      document.getElementById('f-cr').value       = r.crNo||'';
      document.getElementById('f-app').value      = r.application||'';
      document.getElementById('f-apk').value      = r.apkVersion||'';
      document.getElementById('f-purpose').value  = r.purpose||'';
      document.getElementById('f-approval').value = r.approvalDate||'';
      document.getElementById('f-deploy').value   = r.deployDate||'';
      document.getElementById('f-status').value   = r.status||'Pending';
      document.getElementById('f-reattempt').value= r.reattemptDate||'';
      document.getElementById('f-impact').value   = r.impactInProd||'';
      document.getElementById('f-reason').value   = r.reason||'';
      document.getElementById('f-uat').value      = r.uatDate||'';
      document.getElementById('f-passlog').value  = r.passLog||'N/A';
      document.getElementById('f-profix').value   = r.prodFix||'';
      document.getElementById('f-remarks').value  = r.remarks||'';
    }
  } else { clear(); }

  document.getElementById('modal').classList.add('open');
};

window.closeModal = () => {
  document.getElementById('modal').classList.remove('open');
  editingId = null;
};

window.editRow = id => {
  if (currentUser?.role !== 'admin') return toast('Admin access required to edit entries','err');
  openModal(id);
};

window.saveEntry = async () => {
  const crNo        = document.getElementById('f-cr').value.trim();
  const application = document.getElementById('f-app').value.trim();
  const purpose     = document.getElementById('f-purpose').value.trim();
  if (!crNo || !application || !purpose) return toast('CR No, Application and Purpose are required','err');

  const deployDate = document.getElementById('f-deploy').value;
  const data = {
    env:          currentEnv,
    crNo, application, purpose,
    apkVersion:   document.getElementById('f-apk').value.trim(),
    approvalDate: document.getElementById('f-approval').value,
    deployDate,
    status:       document.getElementById('f-status').value,
    reattemptDate:document.getElementById('f-reattempt').value,
    impactInProd: document.getElementById('f-impact').value.trim(),
    reason:       document.getElementById('f-reason').value.trim(),
    uatDate:      document.getElementById('f-uat').value,
    passLog:      document.getElementById('f-passlog').value,
    prodFix:      document.getElementById('f-profix').value.trim(),
    remarks:      document.getElementById('f-remarks').value.trim(),
    createdBy:    currentUser.email || currentUser.name,
  };

  if (!fbReady) {
    if (editingId) {
      const i = demoRows.findIndex(r => r.id===editingId);
      if (i > -1) demoRows[i] = { ...demoRows[i], ...data };
      toast('Updated successfully!','ok');
    } else {
      demoRows.unshift({ id:'d'+Date.now(), ...data });
      toast('Deployment added!','ok');
    }
    closeModal(); renderTable(); return;
  }

  try {
    if (editingId) {
      await window._fb.updateDoc(window._fb.doc(db,'deployments',editingId), data);
      toast('Updated!','ok');
    } else {
      await window._fb.addDoc(window._fb.collection(db,'deployments'), {
        ...data, createdAt: window._fb.serverTimestamp()
      });
      toast('Deployment added!','ok');
    }
    closeModal(); loadRows();
  } catch(e) { toast('Error: '+e.message,'err'); }
};

window.delRow = async id => {
  if (currentUser?.role !== 'admin') return toast('Admin access required','err');
  if (!confirm('Delete this deployment entry? This cannot be undone.')) return;
  if (!fbReady) {
    demoRows = demoRows.filter(r => r.id !== id);
    renderTable(); toast('Entry deleted','ok'); return;
  }
  try {
    await window._fb.deleteDoc(window._fb.doc(db,'deployments',id));
    toast('Deleted','ok'); loadRows();
  } catch(e) { toast('Error deleting','err'); }
};

// ── NAV ──
window.switchEnv = env => {
  currentEnv = env; currentQ = 'ALL';
  document.getElementById('env-cug').className  = 'env-btn' + (env==='CUG'  ? ' ac' : '');
  document.getElementById('env-prod').className = 'env-btn' + (env==='PROD' ? ' ap' : '');
  document.getElementById('env-uat').className  = 'env-btn' + (env==='UAT'  ? ' au' : '');
  document.querySelectorAll('.q-btn').forEach(b => b.classList.toggle('active', b.dataset.q==='ALL'));
  document.querySelector('.search-box').value = ''; searchVal = '';
  renderTable();
};

window.switchQ = (el, q) => {
  currentQ = q;
  document.querySelectorAll('.q-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderTable();
};

window.doSearch = v => { searchVal = v; renderTable(); };

// ── EXPORT CSV ──
window.exportCSV = () => {
  const rows = getFiltered();
  if (!rows.length) return toast('No data to export','err');
  const h = ['Sr No','CR No','Application','Purpose','Approval Date','Deploy Date','Status',
    'Reattempted Date','Impact in Prod','Reason','UAT Date','Pass Log','Prod Fix/CF','APK Version','Remarks','Added By'];
  const lines = [h.join(','), ...rows.map((r,i) => [
    i+1, q(r.crNo), q(r.application), q(r.purpose), r.approvalDate, r.deployDate,
    r.status, r.reattemptDate, q(r.impactInProd), q(r.reason), r.uatDate,
    r.passLog, q(r.prodFix), q(r.apkVersion), q(r.remarks), q(r.createdBy)
  ].join(','))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], {type:'text/csv'}));
  a.download = `DeployTrack_${currentEnv}_${currentQ}_${Date.now()}.csv`;
  a.click(); toast('CSV exported!','ok');
};

// ── UTILS ──
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const q   = s => '"'+(s||'').replace(/"/g,'""')+'"';
const fmt = d => {
  if (!d) return '<span style="color:var(--muted)">—</span>';
  const dt = new Date(d); if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
};

let _tt;
window.toast = (msg, type='ok') => {
  const t = document.getElementById('toast');
  t.textContent = (type==='ok'?'✓  ':'✕  ') + msg;
  t.className = `toast ${type} show`;
  clearTimeout(_tt); _tt = setTimeout(() => t.classList.remove('show'), 3200);
};

window.showFBHelp = () => alert(
`HOW TO CONNECT FIREBASE:

1. Go to console.firebase.google.com
2. Select your project: deploymenttracker-3220d
3. Authentication → Sign-in method → Email/Password → Enable
4. Firestore Database → Create (start in test mode)
5. Project Settings → Your Apps → Web App → copy config
6. Paste config values into FB_CONFIG in this HTML file

TO ADD USERS (admin only — no self sign-up):
• Firebase Console → Authentication → Users → Add user
• Set their email & password
• In Firestore, create collection "users" with doc:
  { uid: "<their uid>", name: "Name", email: "email", role: "admin" or "vendor" }

Upload updated HTML to GitHub Pages.`
);

document.getElementById('modal').addEventListener('click', e => { if (e.target===e.currentTarget) closeModal(); });

// ── THEME TOGGLE ──
let isLight = localStorage.getItem('dt-theme') === 'light';

function applyTheme() {
  document.body.classList.toggle('light', isLight);
  const track = document.getElementById('toggle-track');
  if (track) track.classList.toggle('on', isLight);
  const lbl = document.getElementById('t-label');
  const lbl2 = document.getElementById('t-label2');
  if (lbl) lbl.textContent = isLight ? '☀️' : '🌙';
  if (lbl2) lbl2.textContent = isLight ? '🌙' : '☀️';
}

window.toggleTheme = () => {
  isLight = !isLight;
  localStorage.setItem('dt-theme', isLight ? 'light' : 'dark');
  applyTheme();
};

applyTheme(); // apply on load
initFB();