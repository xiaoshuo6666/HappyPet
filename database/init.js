const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initializeDatabase() {
    let connection;
    try {
        console.log('🚀 开始初始化 Happy Pet 数据库...');
        
        // 使用 createConnection 而不是 createPool
        connection = mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            multipleStatements: true, // 允许执行多条语句
            charset: 'utf8mb4'
        });

        // 使用回调方式连接
        connection.connect((err) => {
            if (err) {
                console.error('❌ MySQL 连接失败:', err.message);
                return;
            }
            console.log('✅ MySQL 连接成功！');
            executeSqlStatements();
        });

        function executeSqlStatements() {
            // 读取 SQL 文件
            const sqlPath = path.join(__dirname, 'schema.sql');
            console.log('📖 读取 SQL 文件...');
            
            const sqlFile = fs.readFileSync(sqlPath, 'utf8');
            
            // 执行整个 SQL 文件
            connection.query(sqlFile, (error, results) => {
                if (error) {
                    console.error('❌ SQL 执行错误:', error.message);
                    // 忽略一些常见的错误（如表已存在）
                    if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.code === 'ER_DUP_FIELDNAME') {
                        console.log('⚠️  表或字段已存在，继续执行...');
                    } else {
                        connection.end();
                        return;
                    }
                }
                
                console.log('✅ SQL 语句执行完成');
                
                // 插入初始数据
                insertInitialData();
            });
        }

        function insertInitialData() {
            const initialDataSQL = `
                -- 插入宠物种类
                INSERT IGNORE INTO pet_types (id, type_name, description) VALUES
                (1, '狗', '犬科動物'),
                (2, '貓', '貓科動物'),
                (3, '鳥', '鳥類寵物'),
                (4, '兔子', '兔科動物'),
                (5, '鼠類', '倉鼠、天竺鼠等'),
                (6, '其他', '其他類型寵物');

                -- 插入案件类型
                INSERT IGNORE INTO case_types (id, type_name, description) VALUES
                (1, '走失協尋', '寵物走失需要協助尋找'),
                (2, '醫療協助', '寵物需要醫療幫助'),
                (3, '臨時寄養', '需要臨時寄宿照顧'),
                (4, '美容服務', '寵物美容需求'),
                (5, '訓練協助', '寵物行為訓練'),
                (6, '其他服務', '其他類型服務');

                -- 插入常见问题
                INSERT IGNORE INTO faqs (question, answer, category, display_order) VALUES
                ('如何使用這個平台？', '請參考網站上的「使用方法」部分，按照步驟操作即可。', 'general', 1),
                ('如何註冊帳號？', '點擊網站右上角的「註冊帳號」按鈕，填寫必要資訊即可完成註冊。', 'account', 2),
                ('忘記密碼怎麼辦？', '在登入頁面點擊「忘記密碼」，按照指示重設您的密碼。', 'account', 3),
                ('如何發布寵物相關案件？', '登入後點擊「發布案件」按鈕，填寫相關資訊並上傳照片即可。', 'cases', 4);
            `;

            connection.query(initialDataSQL, (error, results) => {
                if (error) {
                    console.error('❌ 初始数据插入错误:', error.message);
                } else {
                    console.log('✅ 初始数据插入成功');
                }
                
                console.log('🎉 数据库初始化完成！');
                connection.end();
            });
        }

    } catch (error) {
        console.error('❌ 初始化失败:', error.message);
        if (connection) {
            connection.end();
        }
    }
}

// 执行初始化
initializeDatabase();