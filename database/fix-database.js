const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixDatabase() {
    let connection;
    try {
        console.log('🔧 开始修复数据库...');
        
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: 'happy_pet'
        });

        console.log('✅ MySQL 连接成功！');

        // 检查并添加缺失的表和列
        await checkAndFixTables(connection);
        
        console.log('🎉 数据库修复完成！');

    } catch (error) {
        console.error('❌ 修复失败:', error.message);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

async function checkAndFixTables(connection) {
    // 检查 case_reviews 表是否存在
    try {
        const [rows] = await connection.execute(`
            SELECT COUNT(*) as count FROM information_schema.tables 
            WHERE table_schema = 'happy_pet' AND table_name = 'case_reviews'
        `);
        
        if (rows[0].count === 0) {
            console.log('📋 创建 case_reviews 表...');
            await connection.execute(`
                CREATE TABLE case_reviews (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    case_id INT NOT NULL,
                    user_id INT NOT NULL,
                    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
                    comment TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    UNIQUE KEY unique_case_user (case_id, user_id)
                )
            `);
        }
    } catch (error) {
        console.log('case_reviews 表已存在');
    }

    // 检查 case_detail_photos 表是否存在
    try {
        const [rows] = await connection.execute(`
            SELECT COUNT(*) as count FROM information_schema.tables 
            WHERE table_schema = 'happy_pet' AND table_name = 'case_detail_photos'
        `);
        
        if (rows[0].count === 0) {
            console.log('📋 创建 case_detail_photos 表...');
            await connection.execute(`
                CREATE TABLE case_detail_photos (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    case_id INT NOT NULL,
                    photo_url VARCHAR(255) NOT NULL,
                    display_order INT DEFAULT 0,
                    description TEXT,
                    uploaded_by INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
                    FOREIGN KEY (uploaded_by) REFERENCES users(id)
                )
            `);
        }
    } catch (error) {
        console.log('case_detail_photos 表已存在');
    }

    // 确保案件类型数据存在
    console.log('📝 检查案件类型数据...');
    await connection.execute(`
        INSERT IGNORE INTO case_types (id, type_name, description) VALUES
        (1, '走失協尋', '寵物走失需要協助尋找'),
        (2, '醫療協助', '寵物需要醫療幫助'),
        (3, '臨時寄養', '需要臨時寄宿照顧'),
        (4, '美容服務', '寵物美容需求'),
        (5, '訓練協助', '寵物行為訓練'),
        (6, '其他服務', '其他類型服務')
    `);

    console.log('✅ 所有表和检查完成');
}

// 执行修复
fixDatabase();