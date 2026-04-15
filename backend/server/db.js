const mysql = require("mysql2/promise");
const { generateUniqueUserCode } = require("./utils/userCode");

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

pool.runMigrations = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS friend_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            pair_key VARCHAR(64) NOT NULL UNIQUE,
            sender_id INT NOT NULL,
            receiver_id INT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS private_conversations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_one_id INT NOT NULL,
            user_two_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_private_conversation (user_one_id, user_two_id),
            FOREIGN KEY (user_one_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (user_two_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS private_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            user_id INT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES private_conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    const [userRoleColumns] = await pool.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'role'
    `);

    if (userRoleColumns.length > 0) {
        await pool.query("ALTER TABLE users DROP COLUMN role");
    }

    const [userCodeColumns] = await pool.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'user_code'
    `);

    if (userCodeColumns.length === 0) {
        await pool.query(
            "ALTER TABLE users ADD COLUMN user_code VARCHAR(32) NULL UNIQUE AFTER username"
        );
    }

    const [columns] = await pool.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'course_members'
          AND COLUMN_NAME = 'role'
    `);

    if (columns.length === 0) {
        await pool.query(
            "ALTER TABLE course_members ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'student'"
        );
    }

    await pool.query(`
        UPDATE course_members cm
        JOIN courses c ON cm.course_id = c.id
        SET cm.role = 'admin'
        WHERE cm.user_id = c.user_id
    `);

    await pool.query(`
        UPDATE course_members
        SET role = 'student'
        WHERE role IS NULL OR TRIM(role) = ''
    `);

    await pool.query("UPDATE course_members SET role = LOWER(role)");

    const [usersMissingCode] = await pool.query(`
        SELECT id, username
        FROM users
        WHERE user_code IS NULL OR TRIM(user_code) = ''
        ORDER BY id ASC
    `);

    for (const user of usersMissingCode) {
        const userCode = await generateUniqueUserCode(pool, user.username);
        await pool.query(
            "UPDATE users SET user_code = ? WHERE id = ?",
            [userCode, user.id]
        );
    }
};

module.exports = pool;
