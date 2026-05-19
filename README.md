# CCS Sit-in Monitoring System

A modern, web-based laboratory sit-in management system for the **College of Computer Studies** at the University of Cebu. Students can register, log sit-in sessions, reserve PCs, and track their history. Admins have full control over student records, sessions, announcements, and reports with advanced data management tools.

---

## 📁 Project Structure

```
ccs-sitin/
│
├── index.html              # Public home / landing page
├── login.html              # Student login page
├── registration.html       # Student registration page
├── dashboard.html          # Student dashboard (SPA-lite, profile & status)
├── editprofile.html        # Student edit profile page
├── history.html            # Student sit-in history (w/ Feedback)
├── reservation.html        # Student PC reservation page
│
├── admin.html              # Admin login page
├── admin_dashboard.html    # Admin dashboard (Single-page app)
│
├── style.css               # Global stylesheet (Fluid design tokens)
├── admin.css               # Admin-specific UI & Layout system
├── script.js               # Shared frontend logic & Student API calls
├── admin.js                # Admin-specific logic & Dashboard management
│
├── setup.php               # One-time DB + table creation script
│
└── api/
    ├── db.php              # PDO database connection
    ├── auth.php            # Login & registration endpoints
    ├── student.php         # Student profile, sit-in & feedback endpoints
    └── admin.php           # Admin management, reports & leaderboard endpoints
```

---

## ✨ Features

### 🎓 Student Side

| Page | Description |
|---|---|
| `dashboard.html` | Profile card with remaining sessions, live announcements, and session status notifications. |
| `editprofile.html` | Update personal details, course, and profile picture (stored as base64). |
| `history.html` | Searchable sit-in history with the ability to submit feedback for completed sessions. |
| `reservation.html` | Interactive PC map showing available (🟢) and occupied (🔴) PCs for selected dates. |

---

### 🔧 Admin Side

The Admin Dashboard is a sophisticated Single-Page Application (SPA) designed for efficiency and visual clarity.

| Section | Description |
|---|---|
| **Home** | Real-time stats dashboard with purpose breakdowns and announcement management. |
| **Students** | Comprehensive student management: add, edit, or delete student profiles. |
| **Sit-in** | Real-time monitoring of active sessions with one-click time-out functionality. |
| **Sit-in Records** | Full historical log with advanced search and record management. |
| **Sit-in Reports** | DataTables-powered reports with date filtering and multi-format exports (CSV, Excel, PDF, Print). |
| **Feedback Reports**| Review student feedback, assign 1-5 star ratings, and view the student leaderboard. |
| **Reservation** | Control PC availability and monitor upcoming student reservations. |
| **Lab Software** | Add/delete software per lab, publish or hide lab catalogs, and manage collapsible lab sections. |

---

## 📊 Advanced Reporting & Exporting

The system now integrates **DataTables** for professional-grade reporting:
- **Date Filtering**: Filter records by specific dates or ranges.
- **Instant Search**: Real-time filtering across all table columns.
- **One-Click Export**: Export reports directly to **CSV, Excel, or PDF**.
- **Print View**: Clean, formatted print layout for physical record-keeping.

---

## ⌨️ Responsive UI/UX Scaling

The interface is optimized for modern hardware:
- **Fluid Design**: Uses viewport units (vh/vw) and flexbox/grid for a perfect fit on all monitor sizes.
- **Zero Zoom Needed**: Designed to be fully readable and interactive without manual browser scaling.
- **Premium Aesthetics**: Dark-mode compatible palettes, glassmorphism effects, and smooth transitions.

---

## 🗄️ Database Schema

**Database name:** `ccs_sitin`  

### `users`
| Column | Type | Details |
|---|---|---|
| `idNum` | VARCHAR(50) | Primary key (Username) |
| `sitin_remaining` | INT | Default `30`; decremented on use |
| `profilePic` | LONGTEXT | Base64-encoded image string |

### `sitin_records`
| Column | Type | Details |
|---|---|---|
| `sitId` | INT | Primary key |
| `status` | VARCHAR(20) | `Active`, `Done`, or `Reserved` |

### `feedbacks`
| Column | Type | Details |
|---|---|---|
| `id` | INT | Primary key |
| `sitId` | INT | Unique link to `sitin_records` |
| `message` | TEXT | Student feedback content |
| `rating` | TINYINT | Admin-assigned rating (1-5) |

### `lab_software`
| Column | Type | Details |
|---|---|---|
| `id` | INT | Primary key |
| `lab` | VARCHAR(20) | Lab number from the software lab list |
| `name` | VARCHAR(150) | Software name |
| `version` | VARCHAR(80) | Optional version label |
| `category` | VARCHAR(20) | One of `IDE`, `WEB`, `DEV`, `DB`, `TOOL`, `OS` |

### `lab_software_settings`
| Column | Type | Details |
|---|---|---|
| `lab` | VARCHAR(20) | Primary key |
| `is_published` | TINYINT | `1` shows the lab software to students, `0` hides it |

### Lab Software Workflow
- Admin opens **Lab Software**, adds software to a lab, and publishes that lab when ready.
- Students open **Lab Status**, use the search bar, lab pills, and category pills to browse published software.
- Hidden labs are not shown to students.
- To add/remove labs, update the `ALL_LABS` constant in `public/api/lab_software.php`.

---

## 🔌 API Reference

### `api/student.php`
- `?action=submit_feedback`: Allows students to submit a review for a completed session.
- `?action=get_sitin_status`: Fetches current active and last completed session for the dashboard.

### `api/admin.php`
- `?action=get_feedbacks`: Retrieves all student feedback for review.
- `?action=rate_feedback`: Allows admins to rate student behavior/feedback.
- `?action=get_leaderboard`: Generates a student ranking based on average feedback ratings.

### `api/lab_software.php`
- `?action=get_admin`: Admin catalog grouped by lab, including hidden labs.
- `?action=get_public`: Student catalog for published labs only.
- `?action=add`: Add software with lab, name, version, and category.
- `?action=delete`: Remove a software item by ID.
- `?action=toggle_publish`: Publish or hide one lab's software catalog.

---

## 🚀 Setup & Installation

1. **Clone/Copy** to `C:/xampp/htdocs/SitInSystem/`.
2. **Start** Apache and MySQL in XAMPP.
3. **Initialize Database**: Visit `http://localhost/SitInSystem/public/setup.php`.
4. **Login**:
   - **Admin**: `admin` / `admin123`
   - **Student**: Register a new account.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3 (Modern UI), Vanilla JS |
| **Libraries** | **DataTables.js**, Chart.js, Font Awesome 6 |
| **Export Tools** | JSZip, pdfmake (via DataTables buttons) |
| **Backend** | PHP 7.4+ with PDO |
| **Database** | MySQL |

---

## 📄 License

Developed for the **College of Computer Studies, University of Cebu**.  
For academic and institutional use only.
