document.addEventListener('DOMContentLoaded', () => {
    loadUsers(); loadProjectStats(); loadFilters(); initCalendar();
    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('newUsername').value;
        const password = document.getElementById('newPassword').value;
        const role = document.getElementById('newRole').value;
        const res = await fetch('/add-user', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password, role}) });
        if(res.ok) { alert('נוסף!'); loadUsers(); } else { alert('שגיאה'); }
    });
});

const PROJECT_STAGES = [
    "התארגנות / חתימת נציגות", "בחירת עורך דין דיירים", "מכרז יזמים / בחירת יזם",
    "מו״מ משפטי על ההסכם", "כנס חתימות / החתמות על חוזה", "הגשת תב״ע (תכנון)",
    "שינוי תב״ע (אישור וועדות)", "היתר בניה", "ליווי בנקאי וערבויות", "פינוי דיירים", "הריסה ובניה", "מסירת דירות / אכלוס"
];

function generateStatusSelect(currentStatus) {
    let options = PROJECT_STAGES.map(stage =>
        `<option value="${stage}" ${stage === currentStatus ? 'selected' : ''}>${stage}</option>`
    ).join('');
    if (currentStatus && !PROJECT_STAGES.includes(currentStatus)) {
        options += `<option value="${currentStatus}" selected>${currentStatus} (ישן)</option>`;
    }
    return `<select name="status" style="width:100%; padding: 8px;">${options}</select>`;
}

async function loadFilters() {
    const [projectsRes, usersRes] = await Promise.all([fetch('/project-stats'), fetch('/users')]);
    const projects = await projectsRes.json();
    const users = await usersRes.json();
    const projSel = document.getElementById('filterProject');
    if(projSel) { projSel.innerHTML = '<option value="">כל הפרויקטים</option>'; projects.forEach(p => projSel.innerHTML += `<option value="${p.project_name}">${p.project_name}</option>`); }
    const lawSel = document.getElementById('filterLawyer');
    if(lawSel) { lawSel.innerHTML = '<option value="">כל העורכי דין</option>'; users.filter(u => u.role === 'lawyer').forEach(l => lawSel.innerHTML += `<option value="${l.id}">${l.username}</option>`); }
    const agentSel = document.getElementById('filterAgent');
    if(agentSel) { agentSel.innerHTML = '<option value="">כל הנציגים</option>'; users.filter(u => u.role === 'user').forEach(u => agentSel.innerHTML += `<option value="${u.id}">${u.username}</option>`); }
}

function initCalendar() {
    const project = document.getElementById('filterProject')?.value || '';
    const lawyerId = document.getElementById('filterLawyer')?.value || '';
    const agentId = document.getElementById('filterAgent')?.value || '';
    let url = `/api/meetings?t=${Date.now()}`;
    if (project) url += `&project=${encodeURIComponent(project)}`;
    if (lawyerId) url += `&lawyerId=${lawyerId}`;
    if (agentId) url += `&userId=${agentId}`;
    var calendarEl = document.getElementById('calendar');
    if(calendarEl) {
        calendarEl.innerHTML = '';
        var calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth', locale: 'he', direction: 'rtl', height: '100%',
            events: url,
            eventClick: function(info) {
                const p = info.event.extendedProps;
                alert(`פגישה: ${info.event.title}\nדייר: ${p.name || ''}\nטלפון: ${p.phone || ''}`);
            }
        });
        calendar.render();
    }
}

async function loadUsers() {
    const res = await fetch('/users');
    const users = await res.json();
    document.getElementById('userList').innerHTML = users.map(u => `<div><b>${u.username}</b> (${u.role}) <button onclick="deleteUser(${u.id})">מחק</button></div>`).join('');
}
async function deleteUser(id) { if(confirm('למחוק?')) await fetch('/delete-user', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id})}); loadUsers(); }

async function loadProjectStats() {
    const [statsRes, usersRes] = await Promise.all([fetch('/project-stats'), fetch('/users')]);
    const stats = await statsRes.json();

    document.getElementById('projectStats').innerHTML = stats.map(s => `
        <div class="card" style="margin-bottom:15px; border:1px solid #eee;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h4>${s.project_name}</h4>
                <div>
                    <button onclick="showComplexManagement('${encodeURIComponent(s.project_name)}')" style="background:#f59e0b; margin-left:5px;">🏢 ניהול מתחמים</button>
                    <button onclick="window.location.href='/export-project/${encodeURIComponent(s.project_name)}'" style="background:#3b82f6;">📥 דוח</button>
                    <button onclick="deleteProject('${encodeURIComponent(s.project_name)}')" style="background:#ef4444; margin-right:5px;">🗑️ מחק</button>
                </div>
            </div>
            <div style="font-size:0.9rem; margin-bottom:10px;">סה"כ: ${s.total} | חתמו: ${s.signed}</div>
        </div>`).join('');
}

async function deleteProject(encodedProject) {
    const project = decodeURIComponent(encodedProject);
    if (!confirm(`למחוק את פרויקט "${project}"?`)) return;
    try {
        const res = await fetch('/delete-project', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ project_name: project }) });
        if (res.ok) { alert('נמחק'); loadProjectStats(); } else alert('שגיאה');
    } catch (e) { alert('שגיאה'); }
}

async function deleteComplex(project, complex) {
    if (!confirm(`למחוק את מתחם "${complex}"?`)) return;
    try {
        const res = await fetch('/delete-complex', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ project_name: project, complex_name: complex }) });
        if (res.ok) { alert('נמחק'); document.getElementById('detailsModal').style.display='none'; } else alert('שגיאה');
    } catch (e) { alert('שגיאה'); }
}

async function showComplexManagement(encodedProject) {
    const project = decodeURIComponent(encodedProject);
    const modal = document.getElementById('detailsModal');
    const content = document.getElementById('modalContent');
    document.getElementById('modalTitle').textContent = `ניהול מתחמים: ${project}`;
    modal.style.display = 'block';
    content.innerHTML = 'טוען נתונים...';

    const [complexesRes, usersRes] = await Promise.all([fetch(`/api/complexes-data?project=${encodedProject}`), fetch('/users')]);
    const complexesData = await complexesRes.json();
    const users = await usersRes.json();
    const managers = users.filter(u => u.role === 'manager');
    const lawyers = users.filter(u => u.role === 'lawyer');
    const agents = users.filter(u => u.role === 'user');

    if (complexesData.length === 0) { content.innerHTML = '<p>לא נמצאו מתחמים.</p>'; return; }

    let html = `<div style="display:flex; flex-direction:column; gap:20px;">`;

    complexesData.forEach(c => {
        const mgrOpts = `<option value="">בחר מנהל</option>` + managers.map(u => `<option value="${u.id}" ${u.id == c.manager_id ? 'selected' : ''}>${u.username}</option>`).join('');
        const lawOpts = `<option value="">בחר עו"ד</option>` + lawyers.map(u => `<option value="${u.id}" ${u.id == c.lawyer_id ? 'selected' : ''}>${u.username}</option>`).join('');
        const agentOpts = `<option value="">בחר מחתים</option>` + agents.map(u => `<option value="${u.id}" ${u.id == c.agent_id ? 'selected' : ''}>${u.username}</option>`).join('');
        const invLink = c.invitation_path ? `<a href="/download-complex-file/invitation/${c.invitation_path}" target="_blank">📄 הזמנה</a>` : '';
        const protLink = c.protocol_path ? `<a href="/download-complex-file/protocol/${c.protocol_path}" target="_blank">📂 פרוטוקול</a>` : '';
        const formId = `form-${c.complex_name.replace(/\s/g, '_')}`;

        html += `
        <div style="border:1px solid #ccc; padding:15px; border-radius:8px; background:#f9f9f9;">
            <div style="display:flex; justify-content:space-between;">
                <h3 style="margin-top:0; color:#2563eb;">מתחם ${c.complex_name}</h3>
                <button onclick="deleteComplex('${project}', '${c.complex_name}')" style="background:#ef4444; width:auto; font-size:0.8rem;">🗑️ מחק</button>
            </div>
            <form id="${formId}" onsubmit="return false;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                    <div><label>מנהל מתחם:</label><select name="manager_id" style="width:100%">${mgrOpts}</select></div>
                    <div><label>עורך דין:</label><select name="lawyer_id" style="width:100%">${lawOpts}</select></div>
                    <div><label>מחתים (נציג):</label><select name="agent_id" style="width:100%">${agentOpts}</select></div>
                    <div><label>סטטוס מתחם:</label>${generateStatusSelect(c.status)}</div>
                    <div><label>שם הכנס:</label><input type="text" name="conference_name" value="${c.conference_name}"></div>
                    <div><label>תאריך ושעה:</label><input type="datetime-local" name="conference_date" value="${c.conference_date}"></div>
                    <div><label>העלאת הזמנה:</label><input type="file" name="invitation"> ${invLink}</div>
                    <div><label>העלאת פרוטוקול:</label><input type="file" name="protocol"> ${protLink}</div>
                </div>
                <div style="margin-top:10px;"><button onclick="saveComplexSettings('${project}', '${c.complex_name}', '${formId}')" style="background:#10b981; width:100%;">שמור הגדרות מתחם</button></div>
            </form>
        </div>`;
    });
    html += `</div>`;
    content.innerHTML = html;
}

async function saveComplexSettings(projectName, complexName, formId) {
    const form = document.getElementById(formId);
    const formData = new FormData(form);
    formData.append('project_name', projectName);
    formData.append('complex_name', complexName);

    try {
        const res = await fetch('/api/update-complex', { method: 'POST', body: formData });
        if (res.ok) alert('מתחם עודכן!'); else alert('שגיאה');
    } catch(e) { alert('תקלה בתקשורת'); }
}