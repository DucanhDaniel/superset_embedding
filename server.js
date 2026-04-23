process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const cors = require('cors');
const path = require('path');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
app.use(cors());
app.use(express.json());

require('dotenv').config();

const CONFIG = {
    supersetUrl: process.env.SUPERSET_URL,
    username: process.env.SUPERSET_USERNAME,
    password: process.env.SUPERSET_PASSWORD,
    dashboardId: process.env.SUPERSET_DASHBOARD_ID
};

const jar = new CookieJar();
const client = wrapper(axios.create({
    jar,
    timeout: 30000, // 30s timeout
    headers: { 'Connection': 'keep-alive' }
}));

axiosRetry(client, {
    retries: 5,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
        // Retry nếu timeout hoặc network error
        return axiosRetry.isNetworkOrIdempotentRequestError(error)
            || error.code === 'ETIMEDOUT'
            || error.code === 'ECONNABORTED';
    },
    onRetry: (retryCount, error) => {
        console.log(`⚠️ Retry lần ${retryCount}: ${error.message}`);
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let cachedAdminTokens = {
    accessToken: null,
    csrfToken: null,
    expiresAt: 0
};

async function getAdminTokens() {
    const now = Date.now();
    if (cachedAdminTokens.accessToken && cachedAdminTokens.csrfToken && cachedAdminTokens.expiresAt > now) {
        console.log("Sử dụng Admin Token từ bộ nhớ đệm.");
        return cachedAdminTokens;
    }

    console.log("Đang lấy lại Admin Token và CSRF Token mới...");

    // 1. Đăng nhập lấy access token
    const loginResp = await client.post(`${CONFIG.supersetUrl}/api/v1/security/login`, {
        username: CONFIG.username,
        password: CONFIG.password,
        provider: 'db',
        refresh: true
    });
    const accessToken = loginResp.data.access_token;

    // 2. Lấy CSRF token
    const csrfResp = await client.get(`${CONFIG.supersetUrl}/api/v1/security/csrf_token/`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    const csrfToken = csrfResp.data.result;

    // Lưu vào cache
    cachedAdminTokens = {
        accessToken,
        csrfToken,
        expiresAt: now + (20 * 60 * 1000) // Hết hạn sau 20 phút
    };

    return cachedAdminTokens;
}

app.get('/guest-token', async (req, res) => {
    try {
        const rlsRules = [];

        const { accessToken, csrfToken } = await getAdminTokens();

        console.log("Đang xin Guest Token...");
        const guestTokenResp = await client.post(`${CONFIG.supersetUrl}/api/v1/security/guest_token/`, {
            user: { username: "guest", first_name: "Khach", last_name: "Hang" },
            resources: [{ type: "dashboard", id: CONFIG.dashboardId }],
            rls: rlsRules // Có thể bỏ qua nếu không cần RLS
        }, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'X-CSRFToken': csrfToken,
                'Referer': CONFIG.supersetUrl
            }
        });

        console.log("Thành công! Guest Token:", guestTokenResp.data.token.substring(0, 30) + "...");
        res.json({ token: guestTokenResp.data.token });

    } catch (error) {
        const errorData = error.response?.data || error.message;
        console.error("LỖI:", error.code || errorData);
        res.status(500).json({ message: "Lỗi Server", detail: errorData });
    }
});

app.listen(3010, () => console.log('Server: http://localhost:3010'));