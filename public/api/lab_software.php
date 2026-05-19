<?php
require_once 'db.php';
session_start();

header('Content-Type: application/json');

const ALL_LABS = ['524', '526', '528', '530', '542', '544', '517'];
const SOFTWARE_CATEGORIES = ['IDE', 'WEB', 'DEV', 'DB', 'TOOL', 'OS'];

function labSoftwareJson(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function requireLabSoftwareAdmin(string $action): void {
    $publicActions = ['get_public'];
    if (in_array($action, $publicActions, true)) {
        return;
    }

    if (empty($_SESSION['user_id']) || ($_SESSION['role'] ?? '') !== 'admin') {
        labSoftwareJson(['success' => false, 'message' => 'Admin session required.'], 401);
    }

    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    $mutatingActions = ['add', 'update', 'delete', 'toggle_publish'];
    if (in_array($action, $mutatingActions, true)) {
        $csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!$csrf || !hash_equals($_SESSION['csrf_token'], $csrf)) {
            labSoftwareJson(['success' => false, 'message' => 'Invalid security token. Refresh and try again.'], 403);
        }
    }
}

function ensureLabSoftwareTables(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS lab_software (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lab VARCHAR(20) NOT NULL,
        name VARCHAR(150) NOT NULL,
        version VARCHAR(80) DEFAULT '',
        category VARCHAR(20) NOT NULL DEFAULT 'TOOL',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS lab_software_settings (
        lab VARCHAR(20) PRIMARY KEY,
        is_published TINYINT(1) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    $stmt = $pdo->prepare("INSERT IGNORE INTO lab_software_settings (lab, is_published) VALUES (?, 0)");
    foreach (ALL_LABS as $lab) {
        $stmt->execute([$lab]);
    }
}

function seedDefaultLabSoftware(PDO $pdo): void {
    $count = (int)$pdo->query("SELECT COUNT(*) FROM lab_software")->fetchColumn();
    if ($count > 0) {
        return;
    }

    $defaults = [
        ['XAMPP', '8.2', 'DB'],
        ['Python', '3.12', 'DEV'],
        ['Visual Studio Code', 'latest', 'IDE'],
        ['Visual Studio', '2022', 'IDE'],
        ['Cisco Packet Tracer', '8.2', 'TOOL'],
        ['Google Chrome', 'latest', 'WEB']
    ];

    $insert = $pdo->prepare("INSERT INTO lab_software (lab, name, version, category) VALUES (?, ?, ?, ?)");
    foreach (ALL_LABS as $lab) {
        foreach ($defaults as $software) {
            $insert->execute([$lab, $software[0], $software[1], $software[2]]);
        }
    }

    $publish = $pdo->prepare("INSERT INTO lab_software_settings (lab, is_published) VALUES (?, 1)
        ON DUPLICATE KEY UPDATE is_published = VALUES(is_published)");
    foreach (ALL_LABS as $lab) {
        $publish->execute([$lab]);
    }
}

function normalizeLabSoftwareText(?string $value): string {
    $value = strtolower(trim((string)$value));
    return preg_replace('/\s+/', ' ', $value) ?? '';
}

function cleanLabSoftwareText(?string $value): string {
    return preg_replace('/\s+/', ' ', trim((string)$value)) ?? '';
}

function normalizeLabSoftwareVersion(?string $value): string {
    $version = normalizeLabSoftwareText($value);
    return preg_replace('/^v\s*/', '', $version) ?? '';
}

function cleanLabSoftwareVersion(?string $value): string {
    $version = cleanLabSoftwareText($value);
    return preg_replace('/^v\s*/i', '', $version) ?? '';
}

function labSoftwareKey(string $lab, string $name, string $version): string {
    return $lab . '|' . normalizeLabSoftwareText($name) . '|' . normalizeLabSoftwareVersion($version);
}

function isDuplicateLabSoftware(array $row, string $lab, string $name, string $version, int $excludeId = 0): bool {
    if ($excludeId && (int)$row['id'] === $excludeId) {
        return false;
    }
    if ((string)$row['lab'] !== $lab) {
        return false;
    }

    $existingName = normalizeLabSoftwareText($row['name'] ?? '');
    $existingVersion = normalizeLabSoftwareVersion($row['version'] ?? '');
    $targetName = normalizeLabSoftwareText($name);
    $targetVersion = normalizeLabSoftwareVersion($version);

    if ($existingName !== $targetName) {
        return false;
    }

    if ($targetVersion === '' || $existingVersion === '') {
        return true;
    }

    return $existingVersion === $targetVersion;
}

function labSoftwareDuplicates(PDO $pdo, array $labs, string $name, string $version, int $excludeId = 0): array {
    $stmt = $pdo->query("SELECT id, lab, name, version FROM lab_software");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $duplicates = [];
    foreach ($labs as $lab) {
        foreach ($rows as $row) {
            if (isDuplicateLabSoftware($row, $lab, $name, $version, $excludeId)) {
                $duplicates[] = $lab;
                break;
            }
        }
    }
    return array_values(array_unique($duplicates));
}

function cleanupDuplicateLabSoftware(PDO $pdo): int {
    $rows = $pdo->query("SELECT id, lab, name, version, category, created_at FROM lab_software ORDER BY lab, name, id")->fetchAll(PDO::FETCH_ASSOC);
    $groups = [];
    foreach ($rows as $row) {
        $groupKey = (string)$row['lab'] . '|' . normalizeLabSoftwareText($row['name'] ?? '');
        $groups[$groupKey][] = $row;
    }

    $deleteIds = [];
    foreach ($groups as $groupRows) {
        $versionKeep = [];
        $emptyRows = [];

        foreach ($groupRows as $row) {
            $versionKey = normalizeLabSoftwareVersion($row['version'] ?? '');
            if ($versionKey === '') {
                $emptyRows[] = $row;
                continue;
            }

            if (!isset($versionKeep[$versionKey])) {
                $versionKeep[$versionKey] = (int)$row['id'];
            } else {
                $deleteIds[] = (int)$row['id'];
            }
        }

        if ($versionKeep) {
            foreach ($emptyRows as $row) {
                $deleteIds[] = (int)$row['id'];
            }
        } elseif ($emptyRows) {
            array_shift($emptyRows);
            foreach ($emptyRows as $row) {
                $deleteIds[] = (int)$row['id'];
            }
        }
    }

    $deleteIds = array_values(array_unique(array_filter($deleteIds)));
    if (!$deleteIds) {
        return 0;
    }

    $placeholders = implode(',', array_fill(0, count($deleteIds), '?'));
    $stmt = $pdo->prepare("DELETE FROM lab_software WHERE id IN ($placeholders)");
    $stmt->execute($deleteIds);
    return count($deleteIds);
}

function acquireLabSoftwareLock(PDO $pdo): bool {
    try {
        $stmt = $pdo->query("SELECT GET_LOCK('ccs_lab_software_write', 8)");
        return (int)$stmt->fetchColumn() === 1;
    } catch (Throwable $e) {
        return true;
    }
}

function releaseLabSoftwareLock(PDO $pdo): void {
    try {
        $pdo->query("SELECT RELEASE_LOCK('ccs_lab_software_write')");
    } catch (Throwable $e) {
        error_log('Lab software lock release warning: ' . $e->getMessage());
    }
}

function groupedSoftware(PDO $pdo, bool $publicOnly): array {
    $where = $publicOnly ? "WHERE s.is_published = 1" : "";
    $stmt = $pdo->query("
        SELECT s.lab, s.is_published, sw.id, sw.name, sw.version, sw.category, sw.created_at
        FROM lab_software_settings s
        LEFT JOIN lab_software sw ON sw.lab = s.lab
        $where
        ORDER BY FIELD(s.lab, '524','526','528','530','542','544','517'), sw.category, sw.name
    ");

    $labs = [];
    foreach (ALL_LABS as $lab) {
        $labs[$lab] = ['lab' => $lab, 'is_published' => false, 'software' => []];
    }

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $lab = $row['lab'];
        if (!isset($labs[$lab])) {
            $labs[$lab] = ['lab' => $lab, 'is_published' => false, 'software' => []];
        }
        $labs[$lab]['is_published'] = (bool)$row['is_published'];
        if ($row['id']) {
            $labs[$lab]['software'][] = [
                'id' => (int)$row['id'],
                'lab' => $lab,
                'name' => $row['name'],
                'version' => $row['version'] ?? '',
                'category' => $row['category'] ?: 'TOOL',
                'created_at' => $row['created_at'] ?? ''
            ];
        }
    }

    if ($publicOnly) {
        $labs = array_filter($labs, fn($lab) => $lab['is_published']);
    }

    return array_values($labs);
}

try {
    $labSoftwareLockAcquired = false;
    ensureLabSoftwareTables($pdo);
    seedDefaultLabSoftware($pdo);
    $action = $_GET['action'] ?? '';
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'Invalid method.']);
        exit;
    }

    requireLabSoftwareAdmin($action);

    if ($action === 'get_admin') {
        $cleanedDuplicates = cleanupDuplicateLabSoftware($pdo);
        echo json_encode([
            'success' => true,
            'labs' => groupedSoftware($pdo, false),
            'all_labs' => ALL_LABS,
            'categories' => SOFTWARE_CATEGORIES,
            'cleaned_duplicates' => $cleanedDuplicates
        ]);
    }
    elseif ($action === 'get_public') {
        $cleanedDuplicates = cleanupDuplicateLabSoftware($pdo);
        echo json_encode([
            'success' => true,
            'labs' => groupedSoftware($pdo, true),
            'all_labs' => ALL_LABS,
            'categories' => SOFTWARE_CATEGORIES,
            'cleaned_duplicates' => $cleanedDuplicates
        ]);
    }
    elseif ($action === 'add') {
        $lab = trim($input['lab'] ?? '');
        $name = cleanLabSoftwareText($input['name'] ?? '');
        $version = cleanLabSoftwareVersion($input['version'] ?? '');
        $category = strtoupper(trim($input['category'] ?? 'TOOL'));

        if ((!in_array($lab, ALL_LABS, true) && $lab !== 'ALL') || !$name || !in_array($category, SOFTWARE_CATEGORIES, true)) {
            echo json_encode(['success' => false, 'message' => 'Please provide a valid lab, name, and category.']);
            exit;
        }

        if (!acquireLabSoftwareLock($pdo)) {
            labSoftwareJson(['success' => false, 'message' => 'Software catalog is busy. Please try again.'], 409);
        }
        $labSoftwareLockAcquired = true;
        cleanupDuplicateLabSoftware($pdo);

        if ($lab === 'ALL') {
            $duplicates = labSoftwareDuplicates($pdo, ALL_LABS, $name, $version);
            $targetLabs = array_values(array_diff(ALL_LABS, $duplicates));
            if (!$targetLabs) {
                releaseLabSoftwareLock($pdo);
                $labSoftwareLockAcquired = false;
                echo json_encode(['success' => false, 'message' => 'This software is already registered in the selected lab/s.', 'duplicates' => $duplicates]);
                exit;
            }

            $stmt = $pdo->prepare("INSERT INTO lab_software (lab, name, version, category) VALUES (?, ?, ?, ?)");
            $pdo->beginTransaction();
            $ids = [];
            foreach ($targetLabs as $targetLab) {
                $stmt->execute([$targetLab, $name, $version, $category]);
                $ids[] = (int)$pdo->lastInsertId();
            }
            $pdo->commit();
            echo json_encode([
                'success' => true,
                'message' => $duplicates
                    ? 'Software added to available labs. Some labs were skipped because they already have this software.'
                    : 'Software added to all labs.',
                'ids' => $ids,
                'added_labs' => $targetLabs,
                'skipped_labs' => $duplicates
            ]);
            releaseLabSoftwareLock($pdo);
            $labSoftwareLockAcquired = false;
            exit;
        }

        $duplicates = labSoftwareDuplicates($pdo, [$lab], $name, $version);
        if ($duplicates) {
            releaseLabSoftwareLock($pdo);
            $labSoftwareLockAcquired = false;
            echo json_encode(['success' => false, 'message' => "This software is already registered in Lab $lab.", 'duplicates' => $duplicates]);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO lab_software (lab, name, version, category) VALUES (?, ?, ?, ?)");
        $stmt->execute([$lab, $name, $version, $category]);
        releaseLabSoftwareLock($pdo);
        $labSoftwareLockAcquired = false;
        echo json_encode(['success' => true, 'message' => 'Software added.', 'id' => (int)$pdo->lastInsertId()]);
    }
    elseif ($action === 'update') {
        $id = (int)($input['id'] ?? 0);
        $lab = trim($input['lab'] ?? '');
        $name = cleanLabSoftwareText($input['name'] ?? '');
        $version = cleanLabSoftwareVersion($input['version'] ?? '');
        $category = strtoupper(trim($input['category'] ?? 'TOOL'));

        if (!$id || !in_array($lab, ALL_LABS, true) || !$name || !in_array($category, SOFTWARE_CATEGORIES, true)) {
            echo json_encode(['success' => false, 'message' => 'Please provide a valid lab, name, and category.']);
            exit;
        }

        if (!acquireLabSoftwareLock($pdo)) {
            labSoftwareJson(['success' => false, 'message' => 'Software catalog is busy. Please try again.'], 409);
        }
        $labSoftwareLockAcquired = true;
        cleanupDuplicateLabSoftware($pdo);

        $exists = $pdo->prepare("SELECT id FROM lab_software WHERE id = ?");
        $exists->execute([$id]);
        if (!$exists->fetchColumn()) {
            releaseLabSoftwareLock($pdo);
            $labSoftwareLockAcquired = false;
            echo json_encode(['success' => false, 'message' => 'Software item was not found.']);
            exit;
        }

        $duplicates = labSoftwareDuplicates($pdo, [$lab], $name, $version, $id);
        if ($duplicates) {
            releaseLabSoftwareLock($pdo);
            $labSoftwareLockAcquired = false;
            echo json_encode(['success' => false, 'message' => "This software is already registered in Lab $lab.", 'duplicates' => $duplicates]);
            exit;
        }

        $stmt = $pdo->prepare("UPDATE lab_software SET lab = ?, name = ?, version = ?, category = ? WHERE id = ?");
        $stmt->execute([$lab, $name, $version, $category, $id]);
        releaseLabSoftwareLock($pdo);
        $labSoftwareLockAcquired = false;
        echo json_encode(['success' => true, 'message' => 'Software updated.']);
    }
    elseif ($action === 'delete') {
        $id = (int)($input['id'] ?? 0);
        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'Missing software ID.']);
            exit;
        }

        $stmt = $pdo->prepare("DELETE FROM lab_software WHERE id = ?");
        $stmt->execute([$id]);
        if ($stmt->rowCount() < 1) {
            echo json_encode(['success' => false, 'message' => 'Software item was not found.']);
            exit;
        }
        echo json_encode(['success' => true, 'message' => 'Software removed.']);
    }
    elseif ($action === 'toggle_publish') {
        $lab = trim($input['lab'] ?? '');
        $published = !empty($input['is_published']) ? 1 : 0;
        if (!in_array($lab, ALL_LABS, true)) {
            echo json_encode(['success' => false, 'message' => 'Invalid lab.']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO lab_software_settings (lab, is_published) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE is_published = VALUES(is_published)");
        $stmt->execute([$lab, $published]);
        echo json_encode(['success' => true, 'message' => $published ? 'Lab software published.' : 'Lab software hidden.']);
    }
    else {
        echo json_encode(['success' => false, 'message' => 'Invalid action.']);
    }
} catch (Exception $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if (!empty($labSoftwareLockAcquired) && isset($pdo) && $pdo instanceof PDO) {
        releaseLabSoftwareLock($pdo);
    }
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
