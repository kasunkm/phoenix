/* ═══════════════════════════════════════════════════════════════════════════
   Phoenix Education Institute — Admin Dashboard App
   ═══════════════════════════════════════════════════════════════════════════ */

const API_BASE = '';  // Same origin

// ─── State ──────────────────────────────────────────────────────────────────
let subjects = [];
let grades = [];
let classEntryIndex = 1;

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupMobileMenu();
    loadSubjectsAndGrades();
    loadDashboard();
    setCurrentDate();
    setPaymentDefaults();
    setupStudentSearch();
    setAttendanceDateToday();
});

// ─── Navigation ─────────────────────────────────────────────────────────────
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(pageName) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`[data-page="${pageName}"]`);
    if (navItem) navItem.classList.add('active');

    // Show page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(`page-${pageName}`);
    if (page) page.classList.add('active');

    // Close mobile menu
    closeMobileMenu();

    // Load data for page
    switch (pageName) {
        case 'dashboard': loadDashboard(); break;
        case 'students': loadStudents(); break;
        case 'attendance': loadAttendance(); break;
        case 'payments': loadPaymentReport(); break;
        case 'income': loadIncomeReport(); break;
        case 'qrcodes': loadQRCodes(); break;
    }
}

// ─── Mobile Menu ────────────────────────────────────────────────────────────
function setupMobileMenu() {
    const toggle = document.getElementById('menu-toggle');
    const overlay = document.getElementById('sidebar-overlay');

    toggle.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
        overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', closeMobileMenu);
}

function closeMobileMenu() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
}

// ─── Date Helpers ───────────────────────────────────────────────────────────
function setCurrentDate() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('header-date').textContent = now.toLocaleDateString('en-US', options);
}

function setPaymentDefaults() {
    const now = new Date();
    document.getElementById('payment-month').value = now.getMonth() + 1;
    document.getElementById('payment-year').value = now.getFullYear();
}

function setAttendanceDateToday() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('attendance-date').value = today;
}

// ─── Load Subjects & Grades ─────────────────────────────────────────────────
async function loadSubjectsAndGrades() {
    try {
        const [subRes, gradeRes] = await Promise.all([
            fetch(`${API_BASE}/api/subjects`),
            fetch(`${API_BASE}/api/grades`)
        ]);

        subjects = await subRes.json();
        grades = await gradeRes.json();

        populateFilterDropdowns();
    } catch (err) {
        console.error('Failed to load subjects/grades:', err);
    }
}

function populateFilterDropdowns() {
    const subjectSelects = document.querySelectorAll('#filter-subject, #attendance-subject, #payment-subject, #qr-subject');
    const gradeSelects = document.querySelectorAll('#filter-grade, #attendance-grade, #payment-grade, #qr-grade');

    subjectSelects.forEach(sel => {
        const firstOption = sel.querySelector('option');
        sel.innerHTML = '';
        sel.appendChild(firstOption);
        subjects.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            sel.appendChild(opt);
        });
    });

    gradeSelects.forEach(sel => {
        const firstOption = sel.querySelector('option');
        sel.innerHTML = '';
        sel.appendChild(firstOption);
        grades.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.name;
            sel.appendChild(opt);
        });
    });
}

// ─── Dashboard ──────────────────────────────────────────────────────────────
async function loadDashboard() {
    try {
        const [statsRes, attendanceRes] = await Promise.all([
            fetch(`${API_BASE}/api/dashboard/stats`),
            fetch(`${API_BASE}/api/attendance/today`)
        ]);

        const stats = await statsRes.json();
        const attendance = await attendanceRes.json();

        // Update stats
        animateValue('stat-students-count', stats.totalStudents);
        animateValue('stat-attendance-count', stats.todayAttendance);
        animateValue('stat-enrollments-count', stats.totalEnrollments);
        animateValue('stat-unpaid-count', stats.unpaidThisMonth);

        // Recent attendance
        const listEl = document.getElementById('recent-attendance-list');
        const emptyEl = document.getElementById('no-recent-attendance');

        if (attendance.length === 0) {
            listEl.innerHTML = '';
            emptyEl.style.display = 'block';
        } else {
            emptyEl.style.display = 'none';
            listEl.innerHTML = attendance.slice(0, 10).map(a => `
        <div class="attendance-item">
          <div class="avatar">${a.first_name[0]}${a.last_name[0]}</div>
          <div class="info">
            <div class="name">${a.first_name} ${a.last_name}</div>
            <span class="subject-tag">${a.subject_name}</span>
          </div>
          <span class="time">${a.scan_time}</span>
        </div>
      `).join('');
        }
    } catch (err) {
        console.error('Failed to load dashboard:', err);
    }
}

function animateValue(elementId, endValue) {
    const el = document.getElementById(elementId);
    const start = parseInt(el.textContent) || 0;
    const duration = 600;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(start + (endValue - start) * eased);
        if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
}

// ─── Students ───────────────────────────────────────────────────────────────
function setupStudentSearch() {
    let timeout;
    document.getElementById('student-search').addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(loadStudents, 300);
    });

    document.getElementById('filter-subject').addEventListener('change', loadStudents);
    document.getElementById('filter-grade').addEventListener('change', loadStudents);
}

async function loadStudents() {
    const search = document.getElementById('student-search').value;
    const subject_id = document.getElementById('filter-subject').value;
    const grade_id = document.getElementById('filter-grade').value;

    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (subject_id) params.set('subject_id', subject_id);
    if (grade_id) params.set('grade_id', grade_id);

    try {
        const res = await fetch(`${API_BASE}/api/students?${params}`);
        const students = await res.json();

        const tbody = document.getElementById('students-tbody');
        const emptyEl = document.getElementById('no-students');
        const table = document.getElementById('students-table');

        if (students.length === 0) {
            tbody.innerHTML = '';
            table.style.display = 'none';
            emptyEl.style.display = 'block';
        } else {
            table.style.display = 'table';
            emptyEl.style.display = 'none';

            tbody.innerHTML = students.map(s => `
        <tr>
          <td>
            <strong>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</strong>
          </td>
          <td>${escapeHtml(s.school || '—')}</td>
          <td>${(s.subjects || '').split(',').filter(Boolean).map(sub => `<span class="tag tag-subject">${escapeHtml(sub)}</span>`).join('') || '—'}</td>
          <td>${(s.grades || '').split(',').filter(Boolean).map(g => `<span class="tag tag-grade">${escapeHtml(g)}</span>`).join('') || '—'}</td>
          <td>${escapeHtml(s.parent_contact || '—')}</td>
          <td>
            <div class="table-actions">
              <button class="btn-icon" onclick="viewStudent(${s.id})" title="View Details">
                <span class="material-icons-round">visibility</span>
              </button>
              <button class="btn-icon" onclick="editStudent(${s.id})" title="Edit">
                <span class="material-icons-round">edit</span>
              </button>
              <button class="btn-icon delete" onclick="deleteStudent(${s.id}, '${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}')" title="Delete">
                <span class="material-icons-round">delete</span>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
        }
    } catch (err) {
        console.error('Failed to load students:', err);
        showToast('Failed to load students', 'error');
    }
}

// ─── Student Modal ──────────────────────────────────────────────────────────
function openAddStudentModal() {
    document.getElementById('modal-title').textContent = 'Add New Student';
    document.getElementById('student-form').reset();
    document.getElementById('edit-student-id').value = '';
    resetClassEntries();
    populateClassDropdowns();
    document.getElementById('student-modal-overlay').classList.add('active');
}

async function editStudent(id) {
    try {
        const res = await fetch(`${API_BASE}/api/students/${id}`);
        const student = await res.json();

        document.getElementById('modal-title').textContent = 'Edit Student';
        document.getElementById('edit-student-id').value = student.id;
        document.getElementById('inp-first-name').value = student.first_name;
        document.getElementById('inp-last-name').value = student.last_name;
        document.getElementById('inp-school').value = student.school || '';
        document.getElementById('inp-birthdate').value = student.birthdate || '';
        document.getElementById('inp-parent-name').value = student.parent_name || '';
        document.getElementById('inp-parent-contact').value = student.parent_contact || '';

        // Reset and populate class entries
        resetClassEntries();
        populateClassDropdowns();

        if (student.classes && student.classes.length > 0) {
            // Set first class
            document.querySelector('.class-subject[data-index="0"]').value = student.classes[0].subject_id;
            document.querySelector('.class-grade[data-index="0"]').value = student.classes[0].grade_id;

            // Add more classes
            for (let i = 1; i < student.classes.length; i++) {
                addClassEntry();
                const idx = classEntryIndex - 1;
                document.querySelector(`.class-subject[data-index="${idx}"]`).value = student.classes[i].subject_id;
                document.querySelector(`.class-grade[data-index="${idx}"]`).value = student.classes[i].grade_id;
            }
        }

        document.getElementById('student-modal-overlay').classList.add('active');
    } catch (err) {
        showToast('Failed to load student details', 'error');
    }
}

function closeStudentModal() {
    document.getElementById('student-modal-overlay').classList.remove('active');
}

function resetClassEntries() {
    classEntryIndex = 1;
    const container = document.getElementById('class-entries');
    container.innerHTML = `
    <div class="class-entry" data-index="0">
      <select class="form-select class-subject" data-index="0" id="class-subject-0">
        <option value="">Select Subject</option>
      </select>
      <select class="form-select class-grade" data-index="0" id="class-grade-0">
        <option value="">Select Grade</option>
      </select>
      <button type="button" class="btn-icon btn-remove-class" onclick="removeClassEntry(this)" style="visibility:hidden">
        <span class="material-icons-round">remove_circle</span>
      </button>
    </div>
  `;
}

function addClassEntry() {
    const container = document.getElementById('class-entries');
    const idx = classEntryIndex++;
    const entry = document.createElement('div');
    entry.className = 'class-entry';
    entry.dataset.index = idx;
    entry.innerHTML = `
    <select class="form-select class-subject" data-index="${idx}" id="class-subject-${idx}">
      <option value="">Select Subject</option>
    </select>
    <select class="form-select class-grade" data-index="${idx}" id="class-grade-${idx}">
      <option value="">Select Grade</option>
    </select>
    <button type="button" class="btn-icon btn-remove-class" onclick="removeClassEntry(this)">
      <span class="material-icons-round">remove_circle</span>
    </button>
  `;
    container.appendChild(entry);

    // Populate new dropdowns
    const subSelect = entry.querySelector('.class-subject');
    const gradeSelect = entry.querySelector('.class-grade');
    subjects.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        subSelect.appendChild(opt);
    });
    grades.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        gradeSelect.appendChild(opt);
    });
}

function removeClassEntry(btn) {
    btn.closest('.class-entry').remove();
}

function populateClassDropdowns() {
    document.querySelectorAll('.class-subject').forEach(sel => {
        const val = sel.value;
        const firstOpt = sel.querySelector('option');
        sel.innerHTML = '';
        sel.appendChild(firstOpt);
        subjects.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            sel.appendChild(opt);
        });
        sel.value = val;
    });

    document.querySelectorAll('.class-grade').forEach(sel => {
        const val = sel.value;
        const firstOpt = sel.querySelector('option');
        sel.innerHTML = '';
        sel.appendChild(firstOpt);
        grades.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.name;
            sel.appendChild(opt);
        });
        sel.value = val;
    });
}

async function handleStudentSubmit(e) {
    e.preventDefault();

    const editId = document.getElementById('edit-student-id').value;
    const data = {
        first_name: document.getElementById('inp-first-name').value.trim(),
        last_name: document.getElementById('inp-last-name').value.trim(),
        school: document.getElementById('inp-school').value.trim(),
        birthdate: document.getElementById('inp-birthdate').value,
        parent_name: document.getElementById('inp-parent-name').value.trim(),
        parent_contact: document.getElementById('inp-parent-contact').value.trim(),
        classes: []
    };

    // Collect class entries - scope selector to the class-entries container
    const classEntriesContainer = document.getElementById('class-entries');
    const allEntries = classEntriesContainer.querySelectorAll('.class-entry');
    console.log('[DEBUG] Found class entries:', allEntries.length);
    allEntries.forEach((entry, i) => {
        const subjectSelect = entry.querySelector('.class-subject');
        const gradeSelect = entry.querySelector('.class-grade');
        const subjectId = subjectSelect ? subjectSelect.value : '';
        const gradeId = gradeSelect ? gradeSelect.value : '';
        console.log(`[DEBUG] Entry ${i}: subject=${subjectId}, grade=${gradeId}`);
        if (subjectId && gradeId) {
            data.classes.push({ subject_id: parseInt(subjectId), grade_id: parseInt(gradeId) });
        }
    });
    console.log('[DEBUG] Final classes to send:', JSON.stringify(data.classes));

    try {
        const url = editId ? `${API_BASE}/api/students/${editId}` : `${API_BASE}/api/students`;
        const method = editId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to save student');
        }

        closeStudentModal();
        loadStudents();
        showToast(editId ? 'Student updated successfully!' : 'Student added successfully!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteStudent(id, name) {
    if (!confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) return;

    try {
        await fetch(`${API_BASE}/api/students/${id}`, { method: 'DELETE' });
        loadStudents();
        showToast(`${name} has been deleted`, 'success');
    } catch (err) {
        showToast('Failed to delete student', 'error');
    }
}

// ─── Student Detail Modal ───────────────────────────────────────────────────
async function viewStudent(id) {
    try {
        const [studentRes, paymentsRes] = await Promise.all([
            fetch(`${API_BASE}/api/students/${id}`),
            fetch(`${API_BASE}/api/payments/student/${id}?year=${new Date().getFullYear()}`)
        ]);

        const student = await studentRes.json();
        const payments = await paymentsRes.json();

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        document.getElementById('detail-modal-title').textContent = `${student.first_name} ${student.last_name}`;
        document.getElementById('detail-modal-body').innerHTML = `
      <div class="detail-section">
        <h4><span class="material-icons-round" style="font-size:18px">person</span> Personal Info</h4>
        <div class="detail-grid">
          <div class="detail-item">
            <div class="label">Full Name</div>
            <div class="value">${escapeHtml(student.first_name)} ${escapeHtml(student.last_name)}</div>
          </div>
          <div class="detail-item">
            <div class="label">School</div>
            <div class="value">${escapeHtml(student.school || 'Not specified')}</div>
          </div>
          <div class="detail-item">
            <div class="label">Date of Birth</div>
            <div class="value">${student.birthdate ? formatDate(student.birthdate) : 'Not specified'}</div>
          </div>
          <div class="detail-item">
            <div class="label">Student ID</div>
            <div class="value" style="font-size:0.75rem;word-break:break-all">${student.student_uid}</div>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h4><span class="material-icons-round" style="font-size:18px">family_restroom</span> Parent Info</h4>
        <div class="detail-grid">
          <div class="detail-item">
            <div class="label">Parent's Name</div>
            <div class="value">${escapeHtml(student.parent_name || 'Not specified')}</div>
          </div>
          <div class="detail-item">
            <div class="label">Contact Number</div>
            <div class="value">${escapeHtml(student.parent_contact || 'Not specified')}</div>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h4><span class="material-icons-round" style="font-size:18px">class</span> Enrolled Classes</h4>
        <div class="detail-classes-list">
          ${student.classes && student.classes.length > 0
                ? student.classes.map(c => `<span class="detail-class-tag">${escapeHtml(c.subject_name)} — ${escapeHtml(c.grade_name)}</span>`).join('')
                : '<span class="text-muted">No classes enrolled</span>'
            }
        </div>
      </div>

      <div class="detail-section">
        <h4><span class="material-icons-round" style="font-size:18px">payments</span> Payment History (${new Date().getFullYear()})</h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${months.map((m, i) => {
                const payment = payments.find(p => p.month === i + 1);
                return `<div style="padding:8px 12px;border-radius:8px;text-align:center;min-width:60px;background:${payment ? 'rgba(0,184,148,0.12)' : 'rgba(214,48,49,0.08)'};border:1px solid ${payment ? 'rgba(0,184,148,0.2)' : 'rgba(214,48,49,0.15)'}">
              <div style="font-size:0.7rem;color:var(--text-muted)">${m}</div>
              <div style="font-size:0.8rem;font-weight:600;color:${payment ? 'var(--accent-green)' : 'var(--accent-red)'}">${payment ? '✓' : '✗'}</div>
            </div>`;
            }).join('')}
        </div>
      </div>
    `;

        document.getElementById('detail-modal-overlay').classList.add('active');
    } catch (err) {
        showToast('Failed to load student details', 'error');
    }
}

function closeDetailModal() {
    document.getElementById('detail-modal-overlay').classList.remove('active');
}

// ─── Attendance ─────────────────────────────────────────────────────────────
async function loadAttendance() {
    const date = document.getElementById('attendance-date').value;
    const subject_id = document.getElementById('attendance-subject').value;
    const grade_id = document.getElementById('attendance-grade').value;

    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (subject_id) params.set('subject_id', subject_id);
    if (grade_id) params.set('grade_id', grade_id);

    try {
        const res = await fetch(`${API_BASE}/api/attendance?${params}`);
        const records = await res.json();

        const tbody = document.getElementById('attendance-tbody');
        const emptyEl = document.getElementById('no-attendance');
        const table = document.getElementById('attendance-table');

        if (records.length === 0) {
            tbody.innerHTML = '';
            table.style.display = 'none';
            emptyEl.style.display = 'block';
        } else {
            table.style.display = 'table';
            emptyEl.style.display = 'none';

            tbody.innerHTML = records.map(r => `
        <tr>
          <td><strong>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</strong></td>
          <td><span class="tag tag-subject">${escapeHtml(r.subject_name)}</span></td>
          <td>${formatDate(r.scan_date)}</td>
          <td>${escapeHtml(r.scan_time)}</td>
        </tr>
      `).join('');
        }
    } catch (err) {
        showToast('Failed to load attendance records', 'error');
    }
}

// ─── Payments ───────────────────────────────────────────────────────────────
async function loadPaymentReport() {
    const month = document.getElementById('payment-month').value;
    const year = document.getElementById('payment-year').value;
    const subject_id = document.getElementById('payment-subject').value;
    const grade_id = document.getElementById('payment-grade').value;
    const status = document.getElementById('payment-status').value;

    const params = new URLSearchParams({ month, year });
    if (subject_id) params.set('subject_id', subject_id);
    if (grade_id) params.set('grade_id', grade_id);

    try {
        const res = await fetch(`${API_BASE}/api/payments/report?${params}`);
        let records = await res.json();

        // Client-side status filter
        if (status === 'unpaid') {
            records = records.filter(r => !r.payment_id);
        } else if (status === 'paid') {
            records = records.filter(r => r.payment_id);
        }

        const tbody = document.getElementById('payments-tbody');
        const emptyEl = document.getElementById('no-payments');
        const table = document.getElementById('payments-table');

        if (records.length === 0) {
            tbody.innerHTML = '';
            table.style.display = 'none';
            emptyEl.style.display = 'block';
        } else {
            table.style.display = 'table';
            emptyEl.style.display = 'none';

            const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

            tbody.innerHTML = records.map(r => `
        <tr>
          <td><strong>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</strong></td>
          <td><span class="tag tag-subject">${escapeHtml(r.subject_name)}</span></td>
          <td><span class="tag tag-grade">${escapeHtml(r.grade_name)}</span></td>
          <td><span class="tag ${r.payment_id ? 'tag-paid' : 'tag-unpaid'}">${r.payment_id ? 'Paid' : 'Unpaid'}</span></td>
          <td>${r.amount ? `Rs. ${parseFloat(r.amount).toFixed(2)}` : '—'}</td>
          <td>${r.paid_at ? formatDate(r.paid_at) : '—'}</td>
          <td>
            ${r.payment_id
                    ? `<button class="btn btn-sm btn-danger" onclick="deletePayment(${r.payment_id})">
                  <span class="material-icons-round" style="font-size:16px">undo</span> Undo
                </button>`
                    : `<button class="btn btn-sm btn-success" onclick="openPaymentModal(${r.id}, '${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}', ${r.subject_id}, ${month}, ${year})">
                  <span class="material-icons-round" style="font-size:16px">check</span> Mark Paid
                </button>`
                }
          </td>
        </tr>
      `).join('');
        }
    } catch (err) {
        showToast('Failed to load payment report', 'error');
    }
}

function openPaymentModal(studentId, studentName, subjectId, month, year) {
    document.getElementById('pay-student-id').value = studentId;
    document.getElementById('pay-subject-id').value = subjectId;
    document.getElementById('pay-month').value = month;
    document.getElementById('pay-year').value = year;
    document.getElementById('pay-student-name').textContent = studentName;
    document.getElementById('pay-amount').value = '';
    document.getElementById('pay-notes').value = '';
    document.getElementById('payment-modal-overlay').classList.add('active');
}

function closePaymentModal() {
    document.getElementById('payment-modal-overlay').classList.remove('active');
}

async function handlePaymentSubmit(e) {
    e.preventDefault();

    const data = {
        student_id: parseInt(document.getElementById('pay-student-id').value),
        subject_id: parseInt(document.getElementById('pay-subject-id').value),
        month: parseInt(document.getElementById('pay-month').value),
        year: parseInt(document.getElementById('pay-year').value),
        amount: parseFloat(document.getElementById('pay-amount').value),
        notes: document.getElementById('pay-notes').value.trim()
    };

    try {
        const res = await fetch(`${API_BASE}/api/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!res.ok) throw new Error('Failed to record payment');

        closePaymentModal();
        loadPaymentReport();
        showToast('Payment recorded successfully!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deletePayment(id) {
    if (!confirm('Are you sure you want to undo this payment?')) return;

    try {
        await fetch(`${API_BASE}/api/payments/${id}`, { method: 'DELETE' });
        loadPaymentReport();
        showToast('Payment undone successfully', 'success');
    } catch (err) {
        showToast('Failed to undo payment', 'error');
    }
}

// ─── QR Codes ───────────────────────────────────────────────────────────────
async function loadQRCodes() {
    const subject_id = document.getElementById('qr-subject').value;
    const grade_id = document.getElementById('qr-grade').value;

    const params = new URLSearchParams();
    if (subject_id) params.set('subject_id', subject_id);
    if (grade_id) params.set('grade_id', grade_id);

    try {
        const res = await fetch(`${API_BASE}/api/students?${params}`);
        const students = await res.json();

        const grid = document.getElementById('qr-grid');
        const emptyEl = document.getElementById('no-qr');

        if (students.length === 0) {
            grid.innerHTML = '';
            emptyEl.style.display = 'block';
        } else {
            emptyEl.style.display = 'none';

            // Load QR codes for each student
            const qrPromises = students.map(async s => {
                const qrRes = await fetch(`${API_BASE}/api/students/${s.id}/qr`);
                return qrRes.json();
            });

            const qrResults = await Promise.all(qrPromises);

            grid.innerHTML = qrResults.map((qr, i) => `
        <div class="qr-card">
          <img src="${qr.qr}" alt="QR Code for ${escapeHtml(qr.student.first_name)} ${escapeHtml(qr.student.last_name)}" />
          <div class="student-name">${escapeHtml(qr.student.first_name)} ${escapeHtml(qr.student.last_name)}</div>
          <div class="student-id">ID: ${qr.student.student_uid.substring(0, 8)}...</div>
          <div class="qr-actions">
            <a href="${API_BASE}/api/students/${qr.student.id}/qr/image" download class="btn btn-sm btn-secondary">
              <span class="material-icons-round" style="font-size:16px">download</span>
              Download
            </a>
            <button class="btn btn-sm btn-secondary" onclick="printQR('${qr.qr}', '${escapeHtml(qr.student.first_name)} ${escapeHtml(qr.student.last_name)}')">
              <span class="material-icons-round" style="font-size:16px">print</span>
              Print
            </button>
          </div>
        </div>
      `).join('');
        }
    } catch (err) {
        showToast('Failed to load QR codes', 'error');
    }
}

function printQR(qrImage, name) {
    const win = window.open('', '_blank');
    win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>QR Code - ${name}</title>
      <style>
        body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: Arial, sans-serif; }
        img { width: 300px; height: 300px; }
        h2 { margin-top: 16px; }
        p { color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <h2>Phoenix Education Institute</h2>
      <img src="${qrImage}" />
      <h3>${name}</h3>
      <p>Scan this QR code for attendance</p>
      <script>window.print();</script>
    </body>
    </html>
  `);
}

// ─── Toast Notifications ────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = {
        success: 'check_circle',
        error: 'error',
        warning: 'warning',
        info: 'info'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="material-icons-round">${icons[type]}</span> ${message}`;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}

// ─── Utilities ──────────────────────────────────────────────────────────────
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Income Report ──────────────────────────────────────────────────────────
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function loadIncomeReport() {
    const year = document.getElementById('income-year').value;

    try {
        const res = await fetch(`${API_BASE}/api/income/monthly?year=${year}`);
        const data = await res.json();

        // Update summary cards
        document.getElementById('income-yearly-total').textContent = `Rs. ${(data.yearlyTotal || 0).toLocaleString()}`;
        document.getElementById('income-total-payments').textContent = data.totalPayments || 0;

        // Build monthly bar chart
        const chartEl = document.getElementById('income-chart');
        const maxTotal = Math.max(...data.monthlyTotals.map(m => m.total), 1);

        // Create a map of month -> total
        const monthMap = {};
        data.monthlyTotals.forEach(m => { monthMap[m.month] = m; });

        let chartHtml = '';
        for (let m = 1; m <= 12; m++) {
            const monthData = monthMap[m];
            const total = monthData ? monthData.total : 0;
            const heightPct = total > 0 ? Math.max((total / maxTotal) * 200, 4) : 2;
            const hasIncome = total > 0 ? 'has-income' : '';

            chartHtml += `
                <div class="income-bar-wrapper ${hasIncome}">
                    <div class="income-bar-amount">${total > 0 ? 'Rs.' + total.toLocaleString() : '-'}</div>
                    <div class="income-bar" style="height:${heightPct}px" title="${MONTH_FULL[m]}: Rs.${total.toLocaleString()}"></div>
                    <div class="income-bar-label">${MONTH_NAMES[m]}</div>
                </div>
            `;
        }
        chartEl.innerHTML = chartHtml;

        // Build subject breakdown table
        const breakdownEl = document.getElementById('income-breakdown');

        if (data.subjectBreakdown.length === 0) {
            breakdownEl.innerHTML = `
                <div class="income-no-data">
                    <span class="material-icons-round">account_balance_wallet</span>
                    No income recorded for ${year}
                </div>
            `;
            return;
        }

        // Group by month
        const byMonth = {};
        data.subjectBreakdown.forEach(item => {
            if (!byMonth[item.month]) byMonth[item.month] = [];
            byMonth[item.month].push(item);
        });

        let tableHtml = `
            <table class="income-breakdown-table">
                <thead>
                    <tr>
                        <th>Month / Subject</th>
                        <th>Payments</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (let m = 1; m <= 12; m++) {
            if (!byMonth[m]) continue;
            const monthTotal = monthMap[m] ? monthMap[m].total : 0;
            const monthCount = monthMap[m] ? monthMap[m].payment_count : 0;

            tableHtml += `
                <tr class="month-row">
                    <td>${MONTH_FULL[m]}</td>
                    <td>${monthCount}</td>
                    <td>Rs. ${monthTotal.toLocaleString()}</td>
                </tr>
            `;

            byMonth[m].forEach(item => {
                tableHtml += `
                    <tr class="subject-row">
                        <td>${escapeHtml(item.subject_name)}</td>
                        <td>${item.payment_count}</td>
                        <td>Rs. ${item.total.toLocaleString()}</td>
                    </tr>
                `;
            });
        }

        tableHtml += '</tbody></table>';
        breakdownEl.innerHTML = tableHtml;

    } catch (err) {
        showToast('Failed to load income report', 'error');
    }
}
