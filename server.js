const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const app = express();
const PORT = 3000;

// Setup multer for parsing multipart/form-data
const upload = multer();

// Setup express-session
app.use(session({
  secret: 'eduaid_admin_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1 * 60 * 60 * 1000 } // 1 hour
}));

// Connect to SQLite
const db = new sqlite3.Database(path.join(__dirname, 'data', 'eduaid.db'), (err) => {
  if (err) return console.error('Database connection error:', err.message);
  console.log('✅ Connected to SQLite database');
});

// Create table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    father_name TEXT,
    dob TEXT,
    domicile TEXT,
    city TEXT,
    phone TEXT,
    email TEXT,
    inter_uni TEXT,
    inter_cgpa TEXT,
    bachelor_uni TEXT,
    bachelor_cgpa TEXT,
    master_uni TEXT,
    master_cgpa TEXT,
    phd_uni TEXT,
    phd_cgpa TEXT,
    scholarship_type TEXT,
    status TEXT DEFAULT 'Unverified',
    submitted_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Home route
app.get('/', (req, res) => {
  res.send('EduAid Backend Running 🚀');
});

// Application submission
app.post('/submit-application', upload.single('documents'), (req, res) => {
  const data = req.body;
  const query = `
    INSERT INTO applications (
      name, father_name, dob, domicile, city, phone, email,
      inter_uni, inter_cgpa,
      bachelor_uni, bachelor_cgpa,
      master_uni, master_cgpa,
      phd_uni, phd_cgpa,
      scholarship_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [
    data.name, data.fatherName, data.dob, data.domicile, data.city,
    data.phone, data.email,
    data.interUni || 'N/A', data.interCgpa || 'N/A',
    data.bachelorUni || 'N/A', data.bachelorCgpa || 'N/A',
    data.masterUni || 'N/A', data.masterCgpa || 'N/A',
    data.phdUni || 'N/A', data.phdCgpa || 'N/A',
    data.scholarshipType
  ];
  db.run(query, values, function (err) {
    if (err) {
      console.error(err.message);
      return res.status(500).send('Something went wrong.');
    }
    console.log('✅ Application saved to database:', data);
    res.send('Application submitted successfully!');
  });
});

// Status viewer form page
app.get('/status', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'status.html'));
});

// Status results (updated with Bootstrap styling)
app.post('/status-check', upload.none(), (req, res) => {
  const { scholarshipType } = req.body;
  const query = `
    SELECT name, father_name, 
      CASE 
        WHEN phd_cgpa != 'N/A' AND phd_cgpa != '' THEN 'PhD'
        WHEN master_cgpa != 'N/A' AND master_cgpa != '' THEN 'Master'
        WHEN bachelor_cgpa != 'N/A' AND bachelor_cgpa != '' THEN 'Bachelor'
        WHEN inter_cgpa != 'N/A' AND inter_cgpa != '' THEN 'Intermediate'
        ELSE 'N/A'
      END AS highest_degree,
      status
    FROM applications
    WHERE scholarship_type = ?
  `;
  db.all(query, [scholarshipType], (err, rows) => {
    if (err) return res.status(500).send('Error fetching status.');

    let html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Application Status Result</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
      </head>
      <body class="bg-light">
        <div class="container py-5">
          <h2 class="text-center text-success mb-4">Applications for: ${scholarshipType}</h2>
          <div class="table-responsive">
            <table class="table table-bordered shadow-sm table-hover bg-white">
              <thead class="table-success text-center">
                <tr>
                  <th>Name</th>
                  <th>Father Name</th>
                  <th>Highest Degree</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
    `;

    rows.forEach(row => {
      const badgeColor =
        row.status === 'Granted' ? 'success' :
        row.status === 'Not Eligible' ? 'danger' :
        row.status === 'Unverified' ? 'secondary' : 'warning';

      html += `
        <tr class="text-center">
          <td>${row.name}</td>
          <td>${row.father_name}</td>
          <td>${row.highest_degree}</td>
          <td><span class="badge bg-${badgeColor}">${row.status}</span></td>
        </tr>
      `;
    });

    html += `
              </tbody>
            </table>
          </div>
          <div class="text-center mt-4">
            <a href="/status" class="btn btn-outline-success">🔙 Check Another</a>
          </div>
        </div>
        <footer class="bg-success text-white text-center py-3 mt-5">
          <p class="mb-0">© 2025 EduAid | Empowering Education in Pakistan</p>
        </footer>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Admin login
app.post('/admin-login', upload.none(), (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '1234') {
    req.session.admin = true;
    res.redirect('/admin-panel.html');
  } else {
    res.send('<h3 style="color:red; text-align:center;">Invalid credentials! <a href="/admin-login.html">Try again</a></h3>');
  }
});

// Middleware to protect admin panel
app.get('/admin-panel.html', (req, res) => {
  if (req.session.admin) {
    res.sendFile(path.join(__dirname, 'public', 'admin-panel.html'));
  } else {
    res.redirect('/admin-login.html');
  }
});

// Admin logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin-login.html');
  });
});

// Admin API routes
app.get('/api/applications', (req, res) => {
  if (!req.session.admin) return res.status(403).send('Unauthorized');
  db.all('SELECT * FROM applications ORDER BY submitted_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/update-status', upload.none(), (req, res) => {
  if (!req.session.admin) return res.status(403).send('Unauthorized');
  const { id, status } = req.body;
  db.run('UPDATE applications SET status = ? WHERE id = ?', [status, id], function (err) {
    if (err) return res.status(500).send('Failed to update status.');
    res.send('Status updated.');
  });
});

app.post('/api/delete', upload.none(), (req, res) => {
  if (!req.session.admin) return res.status(403).send('Unauthorized');
  const { id } = req.body;
  db.run('DELETE FROM applications WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).send('Failed to delete application.');
    res.send('Application deleted.');
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
