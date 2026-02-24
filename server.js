const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');
const Database = require('better-sqlite3');
const QRCode = require('qrcode');
const crypto = require('crypto');
const selfsigned = require('selfsigned');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Database Setup ───────────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || __dirname;
const db = new Database(path.join(DATA_DIR, 'phoenix_institute.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    level INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_uid TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    school TEXT,
    birthdate TEXT,
    parent_name TEXT,
    parent_contact TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS student_classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    grade_id INTEGER NOT NULL,
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    active INTEGER DEFAULT 1,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (grade_id) REFERENCES grades(id),
    UNIQUE(student_id, subject_id, grade_id)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    scan_date TEXT NOT NULL,
    scan_time TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    UNIQUE(student_id, subject_id, scan_date)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    amount REAL DEFAULT 0,
    paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    UNIQUE(student_id, subject_id, month, year)
  );
`);

// Seed default subjects and grades
const seedSubjects = ['Science', 'Maths'];
const seedGrades = [
    { name: 'Grade 6', level: 6 },
    { name: 'Grade 7', level: 7 },
    { name: 'Grade 8', level: 8 },
    { name: 'Grade 9', level: 9 },
    { name: 'Grade 10', level: 10 },
    { name: 'Grade 11', level: 11 },
];

const insertSubject = db.prepare('INSERT OR IGNORE INTO subjects (name) VALUES (?)');
seedSubjects.forEach(s => insertSubject.run(s));

const insertGrade = db.prepare('INSERT OR IGNORE INTO grades (name, level) VALUES (?, ?)');
seedGrades.forEach(g => insertGrade.run(g.name, g.level));

// ─── API Routes ───────────────────────────────────────────────────────────────

// === Subjects ===
app.get('/api/subjects', (req, res) => {
    const subjects = db.prepare('SELECT * FROM subjects ORDER BY name').all();
    res.json(subjects);
});

// === Grades ===
app.get('/api/grades', (req, res) => {
    const grades = db.prepare('SELECT * FROM grades ORDER BY level').all();
    res.json(grades);
});

// === Students ===

// Get all students (with optional filters)
app.get('/api/students', (req, res) => {
    const { subject_id, grade_id, search } = req.query;

    let query = `
    SELECT DISTINCT s.*, 
      GROUP_CONCAT(DISTINCT sub.name) as subjects,
      GROUP_CONCAT(DISTINCT g.name) as grades
    FROM students s
    LEFT JOIN student_classes sc ON s.id = sc.student_id AND sc.active = 1
    LEFT JOIN subjects sub ON sc.subject_id = sub.id
    LEFT JOIN grades g ON sc.grade_id = g.id
  `;

    const conditions = [];
    const params = [];

    if (subject_id) {
        conditions.push('sc.subject_id = ?');
        params.push(subject_id);
    }
    if (grade_id) {
        conditions.push('sc.grade_id = ?');
        params.push(grade_id);
    }
    if (search) {
        conditions.push('(s.first_name LIKE ? OR s.last_name LIKE ? OR s.school LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY s.id ORDER BY s.first_name, s.last_name';

    const students = db.prepare(query).all(...params);
    res.json(students);
});

// Get single student
app.get('/api/students/:id', (req, res) => {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const classes = db.prepare(`
    SELECT sc.*, sub.name as subject_name, g.name as grade_name
    FROM student_classes sc
    JOIN subjects sub ON sc.subject_id = sub.id
    JOIN grades g ON sc.grade_id = g.id
    WHERE sc.student_id = ? AND sc.active = 1
  `).all(req.params.id);

    student.classes = classes;
    res.json(student);
});

// Create student
app.post('/api/students', (req, res) => {
    const { first_name, last_name, school, birthdate, parent_name, parent_contact, classes } = req.body;
    console.log('[DEBUG] Create student - classes received:', JSON.stringify(classes));

    if (!first_name || !last_name) {
        return res.status(400).json({ error: 'First name and last name are required' });
    }

    const student_uid = crypto.randomUUID();

    const insertStudent = db.prepare(`
    INSERT INTO students (student_uid, first_name, last_name, school, birthdate, parent_name, parent_contact)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

    const insertClass = db.prepare(`
    INSERT OR IGNORE INTO student_classes (student_id, subject_id, grade_id)
    VALUES (?, ?, ?)
  `);

    const transaction = db.transaction(() => {
        const result = insertStudent.run(student_uid, first_name, last_name, school || null, birthdate || null, parent_name || null, parent_contact || null);
        const studentId = result.lastInsertRowid;

        if (classes && classes.length > 0) {
            classes.forEach(c => {
                insertClass.run(studentId, c.subject_id, c.grade_id);
            });
        }

        return studentId;
    });

    try {
        const studentId = transaction();
        const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
        res.status(201).json(student);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update student
app.put('/api/students/:id', (req, res) => {
    const { first_name, last_name, school, birthdate, parent_name, parent_contact, classes } = req.body;

    const updateStudent = db.prepare(`
    UPDATE students 
    SET first_name = ?, last_name = ?, school = ?, birthdate = ?, parent_name = ?, parent_contact = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

    const deactivateClasses = db.prepare('UPDATE student_classes SET active = 0 WHERE student_id = ?');
    const insertClass = db.prepare(`
    INSERT INTO student_classes (student_id, subject_id, grade_id, active) 
    VALUES (?, ?, ?, 1)
    ON CONFLICT(student_id, subject_id, grade_id) DO UPDATE SET active = 1
  `);

    const transaction = db.transaction(() => {
        updateStudent.run(first_name, last_name, school || null, birthdate || null, parent_name || null, parent_contact || null, req.params.id);

        if (classes) {
            deactivateClasses.run(req.params.id);
            classes.forEach(c => {
                insertClass.run(req.params.id, c.subject_id, c.grade_id);
            });
        }
    });

    try {
        transaction();
        const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
        res.json(student);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete student
app.delete('/api/students/:id', (req, res) => {
    db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// === QR Code ===

// Generate QR code for a student (returns base64 image)
app.get('/api/students/:id/qr', async (req, res) => {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    try {
        const qrData = JSON.stringify({
            uid: student.student_uid,
            id: student.id,
            name: `${student.first_name} ${student.last_name}`
        });

        const qrImage = await QRCode.toDataURL(qrData, {
            width: 400,
            margin: 2,
            color: { dark: '#1a1a2e', light: '#ffffff' }
        });

        res.json({ qr: qrImage, student });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Download QR code as image
app.get('/api/students/:id/qr/image', async (req, res) => {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    try {
        const qrData = JSON.stringify({
            uid: student.student_uid,
            id: student.id,
            name: `${student.first_name} ${student.last_name}`
        });

        const qrBuffer = await QRCode.toBuffer(qrData, {
            width: 400,
            margin: 2,
            color: { dark: '#1a1a2e', light: '#ffffff' }
        });

        res.set('Content-Type', 'image/png');
        res.set('Content-Disposition', `attachment; filename="qr-${student.first_name}-${student.last_name}.png"`);
        res.send(qrBuffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// === Attendance ===

// Record attendance via QR scan
app.post('/api/attendance/scan', (req, res) => {
    const { student_uid, subject_id } = req.body;

    if (!student_uid || !subject_id) {
        return res.status(400).json({ error: 'Student UID and subject ID are required' });
    }

    const student = db.prepare('SELECT * FROM students WHERE student_uid = ?').get(student_uid);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Verify student is enrolled in this subject
    const enrollment = db.prepare(
        'SELECT sc.*, sub.name as subject_name FROM student_classes sc JOIN subjects sub ON sc.subject_id = sub.id WHERE sc.student_id = ? AND sc.subject_id = ? AND sc.active = 1'
    ).get(student.id, subject_id);

    if (!enrollment) {
        const subjectInfo = db.prepare('SELECT name FROM subjects WHERE id = ?').get(subject_id);
        const subjectName = subjectInfo ? subjectInfo.name : 'this subject';
        return res.json({
            success: false,
            message: `${student.first_name} ${student.last_name} is not registered for ${subjectName}`,
            not_enrolled: true,
            student
        });
    }

    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });

    // Check if already scanned today for this subject
    const existing = db.prepare(
        'SELECT * FROM attendance WHERE student_id = ? AND subject_id = ? AND scan_date = ?'
    ).get(student.id, subject_id, today);

    if (existing) {
        return res.json({
            success: false,
            message: `${student.first_name} ${student.last_name} already marked present today at ${existing.scan_time}`,
            already_scanned: true,
            student,
            attendance: existing
        });
    }

    // Record attendance
    const result = db.prepare(
        'INSERT INTO attendance (student_id, subject_id, scan_date, scan_time) VALUES (?, ?, ?, ?)'
    ).run(student.id, subject_id, today, now);

    res.json({
        success: true,
        message: `${student.first_name} ${student.last_name} marked present at ${now}`,
        already_scanned: false,
        student,
        attendance: { id: result.lastInsertRowid, scan_date: today, scan_time: now }
    });
});

// Get attendance records with filters
app.get('/api/attendance', (req, res) => {
    const { subject_id, grade_id, date, student_id } = req.query;

    let query = `
    SELECT a.*, s.first_name, s.last_name, s.student_uid, sub.name as subject_name
    FROM attendance a
    JOIN students s ON a.student_id = s.id
    JOIN subjects sub ON a.subject_id = sub.id
  `;

    const conditions = [];
    const params = [];

    if (student_id) {
        conditions.push('a.student_id = ?');
        params.push(student_id);
    }
    if (subject_id) {
        conditions.push('a.subject_id = ?');
        params.push(subject_id);
    }
    if (date) {
        conditions.push('a.scan_date = ?');
        params.push(date);
    }
    if (grade_id) {
        query += ' JOIN student_classes sc ON s.id = sc.student_id AND sc.active = 1';
        conditions.push('sc.grade_id = ?');
        params.push(grade_id);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY a.scan_date DESC, a.scan_time DESC';

    const records = db.prepare(query).all(...params);
    res.json(records);
});

// Get today's attendance summary
app.get('/api/attendance/today', (req, res) => {
    const { subject_id } = req.query;
    const today = new Date().toISOString().split('T')[0];

    let query = `
    SELECT a.*, s.first_name, s.last_name, sub.name as subject_name
    FROM attendance a
    JOIN students s ON a.student_id = s.id
    JOIN subjects sub ON a.subject_id = sub.id
    WHERE a.scan_date = ?
  `;
    const params = [today];

    if (subject_id) {
        query += ' AND a.subject_id = ?';
        params.push(subject_id);
    }

    query += ' ORDER BY a.scan_time DESC';

    const records = db.prepare(query).all(...params);
    res.json(records);
});

// === Payments ===

// Record a payment
app.post('/api/payments', (req, res) => {
    const { student_id, subject_id, month, year, amount, notes } = req.body;

    if (!student_id || !subject_id || !month || !year) {
        return res.status(400).json({ error: 'Student ID, subject ID, month, and year are required' });
    }

    try {
        const result = db.prepare(`
      INSERT INTO payments (student_id, subject_id, month, year, amount, notes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, subject_id, month, year) DO UPDATE 
      SET amount = ?, notes = ?, paid_at = CURRENT_TIMESTAMP
    `).run(student_id, subject_id, month, year, amount || 0, notes || null, amount || 0, notes || null);

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get payment status for a student
app.get('/api/payments/student/:studentId', (req, res) => {
    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();

    const payments = db.prepare(`
    SELECT p.*, sub.name as subject_name
    FROM payments p
    JOIN subjects sub ON p.subject_id = sub.id
    WHERE p.student_id = ? AND p.year = ?
    ORDER BY p.month
  `).all(req.params.studentId, currentYear);

    res.json(payments);
});

// Get payment report (all students, a specific month)
app.get('/api/payments/report', (req, res) => {
    const { subject_id, grade_id, month, year } = req.query;
    const currentMonth = month || new Date().getMonth() + 1;
    const currentYear = year || new Date().getFullYear();

    let query = `
    SELECT s.id, s.first_name, s.last_name, s.student_uid,
      sc.subject_id, sc.grade_id,
      p.id as payment_id, p.amount, p.paid_at, p.notes,
      sub.name as subject_name, g.name as grade_name
    FROM students s
    JOIN student_classes sc ON s.id = sc.student_id AND sc.active = 1
    JOIN subjects sub ON sc.subject_id = sub.id
    JOIN grades g ON sc.grade_id = g.id
    LEFT JOIN payments p ON s.id = p.student_id AND p.subject_id = sc.subject_id AND p.month = ? AND p.year = ?
  `;

    const params = [currentMonth, currentYear];
    const conditions = [];

    if (subject_id) {
        conditions.push('sc.subject_id = ?');
        params.push(subject_id);
    }
    if (grade_id) {
        conditions.push('sc.grade_id = ?');
        params.push(grade_id);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY s.first_name, s.last_name';

    const records = db.prepare(query).all(...params);
    res.json(records);
});

// Delete payment
app.delete('/api/payments/:id', (req, res) => {
    db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// === Income Report ===

// Get monthly income summary for a year
app.get('/api/income/monthly', (req, res) => {
    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();

    // Total per month
    const monthlyTotals = db.prepare(`
      SELECT month, SUM(amount) as total, COUNT(*) as payment_count
      FROM payments
      WHERE year = ?
      GROUP BY month
      ORDER BY month
    `).all(currentYear);

    // Subject-wise breakdown per month
    const subjectBreakdown = db.prepare(`
      SELECT p.month, sub.name as subject_name, sub.id as subject_id,
        SUM(p.amount) as total, COUNT(*) as payment_count
      FROM payments p
      JOIN subjects sub ON p.subject_id = sub.id
      WHERE p.year = ?
      GROUP BY p.month, p.subject_id
      ORDER BY p.month, sub.name
    `).all(currentYear);

    // Yearly total
    const yearlyTotal = db.prepare(`
      SELECT SUM(amount) as total, COUNT(*) as payment_count
      FROM payments
      WHERE year = ?
    `).get(currentYear);

    res.json({
        year: parseInt(currentYear),
        monthlyTotals,
        subjectBreakdown,
        yearlyTotal: yearlyTotal.total || 0,
        totalPayments: yearlyTotal.payment_count || 0
    });
});

// === Dashboard Stats ===
app.get('/api/dashboard/stats', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
    const todayAttendance = db.prepare('SELECT COUNT(*) as count FROM attendance WHERE scan_date = ?').get(today).count;
    const totalEnrollments = db.prepare('SELECT COUNT(*) as count FROM student_classes WHERE active = 1').get().count;
    const paidEnrollments = db.prepare(`
      SELECT COUNT(*) as count FROM student_classes sc
      INNER JOIN payments p ON sc.student_id = p.student_id AND sc.subject_id = p.subject_id
        AND p.month = ? AND p.year = ?
      WHERE sc.active = 1
    `).get(currentMonth, currentYear).count;

    res.json({
        totalStudents,
        todayAttendance,
        totalEnrollments,
        paidThisMonth: paidEnrollments,
        unpaidThisMonth: totalEnrollments - paidEnrollments
    });
});

// === Serve Frontend ===
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ─────────────────────────────────────────────────────────────

const IS_PRODUCTION = process.env.FLY_APP_NAME || process.env.NODE_ENV === 'production';

(async function startServer() {
    // Start HTTP server
    app.listen(PORT, () => {
        console.log(`\n🏫 Phoenix Education Institute Management System`);
        console.log(`   HTTP  → http://localhost:${PORT}`);
        if (IS_PRODUCTION) {
            console.log(`   Running in production mode (HTTPS handled by platform)`);
            console.log(`   Data directory: ${DATA_DIR}\n`);
        }
    });

    // Start HTTPS server only in local/development mode
    if (!IS_PRODUCTION) {
        const certPath = path.join(__dirname, 'ssl-cert.pem');
        const keyPath = path.join(__dirname, 'ssl-key.pem');

        let sslCert, sslKey;
        if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
            sslCert = fs.readFileSync(certPath, 'utf8');
            sslKey = fs.readFileSync(keyPath, 'utf8');
        } else {
            console.log('⏳ Generating SSL certificate for HTTPS...');
            const attrs = [{ name: 'commonName', value: 'Phoenix Education Institute' }];
            const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048, algorithm: 'sha256' });
            sslCert = pems.cert;
            sslKey = pems.private;
            fs.writeFileSync(certPath, sslCert);
            fs.writeFileSync(keyPath, sslKey);
            console.log('✅ SSL certificate generated!');
        }

        const httpsServer = https.createServer({ key: sslKey, cert: sslCert }, app);
        httpsServer.listen(HTTPS_PORT, () => {
            console.log(`   HTTPS → https://localhost:${HTTPS_PORT}`);
            console.log(`\n📱 Mobile Access:`);
            const os = require('os');
            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        console.log(`   Dashboard → https://${iface.address}:${HTTPS_PORT}`);
                        console.log(`   QR Scanner → https://${iface.address}:${HTTPS_PORT}/scanner.html`);
                    }
                }
            }
            console.log(`\n⚠️  On mobile, accept the "Not Secure" warning to proceed.\n`);
        });
    }
})().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

