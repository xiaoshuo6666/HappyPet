const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupAdmin() {
    let connection;
    try {
        console.log('🛠️  設置管理員功能...');
        
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: 'happy_pet'
        });

        // 更新使用者表，添加管理員權限
        await connection.execute(`
            ALTER TABLE users 
            MODIFY COLUMN user_type ENUM('owner', 'caretaker', 'admin') DEFAULT 'owner'
        `);

        // 創建管理員帳號（如果不存在）
        const [existingAdmin] = await connection.execute(
            'SELECT id FROM users WHERE username = ?',
            ['admin']
        );

        if (existingAdmin.length === 0) {
            const bcrypt = require('bcryptjs');
            const passwordHash = await bcrypt.hash('admin123', 10);
            
            await connection.execute(
                'INSERT INTO users (username, email, password_hash, user_type, full_name) VALUES (?, ?, ?, ?, ?)',
                ['admin', 'admin@happypet.com', passwordHash, 'admin', '系統管理員']
            );
            console.log('✅ 管理員帳號創建成功');
            console.log('   👤 帳號: admin');
            console.log('   🔑 密碼: admin123');
        } else {
            console.log('✅ 管理員帳號已存在');
        }

        console.log('🎉 管理員功能設置完成');

    } catch (error) {
        console.error('❌ 設置失敗:', error.message);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

setupAdmin();