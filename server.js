const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
// Cần cài đặt cookie jar để axios tự động lưu cookie (quan trọng cho CSRF)
// Chạy lệnh: npm install axios-cookiejar-support tough-cookie
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
app.use(cors());
app.use(express.json());

// --- CẤU HÌNH ---
const CONFIG = {
    supersetUrl: 'http://103.102.131.30:8088',
    username: 'admin',
    password: 'admin',
    // dashboardId: '736fe429-4325-4396-91d8-e7723b2f4317'
    dashboardId: '16d97d1c-7ee9-4d86-837b-4febdc6fc644' // Đây là id embed của Tiktok Shop performance
};

// Thiết lập Axios với Cookie Jar (Để nó nhớ phiên làm việc như trình duyệt)
const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/guest-token', async (req, res) => {
    try {
        console.log("1. Đang đăng nhập lấy Access Token...");
        
        // BƯỚC 1: Login
        const loginResp = await client.post(`${CONFIG.supersetUrl}/api/v1/security/login`, {
            username: CONFIG.username,
            password: CONFIG.password,
            provider: 'db',
            refresh: true
        });
        const accessToken = loginResp.data.access_token;

        // BƯỚC 1.5: Lấy CSRF Token (Đây là bước fix lỗi 400)
        console.log("2. Đang lấy CSRF Token...");
        const csrfResp = await client.get(`${CONFIG.supersetUrl}/api/v1/security/csrf_token`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const csrfToken = csrfResp.data.result; // Token chống giả mạo

        // BƯỚC 2: Xin Guest Token (Kèm cả Access Token và CSRF Token)
        console.log("3. Đang xin Guest Token...");
        const guestTokenResp = await client.post(`${CONFIG.supersetUrl}/api/v1/security/guest_token`, {
            user: { username: "guest", first_name: "Khach", last_name: "Hang" },
            resources: [{ type: "dashboard", id: CONFIG.dashboardId }],
            rls: []
        }, {
            headers: { 
                Authorization: `Bearer ${accessToken}`,
                'X-CSRFToken': csrfToken, 
                'Referer': CONFIG.supersetUrl 
            }
        });

        console.log("--> Thành công! Token:", guestTokenResp.data.token.substring(0, 10) + "...");
        res.json({ token: guestTokenResp.data.token });

    } catch (error) {
        // Log lỗi chi tiết
        const errorData = error.response?.data || error.message;
        console.error("!!! LỖI SUPERSET:", JSON.stringify(errorData, null, 2));
        res.status(500).json({ message: "Lỗi Server", detail: errorData });
    }
});

app.listen(3000, () => console.log('Server chạy tại http://localhost:3000'));