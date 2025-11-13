const mysql = require('mysql2/promise');
require('dotenv').config();

async function createDatabase() {
    let connection;
    try {
        console.log('🗄️  創建 happy_pet 資料庫...');
        
        // 先連接到 MySQL（不指定資料庫）
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            multipleStatements: true  // 允許執行多個語句
        });

        console.log('✅ 連接到 MySQL 成功');

        // 使用 query 而不是 execute 來執行 DDL 語句
        await connection.query('CREATE DATABASE IF NOT EXISTS happy_pet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        console.log('✅ 資料庫 happy_pet 創建成功');

        // 使用資料庫
        await connection.query('USE happy_pet');
        console.log('✅ 切換到 happy_pet 資料庫');

        console.log('🎉 資料庫準備完成！');

    } catch (error) {
        console.error('❌ 創建資料庫失敗:');
        console.error('錯誤:', error.message);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

createDatabase();

createDatabase();