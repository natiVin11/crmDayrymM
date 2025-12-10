const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('userId');

// בדיקת התחברות
if (!userId) {
    alert('שגיאת התחברות: חסר מזהה משתמש');
    window.location.href = '/html/index.html';
}

// טעינת הנתונים בעת טעינת הדף
document.addEventListener('DOMContentLoaded', loadLawyerData);

// --- פונקציה לפתיחת היומן (החלק שהיה חסר) ---
function openLawyerCalendar() {
    const modal = document.getElementById('calendarModal');
    const container = document.getElementById('calendarContainer');

    // הצגת המודאל
    modal.style.display = 'flex';

    // ניקוי ובנייה מחדש
    container.innerHTML = "";
    const calendarEl = document.createElement('div');
    calendarEl.style.height = '100%';
    container.appendChild(calendarEl);

    // טעינת היומן
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
            buttonText: {
                today: 'היום',
                month: 'חודש',
                list: 'רשימה'
            },
            // שליפת פגישות: השרת יחזיר רק פגישות שרלוונטיות לעו"ד
            events: `/api/meetings?role=lawyer&userId=${userId}`,

            eventClick: function(info) {
                const p = info.event.extendedProps;
                alert(
                    `📌 פרטי פגישה:\n` +
                    `----------------\n` +
                    `📅 נושא: ${info.event.title}\n` +
                    `👤 דייר: ${p.name || '?'}\n` +
                    `📞 טלפון: ${p.phone || '-'}\n` +
                    `📍 כתובת: ${p.address || '-'}\n` +
                    `📝 הערות: ${p.note || '-'}`
                );
            }
        });
        calendar.render();
    }, 100);
}

// --- לוגיקת טעינת מתחמים ודיירים ---

async function loadLawyerData() {
    const container = document.getElementById('lawyerProjects');
    container.innerHTML = '<p>טוען נתונים...</p>';

    try {
        const res = await fetch(`/lawyer/projects?userId=${userId}`);
        const projects = await res.json();

        if (projects.length === 0) {
            container.innerHTML = '<div class="card">אין פרויקטים משויכים אליך.</div>';
            return;
        }

        let html = '';

        // לולאה על הפרויקטים/מתחמים
        projects.forEach((p, pIndex) => {
            // קיבוץ דיירים לפי בניינים
            const addresses = {};
            p.residents.forEach(r => {
                const addrKey = r.current_address || `גוש ${r.block || ''}/חלקה ${r.parcel || ''}`;
                if (!addresses[addrKey]) addresses[addrKey] = [];
                addresses[addrKey].push(r);
            });

            // כותרת הפרויקט
            html += `
            <div class="card" style="border-top: 5px solid #2563eb; margin-bottom: 30px;">
                <h2 style="color:#1e3a8a; margin-bottom: 10px;">${p.project_name} - מתחם ${p.complex_name}</h2>
                <div style="color:#64748b; margin-bottom: 20px;">סה"כ דיירים במתחם: ${p.residents.length}</div>
            `;

            // לולאה על הבניינים
            Object.keys(addresses).sort().forEach((addr, aIndex) => {
                const residents = addresses[addr];
                const uniqueId = `collapse-${pIndex}-${aIndex}`;
                const signedCount = residents.filter(r => r.lawyer_status && r.lawyer_status.includes('חתם')).length;

                // כפתור אקורדיון לבניין
                html += `
                <button class="address-toggle-btn" onclick="toggleBuilding('${uniqueId}', this)" style="background-color: #f1f5f9; color: #1e293b; width: 100%; text-align: right; padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 5px; font-weight: bold; cursor: pointer; display: flex; justify-content: space-between;">
                    <span>🏢 ${addr} <span style="font-weight:normal; font-size:0.9rem;">(${residents.length} דיירים, ${signedCount} חתמו)</span></span>
                    <span>▼</span>
                </button>
                
                <div id="${uniqueId}" class="building-container" style="display: none; padding: 10px; border: 1px solid #e2e8f0; border-top: none; background: white; margin-bottom: 15px;">
                    <div class="table-wrapper">
                        <table style="width:100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f8fafc;">
                                    <th style="padding: 10px; text-align: right;">דירה</th>
                                    <th style="padding: 10px; text-align: right;">שם הדייר</th>
                                    <th style="padding: 10px; text-align: right;">טלפון</th>
                                    <th style="padding: 10px; text-align: right; width: 140px;">סטטוס חתימה</th>
                                    <th style="padding: 10px; text-align: center;">מסמכים</th>
                                    <th style="padding: 10px; text-align: right;">צ'ק ליסט</th>
                                    <th style="padding: 10px; text-align: right;">חוזה חתום</th>
                                    <th style="padding: 10px; text-align: center;">פעולות</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                // שורות הדיירים
                html += residents.map(r => {
                    const checklist = JSON.parse(r.doc_checklist || '{}');
                    const reqDocs = ['תעודת זהות', 'נסח טאבו', 'יפוי כוח', 'אישור זכויות', 'מסמכי בנק'];

                    const checklistHtml = reqDocs.map(doc => `
                        <div style="margin-bottom: 2px; display:flex; align-items:center;">
                            <input type="checkbox" id="chk-${r.id}-${doc}" ${checklist[doc] ? 'checked' : ''} style="width:auto; margin-left:5px;">
                            <label for="chk-${r.id}-${doc}" style="font-size: 0.8rem; cursor:pointer;">${doc}</label>
                        </div>
                    `).join('');

                    const rentIcon = r.is_renter === 'כן' ? '<span title="מושכר">🏠</span>' : '';

                    return `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 10px;">${r.sub_parcel || '-'}</td>
                            <td style="padding: 10px; font-weight: bold;">${r.name} ${rentIcon}</td>
                            <td style="padding: 10px;">${r.phone || '-'}</td>
                            
                            <td style="padding: 10px;">
                                <select id="stat-${r.id}" style="width: 100%; padding: 5px; border-radius: 4px; border: 1px solid #ccc; font-weight:bold;">
                                    <option value="טרם טופל" ${r.lawyer_status === 'טרם טופל' ? 'selected' : ''}>טרם טופל</option>
                                    <option value="לא חתם" ${r.lawyer_status === 'לא חתם' ? 'selected' : ''} style="color:red;">לא חתם</option>
                                    <option value="חתם חלקי" ${r.lawyer_status === 'חתם חלקי' ? 'selected' : ''} style="color:orange;">חתם חלקי</option>
                                    <option value="חתם מלא" ${r.lawyer_status === 'חתם מלא' ? 'selected' : ''} style="background:#dcfce7; color:green;">חתם מלא</option>
                                </select>
                            </td>
                            
                            <td style="padding: 10px; text-align: center;">
                                <button onclick="viewDocs(${r.id})" style="font-size: 0.8rem; padding: 4px 8px; background: #64748b; border:none; color:white; border-radius:4px; cursor:pointer;">📂</button>
                            </td>
                            
                            <td style="padding: 10px;">${checklistHtml}</td>
                            
                            <td style="padding: 10px;">
                                <input type="file" id="contract-${r.id}" accept=".pdf" style="width: 100%; font-size: 0.8rem;">
                                ${r.contract_file_path ? `<div style="margin-top:4px;"><a href="/download-doc/${r.contract_file_path}" target="_blank" style="color:green; font-weight:bold; font-size:0.8rem; text-decoration:none;">📄 חוזה קיים</a></div>` : ''}
                            </td>
                            
                            <td style="padding: 10px; text-align: center;">
                                <button onclick="saveLawyerUpdate(${r.id})" style="background: #10b981; padding: 6px 12px; border:none; color:white; border-radius:4px; font-weight:bold; cursor:pointer;">💾</button>
                            </td>
                        </tr>
                    `;
                }).join('');

                html += `</tbody></table></div></div>`;
            });

            html += `</div>`; // סגירת כרטיס מתחם
        });

        container.innerHTML = html;

    } catch (e) {
        container.innerHTML = `<p style="color: red;">שגיאה בטעינת הנתונים: ${e.message}</p>`;
    }
}

// פונקציית פתיחה/סגירה של האקורדיון
function toggleBuilding(elementId, btn) {
    const el = document.getElementById(elementId);
    if (el.style.display === 'block') {
        el.style.display = 'none';
        btn.querySelector('span:last-child').textContent = '▼';
        btn.style.backgroundColor = '#f1f5f9';
    } else {
        el.style.display = 'block';
        btn.querySelector('span:last-child').textContent = '▲';
        btn.style.backgroundColor = '#e0f2fe';
    }
}

// פונקציה להצגת מסמכים
async function viewDocs(residentId) {
    try {
        const res = await fetch(`/resident-docs/${residentId}`);
        const docs = await res.json();

        let content = '';
        if (docs.length === 0) content = '<p style="text-align:center; color:#666;">לא הועלו מסמכים.</p>';
        else {
            content = '<ul style="list-style: none; padding: 0;">';
            docs.forEach(d => {
                const date = new Date(d.upload_date).toLocaleDateString('he-IL');
                content += `<li style="margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                    <a href="/download-doc/${d.file_path}" target="_blank" style="font-weight: bold; color: #2563eb; text-decoration: none;">📄 ${d.doc_type}</a>
                    <div style="font-size:0.8rem; color:#666;">${date} (הועלה ע"י ${d.uploaded_by_role === 'user' ? 'נציג' : 'עו"ד'})</div>
                </li>`;
            });
            content += '</ul>';
        }

        const win = window.open("", "Docs", "width=450,height=500,scrollbars=yes");
        win.document.write(`<html dir="rtl"><body style="font-family:sans-serif;padding:20px;"><h3>📂 מסמכים לדייר</h3>${content}</body></html>`);
    } catch (e) { alert('שגיאה בטעינת מסמכים'); }
}

// פונקציית שמירה
async function saveLawyerUpdate(id) {
    const status = document.getElementById(`stat-${id}`).value;
    const checklist = {};
    ['תעודת זהות', 'נסח טאבו', 'יפוי כוח', 'אישור זכויות', 'מסמכי בנק'].forEach(doc => {
        const cb = document.getElementById(`chk-${id}-${doc}`);
        if(cb) checklist[doc] = cb.checked;
    });

    try {
        // 1. העלאת חוזה אם נבחר
        const contractInput = document.getElementById(`contract-${id}`);
        if (contractInput && contractInput.files.length > 0) {
            const formData = new FormData();
            formData.append('contract', contractInput.files[0]);
            formData.append('resident_id', id);
            const uploadRes = await fetch('/upload-contract', { method: 'POST', body: formData });
            if (!uploadRes.ok) throw new Error('שגיאה בהעלאת החוזה');
        }

        // 2. שמירת הנתונים
        const res = await fetch('/lawyer/update-resident', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                id: id,
                lawyer_status: status,
                doc_checklist: JSON.stringify(checklist),
                userId: userId
            })
        });

        if (res.ok) {
            const btn = document.querySelector(`button[onclick="saveLawyerUpdate(${id})"]`);
            const oldText = btn.innerText;
            btn.style.background = '#059669';
            btn.innerText = '✔';

            setTimeout(() => {
                btn.style.background = '#10b981';
                btn.innerText = oldText;
                // אופציונלי: רענון חלקי או הודעה שחוזה עודכן
                if (contractInput && contractInput.files.length > 0) loadLawyerData();
            }, 1000);
        } else {
            alert('שגיאה בשמירת הנתונים.');
        }

    } catch (e) {
        alert('תקלה: ' + e.message);
    }
}