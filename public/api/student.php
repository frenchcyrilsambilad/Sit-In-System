<?php
// api/student.php - Handles all student actions
require_once 'db.php';

header('Content-Type: application/json');
$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    
    if ($action === 'get_profile') {
        $idNum = trim($input['idNum'] ?? '');
        $stmt = $pdo->prepare("SELECT idNum, firstname, lastname, middlename, email, course, level, address, sitin_remaining, role, profilePic FROM users WHERE idNum = ?");
        $stmt->execute([$idNum]);
        if ($user = $stmt->fetch()) {
            echo json_encode(['success' => true, 'user' => $user]);
        } else {
            echo json_encode(['success' => false, 'message' => 'User not found.']);
        }
    }
    
    elseif ($action === 'update_profile') {
        $idNum = trim($input['idNum'] ?? '');
        $firstname = trim($input['firstname'] ?? '');
        $lastname = trim($input['lastname'] ?? '');
        $middlename = trim($input['middlename'] ?? '');
        $email = trim($input['email'] ?? '');
        $course = trim($input['course'] ?? '');
        $level = $input['level'] ?? 1;
        $address = trim($input['address'] ?? '');
        $pass = trim($input['password'] ?? '');
        $profilePic = $input['profilePic'] ?? null;

        // Standard update
        $sql = "UPDATE users SET firstname=?, lastname=?, middlename=?, email=?, course=?, level=?, address=?";
        $params = [$firstname, $lastname, $middlename, $email, $course, $level, $address];
        
        if ($profilePic !== null) {
            $sql .= ", profilePic=?";
            $params[] = $profilePic;
        }

        // If password is provided, update it too
        if (!empty($pass)) {
            $sql .= ", password=?";
            $params[] = password_hash($pass, PASSWORD_DEFAULT);
        }
        $sql .= " WHERE idNum=?";
        $params[] = $idNum;

        $stmt = $pdo->prepare($sql);
        if ($stmt->execute($params)) {
            // Fetch updated
            $stmt = $pdo->prepare("SELECT idNum, firstname, lastname, middlename, email, course, level, address, sitin_remaining, role, profilePic FROM users WHERE idNum = ?");
            $stmt->execute([$idNum]);
            $updated = $stmt->fetch();
            echo json_encode(['success' => true, 'message' => 'Profile updated!', 'user' => $updated]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Database error updating profile.']);
        }
    }
    
    elseif ($action === 'sitin') {
        $idNum = trim($input['idNum'] ?? '');
        $purpose = trim($input['purpose'] ?? '');
        $lab = trim($input['lab'] ?? '');
        $timeStr = $input['timeStr'] ?? '';
        $dateStr = $input['dateStr'] ?? date('Y-m-d');
        
        $status = 'Active';

        if (!$idNum || !$purpose || !$lab) {
            echo json_encode(['success' => false, 'message' => 'Missing purpose or lab.']);
            exit;
        }

        // Check sessions remaining
        $stmt = $pdo->prepare("SELECT sitin_remaining, firstname, middlename, lastname FROM users WHERE idNum = ?");
        $stmt->execute([$idNum]);
        $u = $stmt->fetch();
        if (!$u || $u['sitin_remaining'] <= 0) {
            echo json_encode(['success' => false, 'message' => 'Insufficient sit-in sessions remaining.']);
            exit;
        }

        // Check if student already has an active sit-in
        $activeCheck = $pdo->prepare("SELECT sitId FROM sitin_records WHERE idNum = ? AND status = 'Active' AND deleted_at IS NULL LIMIT 1");
        $activeCheck->execute([$idNum]);
        if ($activeCheck->fetch()) {
            echo json_encode(['success' => false, 'message' => 'This student already has an active sit-in session. Please time-out the current session first.']);
            exit;
        }

        $name = trim(($u['firstname'] ?? '') . ' ' . ($u['middlename'] ?? '') . ' ' . ($u['lastname'] ?? ''));
        $name = trim(preg_replace('/\s+/', ' ', $name)); // Remove extra spaces
        
        // Deduct session
        $newRemaining = $u['sitin_remaining'] - 1;
        $pdo->prepare("UPDATE users SET sitin_remaining=? WHERE idNum=?")->execute([$newRemaining, $idNum]);

        // Insert log
        $insert = $pdo->prepare("INSERT INTO sitin_records (idNum, name, purpose, lab, login, logout, session, date, status, login_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $timeIn = $timeStr ?: date('h:i A');
        $dateToInsert = $dateStr ?: date('Y-m-d');
        $loginDate = date('Y-m-d H:i:s', strtotime($dateToInsert . ' ' . $timeIn) ?: time());
        $openLogout = html_entity_decode('&mdash;', ENT_QUOTES, 'UTF-8');
        if ($insert->execute([$idNum, $name, $purpose, $lab, $timeIn, $openLogout, 1, $dateToInsert, $status, $loginDate])) {
            echo json_encode(['success' => true, 'message' => 'Successfully logged sit-in.', 'remaining' => $newRemaining, 'timeIn' => $timeIn]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Database error creating sit-in record.']);
        }
    }
    
    // ── Get available PCs for a lab/date/time_slot ──
    elseif ($action === 'get_available_pcs') {
        $lab = trim($input['lab'] ?? '');
        $date = trim($input['date'] ?? '');
        $timeSlot = trim($input['time_slot'] ?? '');

        if (!$lab || !$date || !$timeSlot) {
            echo json_encode(['success' => false, 'message' => 'Missing lab, date, or time slot.']);
            exit;
        }

        // Get PCs that are reserved for this lab/date/time_slot
        $stmt = $pdo->prepare("SELECT pc_number, status FROM sitin_records WHERE lab = ? AND date = ? AND time_slot = ? AND status IN ('Reserved','Active') AND deleted_at IS NULL AND pc_number IS NOT NULL");
        $stmt->execute([$lab, $date, $timeSlot]);
        $reserved = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $reservedPcs = [];
        foreach ($reserved as $r) {
            $reservedPcs[(int)$r['pc_number']] = $r['status'];
        }

        echo json_encode(['success' => true, 'reserved_pcs' => $reservedPcs, 'total_pcs' => 40]);
    }
    
    // ── Reserve a specific PC ──
    elseif ($action === 'reserve') {
        $idNum = trim($input['idNum'] ?? '');
        $purpose = trim($input['purpose'] ?? '');
        $lab = trim($input['lab'] ?? '');
        $date = trim($input['date'] ?? '');
        $timeSlot = trim($input['time_slot'] ?? '');
        $pcNumber = (int)($input['pc_number'] ?? 0);

        if (!$idNum || !$purpose || !$lab || !$date || !$timeSlot || !$pcNumber) {
            echo json_encode(['success' => false, 'message' => 'Please fill in all fields and select a PC.']);
            exit;
        }

        // Check sessions remaining
        $stmt = $pdo->prepare("SELECT sitin_remaining, firstname, middlename, lastname FROM users WHERE idNum = ?");
        $stmt->execute([$idNum]);
        $u = $stmt->fetch();
        if (!$u || $u['sitin_remaining'] <= 0) {
            echo json_encode(['success' => false, 'message' => 'Insufficient sit-in sessions remaining.']);
            exit;
        }

        // Check if student already has a reservation for this same lab/date/time_slot
        $dupCheck = $pdo->prepare("SELECT sitId FROM sitin_records WHERE idNum = ? AND lab = ? AND date = ? AND time_slot = ? AND status = 'Reserved' AND deleted_at IS NULL LIMIT 1");
        $dupCheck->execute([$idNum, $lab, $date, $timeSlot]);
        if ($dupCheck->fetch()) {
            echo json_encode(['success' => false, 'message' => 'You already have a reservation for this lab, date, and time slot.']);
            exit;
        }

        // Check if the PC is already reserved by someone else
        $pcCheck = $pdo->prepare("SELECT sitId FROM sitin_records WHERE lab = ? AND date = ? AND time_slot = ? AND pc_number = ? AND status IN ('Reserved','Active') AND deleted_at IS NULL LIMIT 1");
        $pcCheck->execute([$lab, $date, $timeSlot, $pcNumber]);
        if ($pcCheck->fetch()) {
            echo json_encode(['success' => false, 'message' => 'This PC has already been reserved. Please select another.']);
            exit;
        }

        $name = trim(($u['firstname'] ?? '') . ' ' . ($u['middlename'] ?? '') . ' ' . ($u['lastname'] ?? ''));
        $name = trim(preg_replace('/\s+/', ' ', $name));

        // Deduct session
        $newRemaining = $u['sitin_remaining'] - 1;
        $pdo->prepare("UPDATE users SET sitin_remaining=? WHERE idNum=?")->execute([$newRemaining, $idNum]);

        // Insert reservation record
        $insert = $pdo->prepare("INSERT INTO sitin_records (idNum, name, purpose, lab, login, logout, session, date, status, pc_number, time_slot, login_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Reserved', ?, ?, ?)");
        // Convert time_slot to login time display
        $loginTime = explode(' - ', $timeSlot)[0] ?? $timeSlot;
        $loginDate = date('Y-m-d H:i:s', strtotime($date . ' ' . $loginTime) ?: time());
        $openLogout = html_entity_decode('&mdash;', ENT_QUOTES, 'UTF-8');
        if ($insert->execute([$idNum, $name, $purpose, $lab, $loginTime, $openLogout, 1, $date, $pcNumber, $timeSlot, $loginDate])) {
            echo json_encode([
                'success' => true,
                'message' => "PC $pcNumber in Lab $lab reserved successfully!",
                'remaining' => $newRemaining
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Database error creating reservation.']);
        }
    }
    
    // ── Get student's reservations ──
    elseif ($action === 'get_my_reservations') {
        $idNum = trim($input['idNum'] ?? '');
        if (!$idNum) {
            echo json_encode(['success' => false, 'message' => 'Missing student ID.']);
            exit;
        }

        $stmt = $pdo->prepare("SELECT sitId, lab, purpose, date, time_slot, pc_number, status, login FROM sitin_records WHERE idNum = ? AND time_slot IS NOT NULL AND deleted_at IS NULL ORDER BY date DESC, sitId DESC");
        $stmt->execute([$idNum]);
        $reservations = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'reservations' => $reservations]);
    }
    
    // ── Cancel a reservation ──
    elseif ($action === 'cancel_reservation') {
        $idNum = trim($input['idNum'] ?? '');
        $sitId = (int)($input['sitId'] ?? 0);

        if (!$idNum || !$sitId) {
            echo json_encode(['success' => false, 'message' => 'Missing data.']);
            exit;
        }

        // Only allow cancelling own reservations that are still 'Reserved'
        $stmt = $pdo->prepare("SELECT sitId FROM sitin_records WHERE sitId = ? AND idNum = ? AND status = 'Reserved' AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([$sitId, $idNum]);
        if (!$stmt->fetch()) {
            echo json_encode(['success' => false, 'message' => 'Reservation not found or cannot be cancelled.']);
            exit;
        }

        // Soft-delete the reservation and refund the session
        $pdo->prepare("UPDATE sitin_records SET deleted_at = NOW() WHERE sitId = ?")->execute([$sitId]);
        $pdo->prepare("UPDATE users SET sitin_remaining = sitin_remaining + 1 WHERE idNum = ?")->execute([$idNum]);

        // Get updated remaining
        $rem = $pdo->prepare("SELECT sitin_remaining FROM users WHERE idNum = ?");
        $rem->execute([$idNum]);
        $remaining = $rem->fetchColumn();

        echo json_encode(['success' => true, 'message' => 'Reservation cancelled. Session refunded.', 'remaining' => (int)$remaining]);
    }
    
    elseif ($action === 'get_history') {
        $idNum = trim($input['idNum'] ?? '');
        if (!$idNum) {
            echo json_encode(['success' => false, 'message' => 'Missing student ID.']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("
                SELECT s.*,
                    COALESCE((SELECT COUNT(*) FROM feedbacks WHERE sitId = s.sitId), 0) as fbCount,
                    (SELECT message FROM feedbacks WHERE sitId = s.sitId ORDER BY id DESC LIMIT 1) as feedback_message,
                    (SELECT rating FROM feedbacks WHERE sitId = s.sitId ORDER BY id DESC LIMIT 1) as feedback_rating,
                    (SELECT date FROM feedbacks WHERE sitId = s.sitId ORDER BY id DESC LIMIT 1) as feedback_date
                FROM sitin_records s
                WHERE s.idNum = ? AND s.deleted_at IS NULL
                ORDER BY s.sitId DESC
            ");
            $stmt->execute([$idNum]);
            $history = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'history' => $history]);
        } catch(Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage(), 'history' => []]);
        }
    }
    
    elseif ($action === 'submit_feedback') {
        $idNum = trim($input['idNum'] ?? '');
        $sitId = $input['sitId'] ?? null;
        $message = trim($input['message'] ?? '');
        $rating = isset($input['rating']) ? intval($input['rating']) : 0;
        $date = trim($input['date'] ?? date('M j, Y, g:i A'));
        
        if (!$idNum || !$sitId || $rating < 1 || $rating > 5) {
            echo json_encode(['success' => false, 'message' => 'Please select a rating before submitting feedback.']);
            exit;
        }

        if (strlen($message) > 500) {
            echo json_encode(['success' => false, 'message' => 'Feedback message must be 500 characters or fewer.']);
            exit;
        }

        $sessionStmt = $pdo->prepare("SELECT sitId FROM sitin_records WHERE sitId = ? AND idNum = ? AND LOWER(status) = 'done' AND deleted_at IS NULL LIMIT 1");
        $sessionStmt->execute([$sitId, $idNum]);
        if (!$sessionStmt->fetch()) {
            echo json_encode(['success' => false, 'message' => 'Feedback can only be submitted for completed sessions.']);
            exit;
        }

        $dupStmt = $pdo->prepare("SELECT COUNT(*) FROM feedbacks WHERE sitId = ?");
        $dupStmt->execute([$sitId]);
        if ((int)$dupStmt->fetchColumn() > 0) {
            echo json_encode(['success' => false, 'message' => 'Feedback has already been submitted for this session.']);
            exit;
        }
        
        $stmt = $pdo->prepare("INSERT INTO feedbacks (sitId, idNum, message, date, rating) VALUES (?, ?, ?, ?, ?)");
        if ($stmt->execute([$sitId, $idNum, $message, $date, $rating])) {
            echo json_encode(['success' => true, 'message' => 'Feedback submitted successfully.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Database error.']);
        }
    }
    elseif ($action === 'get_sitin_status') {
        $idNum = trim($input['idNum'] ?? '');
        if (!$idNum) {
            echo json_encode(['success' => false, 'message' => 'Missing student ID.']);
            exit;
        }
        // Active sit-in
        $activeStmt = $pdo->prepare("SELECT sitId, lab, purpose, login, date FROM sitin_records WHERE idNum = ? AND status = 'Active' AND deleted_at IS NULL ORDER BY sitId DESC LIMIT 1");
        $activeStmt->execute([$idNum]);
        $active = $activeStmt->fetch(PDO::FETCH_ASSOC);

        // Most recent Done session
        $doneStmt = $pdo->prepare("SELECT sitId, lab, purpose, login, logout, date FROM sitin_records WHERE idNum = ? AND status = 'Done' AND deleted_at IS NULL ORDER BY sitId DESC LIMIT 1");
        $doneStmt->execute([$idNum]);
        $lastDone = $doneStmt->fetch(PDO::FETCH_ASSOC);

        echo json_encode([
            'success'  => true,
            'active'   => $active ?: null,
            'lastDone' => $lastDone ?: null
        ]);
    }

    // ── Get student summary stats ──
    elseif ($action === 'get_summary') {
        $idNum = trim($input['idNum'] ?? '');
        if (!$idNum) {
            echo json_encode(['success' => false, 'message' => 'Missing student ID.']);
            exit;
        }

        // Get all completed sessions for this student
        $stmt = $pdo->prepare("SELECT login, logout, date, lab, purpose, pc_number, time_slot, status, duration_minutes FROM sitin_records WHERE idNum = ? AND deleted_at IS NULL ORDER BY sitId DESC");
        $stmt->execute([$idNum]);
        $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $totalMinutes = 0;
        $totalSessions = 0;
        $longestMinutes = 0;
        $sessionDurations = [];

        foreach ($records as $r) {
            if ($r['status'] === 'Done' && !empty($r['duration_minutes'])) {
                $totalSessions++;
                $dur = (float)$r['duration_minutes'];
                $totalMinutes += $dur;
                $sessionDurations[] = $dur;
                if ($dur > $longestMinutes) $longestMinutes = $dur;
                continue;
            }
            if ($r['status'] === 'Done' && $r['login'] !== '—' && $r['logout'] !== '—' && !empty($r['logout'])) {
                $totalSessions++;
                // Parse times like "10:30 AM"
                $loginTs = strtotime($r['date'] . ' ' . $r['login']);
                $logoutTs = strtotime($r['date'] . ' ' . $r['logout']);
                if ($loginTs && $logoutTs && $logoutTs > $loginTs) {
                    $dur = ($logoutTs - $loginTs) / 60; // minutes
                    $totalMinutes += $dur;
                    $sessionDurations[] = $dur;
                    if ($dur > $longestMinutes) $longestMinutes = $dur;
                }
            } elseif ($r['status'] === 'Done') {
                $totalSessions++;
            }
        }

        $avgMinutes = count($sessionDurations) > 0 ? round($totalMinutes / count($sessionDurations), 1) : 0;
        $totalHours = round($totalMinutes / 60, 1);

        echo json_encode([
            'success' => true,
            'summary' => [
                'total_hours' => $totalHours,
                'total_sessions' => $totalSessions,
                'avg_duration_min' => $avgMinutes,
                'longest_session_min' => round($longestMinutes, 1),
                'total_records' => count($records)
            ],
            'sessions' => $records
        ]);
    }

    // ── Get lab status (all labs, real-time PC availability) ──
    elseif ($action === 'get_lab_status') {
        $labs = ['524', '526', '528', '530', '542', '544', '517'];
        $result = [];

        foreach ($labs as $lab) {
            $stmt = $pdo->prepare("SELECT pc_number, status, name, idNum, purpose, time_slot FROM sitin_records WHERE lab = ? AND pc_number IS NOT NULL AND status IN ('Reserved','Active') AND deleted_at IS NULL AND date = ?");
            $today = date('Y-m-d');
            $stmt->execute([$lab, $today]);
            $pcs = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $pcMap = [];
            $activeCount = 0;
            $reservedCount = 0;
            foreach ($pcs as $pc) {
                $num = (int)$pc['pc_number'];
                $pcMap[$num] = [
                    'status' => $pc['status'],
                    'name' => $pc['name'],
                    'idNum' => $pc['idNum'],
                    'purpose' => $pc['purpose'],
                    'time_slot' => $pc['time_slot']
                ];
                if ($pc['status'] === 'Active') $activeCount++;
                if ($pc['status'] === 'Reserved') $reservedCount++;
            }

            $result[] = [
                'lab' => $lab,
                'total_pcs' => 40,
                'active' => $activeCount,
                'reserved' => $reservedCount,
                'available' => 40 - $activeCount - $reservedCount,
                'pcs' => $pcMap
            ];
        }

        echo json_encode(['success' => true, 'labs' => $result]);
    }

    else {
        echo json_encode(['success' => false, 'message' => 'Invalid action.']);
    }
} else {
    echo json_encode(['success' => false, 'message' => 'Invalid method.']);
}
?>
