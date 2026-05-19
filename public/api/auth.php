<?php
require_once 'db.php';
session_start();

header('Content-Type: application/json');
$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Read raw JSON body if no POST fields are present
    $input = json_decode(file_get_contents('php://input'), true);
    if ($input) {
        $_POST = $input;
    }

    if ($action === 'register') {
        $idNum = trim($_POST['idNum'] ?? '');
        $firstname = trim($_POST['firstname'] ?? '');
        $lastname = trim($_POST['lastname'] ?? '');
        $middlename = trim($_POST['middlename'] ?? '');
        $course = trim($_POST['course'] ?? '');
        $level = $_POST['level'] ?? 1;
        $email = trim($_POST['email'] ?? '');
        $address = trim($_POST['address'] ?? '');
        $password = trim($_POST['password'] ?? '');

        if (!$idNum || !$password || !$firstname || !$lastname) {
            echo json_encode(['success' => false, 'message' => 'Missing required fields.']);
            exit;
        }

        // Check if user exists
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE idNum = ?");
        $stmt->execute([$idNum]);
        if ($stmt->fetchColumn() > 0) {
            echo json_encode(['success' => false, 'message' => 'ID Number already registered!']);
            exit;
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);

        $stmt = $pdo->prepare("INSERT INTO users (idNum, firstname, lastname, middlename, email, password, level, course, address, role) 
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'student')");
        if ($stmt->execute([$idNum, $firstname, $lastname, $middlename, $email, $hash, $level, $course, $address])) {
            echo json_encode(['success' => true, 'message' => 'Registration successful!']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Database error during registration.']);
        }
    }
    
    elseif ($action === 'login') {
        $username = trim($_POST['username'] ?? '');
        $password = trim($_POST['password'] ?? '');

        if (!$username || !$password) {
            echo json_encode(['success' => false, 'message' => 'Please enter username and password.']);
            exit;
        }

        $stmt = $pdo->prepare("SELECT * FROM users WHERE idNum = ?");
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password'])) {
            session_regenerate_id(true);
            $_SESSION['user_id'] = $user['idNum'];
            $_SESSION['role'] = $user['role'];
            if (empty($_SESSION['csrf_token'])) {
                $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            }
            // Remove password hash from response
            unset($user['password']);
            echo json_encode(['success' => true, 'user' => $user, 'role' => $user['role'], 'csrf_token' => $_SESSION['csrf_token']]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Invalid credentials!']);
        }
    } elseif ($action === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid action.']);
    }
} else {
    echo json_encode(['success' => false, 'message' => 'Invalid request method.']);
}
?>
