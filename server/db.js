const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "root",
    database: "student_chat_app"
});

module.exports = pool;