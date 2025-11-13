const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDatabase() {
    let connection;
    try {
        console.log('🔍 檢查資料庫狀態...');
        
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });

        // 檢查所有資料庫
        const [databases] = await connection.execute('SHOW DATABASES');
        console.log('📊 現有資料庫:');
        databases.forEach(db => {
            console.log('   -', db.Database);
        });

        // 檢查 happy_pet 是否存在
        const happyPetExists = databases.some(db => db.Database === 'happy_pet');
        console.log(happyPetExists ? '✅ happy_pet 資料庫存在' : '❌ happy_pet 資料庫不存在');

    } catch (error) {
        console.error('❌ 檢查失敗:', error.message);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

checkDatabase();