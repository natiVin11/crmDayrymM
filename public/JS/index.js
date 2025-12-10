document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const userIn = document.getElementById('username').value;
    const passIn = document.getElementById('password').value;
    const errMsg = document.getElementById('errorMessage');
    const btn = document.getElementById('loginBtn');

    // איפוס הודעות והשבתת כפתור
    errMsg.style.display = 'none';
    btn.disabled = true;
    btn.innerText = 'מתחבר...';

    try {
        const res = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userIn, password: passIn })
        });

        if (res.ok) {
            const data = await res.json();

            // שמירת פרטי המשתמש בדפדפן לשימוש בדפים האחרים
            localStorage.setItem('user', JSON.stringify(data.user));

            // --- לוגיקת הניתוב (Router Logic) ---
            const role = data.user.role;
            const userId = data.user.id;

            switch (role) {
                case 'admin':
                    window.location.href = '/html/admin.html';
                    break;
                case 'lawyer': // עורך דין
                    window.location.href = `/html/lawyer.html?userId=${userId}`;
                    break;
                case 'manager': // מנהל מתחם
                    window.location.href = `/html/manager.html?userId=${userId}`;
                    break;
                case 'user': // נציג טלפוני (ברירת מחדל)
                default:
                    window.location.href = `/html/user.html?userId=${userId}`;
                    break;
            }

        } else {
            // שגיאת שם משתמש או סיסמה
            errMsg.textContent = 'שם משתמש או סיסמה שגויים';
            errMsg.style.display = 'block';
            btn.disabled = false;
            btn.innerText = 'התחבר';
        }
    } catch (err) {
        // שגיאת תקשורת
        console.error(err);
        errMsg.textContent = 'שגיאת תקשורת עם השרת';
        errMsg.style.display = 'block';
        btn.disabled = false;
        btn.innerText = 'התחבר';
    }
});
