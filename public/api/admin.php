<?php
// api/admin.php - Handles all admin actions
require_once 'db.php';
session_start();

header('Content-Type: application/json');
$action = $_GET['action'] ?? '';

function admin_json($payload, $status = 200) {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function require_fields(array $input, array $fields): void {
    foreach ($fields as $field) {
        if (!isset($input[$field]) || trim((string)$input[$field]) === '') {
            admin_json(['success' => false, 'message' => "Missing required field: $field"], 422);
        }
    }
}

function audit_log(PDO $pdo, string $action, string $entityType = '', $entityId = null, array $details = []): void {
    try {
        $stmt = $pdo->prepare("INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([
            $_SESSION['user_id'] ?? null,
            $action,
            $entityType,
            $entityId !== null ? (string)$entityId : null,
            $details ? json_encode($details) : null
        ]);
    } catch (Throwable $e) {
        error_log('Audit log failed: ' . $e->getMessage());
    }
}

function parse_session_datetime(?string $date, ?string $time): ?int {
    if (!$date || !$time || $time === '—' || $time === 'â€”') return null;
    $ts = strtotime($date . ' ' . $time);
    return $ts ?: null;
}

if ($action === 'get_announcements') {
    $stmt = $pdo->query("SELECT * FROM announcements ORDER BY id DESC");
    admin_json(['success' => true, 'announcements' => $stmt->fetchAll()]);
}

if (empty($_SESSION['user_id']) || ($_SESSION['role'] ?? '') !== 'admin') {
    admin_json(['success' => false, 'message' => 'Admin session required.'], 401);
}

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

if ($action === 'session') {
    admin_json(['success' => true, 'csrf_token' => $_SESSION['csrf_token'], 'user_id' => $_SESSION['user_id']]);
}

$readActions = [
    'get_stats', 'get_announcements', 'get_students', 'get_records', 'get_feedbacks',
    'get_leaderboard', 'get_reservations', 'get_pending_reservations',
    'get_reservation_log', 'get_pc_status', 'get_monthly_leaderboard',
    'get_admin_notifications', 'get_pc_heatmap', 'get_audit_logs'
];

if (!in_array($action, $readActions, true)) {
    $csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$csrf || !hash_equals($_SESSION['csrf_token'], $csrf)) {
        admin_json(['success' => false, 'message' => 'Invalid security token. Refresh and try again.'], 403);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    
    if ($action === 'get_stats') {
        $stats = [
            'active' => $pdo->query("SELECT COUNT(*) FROM sitin_records WHERE LOWER(status) = 'active' AND deleted_at IS NULL")->fetchColumn(),
            'done' => $pdo->query("SELECT COUNT(*) FROM sitin_records WHERE LOWER(status) = 'done' AND deleted_at IS NULL")->fetchColumn(),
            'reserved' => $pdo->query("SELECT COUNT(*) FROM sitin_records WHERE LOWER(status) = 'reserved' AND deleted_at IS NULL")->fetchColumn(),
            'total' => $pdo->query("SELECT COUNT(*) FROM sitin_records WHERE deleted_at IS NULL")->fetchColumn(),
            'students' => $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'student'")->fetchColumn()
        ];
        
        $purposes = [];
        $pStmt = $pdo->query("SELECT purpose, COUNT(*) as count FROM sitin_records WHERE LOWER(status) = 'active' AND deleted_at IS NULL GROUP BY purpose");
        while ($row = $pStmt->fetch()) {
           if (!empty($row['purpose'])) $purposes[$row['purpose']] = (int)$row['count'];
        }
        $stats['purposes'] = $purposes;

        // By Lab
        $labs = [];
        $lStmt = $pdo->query("SELECT lab, COUNT(*) as count FROM sitin_records WHERE LOWER(status) = 'active' AND deleted_at IS NULL GROUP BY lab");
        while ($row = $lStmt->fetch()) {
           if (!empty($row['lab'])) $labs[$row['lab']] = (int)$row['count'];
        }
        $stats['labs'] = $labs;

        // Over Time (Daily)
        $over_time = [];
        $tStmt = $pdo->query("SELECT date, COUNT(*) as count FROM sitin_records WHERE deleted_at IS NULL GROUP BY date ORDER BY date DESC LIMIT 7");
        while ($row = $tStmt->fetch()) {
           if (!empty($row['date'])) {
               $formatted = date('M j', strtotime($row['date']));
               $over_time[$formatted] = (int)$row['count'];
           }
        }
        $stats['over_time'] = array_reverse($over_time, true);
        
        echo json_encode(['success' => true, 'stats' => $stats]);
    }
    
    elseif ($action === 'get_announcements') {
        $stmt = $pdo->query("SELECT * FROM announcements ORDER BY id DESC");
        echo json_encode(['success' => true, 'announcements' => $stmt->fetchAll()]);
    }
    
    elseif ($action === 'add_announcement') {
        $text = trim($input['text'] ?? '');
        $date = trim($input['date'] ?? date('F j, Y, h:i A'));
        if (!$text) {
            echo json_encode(['success' => false, 'message' => 'Announcement text cannot be empty.']);
            exit;
        }
        $stmt = $pdo->prepare("INSERT INTO announcements (text, date) VALUES (?, ?)");
        if ($stmt->execute([$text, $date])) {
            audit_log($pdo, 'add_announcement', 'announcement', $pdo->lastInsertId(), ['text' => $text]);
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'message' => 'DB Error.']);
        }
    }
    
    elseif ($action === 'delete_announcement') {
        require_fields($input, ['id']);
        $id = $input['id'] ?? null;
        if ($pdo->prepare("DELETE FROM announcements WHERE id = ?")->execute([$id])) {
            audit_log($pdo, 'delete_announcement', 'announcement', $id);
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false]);
        }
    }

    elseif ($action === 'get_students') {
        $stmt = $pdo->query("SELECT * FROM users WHERE role = 'student'");
        echo json_encode(['success' => true, 'students' => $stmt->fetchAll()]);
    }

    elseif ($action === 'update_student') {
        require_fields($input, ['idNum']);
        $idNum = $input['idNum'] ?? '';
        $sitin_remaining = $input['sitin_remaining'] ?? 30;
        $course = $input['course'] ?? '';
        $level = $input['level'] ?? '';
        
        $stmt = $pdo->prepare("UPDATE users SET sitin_remaining = ?, course = ?, level = ? WHERE idNum = ?");
        if ($stmt->execute([$sitin_remaining, $course, $level, $idNum])) {
             audit_log($pdo, 'update_student', 'user', $idNum, ['sitin_remaining' => $sitin_remaining, 'course' => $course, 'level' => $level]);
             echo json_encode(['success' => true]);
        } else {
             echo json_encode(['success' => false, 'message' => 'Failed to update user.']);
        }
    }

    elseif ($action === 'delete_student') {
        require_fields($input, ['idNum']);
        $idNum = $input['idNum'] ?? '';
        $stmt = $pdo->prepare("DELETE FROM users WHERE idNum = ?");
        if ($stmt->execute([$idNum])) {
            audit_log($pdo, 'delete_student', 'user', $idNum);
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false]);
        }
    }

    elseif ($action === 'get_records') {
        $stmt = $pdo->query("SELECT s.*, u.course, u.profilePic FROM sitin_records s LEFT JOIN users u ON s.idNum = u.idNum WHERE s.deleted_at IS NULL ORDER BY s.sitId DESC");
        echo json_encode(['success' => true, 'records' => $stmt->fetchAll()]);
    }
    
    elseif ($action === 'delete_record') {
        require_fields($input, ['sitId']);
        $sitId = $input['sitId'] ?? null;
        $stmt = $pdo->prepare("UPDATE sitin_records SET deleted_at = NOW() WHERE sitId = ?");
        if ($stmt->execute([$sitId])) {
            audit_log($pdo, 'soft_delete_record', 'sitin_record', $sitId);
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false]);
        }
    }

    elseif ($action === 'timeout_sitin') {
        require_fields($input, ['sitId']);
        $sitId = $input['sitId'] ?? null;
        $logout = date('h:i A'); // Or passed from input
        $logoutDate = date('Y-m-d H:i:s');
        $existing = $pdo->prepare("SELECT date, login, login_date FROM sitin_records WHERE sitId = ? AND deleted_at IS NULL");
        $existing->execute([$sitId]);
        $record = $existing->fetch();
        $loginTs = $record ? (strtotime($record['login_date'] ?? '') ?: parse_session_datetime($record['date'] ?? null, $record['login'] ?? null)) : null;
        $duration = $loginTs ? max(1, (int)round((time() - $loginTs) / 60)) : null;
        $stmt = $pdo->prepare("UPDATE sitin_records SET status = 'Done', logout = ?, logout_date = ?, duration_minutes = ? WHERE sitId = ?");
        if ($stmt->execute([$logout, $logoutDate, $duration, $sitId])) {
            audit_log($pdo, 'timeout_sitin', 'sitin_record', $sitId, ['duration_minutes' => $duration]);
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false]);
        }
    }
    
    elseif ($action === 'get_feedbacks') {
        $stmt = $pdo->query("
            SELECT
                f.*,
                u.firstname,
                u.lastname,
                u.course,
                u.level,
                u.profilePic,
                s.lab,
                s.purpose,
                s.login,
                s.logout
            FROM feedbacks f
            JOIN users u ON f.idNum = u.idNum
            LEFT JOIN sitin_records s ON s.sitId = f.sitId
            ORDER BY f.id DESC
        ");
        echo json_encode(['success' => true, 'feedbacks' => $stmt->fetchAll()]);
    }

    elseif ($action === 'rate_feedback') {
        $id     = $input['id'] ?? null;
        $rating = isset($input['rating']) ? intval($input['rating']) : null;
        if (!$id || !$rating || $rating < 1 || $rating > 5) {
            echo json_encode(['success' => false, 'message' => 'Invalid rating or feedback ID.']);
            exit;
        }
        $stmt = $pdo->prepare("UPDATE feedbacks SET rating = ? WHERE id = ?");
        if ($stmt->execute([$rating, $id])) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'message' => 'DB error.']);
        }
    }
    
    elseif ($action === 'delete_feedback') {
        require_fields($input, ['id']);
        $id = $input['id'] ?? null;
        $stmt = $pdo->prepare("DELETE FROM feedbacks WHERE id = ?");
        if ($stmt->execute([$id])) {
            audit_log($pdo, 'delete_feedback', 'feedback', $id);
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false]);
        }
    }

    elseif ($action === 'get_leaderboard') {
        // Students with at least one rated feedback, ranked by avg rating
        $stmt = $pdo->query("
            SELECT
                u.idNum,
                u.firstname,
                u.lastname,
                u.course,
                u.level,
                u.profilePic,
                ROUND(AVG(f.rating), 2)  AS avg_rating,
                COUNT(f.id)              AS total_feedbacks,
                SUM(CASE WHEN f.rating IS NOT NULL THEN 1 ELSE 0 END) AS rated_count,
                (SELECT COUNT(*) FROM sitin_records sr WHERE sr.idNum = u.idNum AND sr.status = 'Done' AND sr.deleted_at IS NULL) AS total_sessions
            FROM users u
            JOIN feedbacks f ON f.idNum = u.idNum
            WHERE u.role = 'student'
            GROUP BY u.idNum
            HAVING rated_count > 0
            ORDER BY avg_rating DESC, total_feedbacks DESC
            LIMIT 100
        ");
        $leaderboard = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $current_user_rank = null;
        $current_user_stats = null;
        $current_idNum = $input['idNum'] ?? null;

        if ($current_idNum) {
            foreach ($leaderboard as $index => $student) {
                if ($student['idNum'] === $current_idNum) {
                    $current_user_rank = $index + 1;
                    $current_user_stats = $student;
                    break;
                }
            }
        }

        echo json_encode([
            'success' => true, 
            'leaderboard' => $leaderboard,
            'current_rank' => $current_user_rank,
            'current_stats' => $current_user_stats
        ]);
    }
    
    // ══════════ RESERVATION MANAGEMENT ══════════
    
    elseif ($action === 'get_reservations') {
        // Get all reservations (records with time_slot set)
        $stmt = $pdo->query("SELECT s.*, u.firstname, u.lastname, u.course, u.level, u.profilePic 
                             FROM sitin_records s 
                             LEFT JOIN users u ON s.idNum = u.idNum 
                             WHERE s.time_slot IS NOT NULL AND s.deleted_at IS NULL
                             ORDER BY s.date DESC, s.sitId DESC");
        $reservations = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'reservations' => $reservations]);
    }
    
    elseif ($action === 'get_pending_reservations') {
        // Get only pending/Reserved reservations
        $stmt = $pdo->query("SELECT s.*, u.firstname, u.lastname, u.course, u.level, u.profilePic 
                             FROM sitin_records s 
                             LEFT JOIN users u ON s.idNum = u.idNum 
                             WHERE s.time_slot IS NOT NULL AND s.status = 'Reserved' AND s.deleted_at IS NULL
                             ORDER BY s.date ASC, s.sitId ASC");
        $reservations = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'reservations' => $reservations]);
    }
    
    elseif ($action === 'approve_reservation') {
        // Approve = keep status as 'Reserved' (it's already reserved, this confirms it)
        $sitId = (int)($input['sitId'] ?? 0);
        if (!$sitId) {
            echo json_encode(['success' => false, 'message' => 'Missing reservation ID.']);
            exit;
        }
        // Check reservation exists and is Reserved
        $check = $pdo->prepare("SELECT * FROM sitin_records WHERE sitId = ? AND status = 'Reserved' AND deleted_at IS NULL");
        $check->execute([$sitId]);
        if (!$check->fetch()) {
            echo json_encode(['success' => false, 'message' => 'Reservation not found or already processed.']);
            exit;
        }
        // Mark as approved (keep Reserved status, add approved_at timestamp via logout field as marker)
        $stmt = $pdo->prepare("UPDATE sitin_records SET status = 'Reserved' WHERE sitId = ?");
        $stmt->execute([$sitId]);
        audit_log($pdo, 'approve_reservation', 'sitin_record', $sitId);
        echo json_encode(['success' => true, 'message' => 'Reservation approved.']);
    }
    
    elseif ($action === 'reject_reservation') {
        $sitId = (int)($input['sitId'] ?? 0);
        if (!$sitId) {
            echo json_encode(['success' => false, 'message' => 'Missing reservation ID.']);
            exit;
        }
        // Get the reservation to refund session
        $check = $pdo->prepare("SELECT * FROM sitin_records WHERE sitId = ? AND status = 'Reserved' AND deleted_at IS NULL");
        $check->execute([$sitId]);
        $resv = $check->fetch();
        if (!$resv) {
            echo json_encode(['success' => false, 'message' => 'Reservation not found or already processed.']);
            exit;
        }
        // Soft-delete reservation and refund session
        $pdo->prepare("UPDATE sitin_records SET deleted_at = NOW() WHERE sitId = ?")->execute([$sitId]);
        $pdo->prepare("UPDATE users SET sitin_remaining = sitin_remaining + 1 WHERE idNum = ?")->execute([$resv['idNum']]);
        audit_log($pdo, 'reject_reservation', 'sitin_record', $sitId, ['idNum' => $resv['idNum']]);
        echo json_encode(['success' => true, 'message' => 'Reservation rejected and session refunded.']);
    }
    
    elseif ($action === 'checkin_reservation') {
        $sitId = (int)($input['sitId'] ?? 0);
        if (!$sitId) {
            echo json_encode(['success' => false, 'message' => 'Missing reservation ID.']);
            exit;
        }
        $check = $pdo->prepare("SELECT * FROM sitin_records WHERE sitId = ? AND status = 'Reserved' AND deleted_at IS NULL");
        $check->execute([$sitId]);
        if (!$check->fetch()) {
            echo json_encode(['success' => false, 'message' => 'Reservation not found or not in Reserved status.']);
            exit;
        }
        $timeIn = date('h:i A');
        $loginDate = date('Y-m-d H:i:s');
        $stmt = $pdo->prepare("UPDATE sitin_records SET status = 'Active', login = ?, login_date = ? WHERE sitId = ?");
        if ($stmt->execute([$timeIn, $loginDate, $sitId])) {
            audit_log($pdo, 'checkin_reservation', 'sitin_record', $sitId);
            echo json_encode(['success' => true, 'message' => 'Student checked in successfully.', 'timeIn' => $timeIn]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Database error.']);
        }
    }
    
    elseif ($action === 'get_reservation_log') {
        // Full log of all reservation activity
        $stmt = $pdo->query("SELECT s.*, u.firstname, u.lastname, u.course, u.level, u.profilePic 
                             FROM sitin_records s 
                             LEFT JOIN users u ON s.idNum = u.idNum 
                             WHERE s.time_slot IS NOT NULL AND s.deleted_at IS NULL
                             ORDER BY s.sitId DESC");
        $log = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'log' => $log]);
    }
    
    elseif ($action === 'get_pc_status') {
        $lab = trim($input['lab'] ?? '');
        $date = trim($input['date'] ?? '');
        $timeSlot = trim($input['time_slot'] ?? '');
        
        if (!$lab) {
            echo json_encode(['success' => false, 'message' => 'Missing lab.']);
            exit;
        }
        
        $query = "SELECT pc_number, status, name, idNum, time_slot, purpose FROM sitin_records WHERE lab = ? AND pc_number IS NOT NULL AND status IN ('Reserved','Active') AND deleted_at IS NULL";
        $params = [$lab];
        
        if ($date) {
            $query .= " AND date = ?";
            $params[] = $date;
        }
        if ($timeSlot) {
            $query .= " AND time_slot = ?";
            $params[] = $timeSlot;
        }
        
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $pcs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $pcMap = [];
        foreach ($pcs as $pc) {
            $num = (int)$pc['pc_number'];
            $pcMap[$num] = [
                'status' => $pc['status'],
                'name' => $pc['name'],
                'idNum' => $pc['idNum'],
                'time_slot' => $pc['time_slot'],
                'purpose' => $pc['purpose']
            ];
        }
        
        echo json_encode(['success' => true, 'pcs' => $pcMap, 'total_pcs' => 40]);
    }

    elseif ($action === 'get_audit_logs') {
        $stmt = $pdo->query("SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 100");
        echo json_encode(['success' => true, 'logs' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }
    
    else {
        echo json_encode(['success' => false, 'message' => 'Invalid admin action.']);
    }
} else {
    echo json_encode(['success' => false, 'message' => 'Invalid method.']);
}
?>
