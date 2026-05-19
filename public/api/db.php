<?php
// db.php - Handles the database connection
$host = '127.0.0.1';
$dbname = 'ccs_sitin';
$username = 'root';
$password = ''; // Default XAMPP MySQL password is empty

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    // Set PDO error mode to exception
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    // Set default fetch mode to associative array
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    function ensure_column(PDO $pdo, string $table, string $column, string $definition): void {
        $stmt = $pdo->prepare("
            SELECT COUNT(*)
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
              AND COLUMN_NAME = ?
        ");
        $stmt->execute([$table, $column]);
        if ((int)$stmt->fetchColumn() === 0) {
            $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
        }
    }

    function ensure_index(PDO $pdo, string $table, string $index, string $sql): void {
        $stmt = $pdo->prepare("SHOW INDEX FROM `$table` WHERE Key_name = ?");
        $stmt->execute([$index]);
        if (!$stmt->fetch()) {
            $pdo->exec($sql);
        }
    }

    try {
        ensure_column($pdo, 'sitin_records', 'login_date', 'DATETIME DEFAULT NULL');
        ensure_column($pdo, 'sitin_records', 'logout_date', 'DATETIME DEFAULT NULL');
        ensure_column($pdo, 'sitin_records', 'duration_minutes', 'INT DEFAULT NULL');
        ensure_column($pdo, 'sitin_records', 'deleted_at', 'DATETIME DEFAULT NULL');
        ensure_column($pdo, 'feedbacks', 'rating', 'TINYINT DEFAULT NULL');

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                actor_id VARCHAR(50) DEFAULT NULL,
                action VARCHAR(80) NOT NULL,
                entity_type VARCHAR(60) DEFAULT NULL,
                entity_id VARCHAR(60) DEFAULT NULL,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8
        ");

        ensure_index($pdo, 'sitin_records', 'idx_sitin_status', 'CREATE INDEX idx_sitin_status ON sitin_records (status)');
        ensure_index($pdo, 'sitin_records', 'idx_sitin_date', 'CREATE INDEX idx_sitin_date ON sitin_records (date)');
        ensure_index($pdo, 'sitin_records', 'idx_sitin_lab', 'CREATE INDEX idx_sitin_lab ON sitin_records (lab)');
        ensure_index($pdo, 'sitin_records', 'idx_sitin_idnum', 'CREATE INDEX idx_sitin_idnum ON sitin_records (idNum)');
        ensure_index($pdo, 'sitin_records', 'idx_sitin_deleted_at', 'CREATE INDEX idx_sitin_deleted_at ON sitin_records (deleted_at)');
        ensure_index($pdo, 'feedbacks', 'idx_feedbacks_sitid', 'CREATE INDEX idx_feedbacks_sitid ON feedbacks (sitId)');

        $pdo->exec("
            UPDATE sitin_records
            SET status = CASE LOWER(status)
                WHEN 'active' THEN 'Active'
                WHEN 'done' THEN 'Done'
                WHEN 'reserved' THEN 'Reserved'
                ELSE status
            END
            WHERE status IS NOT NULL
        ");
    } catch (Throwable $migrationError) {
        error_log('DB migration warning: ' . $migrationError->getMessage());
    }
} catch(PDOException $e) {
    if ($e->getCode() == 1049) {
        // Database does not exist - setup.php needs to be run!
        die(json_encode(['error' => 'Database not found. Please run setup.php first!']));
    }
    die(json_encode(['error' => 'Database Connection Failed: ' . $e->getMessage()]));
}
?>
