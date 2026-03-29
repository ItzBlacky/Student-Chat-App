const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

pool.runMigrations = async () => {
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
};

module.exports = pool;
