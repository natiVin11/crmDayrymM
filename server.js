const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const http = require('http');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { usersDb, projectsDb, logsDb, meetingsDb } = require('./database');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Create folders
const storedFilesDir = path.join(__dirname, 'uploads', 'stored_files');
const residentDocsDir = path.join(__dirname, 'uploads', 'resident_docs');
const invitationsDir = path.join(__dirname, 'uploads', 'invitations');
const protocolsDir = path.join(__dirname, 'uploads', 'protocols');
[storedFilesDir, invitationsDir, protocolsDir, residentDocsDir].forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/', (req, res) => res.redirect('/html/index.html'));

// Helpers
function dbRun(db, sql, params = []) { return new Promise((resolve, reject) => { db.run(sql, params, function(err) { if (err) reject(err); else resolve(this); }); }); }
function dbGet(db, sql, params = []) { return new Promise((resolve, reject) => { db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); }); }); }
function dbAll(db, sql, params = []) { return new Promise((resolve, reject) => { db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); }); }); }
function logActivity(userId, actionType, description) { dbRun(logsDb, `INSERT INTO activity_logs (user_id, action_type, description) VALUES (?, ?, ?)`, [userId || null, actionType, description]).catch(console.error); }
function sanitize(value) { if (value == null) return ''; const s = String(value).trim(); return (s.toLowerCase() === 'n/a' || s.toLowerCase() === 'null') ? '' : s; }
function parseId(val) { if (!val || val === 'null' || val === '') return null; const p = parseInt(val); return isNaN(p) ? null : p; }

// Excel Logic
async function processExcel(filePath, projectName) {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    let headerRowIndex = -1; let colMap = {};

    for (let i = 0; i < Math.min(rows.length, 50); i++) {
        const row = rows[i];
        const rStr = JSON.stringify(row).toLowerCase();
        if ((rStr.includes('שם') && rStr.includes('בעל')) || rStr.includes('רחוב') || rStr.includes('מתחם') || rStr.includes('טלפון')) {
            headerRowIndex = i;
            row.forEach((cell, index) => {
                if(!cell) return;
                const h = cell.toString().trim();
                if (h.includes('תת מתחם') || h === 'מתחם' || index === 1) colMap.complex = index;
                if ((h.includes('שם בעל') || h.includes('שם דייר')) && !h.includes('בפועל')) colMap.name = index;
                else if (h.includes('שם פרטי')) colMap.firstName = index;
                else if (h.includes('משפחה')) colMap.lastName = index;
                else if (h.includes('בפועל') || h.includes('שוכר')) colMap.renterName = index;
                else if (h.includes('טלפון') || h.includes('נייד')) colMap.phone = index;
                else if (h.includes('ת.ז') || h.includes('זהות')) colMap.idNum = index;
                else if (h.includes('תת') || h.includes('דירה')) colMap.subParcel = index;
                else if (h === 'חלקה') colMap.parcel = index;
                else if (h.includes('גוש')) colMap.block = index;
                else if (h.includes('קומה')) colMap.floor = index;
                else if (h.includes('רחוב') || h.includes('שם הרחוב')) colMap.street = index;
                else if (h.includes('מספר') && (h.includes('בנין') || h.includes('בית'))) colMap.houseNum = index;
                else if (h.includes('כתובת')) colMap.fullAddress = index;
                else if (h.includes('משכיר')) colMap.isRenter = index;
                else if (h.includes('אזהרה') || h.includes('הערות')) colMap.warning = index;
            });
            break;
        }
    }

    if (headerRowIndex === -1) return 0;
    await dbRun(projectsDb, `INSERT OR IGNORE INTO projects_metadata (project_name) VALUES (?)`, [projectName]);

    return new Promise((resolve) => {
        projectsDb.serialize(() => {
            const stmt = projectsDb.prepare(`INSERT INTO residents (
                project_name, complex_name, block, parcel, sub_parcel, floor, name, phone, id_number, 
                current_address, is_renter, renter_name, warning_note, source_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            let lastComplex='A', lastStreet='', lastHouseNum='', lastBlock='', lastParcel='';

            for (let i = headerRowIndex + 1; i < rows.length; i++) {
                const r = rows[i];
                if (!r || r.length === 0) continue;

                let name = '';
                if (colMap.name !== undefined) name = sanitize(r[colMap.name]);
                else if (colMap.firstName !== undefined) {
                    name = sanitize(r[colMap.firstName]);
                    if (colMap.lastName !== undefined) name += ' ' + sanitize(r[colMap.lastName]);
                }
                if (name.includes('שם בעל')) continue;

                let phone = '';
                if (colMap.phone !== undefined && r[colMap.phone]) {
                    phone = String(r[colMap.phone]).replace(/[^0-9]/g, '');
                    if (phone.length === 9 && !phone.startsWith('0')) phone = '0' + phone;
                }

                let warning = 'לא';
                if (colMap.warning !== undefined && r[colMap.warning]) {
                    const wVal = String(r[colMap.warning]).trim();
                    if (wVal && wVal !== '0' && wVal !== '-') warning = wVal;
                }

                let renterName = sanitize(colMap.renterName !== undefined ? r[colMap.renterName] : '');
                let complex = sanitize(colMap.complex !== undefined ? r[colMap.complex] : '');
                if (complex) lastComplex = complex; else complex = lastComplex;
                if (!complex) complex = 'General';

                let street = sanitize(colMap.street !== undefined ? r[colMap.street] : '');
                let houseNum = sanitize(colMap.houseNum !== undefined ? r[colMap.houseNum] : '');
                if (street) lastStreet = street; else street = lastStreet;
                if (houseNum) lastHouseNum = houseNum; else houseNum = lastHouseNum;

                let current_address = '';
                if (colMap.fullAddress !== undefined && r[colMap.fullAddress]) current_address = sanitize(r[colMap.fullAddress]);
                else if (street) current_address = `${street} ${houseNum}`.trim();

                let block = sanitize(colMap.block !== undefined ? r[colMap.block] : '');
                let parcel = sanitize(colMap.parcel !== undefined ? r[colMap.parcel] : '');
                if (block) lastBlock = block; else block = lastBlock;
                if (parcel) lastParcel = parcel; else parcel = lastParcel;
                if (!current_address && block && parcel) current_address = `גוש ${block} חלקה ${parcel}`;

                const idNum = sanitize(colMap.idNum!==undefined ? r[colMap.idNum] : '').replace(/\D/g, '');
                const subParcel = sanitize(colMap.subParcel!==undefined ? r[colMap.subParcel] : '');
                const floor = sanitize(colMap.floor!==undefined ? r[colMap.floor] : '');
                let isRenter = sanitize(colMap.isRenter!==undefined ? r[colMap.isRenter] : '');
                if (!isRenter && renterName.length > 1) isRenter = 'כן';
                if (!isRenter) isRenter = 'לא';

                if (name.length > 1 || (current_address && subParcel)) {
                    stmt.run(projectName, complex, block, parcel, subParcel, floor, name.trim(), phone, idNum, current_address, isRenter, renterName, warning, 'excel');
                }
            }
            stmt.finalize(() => resolve());
        });
    });
}

// User Routes
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await dbGet(usersDb, `SELECT id, username, role FROM users WHERE username = ? AND password = ?`, [username, password]);
        if (!user) return res.status(401).send('פרטים שגויים');
        res.json({ message: 'הצלחה', user });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/users', async (req, res) => { try { res.json(await dbAll(usersDb, "SELECT id, username, role FROM users WHERE id != 1")); } catch (e) { res.status(500).send(e.message); } });
app.post('/add-user', async (req, res) => { try { await dbRun(usersDb, `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, [req.body.username, req.body.password, req.body.role]); res.send('נוסף'); } catch (e) { res.status(500).send(e.message); } });
app.post('/delete-user', async (req, res) => { if (req.body.id == 1) return res.status(403).json({ error: "אסור" }); await dbRun(usersDb, "DELETE FROM users WHERE id = ?", [req.body.id]); res.json({ message: 'Deleted' }); });

// Uploads
app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('חסר קובץ');
    const savedName = `${Date.now()}_${req.file.originalname}`;
    try {
        await processExcel(req.file.path, req.body.project);
        fs.copyFileSync(req.file.path, path.join(storedFilesDir, savedName));
        fs.unlinkSync(req.file.path);
        await dbRun(projectsDb, `INSERT INTO projects_metadata (project_name, original_file_path) VALUES (?, ?) ON CONFLICT(project_name) DO UPDATE SET original_file_path=excluded.original_file_path`, [req.body.project, savedName]);
        res.send(`נקלטו רשומות`);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/upload-resident-doc', upload.single('doc'), async (req, res) => {
    if (!req.file) return res.status(400).send('חסר קובץ');
    const { resident_id, doc_type, uploaded_by_role } = req.body;
    const savedName = `doc_${Date.now()}_${req.file.originalname}`;
    try {
        fs.copyFileSync(req.file.path, path.join(residentDocsDir, savedName));
        fs.unlinkSync(req.file.path);
        await dbRun(projectsDb, `INSERT INTO resident_documents (resident_id, file_name, file_path, doc_type, uploaded_by_role) VALUES (?, ?, ?, ?, ?)`,
            [resident_id, req.file.originalname, savedName, doc_type, uploaded_by_role]);
        res.json({ message: 'הועלה' });
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/upload-contract', upload.single('contract'), async (req, res) => {
    if (!req.file) return res.status(400).send('חסר קובץ');
    const { resident_id } = req.body;
    const savedName = `contract_${Date.now()}_${req.file.originalname}`;
    try {
        fs.copyFileSync(req.file.path, path.join(residentDocsDir, savedName));
        fs.unlinkSync(req.file.path);
        await dbRun(projectsDb, `UPDATE residents SET contract_file_path = ? WHERE id = ?`, [savedName, resident_id]);
        res.json({ message: 'חוזה הועלה' });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/resident-docs/:residentId', async (req, res) => {
    try {
        const docs = await dbAll(projectsDb, `SELECT * FROM resident_documents WHERE resident_id = ?`, [req.params.residentId]);
        res.json(docs);
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/download-doc/:filename', (req, res) => {
    const filePath = path.join(residentDocsDir, req.params.filename);
    if (fs.existsSync(filePath)) res.download(filePath); else res.status(404).send('Not Found');
});

// Complex Management
app.get('/api/complexes-data', async (req, res) => {
    const { project } = req.query;
    try {
        const complexes = await dbAll(projectsDb, `SELECT DISTINCT complex_name FROM residents WHERE project_name = ? ORDER BY complex_name`, [project]);
        const metadata = await dbAll(projectsDb, `SELECT * FROM complexes_metadata WHERE project_name = ?`, [project]);
        const result = complexes.map(c => {
            const meta = metadata.find(m => m.complex_name === c.complex_name) || {};
            return {
                complex_name: c.complex_name,
                manager_id: meta.manager_id || '',
                lawyer_id: meta.lawyer_id || '',
                agent_id: meta.agent_id || '',
                status: meta.status || 'התארגנות / חתימת נציגות',
                conference_name: meta.conference_name || '',
                conference_date: meta.conference_date || '',
                invitation_path: meta.invitation_path || '',
                protocol_path: meta.protocol_path || ''
            };
        });
        res.json(result);
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/update-complex', upload.fields([{ name: 'invitation', maxCount: 1 }, { name: 'protocol', maxCount: 1 }]), async (req, res) => {
    const { project_name, complex_name, manager_id, lawyer_id, agent_id, status, conference_name, conference_date } = req.body;
    const mgrId = parseId(manager_id);
    const lawId = parseId(lawyer_id);
    const agtId = parseId(agent_id);

    let invPath = null, protPath = null;
    if (req.files && req.files['invitation']) {
        invPath = `invite_${Date.now()}_${req.files['invitation'][0].originalname}`;
        fs.renameSync(req.files['invitation'][0].path, path.join(invitationsDir, invPath));
    }
    if (req.files && req.files['protocol']) {
        protPath = `prot_${Date.now()}_${req.files['protocol'][0].originalname}`;
        fs.renameSync(req.files['protocol'][0].path, path.join(protocolsDir, protPath));
    }

    try {
        await dbRun(projectsDb, `INSERT INTO complexes_metadata (project_name, complex_name, manager_id, lawyer_id, agent_id, status, conference_name, conference_date, invitation_path, protocol_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_name, complex_name) DO UPDATE SET
            manager_id=excluded.manager_id, lawyer_id=excluded.lawyer_id, agent_id=excluded.agent_id, status=excluded.status, 
            conference_name=excluded.conference_name, conference_date=excluded.conference_date, 
            invitation_path=excluded.invitation_path, protocol_path=excluded.protocol_path`,
            [project_name, complex_name, mgrId, lawId, agtId, status, conference_name, conference_date, finalInv || null, finalProt || null]);

        if (agtId) {
            await dbRun(projectsDb, `UPDATE residents SET assigned_user_id = ? WHERE project_name = ? AND complex_name = ?`, [agtId, project_name, complex_name]);
        }
        res.json({ message: 'ok' });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/download-complex-file/:type/:filename', (req, res) => {
    const { type, filename } = req.params;
    const dir = type === 'invitation' ? invitationsDir : protocolsDir;
    const filePath = path.join(dir, filename);
    if (fs.existsSync(filePath)) res.download(filePath); else res.status(404).send('Not Found');
});

// Admin Stats
app.get('/project-stats', async (req, res) => {
    try {
        const rows = await dbAll(projectsDb, `SELECT r.project_name, COUNT(r.id) as total, SUM(CASE WHEN r.status LIKE '%חתם%' THEN 1 ELSE 0 END) as signed FROM residents r GROUP BY r.project_name`);
        res.json(rows);
    } catch (e) { res.status(500).json({error: e.message}); }
});

// Delete
app.post('/delete-project', async (req, res) => {
    const { project_name } = req.body;
    try {
        await dbRun(projectsDb, `DELETE FROM residents WHERE project_name = ?`, [project_name]);
        await dbRun(projectsDb, `DELETE FROM projects_metadata WHERE project_name = ?`, [project_name]);
        await dbRun(projectsDb, `DELETE FROM complexes_metadata WHERE project_name = ?`, [project_name]);
        res.json({ message: 'deleted' });
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.post('/delete-complex', async (req, res) => {
    const { project_name, complex_name } = req.body;
    try {
        await dbRun(projectsDb, `DELETE FROM residents WHERE project_name = ? AND complex_name = ?`, [project_name, complex_name]);
        await dbRun(projectsDb, `DELETE FROM complexes_metadata WHERE project_name = ? AND complex_name = ?`, [project_name, complex_name]);
        res.json({ message: 'deleted' });
    } catch (e) { res.status(500).json({error: e.message}); }
});

// User (Agent) + Stats for Dashboard
app.get('/my-buildings', async (req, res) => {
    try {
        const sql = `
            SELECT r.project_name, r.current_address as address, r.complex_name,
            cm.status as project_status, cm.conference_date, cm.conference_name, cm.invitation_path, cm.lawyer_id 
            FROM residents r 
            LEFT JOIN complexes_metadata cm ON r.project_name = cm.project_name AND r.complex_name = cm.complex_name
            WHERE r.assigned_user_id = ? 
            GROUP BY r.project_name, r.current_address`;

        const rows = await dbAll(projectsDb, sql, [req.query.userId]);
        const users = await dbAll(usersDb, `SELECT id, username FROM users WHERE role = 'lawyer'`);
        const lawyerMap = {}; users.forEach(u => lawyerMap[u.id] = u.username);

        const result = [];
        for (const row of rows) {
            // חישוב סטטיסטיקה לנציג
            const stats = await dbGet(projectsDb, `
                SELECT COUNT(*) as total,
                SUM(CASE WHEN status LIKE '%חתם מלא%' THEN 1 ELSE 0 END) as full,
                SUM(CASE WHEN status LIKE '%חתם חלקי%' THEN 1 ELSE 0 END) as partial,
                SUM(CASE WHEN status='סרבן' THEN 1 ELSE 0 END) as refused
                FROM residents WHERE project_name = ? AND complex_name = ?`,
                [row.project_name, row.complex_name]);

            const total = stats.total || 1;
            result.push({
                ...row,
                lawyer_name: lawyerMap[row.lawyer_id] || '',
                stats: {
                    total: stats.total,
                    full_pct: ((stats.full / total) * 100).toFixed(1),
                    partial_pct: ((stats.partial / total) * 100).toFixed(1),
                    refused_pct: ((stats.refused / total) * 100).toFixed(1)
                }
            });
        }
        res.json(result);
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.get('/residents-by-address', async (req, res) => {
    try {
        const residents = await dbAll(projectsDb, `SELECT * FROM residents WHERE project_name = ? AND current_address = ?`, [req.query.project, req.query.address]);
        res.json(residents);
    } catch(e) { res.status(500).json({error: e.message}); }
});

// Meetings
app.post('/schedule-meeting', async (req, res) => {
    try {
        const { resident_id, user_id, project_name, resident_name, start_time, meeting_type } = req.body;
        await dbRun(meetingsDb, `INSERT INTO meetings (resident_id, user_id, project_name, title, start_time, meeting_type) VALUES (?,?,?,?,?,?)`,
            [resident_id, user_id, project_name, `פגישה: ${resident_name}`, start_time, meeting_type]);
        res.json({ message: 'ok' });
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.get('/api/meetings', async (req, res) => {
    try {
        const { userId, role, project, complex } = req.query;
        let meetings = await dbAll(meetingsDb, `SELECT * FROM meetings`);
        let validResidentIds = [];

        if (project && complex) {
            const rows = await dbAll(projectsDb, `SELECT id FROM residents WHERE project_name = ? AND complex_name = ?`, [project, complex]);
            validResidentIds = rows.map(r => r.id);
        } else if (role === 'lawyer' && userId) {
            const rows = await dbAll(projectsDb, `SELECT r.id FROM residents r JOIN complexes_metadata cm ON r.project_name=cm.project_name AND r.complex_name=cm.complex_name WHERE cm.lawyer_id = ?`, [userId]);
            validResidentIds = rows.map(r => r.id);
        } else if (role === 'manager' && userId) {
            const rows = await dbAll(projectsDb, `SELECT r.id FROM residents r JOIN complexes_metadata cm ON r.project_name=cm.project_name AND r.complex_name=cm.complex_name WHERE cm.manager_id = ?`, [userId]);
            validResidentIds = rows.map(r => r.id);
        } else if (role === 'user' && userId) {
            const rows = await dbAll(projectsDb, `SELECT id FROM residents WHERE assigned_user_id = ?`, [userId]);
            validResidentIds = rows.map(r => r.id);
        } else {
            const rows = await dbAll(projectsDb, `SELECT id FROM residents`);
            validResidentIds = rows.map(r => r.id);
        }

        const filteredMeetings = meetings.filter(m => {
            if (role === 'user' && m.user_id == userId) return true;
            if (role === 'lawyer' && m.meeting_type !== 'lawyer') return false;
            return validResidentIds.includes(m.resident_id);
        });

        const ids = filteredMeetings.map(m => m.resident_id).filter(id => id).join(',');
        const detailsMap = {};
        if (ids.length > 0) {
            const details = await dbAll(projectsDb, `SELECT id, name, phone, current_address, note FROM residents WHERE id IN (${ids})`);
            details.forEach(d => detailsMap[d.id] = d);
        }

        const events = filteredMeetings.map(m => {
            const r = detailsMap[m.resident_id] || {};
            return {
                title: `${m.title}${m.meeting_type==='lawyer' ? ' (עו"ד)' : ''}`,
                start: m.start_time,
                color: m.meeting_type === 'lawyer' ? '#8b5cf6' : '#3b82f6',
                extendedProps: { name: r.name, phone: r.phone, address: r.current_address, note: r.note, type: m.meeting_type==='lawyer' ? 'עורך דין' : 'החתמה' }
            };
        });

        res.json(events);
    } catch(e) { res.status(500).json({error:e.message}); }
});

// Updates
app.post('/update-resident-data', async (req, res) => {
    const { id, status, note, signed_representation, signed_contract, missing_docs, is_renter, renter_name, renter_phone, warning_note, current_address, phone, userId } = req.body;
    try {
        const current = await dbGet(projectsDb, "SELECT phone FROM residents WHERE id=?", [id]);
        if (current && current.phone !== phone) {
            await dbRun(projectsDb, `UPDATE residents SET old_phone = phone WHERE id = ? AND (old_phone IS NULL OR old_phone = '')`, [id]);
        }

        await dbRun(projectsDb, `UPDATE residents SET status=?, note=?, signed_representation=?, signed_contract=?, missing_docs=?, is_renter=?, renter_name=?, renter_phone=?, warning_note=?, current_address=?, phone=? WHERE id=?`,
            [status, note, signed_representation, signed_contract, missing_docs, is_renter, renter_name, renter_phone, warning_note, current_address, phone, id]);

        if (userId) {
            const parsedId = parseId(userId);
            if (parsedId !== null) { await dbRun(projectsDb, `UPDATE residents SET assigned_user_id = ? WHERE id=?`, [parsedId, id]); }
        }
        res.json({ message: 'ok' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/lawyer/update-resident', async (req, res) => {
    const { id, lawyer_status, missing_docs, doc_checklist } = req.body;
    try {
        await dbRun(projectsDb, `UPDATE residents SET lawyer_status=?, missing_docs=?, doc_checklist=? WHERE id=?`, [lawyer_status, missing_docs, doc_checklist, id]);
        if (lawyer_status === 'חתם מלא' || lawyer_status === 'חתם חלקי') {
            await dbRun(projectsDb, `UPDATE residents SET status=? WHERE id=?`, [lawyer_status, id]);
        }
        res.json({ message: 'ok' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/lawyer/projects', async (req, res) => {
    try {
        const assignments = await dbAll(projectsDb, `SELECT project_name, complex_name FROM complexes_metadata WHERE lawyer_id = ?`, [req.query.userId]);
        const results = [];
        for (const assign of assignments) {
            const residents = await dbAll(projectsDb, `SELECT * FROM residents WHERE project_name = ? AND complex_name = ? ORDER BY current_address`, [assign.project_name, assign.complex_name]);
            results.push({ project_name: assign.project_name, complex_name: assign.complex_name, residents });
        }
        res.json(results);
    } catch(e) { res.status(500).json({error: e.message}); }
});

// Manager Stats with Breakdown
app.get('/manager/stats', async (req, res) => {
    const managerId = req.query.userId;
    try {
        const assignments = await dbAll(projectsDb, `SELECT project_name, complex_name, invitation_path, protocol_path FROM complexes_metadata WHERE manager_id = ?`, [managerId]);
        if (!assignments.length) return res.json([]);
        const results = [];
        for (const assign of assignments) {
            const stats = await dbGet(projectsDb, `SELECT COUNT(*) as total, 
                SUM(CASE WHEN status LIKE '%חתם מלא%' THEN 1 ELSE 0 END) as signed_full, 
                SUM(CASE WHEN status LIKE '%חתם חלקי%' THEN 1 ELSE 0 END) as signed_partial, 
                SUM(CASE WHEN status='סרבן' THEN 1 ELSE 0 END) as refused, 
                SUM(CASE WHEN status LIKE 'ענה%' THEN 1 ELSE 0 END) as meeting 
                FROM residents WHERE project_name = ? AND complex_name = ?`, [assign.project_name, assign.complex_name]);

            const buildingsStats = await dbAll(projectsDb, `SELECT block, parcel, COUNT(*) as b_total, 
                SUM(CASE WHEN status LIKE '%חתם מלא%' THEN 1 ELSE 0 END) as b_signed_full, 
                SUM(CASE WHEN status LIKE '%חתם חלקי%' THEN 1 ELSE 0 END) as b_signed_partial 
                FROM residents WHERE project_name = ? AND complex_name = ? GROUP BY block, parcel`, [assign.project_name, assign.complex_name]);

            const buildingsWithPct = buildingsStats.map(b => ({
                name: `גוש ${b.block} / חלקה ${b.parcel}`, total: b.b_total,
                full_pct: b.b_total > 0 ? ((b.b_signed_full / b.b_total) * 100).toFixed(1) : 0,
                partial_pct: b.b_total > 0 ? ((b.b_signed_partial / b.b_total) * 100).toFixed(1) : 0
            }));

            const total = stats.total || 1;
            results.push({
                project_name: assign.project_name, complex_name: assign.complex_name,
                invitation_path: assign.invitation_path, protocol_path: assign.protocol_path,
                ...stats,
                signed_full_pct: ((stats.signed_full / total) * 100).toFixed(1),
                signed_partial_pct: ((stats.signed_partial / total) * 100).toFixed(1),
                refused_pct: ((stats.refused / total) * 100).toFixed(1),
                buildings_stats: buildingsWithPct
            });
        }
        res.json(results);
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/export-project/:projectName', async (req, res) => {
    const { complex } = req.query;
    let sql = `SELECT * FROM residents WHERE project_name = ?`;
    let params = [req.params.projectName];
    if (complex) { sql += ` AND complex_name = ?`; params.push(complex); }
    const residents = await dbAll(projectsDb, sql, params);
    const users = await dbAll(usersDb, `SELECT id, username FROM users`);
    const userMap = {}; users.forEach(u => userMap[u.id] = u.username);
    const data = residents.map(r => ({
        'פרויקט': r.project_name, 'מתחם': r.complex_name, 'כתובת': r.current_address, 'שם': r.name, 'טלפון': r.phone,
        'סטטוס': r.status, 'הערות': r.note, 'נציג': userMap[r.assigned_user_id] || '', 'עו"ד': r.lawyer_status
    }));
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(data), "Report");
    res.setHeader('Content-Disposition', 'attachment; filename=' + encodeURIComponent(req.params.projectName) + '_Report.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(xlsx.write(wb, { type: "buffer", bookType: "xlsx" }));
});

app.get('/api/search', async (req, res) => { const { q, role, userId } = req.query; if (!q || q.length < 2) return res.json([]); let sql = `SELECT r.*, cm.lawyer_id FROM residents r LEFT JOIN complexes_metadata cm ON r.project_name = cm.project_name AND r.complex_name = cm.complex_name WHERE (r.name LIKE ? OR r.id_number LIKE ?)`; let params = [`%${q}%`, `%${q}%`]; if (role === 'user') { sql += ` AND r.assigned_user_id = ?`; params.push(userId); } else if (role === 'manager') { sql += ` AND EXISTS (SELECT 1 FROM complexes_metadata cm WHERE cm.manager_id = ? AND cm.project_name = r.project_name AND cm.complex_name = r.complex_name)`; params.push(userId); } else if (role === 'lawyer') { sql += ` AND EXISTS (SELECT 1 FROM complexes_metadata cm WHERE cm.lawyer_id = ? AND cm.project_name = r.project_name AND cm.complex_name = r.complex_name)`; params.push(userId); } try { const rows = await dbAll(projectsDb, sql, params); res.json(rows); } catch (e) { res.status(500).json({error: e.message}); } });

function startServer(port) {
    const server = http.createServer(app);
    server.once('error', (err) => { if (err.code === 'EADDRINUSE') startServer(port + 1); });
    server.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}
startServer(3000);