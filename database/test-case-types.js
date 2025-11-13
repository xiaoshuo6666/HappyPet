// database/test-case-types.js
const mysql = require('mysql2/promise');
require('dotenv').config();

async function testCaseTypes() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: 'happy_pet'
        });

        console.log('🔍 检查案件类型数据...');
        
        const [rows] = await connection.execute('SELECT * FROM case_types');
        console.log('✅ 案件类型数据:', rows);
        
        if (rows.length === 0) {
            console.log('❌ 没有案件类型数据，手动插入...');
            await connection.execute(`
                INSERT INTO case_types (type_name, description) VALUES
                ('走失協尋', '寵物走失需要協助尋找'),
                ('醫療協助', '寵物需要醫療幫助'),
                ('臨時寄養', '需要臨時寄宿照顧'),
                ('美容服務', '寵物美容需求'),
                ('訓練協助', '寵物行為訓練'),
                ('其他服務', '其他類型服務')
            `);
            console.log('✅ 案件类型数据已插入');
        }
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

testCaseTypes();