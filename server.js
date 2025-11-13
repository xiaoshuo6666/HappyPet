const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中介軟體
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// 資料庫連接配置
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'happy_pet'
};

// 創建資料庫連接池
const pool = mysql.createPool(dbConfig);

// JWT密鑰
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

// 檔案上傳配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024
    }
});

// 認證中介軟體 - 修復版本
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    console.log('🔐 認證檢查:', {
        hasAuthHeader: !!authHeader,
        tokenExists: !!token,
        method: req.method,
        path: req.path
    });

    if (!token) {
        console.log('❌ 存取權杖不存在');
        return res.status(401).json({ error: '存取權杖不存在' });
    }

    try {
        const user = jwt.verify(token, JWT_SECRET);
        console.log('✅ JWT驗證成功，用戶ID:', user.id);
        
        const [users] = await pool.execute(
            'SELECT id, username, email, user_type FROM users WHERE id = ?', 
            [user.id]
        );
        
        if (users.length === 0) {
            console.log('❌ 使用者不存在，ID:', user.id);
            return res.status(401).json({ error: '使用者不存在' });
        }
        
        req.user = users[0];
        console.log('✅ 用戶信息載入成功:', req.user.username);
        next();
    } catch (error) {
        console.error('❌ JWT驗證失敗:', error.message);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: '權杖已過期' });
        } else if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: '無效的權杖' });
        } else {
            return res.status(500).json({ error: '伺服器錯誤' });
        }
    }
};



// 測試資料庫連接
app.get('/api/test-db', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        connection.release();
        res.json({ message: '資料庫連接成功！' });
    } catch (error) {
        res.status(500).json({ error: '資料庫連接失敗: ' + error.message });
    }
});

// 使用者註冊
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, full_name, phone, location } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: '使用者名稱、電子信箱和密碼為必填欄位' });
        }

        const [existingUsers] = await pool.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ error: '使用者名稱或電子信箱已存在' });
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password_hash, full_name, phone, location) VALUES (?, ?, ?, ?, ?, ?)',
            [username, email, passwordHash, full_name, phone, location]
        );

        res.status(201).json({
            message: '註冊成功',
            userId: result.insertId
        });
    } catch (error) {
        console.error('註冊錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

// 使用者登入
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: '使用者名稱和密碼為必填欄位' });
        }

        const [users] = await pool.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: '使用者名稱或密碼錯誤' });
        }

        const user = users[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: '使用者名稱或密碼錯誤' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: '登入成功',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                user_type: user.user_type,
                full_name: user.full_name,
                location: user.location
            }
        });
    } catch (error) {
        console.error('登入錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

// 獲取案件列表
app.get('/api/cases', async (req, res) => {
    try {
        const [cases] = await pool.execute(`
            SELECT c.*, ct.type_name, u.username as created_by_name
            FROM cases c
            LEFT JOIN case_types ct ON c.case_type_id = ct.id
            LEFT JOIN users u ON c.created_by = u.id
            WHERE c.status = 'open'
            ORDER BY c.created_at DESC
        `);

        res.json(cases);
    } catch (error) {
        console.error('獲取案件錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

// 創建新案件
app.post('/api/cases', authenticateToken, upload.array('photos', 10), async (req, res) => {
    try {
        const { title, description, case_type_id, location, contact_info } = req.body; // 新增 contact_info
        const created_by = req.user.id;

        if (!title || !description || !case_type_id || !location || !contact_info) { // 新增 contact_info 验证
            return res.status(400).json({ error: '標題、描述、案件類型、地點和聯絡電話為必填欄位' });
        }

        const [result] = await pool.execute(
            'INSERT INTO cases (title, description, case_type_id, location, contact_info, created_by, status) VALUES (?, ?, ?, ?, ?, ?, ?)', // 新增 contact_info
            [title, description, case_type_id, location, contact_info, created_by, 'open'] // 新增 contact_info
        );

        if (req.files && req.files.length > 0) {
            const photoPromises = req.files.map(file => {
                return pool.execute(
                    'INSERT INTO case_photos (case_id, photo_url, uploaded_by) VALUES (?, ?, ?)',
                    [result.insertId, file.filename, created_by]
                );
            });
            await Promise.all(photoPromises);
        }

        res.status(201).json({
            message: '案件創建成功',
            caseId: result.insertId
        });
    } catch (error) {
        console.error('創建案件錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

// 獲取常見問題
app.get('/api/faqs', async (req, res) => {
    try {
        const [faqs] = await pool.execute(`
            SELECT * FROM faqs 
            WHERE is_active = TRUE 
            ORDER BY display_order ASC, created_at DESC
        `);

        res.json(faqs);
    } catch (error) {
        console.error('獲取FAQ錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

// 獲取寵物種類
app.get('/api/pet-types', async (req, res) => {
    try {
        const [petTypes] = await pool.execute('SELECT * FROM pet_types ORDER BY type_name');
        res.json(petTypes);
    } catch (error) {
        console.error('獲取寵物種類錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

// 獲取案件類型
app.get('/api/case-types', async (req, res) => {
    try {
        const [caseTypes] = await pool.execute('SELECT * FROM case_types ORDER BY type_name');
        res.json(caseTypes);
    } catch (error) {
        console.error('獲取案件類型錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

// ==========================================
// 管理員 API (無權限驗證) - 使用 pool.execute
// ==========================================

// 獲取所有使用者
app.get('/api/admin/users', async (req, res) => {
    try {
        console.log('📢 管理員用戶API被呼叫');
        
        const [users] = await pool.execute(
            'SELECT id, username, email, user_type, full_name, phone, location, created_at FROM users ORDER BY created_at DESC'
        );
        
        console.log(`✅ 返回 ${users.length} 個用戶`);
        res.json(users);
        
    } catch (error) {
        console.error('❌ 獲取用戶列表失敗:', error);
        res.status(500).json({ 
            error: '獲取用戶列表失敗',
            details: error.message
        });
    }
});

// 獲取所有案件
app.get('/api/admin/cases', async (req, res) => {
    try {
        console.log('📢 管理員案件API被呼叫');
        
        const [cases] = await pool.execute(`
            SELECT c.*, 
                   u.username as created_by_username,
                   ct.type_name as case_type_name
            FROM cases c 
            LEFT JOIN users u ON c.created_by = u.id 
            LEFT JOIN case_types ct ON c.case_type_id = ct.id
            ORDER BY c.created_at DESC
        `);
        
        console.log(`✅ 返回 ${cases.length} 個案件`);
        res.json(cases);
        
    } catch (error) {
        console.error('❌ 獲取案件列表失敗:', error);
        res.status(500).json({ 
            error: '獲取案件列表失敗',
            details: error.message
        });
    }
});

// 獲取統計數據
app.get('/api/admin/stats', async (req, res) => {
    try {
        console.log('📢 管理員統計API被呼叫');
        
        const [users] = await pool.execute('SELECT COUNT(*) as count FROM users');
        const [cases] = await pool.execute('SELECT COUNT(*) as count FROM cases');
        const [active] = await pool.execute('SELECT COUNT(*) as count FROM cases WHERE status = "open"');
        const [completed] = await pool.execute('SELECT COUNT(*) as count FROM cases WHERE status = "completed"');
        
        const stats = {
            totalUsers: users[0].count,
            totalCases: cases[0].count,
            activeCases: active[0].count,
            completedCases: completed[0].count
        };
        
        console.log('✅ 統計數據:', stats);
        res.json(stats);
        
    } catch (error) {
        console.error('❌ 獲取統計數據失敗:', error);
        res.status(500).json({ 
            error: '獲取統計數據失敗',
            details: error.message
        });
    }
});

// 管理員刪除案件
// 管理員刪除案件 - 修复版本
app.delete('/api/admin/cases/:id', async (req, res) => {
    try {
        const caseId = req.params.id;
        console.log(`🗑️ 刪除案件: ${caseId}`);
        
        // 开始事务
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            // 1. 先删除案件相关的照片记录
            console.log(`📸 删除案件 ${caseId} 的相关照片...`);
            await connection.execute('DELETE FROM case_photos WHERE case_id = ?', [caseId]);
            
            // 2. 如果有评价表，也删除相关评价
            try {
                await connection.execute('DELETE FROM case_reviews WHERE case_id = ?', [caseId]);
                console.log(`⭐ 删除案件 ${caseId} 的相关评价...`);
            } catch (error) {
                console.log('⚠️ 案件评价表可能不存在，跳过删除评价');
            }
            
            // 3. 最后删除案件本身
            console.log(`🗂️ 删除案件 ${caseId} ...`);
            await connection.execute('DELETE FROM cases WHERE id = ?', [caseId]);
            
            // 提交事务
            await connection.commit();
            console.log(`✅ 案件 ${caseId} 删除成功`);
            
            res.json({ 
                message: '案件删除成功', 
                deletedId: caseId 
            });
            
        } catch (error) {
            // 回滚事务
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        
    } catch (error) {
        console.error('❌ 刪除案件失敗:', error);
        res.status(500).json({ 
            error: '刪除案件失敗',
            details: error.message,
            code: error.code
        });
    }
});

// 管理員刪除用戶
app.delete('/api/admin/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        console.log(`🗑️ 刪除用戶: ${userId}`);
        
        await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
        
        res.json({ message: '用戶刪除成功', deletedId: userId });
        
    } catch (error) {
        console.error('❌ 刪除用戶失敗:', error);
        res.status(500).json({ 
            error: '刪除用戶失敗',
            details: error.message
        });
    }
});

// 測試API
app.get('/api/admin/test', (req, res) => {
    res.json({ 
        message: '✅ 管理員API測試成功！',
        timestamp: new Date().toISOString(),
        status: '運行正常'
    });
});

// 根路徑
app.get('/', (req, res) => {
    res.json({ 
        message: 'Happy Pet 後端伺服器運行中！',
        version: '1.0.0',
        endpoints: {
            test: '/api/test-db',
            auth: ['/api/register', '/api/login'],
            cases: '/api/cases',
            faqs: '/api/faqs',
            types: ['/api/pet-types', '/api/case-types'],
            admin: ['/api/admin/users', '/api/admin/cases', '/api/admin/stats']
        }
    });
});

// 啟動伺服器
app.listen(PORT, () => {
    console.log(`🎉 Happy Pet 伺服器運行在 http://localhost:${PORT}`);
});

// ==========================================
// 管理員編輯功能 API
// ==========================================

// 更新用戶資訊
app.put('/api/admin/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const { username, email, user_type, full_name, phone, location } = req.body;
        
        console.log(`✏️ 更新用戶: ${userId}`, req.body);
        
        await pool.execute(
            'UPDATE users SET username = ?, email = ?, user_type = ?, full_name = ?, phone = ?, location = ? WHERE id = ?',
            [username, email, user_type, full_name, phone, location, userId]
        );
        
        res.json({ message: '用戶更新成功' });
        
    } catch (error) {
        console.error('❌ 更新用戶失敗:', error);
        res.status(500).json({ 
            error: '更新用戶失敗',
            details: error.message
        });
    }
});

// 更新案件資訊 - 移除电话验证
app.put('/api/admin/cases/:id', async (req, res) => {
    try {
        const caseId = req.params.id;
        const { 
            title, description, case_type_id, location,
            status, urgency_level, budget, start_date, end_date 
        } = req.body;
        
        console.log(`✏️ 更新案件: ${caseId}`, req.body);
        
        // 验证必填字段 - 移除电话验证
        if (!title || !description || !case_type_id || !location || !status) {
            return res.status(400).json({ 
                error: '標題、描述、案件類型、地點和狀態為必填欄位' 
            });
        }
        
        // 清理参数，将 undefined 转换为 null
        const cleanParams = {
            title: title || null,
            description: description || null,
            case_type_id: case_type_id || null,
            location: location || null,
            status: status || null,
            urgency_level: urgency_level || 'medium',
            budget: budget !== undefined && budget !== '' ? parseFloat(budget) : null,
            start_date: start_date || null,
            end_date: end_date || null
        };
        
        console.log('🧹 清理后的参数:', cleanParams);
        
        await pool.execute(
            `UPDATE cases SET 
                title = ?, description = ?, case_type_id = ?, location = ?,
                status = ?, urgency_level = ?, budget = ?, start_date = ?, end_date = ?
             WHERE id = ?`,
            [
                cleanParams.title,
                cleanParams.description,
                cleanParams.case_type_id,
                cleanParams.location,
                cleanParams.status,
                cleanParams.urgency_level,
                cleanParams.budget,
                cleanParams.start_date,
                cleanParams.end_date,
                caseId
            ]
        );
        
        res.json({ message: '案件更新成功' });
        
    } catch (error) {
        console.error('❌ 更新案件失敗:', error);
        res.status(500).json({ 
            error: '更新案件失敗',
            details: error.message,
            code: error.code
        });
    }
});

// 獲取單個用戶詳情
app.get('/api/admin/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE id = ?',
            [userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: '用戶不存在' });
        }
        
        res.json(users[0]);
        
    } catch (error) {
        console.error('❌ 獲取用戶詳情失敗:', error);
        res.status(500).json({ 
            error: '獲取用戶詳情失敗',
            details: error.message
        });
    }
});

// 獲取單個案件詳情
app.get('/api/admin/cases/:id', async (req, res) => {
    try {
        const caseId = req.params.id;
        
        const [cases] = await pool.execute(`
            SELECT c.*, 
                   u.username as created_by_username,
                   ct.type_name as case_type_name
            FROM cases c 
            LEFT JOIN users u ON c.created_by = u.id 
            LEFT JOIN case_types ct ON c.case_type_id = ct.id
            WHERE c.id = ?
        `, [caseId]);
        
        if (cases.length === 0) {
            return res.status(404).json({ error: '案件不存在' });
        }
        
        res.json(cases[0]);
        
    } catch (error) {
        console.error('❌ 獲取案件詳情失敗:', error);
        res.status(500).json({ 
            error: '獲取案件詳情失敗',
            details: error.message
        });
    }
});

app.post('/api/admin/faqs', async (req, res) => {
    try {
        const { question, answer, category, display_order, is_active } = req.body;
        
        const [result] = await pool.execute(
            'INSERT INTO faqs (question, answer, category, display_order, is_active) VALUES (?, ?, ?, ?, ?)',
            [question, answer, category, display_order || 0, is_active || true]
        );
        
        res.status(201).json({
            message: 'FAQ 創建成功',
            faqId: result.insertId
        });
    } catch (error) {
        console.error('創建 FAQ 錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

// 管理 FAQ (更新)
app.put('/api/admin/faqs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { question, answer, category, display_order, is_active } = req.body;
        
        await pool.execute(
            'UPDATE faqs SET question = ?, answer = ?, category = ?, display_order = ?, is_active = ? WHERE id = ?',
            [question, answer, category, display_order, is_active, id]
        );
        
        res.json({ message: 'FAQ 更新成功' });
    } catch (error) {
        console.error('更新 FAQ 錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

// 管理 FAQ (刪除)
app.delete('/api/admin/faqs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute('DELETE FROM faqs WHERE id = ?', [id]);
        
        res.json({ message: 'FAQ 刪除成功' });
    } catch (error) {
        console.error('刪除 FAQ 錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

// 獲取更多案件（分頁）
app.get('/api/cases/more', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const offset = (page - 1) * limit;
        
        console.log(`📋 請求更多案件 - 頁數: ${page}, 每頁: ${limit}`);
        
        const [cases] = await pool.execute(`
            SELECT c.*, 
                   ct.type_name,
                   u.username as created_by_name,
                   (SELECT photo_url FROM case_photos WHERE case_id = c.id LIMIT 1) as main_photo
            FROM cases c
            LEFT JOIN case_types ct ON c.case_type_id = ct.id
            LEFT JOIN users u ON c.created_by = u.id
            WHERE c.status = 'open'
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
        
        console.log(`✅ 返回 ${cases.length} 個案件`);
        res.json(cases);
        
    } catch (error) {
        console.error('❌ 獲取更多案件錯誤:', error);
        res.status(500).json({ 
            error: '獲取更多案件失敗',
            details: error.message
        });
    }
});

// 获取案件详情 - 修复版本
// 获取案件详情 - 修复版本，确保返回 assigned_to
app.get('/api/cases/:id/detail', async (req, res) => {
    try {
        const caseId = req.params.id;
        console.log(`📋 請求案件詳情: ${caseId}`);
        
        // 获取案件基本信息 - 确保包含 assigned_to
        const [cases] = await pool.execute(`
            SELECT c.*, 
                   ct.type_name,
                   u.username as created_by_username,
                   u.email as contact_email,
                   u.phone as contact_phone,
                   c.assigned_to  -- 确保返回这个字段！
            FROM cases c 
            LEFT JOIN case_types ct ON c.case_type_id = ct.id
            LEFT JOIN users u ON c.created_by = u.id
            WHERE c.id = ?
        `, [caseId]);
        
        if (cases.length === 0) {
            console.log(`❌ 案件不存在: ${caseId}`);
            return res.status(404).json({ error: '案件不存在' });
        }
        
        const caseDetail = cases[0];
        
        console.log('📄 案件详情包含 assigned_to:', {
            id: caseDetail.id,
            title: caseDetail.title,
            assigned_to: caseDetail.assigned_to,  // 这里应该显示保姆ID
            status: caseDetail.status
        });
        
        // 获取案件照片
        const [photos] = await pool.execute(`
            SELECT * FROM case_photos 
            WHERE case_id = ? 
            ORDER BY created_at ASC
        `, [caseId]);
        
        console.log(`🔍 查询到的案件照片:`, photos);
        
        // 获取案件评价
        let reviews = [];
        try {
            const [reviewsResult] = await pool.execute(`
                SELECT r.*, u.username 
                FROM case_reviews r
                LEFT JOIN users u ON r.user_id = u.id
                WHERE r.case_id = ?
                ORDER BY r.created_at DESC
            `, [caseId]);
            reviews = reviewsResult;
        } catch (error) {
            console.log('⚠️ 案件评价表可能不存在，跳过评价查询');
        }
        
        // 更新浏览次数
        await pool.execute(
            'UPDATE cases SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?',
            [caseId]
        );
        
        const result = {
            ...caseDetail,
            photos: photos,
            reviews: reviews,
            contact_info: caseDetail.contact_phone || caseDetail.contact_email || '未提供',
            is_urgent: caseDetail.urgency_level === 'high' || caseDetail.urgency_level === 'emergency'
        };
        
        console.log(`✅ 返回案件詳情，包含 assigned_to: ${caseDetail.assigned_to}`);
        res.json(result);
        
    } catch (error) {
        console.error('獲取案件詳情錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤: ' + error.message });
    }
});

// 获取案件评价
app.get('/api/cases/:id/reviews', async (req, res) => {
    try {
        const caseId = req.params.id;
        
        const [reviews] = await pool.execute(`
            SELECT r.*, u.username 
            FROM case_reviews r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE r.case_id = ?
            ORDER BY r.created_at DESC
        `, [caseId]);
        
        res.json(reviews);
    } catch (error) {
        console.error('獲取案件評價錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

// 提交案件评价
app.post('/api/cases/:id/reviews', authenticateToken, async (req, res) => {
    try {
        const caseId = req.params.id;
        const { rating, comment } = req.body;
        const userId = req.user.id;
        
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: '評分必須在1-5之間' });
        }
        
        // 检查用户是否已经评价过
        const [existingReviews] = await pool.execute(
            'SELECT id FROM case_reviews WHERE case_id = ? AND user_id = ?',
            [caseId, userId]
        );
        
        if (existingReviews.length > 0) {
            return res.status(400).json({ error: '您已經評價過此案件' });
        }
        
        // 插入评价
        await pool.execute(
            'INSERT INTO case_reviews (case_id, user_id, rating, comment) VALUES (?, ?, ?, ?)',
            [caseId, userId, rating, comment]
        );
        
        res.json({ message: '評價提交成功' });
        
    } catch (error) {
        console.error('提交評價錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});
// ==========================================
// 照片文件调试端点
// ==========================================

// 调试照片文件访问
app.get('/api/debug/uploads', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        const uploadsDir = path.join(__dirname, 'uploads');
        console.log('📁 检查上传目录:', uploadsDir);
        
        // 检查目录是否存在
        if (!fs.existsSync(uploadsDir)) {
            console.log('❌ uploads目录不存在，创建目录...');
            fs.mkdirSync(uploadsDir, { recursive: true });
            return res.json({ 
                message: 'uploads目录已创建',
                path: uploadsDir,
                created: true
            });
        }
        
        // 获取文件列表
        const files = fs.readdirSync(uploadsDir);
        console.log(`📄 找到 ${files.length} 个文件`);
        
        // 获取文件详细信息
        const fileDetails = files.map(filename => {
            const filePath = path.join(uploadsDir, filename);
            const stats = fs.statSync(filePath);
            return {
                filename: filename,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                path: filePath,
                exists: true
            };
        });
        
        res.json({
            uploadsDirectory: uploadsDir,
            fileCount: files.length,
            files: fileDetails,
            directoryExists: true
        });
        
    } catch (error) {
        console.error('❌ 检查上传目录错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 测试单个文件访问
app.get('/api/debug/photo/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);
    
    console.log(`🔍 测试文件访问: ${filename}`);
    console.log(`📁 文件路径: ${filePath}`);
    
    const fs = require('fs');
    if (fs.existsSync(filePath)) {
        console.log('✅ 文件存在，准备发送');
        res.sendFile(filePath);
    } else {
        console.log('❌ 文件不存在');
        res.status(404).json({ 
            error: '文件不存在',
            filename: filename,
            path: filePath,
            currentDir: __dirname
        });
    }
});

// 测试静态文件服务
app.get('/api/debug/static-test', (req, res) => {
    res.json({
        message: '静态文件服务测试',
        staticPaths: {
            '/uploads': 'uploads目录',
            '/api/uploads': 'api上传目录'
        },
        testUrls: [
            `http://localhost:${PORT}/uploads/1761765617625-357598449-101.png`,
            `http://localhost:${PORT}/api/debug/photo/1761765617625-357598449-101.png`
        ]
    });
});

// 确保上传目录存在
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    console.log('📁 创建uploads目录...');
    fs.mkdirSync(uploadsDir, { recursive: true });
}

console.log(`📁 上传目录: ${uploadsDir}`);
console.log(`🔧 静态文件服务配置: /uploads -> ${uploadsDir}`);

// 中介軟體
app.use(cors());
app.use(express.json());

// 静态文件服务配置 - 添加 /api/uploads 路径
app.use('/uploads', express.static('uploads'));
app.use('/api/uploads', express.static('uploads'));  // 添加这一行

console.log('📁 静态文件服务配置:');
console.log('   /uploads -> uploads目录');
console.log('   /api/uploads -> uploads目录');

// ==========================================
// 接案保姆相关 API
// ==========================================

// 获取案件的接案保姆信息
app.get('/api/cases/:id/caretaker', async (req, res) => {
    try {
        const caseId = req.params.id;
        console.log(`👤 获取案件 ${caseId} 的接案保姆信息`);
        
        // 查询案件的接案保姆信息
        const [caretakers] = await pool.execute(`
            SELECT 
                u.id,
                u.username,
                u.full_name,
                u.email,
                u.phone,
                u.location,
                u.avatar_url,
                AVG(cr.rating) as avg_rating,
                COUNT(cr.id) as review_count,
                u.created_at as member_since
            FROM cases c
            LEFT JOIN users u ON c.assigned_to = u.id
            LEFT JOIN case_reviews cr ON cr.user_id = u.id
            WHERE c.id = ? AND c.assigned_to IS NOT NULL
            GROUP BY u.id
        `, [caseId]);
        
        if (caretakers.length === 0) {
            console.log(`❌ 案件 ${caseId} 没有接案保姆`);
            return res.status(404).json({ error: '此案件尚未有保姆接案' });
        }
        
        const caretaker = caretakers[0];
        
        // 获取保姆的接案历史
        const [caseHistory] = await pool.execute(`
            SELECT COUNT(*) as completed_cases
            FROM cases 
            WHERE assigned_to = ? AND status = 'completed'
        `, [caretaker.id]);
        
        // 确保所有数字字段都是正确的类型
        const result = {
            id: caretaker.id,
            name: caretaker.full_name || caretaker.username,
            username: caretaker.username,
            email: caretaker.email,
            phone: caretaker.phone,
            location: caretaker.location,
            avatar: caretaker.avatar_url,
            rating: caretaker.avg_rating ? parseFloat(caretaker.avg_rating) : 0, // 确保是数字
            review_count: parseInt(caretaker.review_count) || 0, // 确保是整数
            completed_cases: parseInt(caseHistory[0].completed_cases) || 0, // 确保是整数
            member_since: new Date(caretaker.member_since).getFullYear(),
            bio: '專業寵物保姆，擁有豐富的寵物照顧經驗。'
        };
        
        console.log(`✅ 返回接案保姆信息: ${result.name}`, {
            rating: result.rating,
            review_count: result.review_count,
            completed_cases: result.completed_cases
        });
        
        res.json(result);
        
    } catch (error) {
        console.error('❌ 獲取接案保姆信息錯誤:', error);
        res.status(500).json({ 
            error: '獲取接案保姆信息失敗',
            details: error.message
        });
    }
});

// 应聘接案 API - 返回当前用户信息
app.post('/api/cases/:id/apply', authenticateToken, async (req, res) => {
    try {
        const caseId = req.params.id;
        const userId = req.user.id;
        
        console.log(`📝 用户 ${userId} 应聘案件 ${caseId}`);
        
        // 检查案件是否存在且状态为开放
        const [cases] = await pool.execute(
            'SELECT * FROM cases WHERE id = ? AND status = "open"',
            [caseId]
        );
        
        if (cases.length === 0) {
            return res.status(404).json({ error: '案件不存在或已被接案' });
        }
        
        const caseItem = cases[0];
        
        // 检查用户是否是案件创建者
        if (caseItem.created_by === userId) {
            return res.status(400).json({ error: '不能应聘自己发布的案件' });
        }
        
        // 检查用户是否已经应聘过
        const [existingApplications] = await pool.execute(
            'SELECT id FROM case_applications WHERE case_id = ? AND user_id = ?',
            [caseId, userId]
        );
        
        if (existingApplications.length > 0) {
            return res.status(400).json({ error: '您已经应聘过此案件' });
        }
        
        // 开始事务
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            // 1. 创建应聘记录
            await connection.execute(
                'INSERT INTO case_applications (case_id, user_id, status) VALUES (?, ?, "pending")',
                [caseId, userId]
            );
            
            // 2. 更新案件状态和接案保姆
            await connection.execute(
                'UPDATE cases SET status = "in_progress", assigned_to = ? WHERE id = ?',
                [userId, caseId]
            );
            
            // 提交事务
            await connection.commit();
            console.log(`✅ 用户 ${userId} 成功应聘案件 ${caseId}`);
            
            // 获取当前用户的完整信息
            const [userInfo] = await pool.execute(
                'SELECT id, username, email, full_name, phone, location, created_at FROM users WHERE id = ?',
                [userId]
            );
            
            const user = userInfo[0];
            
            res.json({ 
                message: '应聘成功！案件发布者将会与您联系。',
                case_id: caseId,
                assigned_to: userId,
                caretaker_info: {
                    id: user.id,
                    name: user.full_name || user.username,
                    username: user.username,
                    email: user.email,
                    phone: user.phone,
                    location: user.location,
                    member_since: new Date(user.created_at).getFullYear()
                }
            });
            
        } catch (error) {
            // 回滚事务
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        
    } catch (error) {
        console.error('❌ 应聘案件错误:', error);
        res.status(500).json({ 
            error: '应聘失败',
            details: error.message
        });
    }
});

// 创建案件应聘表（如果不存在）
const createCaseApplicationsTable = async () => {
    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS case_applications (
                id INT PRIMARY KEY AUTO_INCREMENT,
                case_id INT NOT NULL,
                user_id INT NOT NULL,
                status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_case_user (case_id, user_id)
            )
        `);
        console.log('✅ 案件应聘表创建/检查完成');
    } catch (error) {
        console.error('❌ 创建案件应聘表错误:', error);
    }
};

// 在服务器启动时创建表
createCaseApplicationsTable();

// 获取单个FAQ详情 - 新增这个API
app.get('/api/admin/faqs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [faqs] = await pool.execute(
            'SELECT * FROM faqs WHERE id = ?',
            [id]
        );
        
        if (faqs.length === 0) {
            return res.status(404).json({ error: 'FAQ不存在' });
        }
        
        res.json(faqs[0]);
    } catch (error) {
        console.error('獲取FAQ詳情錯誤:', error);
        res.status(500).json({ error: '伺服器內部錯誤' });
    }
});

const http = require('http');
const socketIo = require('socket.io');

// 创建HTTP服务器
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// 在线用户映射
const onlineUsers = new Map();

// Socket.io 连接处理
io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  // 用户登录
  socket.on('user_online', async (userId) => {
    onlineUsers.set(userId, socket.id);
    socket.userId = userId;
    
    try {
      await pool.execute(
        'INSERT INTO user_online_status (user_id, is_online, socket_id) VALUES (?, TRUE, ?) ON DUPLICATE KEY UPDATE is_online = TRUE, socket_id = ?',
        [userId, socket.id, socket.id]
      );
      
      // 通知相关用户该用户上线
      socket.broadcast.emit('user_status_changed', { userId, isOnline: true });
    } catch (error) {
      console.error('更新在线状态错误:', error);
    }
  });

  // 加入聊天会话
  socket.on('join_session', (sessionId) => {
    socket.join(`session_${sessionId}`);
    console.log(`用户 ${socket.userId} 加入会话 ${sessionId}`);
  });

  // 发送消息
  socket.on('send_message', async (data) => {
    try {
      const { sessionId, message, messageType = 'text', fileInfo = null } = data;
      
      // 保存消息到数据库
      const [result] = await pool.execute(
        'INSERT INTO chat_messages (session_id, sender_id, message_type, message_text, file_url, file_name, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sessionId, socket.userId, messageType, message, fileInfo?.url, fileInfo?.name, fileInfo?.size]
      );

      // 获取完整的消息信息
      const [messages] = await pool.execute(`
        SELECT cm.*, u.username, u.full_name 
        FROM chat_messages cm 
        LEFT JOIN users u ON cm.sender_id = u.id 
        WHERE cm.id = ?
      `, [result.insertId]);

      const messageData = messages[0];

      // 更新会话最后活动时间
      await pool.execute(
        'UPDATE chat_sessions SET last_message_at = NOW() WHERE id = ?',
        [sessionId]
      );

      // 发送消息给会话中的所有用户
      io.to(`session_${sessionId}`).emit('new_message', messageData);

      // 发送通知给不在线的用户
      const [session] = await pool.execute(
        'SELECT participant1_id, participant2_id FROM chat_sessions WHERE id = ?',
        [sessionId]
      );

      if (session.length > 0) {
        const { participant1_id, participant2_id } = session[0];
        const otherUserId = socket.userId === participant1_id ? participant2_id : participant1_id;
        
        if (!onlineUsers.has(otherUserId)) {
          // 可以在这里集成推送通知
          console.log(`用户 ${otherUserId} 有新消息，但不在线`);
        }
      }

    } catch (error) {
      console.error('发送消息错误:', error);
      socket.emit('message_error', { error: '发送消息失败' });
    }
  });

  // 标记消息为已读
  socket.on('mark_messages_read', async (data) => {
    try {
      const { sessionId } = data;
      
      await pool.execute(
        'UPDATE chat_messages SET is_read = TRUE, read_at = NOW() WHERE session_id = ? AND sender_id != ? AND is_read = FALSE',
        [sessionId, socket.userId]
      );

      // 更新参与者最后阅读时间
      await pool.execute(
        'INSERT INTO chat_participants (session_id, user_id, last_read_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE last_read_at = NOW()',
        [sessionId, socket.userId]
      );

      // 通知对方消息已读
      socket.to(`session_${sessionId}`).emit('messages_read', {
        sessionId,
        userId: socket.userId
      });

    } catch (error) {
      console.error('标记消息已读错误:', error);
    }
  });

  // 断开连接
  socket.on('disconnect', async () => {
    console.log('用户断开连接:', socket.id);
    
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      
      try {
        await pool.execute(
          'UPDATE user_online_status SET is_online = FALSE, last_seen = NOW() WHERE user_id = ?',
          [socket.userId]
        );
        
        // 通知相关用户该用户下线
        socket.broadcast.emit('user_status_changed', { 
          userId: socket.userId, 
          isOnline: false 
        });
      } catch (error) {
        console.error('更新离线状态错误:', error);
      }
    }
  });
});

// ==========================================
// 聊天相关 REST API
// ==========================================

// 获取或创建聊天会话
app.post('/api/chat/sessions', authenticateToken, async (req, res) => {
  try {
    const { caseId, participant2Id } = req.body;
    const participant1Id = req.user.id;

    // 检查是否已经存在会话
    const [existingSessions] = await pool.execute(
      'SELECT * FROM chat_sessions WHERE case_id = ? AND ((participant1_id = ? AND participant2_id = ?) OR (participant1_id = ? AND participant2_id = ?))',
      [caseId, participant1Id, participant2Id, participant2Id, participant1Id]
    );

    let sessionId;
    
    if (existingSessions.length > 0) {
      sessionId = existingSessions[0].id;
    } else {
      // 创建新会话
      const [result] = await pool.execute(
        'INSERT INTO chat_sessions (case_id, participant1_id, participant2_id) VALUES (?, ?, ?)',
        [caseId, participant1Id, participant2Id]
      );
      sessionId = result.insertId;

      // 添加参与者记录
      await pool.execute(
        'INSERT INTO chat_participants (session_id, user_id) VALUES (?, ?), (?, ?)',
        [sessionId, participant1Id, sessionId, participant2Id]
      );
    }

    // 返回会话信息
    const [sessions] = await pool.execute(`
      SELECT cs.*, 
        u1.username as participant1_username,
        u1.full_name as participant1_name,
        u2.username as participant2_username,
        u2.full_name as participant2_name,
        c.title as case_title
      FROM chat_sessions cs
      LEFT JOIN users u1 ON cs.participant1_id = u1.id
      LEFT JOIN users u2 ON cs.participant2_id = u2.id
      LEFT JOIN cases c ON cs.case_id = c.id
      WHERE cs.id = ?
    `, [sessionId]);

    res.json(sessions[0]);

  } catch (error) {
    console.error('创建聊天会话错误:', error);
    res.status(500).json({ error: '创建聊天会话失败' });
  }
});

// 获取用户的聊天会话列表
app.get('/api/chat/sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [sessions] = await pool.execute(`
      SELECT cs.*,
        CASE 
          WHEN cs.participant1_id = ? THEN u2.username
          ELSE u1.username
        END as other_party_username,
        CASE 
          WHEN cs.participant1_id = ? THEN u2.full_name
          ELSE u1.full_name
        END as other_party_name,
        c.title as case_title,
        (SELECT message_text FROM chat_messages WHERE session_id = cs.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM chat_messages WHERE session_id = cs.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
        (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id AND sender_id != ? AND is_read = FALSE) as unread_count
      FROM chat_sessions cs
      LEFT JOIN users u1 ON cs.participant1_id = u1.id
      LEFT JOIN users u2 ON cs.participant2_id = u2.id
      LEFT JOIN cases c ON cs.case_id = c.id
      WHERE (cs.participant1_id = ? OR cs.participant2_id = ?)
      ORDER BY cs.last_message_at DESC
    `, [userId, userId, userId, userId, userId]);

    res.json(sessions);

  } catch (error) {
    console.error('获取会话列表错误:', error);
    res.status(500).json({ error: '获取会话列表失败' });
  }
});

// 获取会话消息
app.get('/api/chat/sessions/:sessionId/messages', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // 验证用户是否有权限访问此会话
    const [sessions] = await pool.execute(
      'SELECT * FROM chat_sessions WHERE id = ? AND (participant1_id = ? OR participant2_id = ?)',
      [sessionId, req.user.id, req.user.id]
    );

    if (sessions.length === 0) {
      return res.status(403).json({ error: '无权访问此会话' });
    }

    const [messages] = await pool.execute(`
      SELECT cm.*, u.username, u.full_name 
      FROM chat_messages cm 
      LEFT JOIN users u ON cm.sender_id = u.id 
      WHERE cm.session_id = ? 
      ORDER BY cm.created_at DESC 
      LIMIT ? OFFSET ?
    `, [sessionId, parseInt(limit), offset]);

    // 反转消息顺序（最新的在最后）
    messages.reverse();

    res.json(messages);

  } catch (error) {
    console.error('获取消息错误:', error);
    res.status(500).json({ error: '获取消息失败' });
  }
});

// 获取未读消息数量
app.get('/api/chat/unread-count', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [result] = await pool.execute(`
      SELECT COUNT(*) as unread_count
      FROM chat_messages cm
      LEFT JOIN chat_sessions cs ON cm.session_id = cs.id
      WHERE cm.sender_id != ? AND cm.is_read = FALSE 
      AND (cs.participant1_id = ? OR cs.participant2_id = ?)
    `, [userId, userId, userId]);

    res.json({ unreadCount: result[0].unread_count });

  } catch (error) {
    console.error('获取未读消息数量错误:', error);
    res.status(500).json({ error: '获取未读消息数量失败' });
  }
});

// 上传聊天文件
app.post('/api/chat/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const fileInfo = {
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    };

    res.json(fileInfo);

  } catch (error) {
    console.error('上传文件错误:', error);
    res.status(500).json({ error: '文件上传失败' });
  }
});