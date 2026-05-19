<?php
// api/leaderboard.php - Handles Leaderboard and Reward actions for Admins
require_once 'db.php';

header('Content-Type: application/json');
$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    
    if ($action === 'get_admin_leaderboard') {
        // We need to fetch all students, their completed sessions, calculate points, and sort them.
        $stmt = $pdo->query("SELECT * FROM users WHERE role = 'student'");
        $students = $stmt->fetchAll();
        
        $leaderboard = [];
        
        foreach ($students as $student) {
            $idNum = $student['idNum'];
            
            // Get completed sessions
            $sStmt = $pdo->prepare("SELECT login, logout FROM sitin_records WHERE idNum = ? AND status = 'Done'");
            $sStmt->execute([$idNum]);
            $sessions = $sStmt->fetchAll();
            
            $total_sitins = count($sessions);
            $total_duration_mins = 0;
            $longest_session_mins = 0;
            $session_points = 0;
            
            foreach ($sessions as $s) {
                if ($s['login'] && $s['logout']) {
                    $login_time = strtotime($s['login']);
                    $logout_time = strtotime($s['logout']);
                    
                    if ($logout_time && $login_time) {
                        $diff_mins = max(0, round(abs($logout_time - $login_time) / 60));
                        $total_duration_mins += $diff_mins;
                        if ($diff_mins > $longest_session_mins) {
                            $longest_session_mins = $diff_mins;
                        }
                        
                        // Calculate Points for this session
                        // Completion: +1
                        $pts = 1;
                        // Duration: +1 per 30 mins (max 3)
                        $dur_pts = floor($diff_mins / 30);
                        if ($dur_pts > 3) $dur_pts = 3;
                        $pts += $dur_pts;
                        // Bonus: +1 if >= 2 hours (120 mins)
                        if ($diff_mins >= 120) {
                            $pts += 1;
                        }
                        
                        $session_points += $pts;
                    }
                }
            }
            
            // Manual points (stored in users.points)
            $manual_points = (int)($student['points'] ?? 0);
            
            $total_points = $session_points + $manual_points;
            
            // Calculate format for hours/mins
            $hours = floor($total_duration_mins / 60);
            $mins = $total_duration_mins % 60;
            $total_hours_str = $hours > 0 ? "{$hours}h {$mins}m" : "{$mins}m";
            if ($total_duration_mins == 0) $total_hours_str = "0h";
            
            $avg_session_mins = $total_sitins > 0 ? round($total_duration_mins / $total_sitins) : 0;
            $avg_hours = floor($avg_session_mins / 60);
            $avg_mins = $avg_session_mins % 60;
            $avg_session_str = $avg_hours > 0 ? "{$avg_hours}h {$avg_mins}m" : "{$avg_mins}m";
            if ($avg_session_mins == 0) $avg_session_str = "—";
            
            $long_hours = floor($longest_session_mins / 60);
            $long_mins = $longest_session_mins % 60;
            $longest_session_str = $long_hours > 0 ? "{$long_hours}h {$long_mins}m" : "{$long_mins}m";
            if ($longest_session_mins == 0) $longest_session_str = "—";
            
            $leaderboard[] = [
                'idNum' => $idNum,
                'firstname' => $student['firstname'],
                'lastname' => $student['lastname'],
                'course' => $student['course'],
                'profilePic' => $student['profilePic'],
                'total_sitins' => $total_sitins,
                'total_duration_mins' => $total_duration_mins,
                'total_hours_str' => $total_hours_str,
                'avg_session_str' => $avg_session_str,
                'longest_session_str' => $longest_session_str,
                'session_points' => $session_points,
                'manual_points' => $manual_points,
                'total_points' => $total_points
            ];
        }
        
        // Sort logic: 1. total_points DESC, 2. total_sitins DESC, 3. total_duration_mins DESC
        usort($leaderboard, function($a, $b) {
            if ($a['total_points'] !== $b['total_points']) {
                return $b['total_points'] - $a['total_points'];
            }
            if ($a['total_sitins'] !== $b['total_sitins']) {
                return $b['total_sitins'] - $a['total_sitins'];
            }
            return $b['total_duration_mins'] - $a['total_duration_mins'];
        });
        
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
    
    elseif ($action === 'add_points') {
        $idNum = $input['idNum'] ?? '';
        $points = (int)($input['points'] ?? 0);
        $reason = $input['reason'] ?? '';
        
        if (!$idNum || $points <= 0) {
            echo json_encode(['success' => false, 'message' => 'Invalid inputs.']);
            exit;
        }
        
        // Add to users.points
        $stmt = $pdo->prepare("UPDATE users SET points = points + ? WHERE idNum = ?");
        if ($stmt->execute([$points, $idNum])) {
            
            $date = date('F j, Y, h:i A');
            // Log to points_log
            $logStmt = $pdo->prepare("INSERT INTO points_log (idNum, points_added, reason, date) VALUES (?, ?, ?, ?)");
            $logStmt->execute([$idNum, $points, $reason, $date]);
            
            // Send notification
            $notifMsg = "You have been awarded {$points} XP Points! Reason: {$reason}";
            $notifStmt = $pdo->prepare("INSERT INTO notifications (idNum, message, date) VALUES (?, ?, ?)");
            $notifStmt->execute([$idNum, $notifMsg, $date]);
            
            echo json_encode(['success' => true, 'message' => 'Points awarded successfully.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Database error.']);
        }
    }
    
    elseif ($action === 'reset_sessions') {
        $default_sessions = 30; // Default count
        $stmt = $pdo->prepare("UPDATE users SET sitin_remaining = ? WHERE role = 'student'");
        if ($stmt->execute([$default_sessions])) {
            echo json_encode(['success' => true, 'message' => "All student sessions have been reset to {$default_sessions}."]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Database error.']);
        }
    }
    
    else {
        echo json_encode(['success' => false, 'message' => 'Invalid action.']);
    }
} else {
    echo json_encode(['success' => false, 'message' => 'Invalid method.']);
}
?>
