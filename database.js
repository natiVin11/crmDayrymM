const sqlite3 = require('sqlite3').verbose();

const usersDb = new sqlite3.Database('./users.db');
const projectsDb = new sqlite3.Database('./projects.db');
const meetingsDb = new sqlite3.Database('./meetings.db');
const logsDb = new sqlite3.Database('./logs.db');

usersDb.serialize(() => {
    usersDb.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT
    )`, (err) => { if (!err) usersDb.run(`INSERT OR IGNORE INTO users (id, username, password, role) VALUES (1, 'admin', 'admin', 'admin')`); });

    usersDb.run(`CREATE TABLE IF NOT EXISTS api_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT, service_name TEXT, token TEXT UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

projectsDb.serialize(() => {
    projectsDb.run(`CREATE TABLE IF NOT EXISTS residents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT, complex_name TEXT, 
        block TEXT, parcel TEXT, sub_parcel TEXT, floor TEXT,
        name TEXT, phone TEXT, old_phone TEXT, id_number TEXT,
        status TEXT DEFAULT 'ללא מענה', note TEXT,
        
        lawyer_status TEXT DEFAULT 'טרם טופל', 
        doc_checklist TEXT DEFAULT '{}', 
        contract_file_path TEXT,
        missing_docs TEXT,
        signed_representation TEXT DEFAULT 'לא', signed_contract TEXT DEFAULT 'לא',
        
        is_renter TEXT DEFAULT 'לא', renter_name TEXT, renter_phone TEXT,
        warning_note TEXT DEFAULT 'לא', 
        current_address TEXT,
        source_type TEXT, assigned_user_id INTEGER
    )`);

    projectsDb.run(`CREATE TABLE IF NOT EXISTS projects_metadata (
        project_name TEXT PRIMARY KEY, project_status TEXT DEFAULT 'התארגנות', 
        conference_date TEXT, conference_name TEXT, original_file_path TEXT, conference_invitation_path TEXT
    )`);

    projectsDb.run(`CREATE TABLE IF NOT EXISTS complexes_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT, complex_name TEXT,
        manager_id INTEGER, lawyer_id INTEGER, agent_id INTEGER,
        status TEXT DEFAULT 'התארגנות / חתימת נציגות', 
        conference_name TEXT, conference_date DATETIME,
        invitation_path TEXT, protocol_path TEXT,
        UNIQUE(project_name, complex_name)
    )`);

    projectsDb.run(`CREATE TABLE IF NOT EXISTS resident_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT, resident_id INTEGER, file_name TEXT, file_path TEXT, doc_type TEXT, uploaded_by_role TEXT, upload_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    projectsDb.run(`CREATE TABLE IF NOT EXISTS building_protocols (
        id INTEGER PRIMARY KEY AUTOINCREMENT, project_name TEXT, block TEXT, parcel TEXT, file_name TEXT, file_path TEXT, upload_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

meetingsDb.serialize(() => {
    meetingsDb.run(`CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT, resident_id INTEGER, user_id INTEGER, 
        project_name TEXT, title TEXT, start_time DATETIME, meeting_type TEXT
    )`);
});

logsDb.serialize(() => {
    logsDb.run(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action_type TEXT, description TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

module.exports = { usersDb, projectsDb, meetingsDb, logsDb };