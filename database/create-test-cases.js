const mysql = require('mysql2/promise');
require('dotenv').config();

async function createTestCases() {
    let connection;
    try {
        console.log('📝 創建測試案件資料...');
        
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: 'happy_pet'
        });

        // 檢查是否有使用者
        const [users] = await connection.execute('SELECT id FROM users LIMIT 1');
        if (users.length === 0) {
            console.log('❌ 沒有使用者，請先註冊一個使用者');
            return;
        }
        const userId = users[0].id;
        console.log(`👤 使用使用者 ID: ${userId}`);

        // 檢查案件類型
        const [caseTypes] = await connection.execute('SELECT id, type_name FROM case_types');
        console.log('📋 可用案件類型:', caseTypes);

        // 創建測試案件
        console.log('🆕 創建測試案件...');
        
        const testCases = [
            {
                title: '走失黃金獵犬尋找',
                description: '溫馴的黃金獵犬在公園走失，戴著藍色項圈，名叫Lucky',
                case_type_id: caseTypes.find(ct => ct.type_name === '走失協尋')?.id || 1,
                location: '台北市大安區',
                contact_info: '0912-345-678',
                budget: 5000,
                urgency_level: 'high',
                is_urgent: true
            },
            {
                title: '流浪貓救援協助',
                description: '受傷的流浪貓需要緊急醫療幫助，左前腳受傷',
                case_type_id: caseTypes.find(ct => ct.type_name === '醫療協助')?.id || 2,
                location: '新北市板橋區',
                contact_info: 'contact@example.com',
                budget: 3000,
                urgency_level: 'emergency',
                is_urgent: true
            },
            {
                title: '寵物寄養需求',
                description: '為期兩週的寵物照護服務，需要愛心人士幫忙',
                case_type_id: caseTypes.find(ct => ct.type_name === '臨時寄養')?.id || 3,
                location: '台中市西區',
                contact_info: '04-1234567',
                budget: 4000,
                urgency_level: 'medium',
                is_urgent: false
            },
            {
                title: '狗狗美容服務',
                description: '貴賓犬需要美容修剪，包括洗澡和毛髮護理',
                case_type_id: caseTypes.find(ct => ct.type_name === '美容服務')?.id || 4,
                location: '桃園市中壢區',
                contact_info: '03-4567890',
                budget: 1500,
                urgency_level: 'low',
                is_urgent: false
            }
        ];

        for (const testCase of testCases) {
            const [result] = await connection.execute(
                `INSERT INTO cases (title, description, case_type_id, location, contact_info, budget, urgency_level, is_urgent, created_by, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
                [
                    testCase.title,
                    testCase.description,
                    testCase.case_type_id,
                    testCase.location,
                    testCase.contact_info,
                    testCase.budget,
                    testCase.urgency_level,
                    testCase.is_urgent,
                    userId
                ]
            );
            console.log(`✅ 創建案件: ${testCase.title} (ID: ${result.insertId})`);
        }

        // 顯示所有案件
        const [allCases] = await connection.execute('SELECT id, title, location FROM cases ORDER BY id');
        console.log('\n📊 所有案件列表:');
        allCases.forEach(c => console.log(`   - ID ${c.id}: ${c.title} (${c.location})`));

    } catch (error) {
        console.error('❌ 創建測試案件失敗:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

createTestCases();