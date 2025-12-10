const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('userId');

// בדיקת התחברות
if (!userId) {
    alert('שגיאת התחברות: חסר מזהה משתמש');
    window.location.href = '/html/index.html';
}

// משתנים גלובליים
let currentProject = null;
let currentAddress = null;
let allAgents = [];

document.addEventListener('DOMContentLoaded', async () => {
    // טעינת שם משתמש
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        const user = JSON.parse(storedUser);
        const header = document.getElementById('welcomeHeader');
        if(header) header.textContent = `שלום, ${user.username}`;
    }

    // טעינת רשימת נציגים (להעברת טיפול)
    try {
        const res = await fetch('/users');
        const users = await res.json();
        allAgents = users.filter(u => u.role === 'user');
    } catch(e) {}

    loadMyBuildings();
});

// --- פונקציות יומן ---
function openUserCalendar() {
    const modal = document.getElementById('calendarModal');
    const container = document.getElementById('calendarContainer');

    modal.style.display = 'flex';
    container.innerHTML = "";
    const calendarEl = document.createElement('div');
    calendarEl.style.height = '100%';
    container.appendChild(calendarEl);

    setTimeout(() => {
        var calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'he',
            direction: 'rtl',
            height: '100%',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,listWeek'
            },
            events: `/api/meetings?role=user&userId=${userId}`,
            eventClick: function(info) {
                const p = info.event.extendedProps;
                alert(`📌 פגישה: ${info.event.title}\n👤 דייר: ${p.name || '?'}\n📞 טלפון: ${p.phone || '-'}\n📍 כתובת: ${p.address || '-'}`);
            }
        });
        calendar.render();
    }, 100);
}

// --- טעינת רשימת בניינים ודאשבורד ---
async function loadMyBuildings() {
    const container = document.getElementById('myBuildings');
    container.innerHTML = '<p>טוען...</p>';

    // איפוס חיפוש
    const searchInput = document.getElementById('searchInput');
    if(searchInput) searchInput.value = '';

    try {
        const res = await fetch(`/my-buildings?userId=${userId}`);
        const buildings = await res.json();

        if (buildings.length === 0) {
            container.innerHTML = '<p>אין לך כתובות משויכות.</p>';
            return;
        }

        container.innerHTML = buildings.map(b => `
            <div class="card" style="padding:15px; border:1px solid #ddd; margin-bottom:15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div>
                        <h3 style="margin:0; color:#2563eb;">${b.project_name}</h3>
                        <div style="font-size:0.95rem;">${b.address} (מתחם ${b.complex_name})</div>
                    </div>
                    <button onclick="openResidentList('${encodeURIComponent(b.project_name)}', '${encodeURIComponent(b.address)}')" style="background:#3b82f6; width:auto; padding:8px 15px;">הצג דיירים</button>
                </div>
                
                <div style="background:#f8fafc; padding:10px; border-radius:8px; font-size:0.85rem;">
                    <strong>סטטוס מתחם:</strong>
                    <div style="display:flex; height:12px; background:#e5e7eb; border-radius:6px; overflow:hidden; margin:5px 0;">
                        <div style="width:${b.stats.full_pct}%; background:#10b981;" title="מלא ${b.stats.full_pct}%"></div>
                        <div style="width:${b.stats.partial_pct}%; background:#f59e0b;" title="חלקי ${b.stats.partial_pct}%"></div>
                        <div style="width:${b.stats.refused_pct}%; background:#ef4444;" title="סרבן ${b.stats.refused_pct}%"></div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <span style="color:#166534">● מלא: ${b.stats.full_pct}%</span>
                        <span style="color:#b45309">● חלקי: ${b.stats.partial_pct}%</span>
                        <span style="color:#991b1b">● סרבנים: ${b.stats.refused_pct}%</span>
                    </div>
                </div>
            </div>`).join('');
    } catch (e) { container.innerHTML = '<p style="color:red">שגיאה בטעינת נתונים</p>'; }
}

// --- פתיחת רשימת דיירים בבניין ---
async function openResidentList(encodedProject, encodedAddress) {
    const project = decodeURIComponent(encodedProject);
    const address = decodeURIComponent(encodedAddress);

    currentProject = project;
    currentAddress = address;

    const modal = document.getElementById('detailsModal');
    if(modal) modal.style.display = 'flex';

    document.getElementById('modalTitle').textContent = `${project} - ${address}`;
    const content = document.getElementById('modalContent');
    content.innerHTML = '<p style="text-align:center;">טוען דיירים...</p>';

    try {
        const res = await fetch(`/residents-by-address?project=${encodedProject}&address=${encodedAddress}`);
        const residents = await res.json();

        if(residents.length === 0) {
            content.innerHTML = '<p>לא נמצאו דיירים בכתובת זו.</p>';
            return;
        }

        content.innerHTML = residents.map(r => {
            const safeR = JSON.stringify(r).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

            // צבע סטטוס
            const isSigned = r.status.includes('חתם') || r.status === 'ענה ונקבע פגישה';
            const statusStyle = isSigned ? 'background:#dcfce7; color:#166534; font-weight:bold; padding:2px 8px; border-radius:10px;' : 'background:#f1f5f9; padding:2px 8px; border-radius:10px;';

            return `
            <div class="resident-list-item" onclick='openClientCard(${safeR})' style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid #eee; cursor:pointer;">
                <div>
                    <b>${r.name}</b> 
                    <small>| דירה ${r.sub_parcel}</small>
                    ${r.warning_note !== 'לא' ? '<span style="color:red; font-weight:bold;"> (⚠️ אזהרה)</span>' : ''}
                </div>
                <div style="${statusStyle}">${r.status}</div>
            </div>`;
        }).join('');
    } catch(e) {
        content.innerHTML = '<p>שגיאה בטעינת הרשימה</p>';
    }
}

// --- כרטיס דייר (עריכה) ---
function openClientCard(r) {
    const content = document.getElementById('modalContent');
    const statusOpts = ["ללא מענה", "ענה ונקבע פגישה", "סרבן", "לא מעוניין", "בבדיקה"];
    const isRenter = r.is_renter === 'כן';

    // בדיקה אם התיק ננעל ע"י עו"ד
    const isLocked = (r.lawyer_status === 'חתם מלא' || r.lawyer_status === 'חתם חלקי');
    const disabled = isLocked ? 'disabled' : '';

    // צ'ק ליסט לקריאה בלבד
    const checklist = JSON.parse(r.doc_checklist || '{}');
    const reqDocs = ['תעודת זהות', 'נסח טאבו', 'יפוי כוח', 'אישור זכויות', 'מסמכי בנק'];
    let docsHtml = '<div style="margin-top:5px; font-size:0.8rem; display:flex; gap:10px; flex-wrap:wrap;">';
    reqDocs.forEach(doc => { if(checklist[doc]) docsHtml += `<span style="color:green">✅ ${doc}</span>`; });
    docsHtml += '</div>';

    const agentsOptions = allAgents.map(a => `<option value="${a.id}" ${a.id == r.assigned_user_id ? 'selected' : ''}>${a.username}</option>`).join('');

    content.innerHTML = `
        <div class="client-card-grid">
            <div class="form-group"><label>שם מלא</label><input type="text" value="${r.name}" readonly style="background:#eee;"></div>
            
            <div class="form-group">
                <label>טלפון <button type="button" onclick="enablePhoneEdit()" style="background:none; border:none; color:blue; cursor:pointer; text-decoration:underline; font-size:0.8rem;">(מספר שגוי? לחץ לעדכון)</button></label>
                <input type="text" id="client-phone" value="${r.phone}" readonly style="background:#eee; font-weight:bold;">
                ${r.old_phone ? `<small style="color:red; display:block;">מספר מקורי מאקסל: ${r.old_phone}</small>` : ''}
            </div>
            
            <div class="client-card-full" style="background:#f0fdf4; border:1px solid #bbf7d0; padding:10px; border-radius:8px; margin-bottom:10px;">
                <label>📋 סטטוס עורך דין (מסמכים וחתימות):</label>
                <div style="font-size:1.1rem; font-weight:bold;">${r.lawyer_status}</div>
                ${docsHtml}
                ${r.contract_file_path ? `<a href="/download-doc/${r.contract_file_path}" target="_blank" style="display:block; margin-top:5px; color:#166534; font-weight:bold;">📄 הורד חוזה חתום</a>` : ''}
            </div>

            <div class="form-group"><label>נציג מטפל:</label><select id="edit-agent">${agentsOptions}</select></div>

            <div class="form-group"><label>הערת אזהרה (מאקסל):</label>
                <input type="text" value="${r.warning_note}" readonly style="background:#fee2e2; color:#991b1b; font-weight:bold;">
            </div>

            <div class="client-card-full form-group" style="border-top:1px solid #eee; padding-top:10px;">
                <label>📤 העלאת מסמכים:</label>
                <div style="display:flex; gap:5px;">
                    <select id="upload-type" style="flex:1;">
                        <option value="תעודת זהות">תעודת זהות</option>
                        <option value="נסח טאבו">נסח טאבו</option>
                        <option value="יפוי כוח">יפוי כוח</option>
                        <option value="אחר">אחר</option>
                    </select>
                    <input type="file" id="upload-file" style="flex:1;">
                    <button onclick="uploadDoc(${r.id})" style="width:auto; background:#8b5cf6;">העלה</button>
                </div>
            </div>

            <div class="form-group"><label>האם מושכר?</label>
                <select id="edit-rent" onchange="toggleRenterFields()"><option value="לא" ${!isRenter?'selected':''}>לא</option><option value="כן" ${isRenter?'selected':''}>כן</option></select>
            </div>
            
            <div id="renter-fields" class="client-card-full" style="display:${isRenter?'grid':'none'}; grid-template-columns: 1fr 1fr; gap:10px; background:#fffbe6; padding:10px;">
                <div><label>שם השוכר</label><input type="text" id="edit-renter-name" value="${r.renter_name||''}"></div>
                <div><label>טלפון שוכר</label><input type="text" id="edit-renter-phone" value="${r.renter_phone||''}"></div>
            </div>

            <div class="client-card-full form-group"><label>סטטוס טיפול (נציג)</label>
                <select id="edit-status" onchange="toggleMeetingArea()" ${disabled} style="font-weight:bold; border:2px solid blue; padding:8px;">
                    ${statusOpts.map(o=>`<option value="${o}" ${r.status===o?'selected':''}>${o}</option>`).join('')}
                </select>
                ${isLocked ? '<small style="color:red; display:block;">⚠ התיק ננעל ע"י עורך הדין (נחתם)</small>' : ''}
            </div>
            
            <div id="meeting-area" class="meeting-area client-card-full" style="display:none; background:#eff6ff; padding:15px; border-radius:8px;">
                <label style="color:#1e40af; font-weight:bold;">📅 קביעת פגישה חדשה</label>
                <div style="display:flex; gap:10px; margin-top:5px;">
                    <input type="datetime-local" id="edit-date" style="background:#fff;">
                    <select id="edit-meeting-type" style="background:#fff;">
                        <option value="agent">עבורי (החתמה)</option>
                        <option value="lawyer">עבור עורך דין</option>
                    </select>
                </div>
            </div>

            <div class="client-card-full form-group"><label>הערות</label><textarea id="edit-note" rows="3">${r.note||''}</textarea></div>
        </div>
        
        <div style="display:flex; gap:10px; margin-top:15px; border-top:1px solid #ccc; padding-top:15px;">
            <button onclick="saveClientCard(${r.id}, '${r.project_name.replace(/'/g, "\\'")}', '${r.name.replace(/'/g, "\\'")}')" style="flex:2; background:#10b981; font-size:1.1rem;">💾 שמור שינויים</button>
            <button onclick="openResidentList('${encodeURIComponent(currentProject)}', '${encodeURIComponent(currentAddress)}')" style="flex:1; background:#6b7280;">חזור</button>
        </div>
    `;
    toggleMeetingArea();
}

function enablePhoneEdit() {
    const el = document.getElementById('client-phone');
    el.readOnly = false;
    el.style.background = '#fff';
    el.style.border = '2px solid red';
    el.focus();
}

function toggleRenterFields() {
    const isRenter = document.getElementById('edit-rent').value === 'כן';
    document.getElementById('renter-fields').style.display = isRenter ? 'grid' : 'none';
}

function toggleMeetingArea() {
    const status = document.getElementById('edit-status').value;
    const area = document.getElementById('meeting-area');
    area.style.display = (status === 'ענה ונקבע פגישה') ? 'block' : 'none';
}

async function uploadDoc(residentId) {
    const fileInput = document.getElementById('upload-file');
    const docType = document.getElementById('upload-type').value;
    if (!fileInput.files.length) return alert('בחר קובץ');

    const formData = new FormData();
    formData.append('doc', fileInput.files[0]);
    formData.append('resident_id', residentId);
    formData.append('doc_type', docType);
    formData.append('uploaded_by_role', 'user');

    try {
        const res = await fetch('/upload-resident-doc', { method: 'POST', body: formData });
        if(res.ok) alert('המסמך הועלה בהצלחה!'); else alert('שגיאה בהעלאה');
    } catch(e) { alert('תקלה בתקשורת'); }
}

async function saveClientCard(id, projectName, residentName) {
    const status = document.getElementById('edit-status').value;
    const note = document.getElementById('edit-note').value;
    const agentId = document.getElementById('edit-agent').value;
    const isRenter = document.getElementById('edit-rent').value;
    const renterName = document.getElementById('edit-renter-name').value;
    const renterPhone = document.getElementById('edit-renter-phone').value;
    const phone = document.getElementById('client-phone').value;

    const meetingDate = document.getElementById('edit-date').value;
    const meetingType = document.getElementById('edit-meeting-type').value;

    try {
        await fetch('/update-resident-data', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                id, userId: agentId, status, note,
                is_renter: isRenter, renter_name: renterName, renter_phone: renterPhone,
                phone: phone, current_address: currentAddress
            })
        });

        if (status === "ענה ונקבע פגישה") {
            if (!meetingDate) { alert('נא לבחור תאריך לפגישה!'); return; }
            await fetch('/schedule-meeting', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ resident_id: id, user_id: userId, project_name: projectName, resident_name: residentName, start_time: meetingDate, meeting_type: meetingType })
            });
            const cleanPhone = phone.replace(/\D/g, '');
            if (cleanPhone) window.open(`https://wa.me/972${cleanPhone.substring(1)}?text=${encodeURIComponent('נקבעה פגישה לתאריך ' + new Date(meetingDate).toLocaleString())}`, '_blank');
            alert('פגישה נקבעה!');
        } else {
            alert('הנתונים עודכנו בהצלחה!');
        }

        openResidentList(encodeURIComponent(currentProject), encodeURIComponent(currentAddress));

    } catch (e) {
        alert('שגיאה בתקשורת עם השרת');
    }
}

async function searchResidents() {
    const q = document.getElementById('searchInput').value;
    if(!q) return loadMyBuildings();

    const container = document.getElementById('myBuildings');
    container.innerHTML = 'מחפש...';

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&role=user&userId=${userId}`);
        const results = await res.json();

        if (results.length === 0) { container.innerHTML = '<p>לא נמצאו תוצאות.</p>'; return; }

        container.innerHTML = `<h4>תוצאות חיפוש:</h4>` + results.map(r => {
            const safeR = JSON.stringify(r).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
            return `
            <div class="resident-list-item" onclick='openClientCard(${safeR})' style="padding:10px; border-bottom:1px solid #ccc; cursor:pointer;">
                <div><b>${r.name}</b> <small>${r.current_address}</small></div>
                <div>${r.status}</div>
            </div>`;
        }).join('');
    } catch(e) { container.innerHTML = 'שגיאה בחיפוש'; }
}