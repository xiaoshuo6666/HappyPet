const mysql = require('mysql2/promise');
require('dotenv').config();

async function cleanupCaseTypesSafe() {
    let connection;
    try {
        console.log('🧹 开始安全清理重复的案件类型数据...');
        
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: 'happy_pet'
        });

        // 1. 首先检查是否有案件使用了这些类型
        console.log('🔍 检查案件数据...');
        const [cases] = await connection.execute('SELECT COUNT(*) as count FROM cases');
        console.log('当前有', cases[0].count, '个案件');

        if (cases[0].count > 0) {
            console.log('⚠️  有案件数据存在，需要更新案件的外键引用');
            
            // 获取当前有效的案件类型映射
            const [currentTypes] = await connection.execute('SELECT * FROM case_types ORDER BY id');
            
            // 创建类型名称到最小ID的映射
            const typeNameToMinId = {};
            currentTypes.forEach(type => {
                if (!typeNameToMinId[type.type_name]) {
                    typeNameToMinId[type.type_name] = type.id;
                }
            });
            
            console.log('📋 类型映射:', typeNameToMinId);
            
            // 更新案件的外键引用到最小的ID
            for (const [typeName, minId] of Object.entries(typeNameToMinId)) {
                const [result] = await connection.execute(
                    'UPDATE cases SET case_type_id = ? WHERE case_type_id IN (SELECT id FROM case_types WHERE type_name = ? AND id > ?)',
                    [minId, typeName, minId]
                );
                if (result.affectedRows > 0) {
                    console.log(`✅ 更新了 ${result.affectedRows} 个案件的 ${typeName} 类型引用`);
                }
            }
        }

        // 2. 现在可以安全删除重复的案件类型
        console.log('🗑️ 删除重复的案件类型数据...');
        
        // 先禁用外键检查
        await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
        
        // 删除重复的记录，只保留每个类型名称的最小ID
        const [deleteResult] = await connection.execute(`
            DELETE t1 FROM case_types t1
            INNER JOIN case_types t2 
            WHERE t1.id > t2.id AND t1.type_name = t2.type_name
        `);
        
        console.log(`✅ 删除了 ${deleteResult.affectedRows} 条重复记录`);
        
        // 重新启用外键检查
        await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

        // 3. 验证结果
        const [cleanedData] = await connection.execute('SELECT * FROM case_types ORDER BY id');
        console.log('✅ 清理完成！现在有', cleanedData.length, '条案件类型记录：');
        cleanedData.forEach(type => {
            console.log(`   - ${type.id}: ${type.type_name} (${type.description})`);
        });

    } catch (error) {
        console.error('❌ 清理失败:', error.message);
        // 确保重新启用外键检查
        if (connection) {
            await connection.execute('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
        }
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

cleanupCaseTypesSafe();