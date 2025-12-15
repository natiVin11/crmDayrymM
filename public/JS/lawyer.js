document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');

    if (!userId) { window.location.href = '/html/index.html'; return; }

    initLawyerData(userId);
    loadAgentsForChat();

    setInterval(() => {
        if(document.getElementById('lawyerChatWindow').style.display === 'flex') {
            loadLawyerChatHistory(userId);
        }
    }, 10000);

    const updateForm = document.getElementById('updateForm');
    if (updateForm) updateForm.addEventListener('submit', handleFormSubmit);

    const statusSelect = document.getElementById('editStatus');
    if (statusSelect) statusSelect.addEventListener('change', togglePartialFields);

    const blockForm = document.getElementById('blockTimeForm');
    if (blockForm) blockForm.addEventListener('submit', async (e) => { e.preventDefault(); await handleBlockTimeSubmit(userId); });

    const backBtn = document.getElementById('backBtn');
    if(backBtn) backBtn.onclick = handleBackNavigation;
});

// --- משתנים ---
let hierarchy = {};
let currentView = 'projects';
let selectedProject = null;
let selectedComplex = null;
let currentChatTab = 'group';

// --- נתונים ורינדור ---
async function initLawyerData(userId) {
    const container = document.getElementById('mainContainer');
    container.innerHTML = '<div style="text-align:center;">טוען נתונים...</div>';

    try {
        const res = await fetch(`/lawyer/projects?userId=${userId}`);
        const data = await res.json();

        hierarchy = {};
        data.forEach(group => {
            const projName = group.project_name;
            const compName = group.complex_name;
            if (!hierarchy[projName]) hierarchy[projName] = {};
            if (!hierarchy[projName][compName]) hierarchy[projName][compName] = {};

            group.residents.forEach(r => {
                const addr = r.current_address || 'ללא כתובת';
                if (!hierarchy[projName][compName][addr]) hierarchy[projName][compName][addr] = [];
                hierarchy[projName][compName][addr].push(r);
            });
        });
        renderProjectsView();
    } catch (e) {
        console.error(e);
        container.innerHTML = 'שגיאה בטעינת הנתונים';
    }
}

function renderProjectsView() {
    currentView = 'projects';
    selectedProject = null; selectedComplex = null;
    document.getElementById('navBar').style.display = 'none';
    const container = document.getElementById('mainContainer');
    const projects = Object.keys(hierarchy);
    if(projects.length === 0) { container.innerHTML = '<div style="text-align:center;">אין פרויקטים.</div>'; return; }

    container.innerHTML = projects.map(p => `
        <div class="card" onclick="renderComplexesView('${p}')" style="cursor:pointer; border-right: 5px solid var(--primary);">
            <h3>📁 פרויקט: ${p}</h3>
            <div style="color:#64748b;">${Object.keys(hierarchy[p]).length} מתחמים</div>
        </div>
    `).join('');
}

function renderComplexesView(pName) {
    currentView = 'complexes'; selectedProject = pName;
    document.getElementById('navBar').style.display = 'flex';
    document.getElementById('navTitle').innerText = `פרויקט ${pName}`;
    const container = document.getElementById('mainContainer');
    container.innerHTML = Object.keys(hierarchy[pName]).map(c => `
        <div class="card" onclick="renderBuildingsView('${c}')" style="cursor:pointer; border-right: 5px solid var(--accent);">
            <h3>🏢 מתחם: ${c}</h3>
            <div style="color:#64748b;">${Object.keys(hierarchy[pName][c]).length} בניינים</div>
        </div>
    `).join('');
}

function renderBuildingsView(cName) {
    currentView = 'buildings'; selectedComplex = cName;
    document.getElementById('navTitle').innerText = `${selectedProject} > ${cName}`;
    const container = document.getElementById('mainContainer');
    const addresses = Object.keys(hierarchy[selectedProject][cName]);

    container.innerHTML = addresses.map(addr => {
        const count = hierarchy[selectedProject][cName][addr].length;
        const signed = hierarchy[selectedProject][cName][addr].filter(r => r.lawyer_status === 'חתם מלא').length;
        const pct = count > 0 ? Math.round((signed/count)*100) : 0;
        return `
        <div class="card" onclick="renderResidentsView('${addr}')" style="cursor:pointer;">
            <h3>📍 ${addr}</h3>
            <div style="margin-bottom:5px;">${count} דיירים (${pct}% חתמו)</div>
            <div class="progress-bg"><div class="progress-fill gold" style="width:${pct}%"></div></div>
        </div>`;
    }).join('');
}

function renderResidentsView(addr) {
    currentView = 'residents';
    document.getElementById('navTitle').innerText = `${selectedComplex} > ${addr}`;
    const container = document.getElementById('mainContainer');
    const residents = hierarchy[selectedProject][selectedComplex][addr];
    residents.sort((a,b) => (parseInt(a.sub_parcel)||0) - (parseInt(b.sub_parcel)||0));

    let html = `<div class="table-wrapper" style="grid-column: 1/-1;"><table><thead><tr><th>דירה</th><th>דייר</th><th>סטטוס</th><th>פעולות</th></tr></thead><tbody>`;
    html += residents.map(r => {
        let cls = 'status-none';
        if (r.lawyer_status === 'חתם מלא') cls = 'status-signed';
        else if (r.lawyer_status === 'חתם חלקי') cls = 'status-partial';
        else if (r.lawyer_status === 'בתהליך חתימה') cls = 'bg-orange';
        return `<tr><td>${r.sub_parcel}</td><td><b>${r.name}</b><br><small>${r.id_number||''}</small></td><td><span class="status-badge ${cls}">${r.lawyer_status||'טרם טופל'}</span></td><td><button class="btn-edit" onclick='openUpdateModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>✏️ עדכן</button></td></tr>`;
    }).join('');
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function handleBackNavigation() {
    if (currentView === 'residents') renderBuildingsView(selectedComplex);
    else if (currentView === 'buildings') renderComplexesView(selectedProject);
    else if (currentView === 'complexes') renderProjectsView();
}

// --- מודאל עדכון (V = התקבל/קיים) ---

window.openUpdateModal = function(r) {
    document.getElementById('editId').value = r.id;
    document.getElementById('editStatus').value = r.lawyer_status || 'טרם טופל';

    // יצירת צ'קבוקסים
    let owners = [{ name: r.name, id: 'main' }];
    if (r.secondary_owners) r.secondary_owners.forEach((so, i) => owners.push({ name: so.name, id: `sec_${i}` }));

    document.getElementById('ownersCheckboxes').innerHTML = owners.map(o =>
        `<div class="checkbox-item"><input type="checkbox" name="missing_owner" value="${o.name}" id="mo_${o.id}"><label for="mo_${o.id}">${o.name}</label></div>`
    ).join('');

    // --- מצב התחלתי: הכל מסומן ב-V (הנחה שהכל קיים) ---
    // העורך דין יסיר את ה-V ממה שחסר.
    document.querySelectorAll('#updateModal input[type="checkbox"]').forEach(cb => cb.checked = true);
    document.getElementById('signedDocs').value = '';

    // --- טעינת חוסרים קודמים ---
    // אם משהו שמור ב-DB כחסר -> נסיר לו את ה-V
    if (r.missing_docs_json) {
        try {
            const missing = JSON.parse(r.missing_docs_json);

            if(missing.owners) {
                missing.owners.forEach(name => {
                    const el = document.querySelector(`input[name="missing_owner"][value="${name}"]`);
                    if(el) el.checked = false; // מסירים V כי זה חסר
                });
            }
            if(missing.docs) {
                missing.docs.forEach(docName => {
                    const el = document.querySelector(`input[name="missing_doc"][value="${docName}"]`);
                    if(el) el.checked = false; // מסירים V כי זה חסר
                });
            }
        } catch(e){}
    }

    togglePartialFields();
    document.getElementById('updateModal').style.display = 'flex';
};

window.togglePartialFields = function() {
    document.getElementById('partialSection').style.display =
        document.getElementById('editStatus').value === 'חתם חלקי' ? 'block' : 'none';
};

async function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const status = document.getElementById('editStatus').value;
    const files = document.getElementById('signedDocs').files;

    // --- איסוף חוסרים (מה שלא מסומן ב-V) ---
    let missing = { owners:[], docs:[] };

    if (status === 'חתם חלקי') {
        // מי שלא מסומן (checked = false) -> נכנס לרשימת החוסרים
        document.querySelectorAll('input[name="missing_owner"]').forEach(cb => {
            if (!cb.checked) missing.owners.push(cb.value);
        });
        document.querySelectorAll('input[name="missing_doc"]').forEach(cb => {
            if (!cb.checked) missing.docs.push(cb.value);
        });
    }

    const fd = new FormData();
    fd.append('id', id);
    fd.append('lawyer_status', status);
    fd.append('missing_docs_json', JSON.stringify(missing));
    for(let f of files) fd.append('signed_docs', f);

    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerText = 'שומר...'; btn.disabled = true;

    try {
        await fetch('/lawyer/update-resident', { method: 'POST', body: fd });
        document.getElementById('updateModal').style.display = 'none';
        const userId = new URLSearchParams(window.location.search).get('userId');
        initLawyerData(userId);

        if (currentView === 'residents') {
            renderResidentsView(Object.keys(hierarchy[selectedProject][selectedComplex]).find(addr =>
                hierarchy[selectedProject][selectedComplex][addr].some(r => r.id == id)
            ));
        }
    } catch(e) { alert('שגיאה'); }
    finally { btn.innerText = 'שמור ועדכן'; btn.disabled = false; }
}

// --- צ'אט ---
window.switchChatTab = function(tab) {
    currentChatTab = tab;
    document.getElementById('tabGroup').classList.toggle('active', tab==='group');
    document.getElementById('tabPrivate').classList.toggle('active', tab==='private');
    const sel = document.getElementById('chatRecipient');
    if (tab === 'group') sel.value = 'all'; else if (sel.options.length>1) sel.selectedIndex=1;
    loadLawyerChatHistory(new URLSearchParams(window.location.search).get('userId'));
};

function toggleLawyerChat() {
    const win = document.getElementById('lawyerChatWindow');
    if (win.style.display === 'flex') win.style.display = 'none';
    else { win.style.display = 'flex'; loadLawyerChatHistory(new URLSearchParams(window.location.search).get('userId')); }
}

async function loadAgentsForChat() {
    try {
        const res = await fetch('/api/staff/users');
        const users = await res.json();
        const sel = document.getElementById('chatRecipient');
        sel.innerHTML = '<option value="all">📢 שלח לכולם</option>';
        users.forEach(u => {
            if (u.role !== 'lawyer') {
                const opt = document.createElement('option'); opt.value = u.id; opt.innerText = `${u.username} (${u.role})`; sel.appendChild(opt);
            }
        });
    } catch(e){}
}

async function loadLawyerChatHistory(userId) {
    const container = document.getElementById('lawyerChatBody');
    if(!container) return;
    try {
        const res = await fetch(`/api/staff/history?userId=${userId}`);
        const all = await res.json();
        const filtered = all.filter(m => {
            const rId = parseInt(m.recipient_id), sId = parseInt(m.sender_id), myId = parseInt(userId);
            return currentChatTab === 'group' ? (rId === 0) : ((rId === myId) || (sId === myId && rId !== 0));
        });
        container.innerHTML = filtered.map(m => {
            const isMe = m.sender_id == userId, cls = isMe ? 'mine' : 'others';
            let fileHtml = m.file_path ? `<a href="/staff-files/${m.file_path}" target="_blank" class="staff-file-link">📎 ${m.file_name||'קובץ'}</a>` : '';
            return `<div class="staff-msg ${cls}"><small>${m.sender_name}</small><div>${m.message}</div>${fileHtml}</div>`;
        }).join('');
        container.scrollTop = container.scrollHeight;
    } catch(e){}
}

async function sendLawyerMessage() {
    const userId = new URLSearchParams(window.location.search).get('userId');
    const msg = document.getElementById('chatMsg').value;
    const recipient = document.getElementById('chatRecipient').value;
    const file = document.getElementById('chatFile').files[0];
    if(!msg && !file) return;

    const fd = new FormData();
    fd.append('sender_id', userId); fd.append('recipient_id', recipient); fd.append('message', msg);
    if(file) fd.append('file', file);

    await fetch('/api/staff/send', { method: 'POST', body: fd });
    document.getElementById('chatMsg').value = ''; document.getElementById('chatFile').value = '';
    loadLawyerChatHistory(userId);
}

// --- יומן ---
window.openLawyerCalendar = function() {
    document.getElementById('calendarModal').style.display = 'flex';
    setTimeout(() => {
        const el = document.getElementById('calendarContainer'); el.innerHTML = '';
        new FullCalendar.Calendar(el, {
            initialView: 'dayGridMonth', locale: 'he', direction: 'rtl', height: '100%',
            events: `/api/tasks?userId=${new URLSearchParams(window.location.search).get('userId')}`,
            eventDidMount: function(info) { if (info.event.extendedProps.type === 'blocked') { info.el.style.backgroundColor = '#ef4444'; info.el.style.borderColor = '#ef4444'; } }
        }).render();
    }, 200);
};

async function handleBlockTimeSubmit(userId) {
    const date = document.getElementById('blockDate').value;
    const reason = document.getElementById('blockReason').value;
    if(!date) return alert('חובה לבחור תאריך');
    await fetch('/api/lawyer/block-time', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: userId, start_time: date, reason }) });
    alert('נחסם'); document.getElementById('blockTimeModal').style.display = 'none'; openLawyerCalendar();
}
