const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initializeDatabase() {
    let connection;
    try {
        console.log('🚀 开始初始化 Happy Pet 数据库...');
        
        // 连接到 MySQL（先不指定数据库）
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            multipleStatements: true,
            charset: 'utf8mb4'
        });

        console.log('✅ MySQL 连接成功！');

        // 创建数据库（如果不存在）
        await connection.execute('CREATE DATABASE IF NOT EXISTS happy_pet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        await connection.execute('USE happy_pet');

        console.log('✅ 数据库 happy_pet 已就绪');

        // 读取 SQL 文件
        const sqlPath = path.join(__dirname, 'schema.sql');
        console.log('📖 读取 SQL 文件...');
        
        const sqlFile = fs.readFileSync(sqlPath, 'utf8');
        
        // 分割 SQL 语句，逐条执行
        const sqlStatements = sqlFile.split(';').filter(stmt => stmt.trim());
        
        for (let i = 0; i < sqlStatements.length; i++) {
            const stmt = sqlStatements[i].trim();
            if (stmt) {
                try {
                    await connection.execute(stmt + ';');
                    console.log(`✅ 执行 SQL 语句 ${i + 1}/${sqlStatements.length}`);
                } catch (error) {
                    // 忽略重复列的错误
                    if (error.code === 'ER_DUP_FIELDNAME') {
                        console.log(`⚠️  跳过重复列: ${error.message.split("'")[1]}`);
                    } else {
                        console.log(`⚠️  SQL 语句 ${i + 1} 执行警告: ${error.message}`);
                    }
                }
            }
        }
        
        console.log('🎉 数据库初始化完成！');
        console.log('📊 happy_pet 数据库已就绪');

    } catch (error) {
        console.error('❌ 初始化失败:');
        console.error('错误:', error.message);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// 执行初始化
initializeDatabase();