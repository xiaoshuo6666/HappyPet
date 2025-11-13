const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    try {
        console.log('🔗 測試資料庫連線...');
        console.log('📋 連線資訊:');
        console.log('   主機:', process.env.DB_HOST || 'localhost');
        console.log('   使用者:', process.env.DB_USER || 'root');
        
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });

        console.log('✅ MySQL 連線成功！');
        
        // 顯示 MySQL 版本
        const [rows] = await connection.execute('SELECT VERSION() as version');
        console.log('📋 MySQL 版本:', rows[0].version);
        
        await connection.end();
        
    } catch (error) {
        console.error('❌ 連線失敗:');
        console.error('錯誤訊息:', error.message);
        console.error('錯誤代碼:', error.code);
        
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('\n💡 解決方案：');
            console.log('1. 檢查 .env 檔案中的 DB_PASSWORD 是否正確');
            console.log('2. 確認 MySQL root 密碼');
        } else if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 解決方案：');
            console.log('1. 確認 MySQL 服務是否啟動');
            console.log('2. Windows: 檢查服務中的 "MySQL80" 或 "MySQL57"');
            console.log('3. 確認 .env 中的 DB_HOST 是否正確');
        }
    }
}

testConnection();