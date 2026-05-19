<?php
// setup.php - Run this ONCE to create the database and tables
$host = '127.0.0.1';
$username = 'root';
$password = ''; // Default XAMPP

try {
    // 1. Connect without database to create it
    $pdo = new PDO("mysql:host=$host;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // 2. Create the database
    $pdo->exec("CREATE DATABASE IF NOT EXISTS ccs_sitin DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci");
    echo "Database 'ccs_sitin' created or already exists.<br>";
    
    // 3. Switch to the database
    $pdo->exec("USE ccs_sitin");
    
    // 4. Create users table
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        idNum VARCHAR(50) PRIMARY KEY,
        firstname VARCHAR(100),
        lastname VARCHAR(100),
        middlename VARCHAR(100),
        email VARCHAR(150),
        password VARCHAR(255) NOT NULL,
        level INT,
        course VARCHAR(150),
        address TEXT,
        sitin_remaining INT DEFAULT 30,
        role VARCHAR(20) DEFAULT 'student',
        profilePic LONGTEXT
    )");
    echo "Table 'users' created.<br>";
    
    // 5. Create sitin_records table
    $pdo->exec("CREATE TABLE IF NOT EXISTS sitin_records (
        sitId INT AUTO_INCREMENT PRIMARY KEY,
        idNum VARCHAR(50),
        name VARCHAR(255),
        purpose VARCHAR(100),
        lab VARCHAR(50),
        login VARCHAR(20),
        logout VARCHAR(20),
        session INT DEFAULT 1,
        date VARCHAR(20),
        status VARCHAR(20) DEFAULT 'Active',
        FOREIGN KEY (idNum) REFERENCES users(idNum) ON DELETE CASCADE
    )");
    echo "Table 'sitin_records' created.<br>";
    
    // 6. Create announcements table
    $pdo->exec("CREATE TABLE IF NOT EXISTS announcements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        text TEXT NOT NULL,
        date VARCHAR(100)
    )");
    echo "Table 'announcements' created.<br>";

    // 7. Create feedbacks table
    $pdo->exec("CREATE TABLE IF NOT EXISTS feedbacks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idNum VARCHAR(50),
        sitId INT UNIQUE,
        message TEXT NOT NULL,
        date VARCHAR(100),
        rating TINYINT DEFAULT NULL,
        FOREIGN KEY (idNum) REFERENCES users(idNum) ON DELETE CASCADE
    )");
    echo "Table 'feedbacks' created.<br>";

    // 7b. Add rating column to existing feedbacks table (migration)
    try {
        $pdo->exec("ALTER TABLE feedbacks ADD COLUMN rating TINYINT DEFAULT NULL");
        echo "Column 'rating' added to feedbacks.<br>";
    } catch (Exception $e) {
        echo "Column 'rating' already exists (skipped).<br>";
    }

    // 8. Add pc_number column to sitin_records (migration for reservation)
    try {
        $pdo->exec("ALTER TABLE sitin_records ADD COLUMN pc_number INT DEFAULT NULL");
        echo "Column 'pc_number' added to sitin_records.<br>";
    } catch (Exception $e) {
        echo "Column 'pc_number' already exists (skipped).<br>";
    }

    // 8b. Add time_slot column to sitin_records (migration for reservation)
    try {
        $pdo->exec("ALTER TABLE sitin_records ADD COLUMN time_slot VARCHAR(30) DEFAULT NULL");
        echo "Column 'time_slot' added to sitin_records.<br>";
    } catch (Exception $e) {
        echo "Column 'time_slot' already exists (skipped).<br>";
    }

    // 9. Add points column to users (migration for leaderboard)
    try {
        $pdo->exec("ALTER TABLE users ADD COLUMN points INT DEFAULT 0");
        echo "Column 'points' added to users.<br>";
    } catch (Exception $e) {
        echo "Column 'points' already exists (skipped).<br>";
    }

    // 10. Create points_log table
    $pdo->exec("CREATE TABLE IF NOT EXISTS points_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idNum VARCHAR(50),
        points_added INT,
        reason TEXT,
        date VARCHAR(100),
        FOREIGN KEY (idNum) REFERENCES users(idNum) ON DELETE CASCADE
    )");
    echo "Table 'points_log' created.<br>";

    // 11. Create notifications table
    $pdo->exec("CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idNum VARCHAR(50),
        message TEXT NOT NULL,
        is_read TINYINT DEFAULT 0,
        date VARCHAR(100),
        FOREIGN KEY (idNum) REFERENCES users(idNum) ON DELETE CASCADE
    )");
    echo "Table 'notifications' created.<br>";

    // 12. Create lab software tables
    $pdo->exec("CREATE TABLE IF NOT EXISTS lab_software (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lab VARCHAR(20) NOT NULL,
        name VARCHAR(150) NOT NULL,
        version VARCHAR(80) DEFAULT '',
        category VARCHAR(20) NOT NULL DEFAULT 'TOOL',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    echo "Table 'lab_software' created.<br>";

    $pdo->exec("CREATE TABLE IF NOT EXISTS lab_software_settings (
        lab VARCHAR(20) PRIMARY KEY,
        is_published TINYINT(1) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");
    echo "Table 'lab_software_settings' created.<br>";

    $labs = ['524', '526', '528', '530', '542', '544', '517'];
    $labSetting = $pdo->prepare("INSERT IGNORE INTO lab_software_settings (lab, is_published) VALUES (?, 0)");
    foreach ($labs as $lab) {
        $labSetting->execute([$lab]);
    }
    echo "Default lab software settings created.<br>";

    $softwareCount = (int)$pdo->query("SELECT COUNT(*) FROM lab_software")->fetchColumn();
    if ($softwareCount === 0) {
        $defaultSoftware = [
            ['XAMPP', '8.2', 'DB'],
            ['Python', '3.12', 'DEV'],
            ['Visual Studio Code', 'latest', 'IDE'],
            ['Visual Studio', '2022', 'IDE'],
            ['Cisco Packet Tracer', '8.2', 'TOOL'],
            ['Google Chrome', 'latest', 'WEB']
        ];
        $labSoftwareSeed = $pdo->prepare("INSERT INTO lab_software (lab, name, version, category) VALUES (?, ?, ?, ?)");
        foreach ($labs as $lab) {
            foreach ($defaultSoftware as $software) {
                $labSoftwareSeed->execute([$lab, $software[0], $software[1], $software[2]]);
            }
            $pdo->prepare("UPDATE lab_software_settings SET is_published = 1 WHERE lab = ?")->execute([$lab]);
        }
        echo "Default lab software catalog seeded.<br>";
    }

    // 7. Insert default Admin account
    $adminId = 'admin';
    // Check if admin exists
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE idNum = ?");
    $stmt->execute([$adminId]);
    if ($stmt->fetchColumn() == 0) {
        $adminPass = password_hash('admin123', PASSWORD_DEFAULT);
        $insert = $pdo->prepare("INSERT INTO users (idNum, firstname, lastname, password, role) VALUES (?, ?, ?, ?, ?)");
        $insert->execute([$adminId, 'System', 'Admin', $adminPass, 'admin']);
        echo "Default admin account created (Username: admin, Password: admin123).<br>";
    } else {
        echo "Default admin account already exists.<br>";
    }
    
    echo "<br><b>Setup Complete!</b> You can now <a href='login.html'>login here</a>.";
    
} catch(PDOException $e) {
    die("Setup Failed: " . $e->getMessage());
}
?>
