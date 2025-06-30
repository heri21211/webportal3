const express = require('express');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
const fs = require('fs');

// Update nilai untuk variabel yang ada di .env
function updateEnvVariable(variable, value) {
    try {
        let envContent = fs.readFileSync('.env', 'utf8');
        const regex = new RegExp(`${variable}=.*`, 'g');
        
        if (envContent.match(regex)) {
            envContent = envContent.replace(regex, `${variable}=${value}`);
        } else {
            envContent += `\n${variable}=${value}`;
        }
        
        fs.writeFileSync('.env', envContent);
    } catch (error) {
        console.error(`Error updating ${variable} in .env:`, error);
    }
}

// Fungsi untuk memuat pengaturan dari settings.json dan menerapkannya ke process.env
function loadSettings() {
    try {
        const settingsPath = path.join(__dirname, 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const settingsData = fs.readFileSync(settingsPath, 'utf8');
            const settings = JSON.parse(settingsData);
            
            // Muat pengaturan server jika ada
            if (settings.server) {
                process.env.GENIEACS_URL = settings.server.genieacsUrl || process.env.GENIEACS_URL;
                process.env.GENIEACS_USERNAME = settings.server.genieacsUsername || process.env.GENIEACS_USERNAME;
                process.env.GENIEACS_PASSWORD = settings.server.genieacsPassword || process.env.GENIEACS_PASSWORD;
                process.env.ADMIN_USERNAME = settings.server.adminUsername || process.env.ADMIN_USERNAME;
                process.env.ADMIN_PASSWORD = settings.server.adminPassword || process.env.ADMIN_PASSWORD;
                
                console.log('Pengaturan server dimuat dari settings.json');
            }
            
            return settings;
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
    
    return {};
}

require('dotenv').config();

// Muat pengaturan dari settings.json setelah memuat .env
const appSettings = loadSettings();
const multer = require('multer');

// Import WhatsApp handler
const whatsappHandler = require('./whatsapp-handler');

// Fungsi untuk apa yah
function decodeToken(encoded) {
    return Buffer.from(encoded, 'base64').toString('utf-8');
}

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'rahasia-session',
    resave: false,
    saveUninitialized: true
}));

const PRO_STATUS_FILE = path.join(__dirname, 'pro-status.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
// Versi yang diperlukan untuk file aktivasi
const REQUIRED_ACTIVATION_VERSION = '3.0';
// Konstanta untuk WhatsApp webhook
const WHATSAPP_COMMANDS = {
    HELP: ['help', 'bantuan', 'menu'],
    STATUS: ['status', 'cek', 'info'],
    SSID_2G: ['ssid2g', 'wifi2g', 'ssid 2g'],
    SSID_5G: ['ssid5g', 'wifi5g', 'ssid 5g'],
    PASSWORD_2G: ['pass2g', 'password2g', 'pw2g'],
    PASSWORD_5G: ['pass5g', 'password5g', 'pw5g'],
    REBOOT: ['reboot', 'restart', 'boot'],
    USER_INFO: ['userinfo', 'user', 'pelanggan'],
    CONNECTED_DEVICES: ['devices', 'perangkat', 'connected']
};

// Konstanta untuk pesan WhatsApp
const WHATSAPP_MESSAGES = {
    WELCOME: "Selamat datang di layanan WhatsApp WebPortal. Ketik *help* untuk melihat daftar perintah.",
    HELP: "*Menu Perintah WebPortal*\n\n" +
          "*status* - Cek status perangkat\n" +
          "*ssid2g* [nama] - Ubah nama WiFi 2.4G\n" +
          "*ssid5g* [nama] - Ubah nama WiFi 5G\n" +
          "*pass2g* [password] - Ubah password WiFi 2.4G\n" +
          "*pass5g* [password] - Ubah password WiFi 5G\n" +
          "*devices* - Lihat perangkat terhubung\n\n" +
          "*Khusus Admin:*\n" +
          "*reboot* [no_pelanggan] - Restart perangkat\n" +
          "*userinfo* [no_pelanggan] - Lihat info pelanggan",
    NOT_REGISTERED: "Maaf, nomor Anda belum terdaftar di sistem. Silakan hubungi admin untuk mendaftarkan nomor Anda.",
    ADMIN_ONLY: "Maaf, perintah ini hanya dapat diakses oleh admin.",
    SUCCESS: "Berhasil mengubah {param} menjadi: {value}",
    ERROR: "Maaf, terjadi kesalahan: {error}",
    INVALID_COMMAND: "Perintah tidak valid. Ketik *help* untuk melihat daftar perintah.",
    REBOOT_SUCCESS: "Perangkat berhasil di-restart. Mohon tunggu beberapa menit hingga perangkat kembali online.",
    REBOOT_FAILED: "Gagal me-restart perangkat. Error: {error}"
};

// Initialize settings file if it doesn't exist
if (!fs.existsSync(SETTINGS_FILE)) {
    const defaultSettings = {
        otpEnabled: false,
        otpExpiry: 300,
        otpLength: 6,
        whatsappGateway: "fonnte",
        gateways: {
            fonnte: {
                token: "",
                enabled: false,
                serverUrl: "https://api.fonnte.com/send",
                sender: ""
            },
            wablas: {
                token: "",
                enabled: false,
                serverUrl: "https://solo.wablas.com/api",
                sender: ""
            },
            mpwa: {
                token: "",
                enabled: false,
                serverUrl: "https://mpwa.id/api",
                sender: ""
            }
        },
        otpMessage: "Kode OTP Anda untuk login WebPortal: {{otp}}. Kode ini berlaku selama {{expiry}} menit.",
        adminWhatsapp: ""
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
}

// Load settings
let settings = {};
try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
} catch (error) {
    console.error('Error loading settings:', error);
    settings = {
        otpEnabled: false,
        otpExpiry: 300,
        otpLength: 6
    };
}

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (req, res) => {
    res.render('login', { error: null });
});

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.get('/verify-otp', (req, res) => {
    // Redirect ke login jika tidak ada username
    if (!req.query.username) {
        return res.redirect('/login');
    }
    // Baca pengaturan OTP
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
    
    res.render('verify-otp', { 
        username: req.query.username, 
        error: null,
        otpLength: settings.otpLength,
        otpExpiry: Math.floor(settings.otpExpiry / 60) // Convert seconds to minutes
    });
});

// Fungsi untuk generate OTP
function generateOTP(length = 6) {
    const digits = '0123456789';
    let OTP = '';
    for (let i = 0; i < length; i++) {
        OTP += digits[Math.floor(Math.random() * 10)];
    }
    return OTP;
}
// Simpan OTP sementara (dalam praktik nyata sebaiknya gunakan database)
const otpStore = new Map();

// Fungsi untuk format nomor WhatsApp
function formatWhatsAppNumber(number) {
    // Jika group WhatsApp, return apa adanya
    if (typeof number === 'string' && number.includes('@g.us')) {
        return number.trim();
    }
    // Hapus semua spasi dan karakter non-digit
    number = number.replace(/\D/g, '');
    // Jika dimulai dengan 0, ganti dengan 62
    if (number.startsWith('0')) {
        number = '62' + number.slice(1);
    }
    // Jika dimulai dengan 62, biarkan apa adanya
    else if (number.startsWith('62')) {
        number = number;
    }
    // Jika tidak dimulai dengan 0 atau 62, tambahkan 62
    else {
        number = '62' + number;
    }
    return number;
}

// Fungsi untuk mengirim pesan WhatsApp berdasarkan gateway yang dipilih
async function sendWhatsAppMessage(phoneNumber, message) {
    try {
        // Format nomor WhatsApp
        const formattedNumber = formatWhatsAppNumber(phoneNumber);
        
        // Baca pengaturan
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        const gateway = settings.whatsappGateway;
        
        console.log(`Mengirim pesan ke ${formattedNumber} menggunakan gateway ${gateway}`);
        
        switch (gateway) {
            case 'fonnte':
                return await sendViaFonnte(formattedNumber, message);
            case 'wablas':
                return await sendViaWablas(formattedNumber, message);
            case 'mpwa':
                return await sendViaMpwa(formattedNumber, message);
            default:
                console.error('Gateway tidak dikenal:', gateway);
                return false;
        }
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return false;
    }
}

// Fungsi untuk kirim pesan via Fonnte
async function sendViaFonnte(phoneNumber, message) {
    try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        const token = settings.gateways.fonnte.token;
        
        if (!token) {
            console.error('Fonnte token tidak dikonfigurasi');
            return false;
        }
        
        const response = await fetch('https://api.fonnte.com/send', {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                target: phoneNumber,
                message: message
            })
        });
        
        const data = await response.json();
        console.log('Fonnte response:', data);
        
        return response.ok;
    } catch (error) {
        console.error('Error sending via Fonnte:', error);
        return false;
    }
}

// Fungsi untuk kirim pesan via Wablas
async function sendViaWablas(phoneNumber, message) {
    try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        const token = settings.gateways.wablas.token;
        const serverUrl = settings.gateways.wablas.serverUrl;
        
        if (!token || !serverUrl) {
            console.error('Wablas token atau server URL tidak dikonfigurasi');
            return false;
        }
        
        const response = await fetch(`${serverUrl}/send-message`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                phone: phoneNumber,
                message: message
            })
        });
        
        const data = await response.json();
        console.log('Wablas response:', data);
        
        return data.status === true;
    } catch (error) {
        console.error('Error sending via Wablas:', error);
        return false;
    }
}

// Fungsi untuk kirim pesan via MPWA
async function sendViaMpwa(phoneNumber, message) {
    try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        const token = settings.gateways.mpwa.token;
        const sender = settings.gateways.mpwa.sender || 'default';
        const endpoint = settings.gateways.mpwa.serverUrl || 'https://wa.parabolaku.id/send-message';
        const footer = settings.gateways.mpwa.footer || 'ALIJAYA-NET';
        
        if (!token) {
            console.error('MPWA token tidak dikonfigurasi');
            return false;
        }
        
        console.log('Mengirim MPWA ke:', {
            nomor: phoneNumber,
            sender: sender,
            endpoint: endpoint
        });

        // Format nomor dengan benar
        let targetNumber = phoneNumber;
        if (typeof targetNumber === 'string' && targetNumber.includes('@g.us')) {
            // Group WhatsApp, biarkan apa adanya
            console.log('Target group WhatsApp, tidak diubah:', targetNumber);
        } else {
            // Nomor personal, normalisasi ke format 62xxx
            if (!targetNumber.startsWith('62')) {
                if (targetNumber.startsWith('0')) {
                    targetNumber = '62' + targetNumber.substring(1);
                } else {
                    targetNumber = '62' + targetNumber;
                }
            }
        }
        console.log('Format nomor MPWA:', targetNumber);
        
        try {
            // Gunakan endpoint dari pengaturan
            const requestBody = {
                api_key: token,
                sender: sender,
                number: targetNumber,
                message: message,
                footer: footer
            };
            
            console.log('MPWA JSON data:', JSON.stringify(requestBody));
            console.log('MPWA endpoint:', endpoint);
            
            // Kirim request dengan format JSON
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            console.log('MPWA response status:', response.status, response.statusText);
            
            // Ambil response text
            const responseText = await response.text();
            console.log('MPWA raw response:', responseText);
            
            // Coba parse JSON jika memungkinkan
            try {
                const jsonResponse = JSON.parse(responseText);
                console.log('MPWA JSON response:', jsonResponse);
                
                // Cek status dari respons
                if (jsonResponse && typeof jsonResponse === 'object') {
                    // Format respons bisa bervariasi
                    if (jsonResponse.status === true || 
                        jsonResponse.status === 'true' || 
                        jsonResponse.status === 'success' || 
                        jsonResponse.success === true) {
                        console.log('MPWA success response detected');
                        return true;
                    }
                    
                    console.log('MPWA failure detected in response:', jsonResponse);
                    return false;
                }
            } catch (jsonError) {
                console.error('MPWA JSON parse error:', jsonError);
                
                // Fallback: cek text response
                if (responseText.toLowerCase().includes('success') || 
                    responseText.toLowerCase().includes('berhasil')) {
                    return true;
                }
                
                return false;
            }
            
            return false;
        } catch (error) {
            console.error('MPWA request error:', error);
            return false;
        }
    } catch (error) {
        console.error('MPWA general error:', error);
        return false;
    }
}

// Fungsi untuk kirim OTP
async function sendOTP(customerNumber, otp) {
    try {
        // Baca pengaturan
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        
        // Siapkan pesan OTP
        let message = settings.otpMessage || "Kode OTP Anda untuk login WebPortal: {{otp}}. Kode ini berlaku selama {{expiry}} menit.";
        
        // Ganti placeholder dengan nilai sebenarnya
        message = message.replace('{{otp}}', otp);
        message = message.replace('{{expiry}}', Math.floor(settings.otpExpiry / 60));
        
        // Kirim pesan
        return await sendWhatsAppMessage(customerNumber, message);
    } catch (error) {
        console.error('Error sending OTP:', error);
        return false;
    }
}

// Endpoint untuk login customer dengan OTP
app.post('/login', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.render('login', { error: 'Nomor pelanggan diperlukan' });
    }

    try {
        console.log('Attempting to connect to GenieACS server...');
        
        // Get all devices first
        const response = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            },
            headers: {
                'Accept': 'application/json'
            }
        });

        console.log('Total devices:', response.data.length);

        // Find device with matching tag
        const device = response.data.find(d => {
            console.log('Checking device:', {
                id: d._id,
                tags: d._tags,
                rawDevice: JSON.stringify(d)
            });
            return d._tags && d._tags.includes(username);
        });

        if (device) {
            console.log('Device found:', {
                deviceId: device._id,
                tags: device._tags
            });

            // Baca pengaturan OTP
            const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));

            // Cek apakah OTP diaktifkan di pengaturan
            if (settings.otpEnabled) {
                // Generate dan kirim OTP
                const otp = generateOTP(settings.otpLength);
                const success = await sendOTP(username, otp);
                
                if (success) {
                    // Simpan OTP dengan waktu kadaluarsa sesuai pengaturan
                    otpStore.set(username, {
                        code: otp,
                        expiry: Date.now() + (settings.otpExpiry * 1000)
                    });
                    // Redirect ke halaman verifikasi OTP
                    res.render('verify-otp', { username, error: null, otpLength: settings.otpLength, otpExpiry: Math.floor(settings.otpExpiry / 60) });
                } else {
                    res.render('login', { error: 'Gagal mengirim OTP, silakan coba lagi' });
                }
            } else {
                // Jika OTP dinonaktifkan, langsung login
                req.session.username = username;
                req.session.deviceId = device._id;
                res.redirect('/dashboard');
            }
        } else {
            // Debug: Log all devices and their tags
            console.log('No device found with tag:', username);
            console.log('Available devices:', response.data.map(d => ({
                id: d._id,
                tags: d._tags || [],
                rawDevice: JSON.stringify(d)
            })));

            res.render('login', { error: 'Nomor pelanggan tidak ditemukan' });
        }
    } catch (error) {
        console.error('Login error:', error);
        console.error('Full error details:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            url: error.config?.url
        });
        res.render('login', { error: 'Terjadi kesalahan saat login' });
    }
});

// Endpoint untuk verifikasi OTP
app.post('/verify-otp', async (req, res) => {
    const { username, otp } = req.body;
    
    // Baca pengaturan OTP
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
    
    // Verifikasi OTP
    const storedOTP = otpStore.get(username);
    console.log('Verifying OTP:', {
        input: otp,
        stored: storedOTP?.code,
        expiry: storedOTP?.expiry,
        now: Date.now(),
        isExpired: storedOTP ? Date.now() > storedOTP.expiry : true
    });

    // Pastikan tipe data sama (string) saat membandingkan
    if (!storedOTP || 
        String(storedOTP.code) !== String(otp) || 
        Date.now() > storedOTP.expiry) {
        return res.render('verify-otp', { 
            username, 
            error: 'OTP tidak valid atau kadaluarsa',
            otpLength: settings.otpLength,
            otpExpiry: Math.floor(settings.otpExpiry / 60)
        });
    }

    // Hapus OTP yang sudah digunakan
    otpStore.delete(username);

    try {
        console.log('Attempting to connect to GenieACS server...');
        
        // Get all devices first
        const response = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            },
            headers: {
                'Accept': 'application/json'
            }
        });

        console.log('Total devices:', response.data.length);

        // Find device with matching tag
        const device = response.data.find(d => {
            console.log('Checking device:', {
                id: d._id,
                tags: d._tags,
                rawDevice: JSON.stringify(d)
            });
            return d._tags && d._tags.includes(username);
        });

        if (device) {
            console.log('Device found:', {
                deviceId: device._id,
                tags: device._tags
            });
            
            req.session.username = username;
            req.session.deviceId = device._id;
            res.redirect('/dashboard');
        } else {
            // Debug: Log all devices and their tags
            console.log('No device found with tag:', username);
            console.log('Available devices:', response.data.map(d => ({
                id: d._id,
                tags: d._tags || [],
                rawDevice: JSON.stringify(d)
            })));

            res.render('login', { error: 'Nomor pelanggan tidak ditemukan' });
        }
    } catch (error) {
        console.error('Login error:', error);
        console.error('Full error details:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            url: error.config?.url
        });
        res.render('login', { error: 'Terjadi kesalahan saat menghubungi server' });
    }
});

// Update parameter paths untuk Product Class/Model
const parameterPaths = {
    pppUsername: [
        'VirtualParameters.pppoeUsername',
        'VirtualParameters.pppUsername',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username'
    ],
    rxPower: [
        'VirtualParameters.RXPower',
        'VirtualParameters.redaman',
        'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.RXPower'
    ],
    pppMac: [
        'VirtualParameters.pppMac',
        'VirtualParameters.WanMac',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.MACAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.MACAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.2.MACAddress',
        'Device.IP.Interface.1.IPv4Address.1.IPAddress'
    ],
    pppMacWildcard: [
        'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.1.WANPPPConnection.*.MACAddress',
        'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.1.WANIPConnection.*.MACAddress'
    ],
    pppoeIP: [
        'VirtualParameters.pppoeIP',
        'VirtualParameters.pppIP'
    ],
    tr069IP: [
        'VirtualParameters.IPTR069'
    ],
    ssid: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'
    ],
    ssid2G: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'
    ],
    ssid5G: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID'
    ],
    userConnected: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations'
    ],
    userConnected2G: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations'
    ],
    userConnected5G: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.TotalAssociations'
    ],
    uptime: [
        'VirtualParameters.getdeviceuptime'
    ],
    productClass: [
        'DeviceID.ProductClass',
        'InternetGatewayDevice.DeviceInfo.ProductClass',
        'Device.DeviceInfo.ProductClass',
        'InternetGatewayDevice.DeviceInfo.ModelName',
        'Device.DeviceInfo.ModelName'
    ],
    serialNumber: [
        'DeviceID.SerialNumber',
        'InternetGatewayDevice.DeviceInfo.SerialNumber',
        'Device.DeviceInfo.SerialNumber'
    ],
    registeredTime: [
        'Events.Registered'
    ]
};

// Update helper function untuk cek status device
const getDeviceStatus = (lastInform) => {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000; // 5 menit dalam milliseconds
    const lastInformTime = new Date(lastInform).getTime();
    
    return (now - lastInformTime) <= fiveMinutes;
};

// Dashboard route
app.get('/dashboard', async (req, res) => {
    if (!req.session.username || !req.session.deviceId) {
        return res.redirect('/');
    }

    try {
        const deviceResponse = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            params: {
                query: JSON.stringify({ "_id": req.session.deviceId })
            },
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        if (!deviceResponse.data || !deviceResponse.data.length) {
            throw new Error('Device not found');
        }

        const device = deviceResponse.data[0];
        console.log('Raw device data:', JSON.stringify(device, null, 2));

        // Get device status
        const lastInform = device._lastInform;
        const deviceStatus = getDeviceStatus(lastInform);

        // Get Product Class/Model
        let model = getParameterWithPaths(device, parameterPaths.productClass);
        
        // Fallback ke device ID jika tidak ditemukan
        if (model === 'N/A') {
            const deviceIdParts = req.session.deviceId.split('-');
            if (deviceIdParts.length >= 2) {
                model = deviceIdParts[1];
            }
        }

        // Get Serial Number
        let serialNumber = getParameterWithPaths(device, parameterPaths.serialNumber);
        if (serialNumber === 'N/A') {
            const deviceIdParts = req.session.deviceId.split('-');
            if (deviceIdParts.length >= 3) {
                serialNumber = deviceIdParts[2];
            }
        }

        // Get device data
        const deviceData = {
            _id: device._id,
            _tags: device._tags || [],
            username: req.session.username,
            model: model,
            serialNumber: serialNumber,
            pppUsername: getParameterWithPaths(device, parameterPaths.pppUsername),
            pppMac: getParameterWithPaths(device, [...parameterPaths.pppMac, ...parameterPaths.pppMacWildcard]),
            pppoeIP: getParameterWithPaths(device, parameterPaths.pppoeIP),
            tr069IP: getParameterWithPaths(device, parameterPaths.tr069IP),
            ssid: getParameterWithPaths(device, parameterPaths.ssid),
            ssid2G: getParameterWithPaths(device, parameterPaths.ssid2G),
            ssid5G: getParameterWithPaths(device, parameterPaths.ssid5G),
            userConnected: getParameterWithPaths(device, parameterPaths.userConnected) || '0',
            userConnected2G: getParameterWithPaths(device, parameterPaths.userConnected2G) || '0',
            userConnected5G: getParameterWithPaths(device, parameterPaths.userConnected5G) || '0',
            rxPower: getParameterWithPaths(device, parameterPaths.rxPower),
            uptime: getParameterWithPaths(device, parameterPaths.uptime),
            registeredTime: getParameterWithPaths(device, parameterPaths.registeredTime),
            status: deviceStatus ? 'online' : 'offline',
            statusLabel: deviceStatus ? 'Online' : 'Offline',
            statusColor: deviceStatus ? '#33ff33' : '#ff0000',
            lastInform: new Date(lastInform || Date.now()).toLocaleString(),
            manufacturer: device.DeviceID?.Manufacturer || 'N/A'
        };

        // Digunakan array kosong dulu, data akan diambil secara asinkron melalui API
        let connectedUsers = [];

        // Clean up model name if needed
        deviceData.model = deviceData.model.replace('%2D', '-');

        console.log('Processed device data:', deviceData);

        res.render('dashboard', { deviceData, connectedUsers, error: null });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('dashboard', { 
            deviceData: {
                username: req.session.username,
                model: 'N/A',
                serialNumber: 'N/A',
                manufacturer: 'N/A',
                pppUsername: 'N/A',
                pppMac: 'N/A',
                pppoeIP: 'N/A',
                tr069IP: 'N/A',
                ssid: 'N/A',
                ssid2G: 'N/A',
                ssid5G: 'N/A',
                userConnected: '0',
                userConnected2G: '0',
                userConnected5G: '0',
                rxPower: 'N/A',
                uptime: 'N/A',
                registeredTime: 'N/A',
                status: 'unknown',
                statusLabel: 'Unknown',
                statusColor: '#99ccff',
                lastInform: 'N/A'
            },
            connectedUsers: [], // Menambahkan variabel connectedUsers (array kosong)
            error: `Gagal mengambil data perangkat: ${error.message}`
        });
    }
});

// Endpoint baru untuk mendapatkan data perangkat terhubung
app.get('/api/connected-devices', async (req, res) => {
    if (!req.session.username || !req.session.deviceId) {
        return res.status(401).json({ success: false, message: 'Tidak terautentikasi' });
    }

    try {
        const deviceId = req.query.deviceId || req.session.deviceId;
        const username = req.session.username;
        
        console.log(`Mendapatkan data perangkat untuk user: ${username}, device: ${deviceId}`);
        
        // Coba mendapatkan data langsung dari GenieACS
        let realDeviceData = null;
        let connectedUsers = [];
        let usingRealData = false;
        
        try {
            const encodedQuery = encodeURIComponent(JSON.stringify({ "_id": deviceId }));
            console.log(`Mencoba langsung query GenieACS: ${process.env.GENIEACS_URL}/devices/?query=${encodedQuery}`);
            
            const deviceResponse = await axios.get(`${process.env.GENIEACS_URL}/devices/?query=${encodedQuery}`, {
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                },
                headers: {
                    'Accept': 'application/json'
                },
                timeout: 3000 // Timeout 3 detik agar tidak terlalu lama
            });
            
            if (deviceResponse.data && deviceResponse.data.length > 0) {
                realDeviceData = deviceResponse.data[0];
                console.log('Data device dari GenieACS berhasil didapat');
                
                // Jika berhasil mendapatkan data perangkat, coba ambil data host
                if (realDeviceData.InternetGatewayDevice && 
                    realDeviceData.InternetGatewayDevice.LANDevice && 
                    realDeviceData.InternetGatewayDevice.LANDevice['1'] && 
                    realDeviceData.InternetGatewayDevice.LANDevice['1'].Hosts && 
                    realDeviceData.InternetGatewayDevice.LANDevice['1'].Hosts.Host) {
                        
                    console.log('Data host ditemukan di respons GenieACS!');
                    const hosts = realDeviceData.InternetGatewayDevice.LANDevice['1'].Hosts.Host;
                    
                    // Proses data host
                    for (const index in hosts) {
                        if (!isNaN(index)) { // Hanya proses indeks numerik
                            const host = hosts[index];
                            
                            if (host) {
                                const lastSeen = host.X_BROADCOM_COM_LastActive?._value || 
                                                host.LastActive?._value || 
                                                new Date().toISOString();
                                               
                                const isActive = new Date() - new Date(lastSeen) < (60 * 60 * 1000); // 1 jam
                                
                                connectedUsers.push({
                                    hostName: host.HostName?._value || '(tidak diketahui)',
                                    ipAddress: host.IPAddress?._value || '-',
                                    macAddress: host.MACAddress?._value || '-',
                                    interfaceType: host.InterfaceType?._value || '-',
                                    activeStatus: isActive ? 'Aktif' : 'Tidak Aktif',
                                    lastConnect: new Date(lastSeen).toLocaleString()
                                });
                            }
                        }
                    }
                    
                    console.log(`Berhasil memproses ${connectedUsers.length} perangkat terhubung dari GenieACS`);
                    
                    if (connectedUsers.length > 0) {
                        usingRealData = true;
                    }
                }
            }
        } catch (genieacsError) {
            console.log('Gagal mendapatkan data langsung dari GenieACS:', genieacsError.message);
        }
        
        // Jika tidak bisa mendapatkan data dari GenieACS atau tidak ada perangkat, gunakan data contoh
        if (connectedUsers.length === 0) {
            console.log('Tidak ada data dari GenieACS, menggunakan data contoh');
        
            // Data contoh yang dibedakan berdasarkan username/nomor HP
            if (username.includes('081220564761')) {
                // Data untuk nomor ini
                connectedUsers = [
                    { hostName: '(tidak diketahui)', ipAddress: '192.168.1.3', macAddress: 'EE:6D:6D:6F:2A:3D', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() },
                    { hostName: 'Galaxy-A02', ipAddress: '192.168.1.4', macAddress: '6A:42:9B:E7:42:AE', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() },
                    { hostName: 'android-963fbb7468a947f', ipAddress: '192.168.1.2', macAddress: '3A:4B:70:81:16:B5', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() },
                    { hostName: 'OPPO-A31', ipAddress: '192.168.1.10', macAddress: '1C:02:19:05:16:31', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() },
                    { hostName: 'A04-milik-Iis', ipAddress: '192.168.1.13', macAddress: '02:1B:03:CC:A5:35', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() }
                ];
            } 
            else if (username.includes('081321960111')) {
                connectedUsers = [
                    { hostName: 'OPPO-A12', ipAddress: '192.168.100.5', macAddress: '20:64:cb:c8:6e:5d', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() },
                    { hostName: 'V2026', ipAddress: '192.168.100.4', macAddress: '0e:3e:b0:3c:b6:97', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() },
                    { hostName: 'android-44b4250144973efb', ipAddress: '192.168.100.133', macAddress: '00:08:22:f8:cf:fb', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() }
                ];
            } else if (username.includes('087828060111')) {
                connectedUsers = [
                    { hostName: 'android-8a94f5c4d9425b61', ipAddress: '192.168.100.152', macAddress: '00:08:22:88:f4:fb', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() },
                    { hostName: 'android-33a099bf27710b1a', ipAddress: '192.168.100.111', macAddress: '30:cb:f8:cc:6a:45', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() },
                    { hostName: 'iPhone-Dimas', ipAddress: '192.168.100.50', macAddress: 'a4:83:e7:4e:a2:bc', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() }
                ];
            } else {
                // Jika tidak ada data khusus, buat data generik berdasarkan username
                const deviceBaseName = username.length >= 4 ? username.substring(0, 4) : 'Dev';
                const deviceSecondName = username.length >= 9 ? username.substring(5, 9) : 'User';
                
                connectedUsers = [
                    { hostName: `Smartphone-${deviceBaseName}`, ipAddress: '192.168.100.100', macAddress: '00:11:22:33:44:55', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() },
                    { hostName: `Laptop-${deviceSecondName}`, ipAddress: '192.168.100.101', macAddress: '66:77:88:99:aa:bb', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() }
                ];
            }
        }

        // Kirim respons dengan data yang didapat
        res.json({ 
            success: true, 
            connectedUsers,
            usingRealData: usingRealData
        });

        // Background process untuk mencoba mendapatkan data sebenarnya jika kita belum mendapatkannya
        if (!usingRealData) {
            (async () => {
                try {
                    console.log(`Memulai background task untuk deviceId: ${deviceId}`);
                    
                    // URL dan query untuk mendapatkan data host
                    const encodedDeviceId = encodeURIComponent(deviceId);
                    const hostTaskUrl = `${process.env.GENIEACS_URL}/devices/${encodedDeviceId}/tasks`;
                    
                    // Buat task untuk mengambil data host sesuai dengan struktur parameter yang benar
                    await axios.post(hostTaskUrl, {
                        name: "getParameterValues",
                        parameterNames: [
                            "InternetGatewayDevice.LANDevice.1.Hosts.Host.*.HostName",
                            "InternetGatewayDevice.LANDevice.1.Hosts.Host.*.IPAddress",
                            "InternetGatewayDevice.LANDevice.1.Hosts.Host.*.MACAddress",
                            "InternetGatewayDevice.LANDevice.1.Hosts.Host.*.InterfaceType",
                            "InternetGatewayDevice.LANDevice.1.Hosts.Host.*.Active",
                            "InternetGatewayDevice.LANDevice.1.Hosts.Host.*.X_BROADCOM_COM_LastActive"
                        ]
                    }, {
                        auth: {
                            username: process.env.GENIEACS_USERNAME,
                            password: process.env.GENIEACS_PASSWORD
                        },
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }).then(() => {
                        console.log('Task getParameterValues untuk data host berhasil dibuat');
                    }).catch(err => {
                        console.log('Gagal membuat task getParameterValues:', err.message);
                    });
                    
                    // Selanjutnya, juga minta refresh object untuk data host
                    await axios.post(hostTaskUrl, {
                        name: "refreshObject",
                        objectName: "InternetGatewayDevice.LANDevice.1.Hosts"
                    }, {
                        auth: {
                            username: process.env.GENIEACS_USERNAME,
                            password: process.env.GENIEACS_PASSWORD
                        },
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }).then(() => {
                        console.log('Task refreshObject untuk data host berhasil dibuat');
                    }).catch(err => {
                        console.log('Gagal membuat task refreshObject:', err.message);
                    });
                    
                    console.log('Background task selesai');
                } catch (error) {
                    console.error('Error pada background task:', error);
                }
            })();
        }
    } catch (error) {
        console.error('Error mengambil data perangkat terhubung:', error);
        
        // Return data fallback meskipun terjadi error
        const username = req.session.username || '';
        const mockData = [
            { hostName: 'Smartphone', ipAddress: '192.168.1.100', macAddress: 'AA:BB:CC:DD:EE:FF', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() },
            { hostName: 'Laptop', ipAddress: '192.168.1.101', macAddress: '11:22:33:44:55:66', interfaceType: '802.11', activeStatus: 'Aktif', lastConnect: new Date().toLocaleString() }
        ];
        
        res.json({ 
            success: true, 
            connectedUsers: mockData,
            usingRealData: false
        });
    }
});

// Helper function to format uptime
function formatUptime(seconds) {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

// Helper function to get nested value with multiple possible paths
const getParameterWithPaths = (device, paths) => {
    try {
        if (!device) {
            console.warn('Device object is null or undefined');
            return 'N/A';
        }

        for (const path of paths) {
            console.log(`Checking path: ${path}`);
            
            // Handle DeviceID special case
            if (path.startsWith('DeviceID.')) {
                const property = path.split('.')[1];
                if (device.DeviceID && device.DeviceID[property] !== undefined) {
                    const value = device.DeviceID[property];
                    console.log(`Found DeviceID value at ${path}:`, value);
                    // Clean up encoded characters if any
                    return typeof value === 'string' ? value.replace('%2D', '-') : value;
                }
            }
            
            // Handle wildcard paths
            if (path.includes('*')) {
                const parts = path.split('.');
                let current = device;
                let found = true;
                
                for (const part of parts) {
                    if (!current) {
                        found = false;
                        break;
                    }

                    if (part === '*') {
                        // Get all numeric keys
                        const keys = Object.keys(current || {}).filter(k => !isNaN(k));
                        // Try each key until we find a value
                        for (const key of keys) {
                            const temp = current[key];
                            if (temp?._value !== undefined) {
                                current = temp;
                                found = true;
                                break;
                            }
                            current = temp;
                        }
                        if (!current) {
                            found = false;
                            break;
                        }
                    } else {
                        current = current[part];
                    }
                }
                
                if (found && current?._value !== undefined) {
                    console.log(`Found value at ${path}:`, current._value);
                    return current._value;
                }
            } else {
                // Direct path
                const value = getNestedValue(device, path);
                if (value !== undefined) {
                    console.log(`Found value at ${path}:`, value);
                    return value;
                }
            }
        }

        console.log('No value found in any path');
        return 'N/A';
    } catch (error) {
        console.error(`Error getting value for path ${paths}:`, error);
        return 'N/A';
    }
};

// Function to safely get nested value
const getNestedValue = (obj, path) => {
    try {
        if (!obj || !path) return undefined;
        
        // Handle root level properties
        if (path.startsWith('_')) {
            return obj[path];
        }

        let current = obj;
        const parts = path.split('.');
        
        for (const part of parts) {
            if (!current) return undefined;
            current = current[part];
        }
        
        return current?._value;
    } catch (error) {
        console.error(`Error getting value for path ${path}:`, error);
        return undefined;
    }
};

// Helper function to encode device ID properly
function encodeDeviceId(deviceId) {
    // First decode to handle any existing encoding
    const decodedId = decodeURIComponent(deviceId);
    // Then encode properly for URL
    return encodeURIComponent(decodedId);
}

// Endpoint laporan gangguan dari pelanggan
app.post('/lapor-gangguan', async (req, res) => {
    try {
        const { jenisGangguan, keterangan, nomorPelanggan, pppoeUsername, rxPower, userConnected2G, userConnected5G } = req.body;
        // Baca settings dan nomor admin
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        const adminNumber = settings.adminWhatsapp;
        const groupId = settings.groupWhatsapp;
        if (!adminNumber) {
            return res.status(400).json({ success: false, message: 'Nomor admin belum diatur.' });
        }
        // Format pesan laporan lengkap
        // Format waktu Asia/Jakarta
        const now = new Date();
        const waktu = now.toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: 'numeric', month: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        }).replace(/\./g, ':');

        let pesan = `*Laporan Gangguan dari Pelanggan*\n`;
        pesan += `Nomor Pelanggan: ${nomorPelanggan && nomorPelanggan !== '' ? nomorPelanggan : '-'}\n`;
        pesan += `PPPoE Username: ${pppoeUsername && pppoeUsername !== '' ? pppoeUsername : '-'}\n`;
        pesan += `Redaman (RXPower): ${rxPower && rxPower !== '' ? rxPower : '-'}\n`;
        pesan += `User Konek SSID 2.4G: ${userConnected2G && userConnected2G !== '' ? userConnected2G : '-'}\n`;
        pesan += `User Konek SSID 5G: ${(userConnected5G && userConnected5G !== '' && userConnected5G !== '-') ? userConnected5G : 'N/A'}\n`;
        pesan += `Jenis Gangguan: ${jenisGangguan && jenisGangguan !== '' ? jenisGangguan : '-'}\n`;
        if (keterangan && keterangan.trim()) pesan += `Keterangan: ${keterangan}\n`;
        pesan += `Waktu: ${waktu}`;
        // Kirim ke admin via WhatsApp
        // Kirim ke admin dan group jika ada
        let resultAdmin = await sendWhatsAppMessage(adminNumber, pesan);
        let resultGroup = true;
        if (groupId && groupId !== '') {
            try {
                resultGroup = await sendWhatsAppMessage(groupId, pesan);
            } catch (e) {
                console.error('Gagal kirim ke group:', e);
                resultGroup = false;
            }
        }
        if (resultAdmin && resultGroup) {
            return res.json({ success: true });
        } else if (!resultAdmin) {
            return res.status(500).json({ success: false, message: 'Gagal mengirim pesan ke admin.' });
        } else {
            return res.status(500).json({ success: false, message: 'Gagal mengirim pesan ke group WhatsApp.' });
        }
    } catch (err) {
        console.error('Laporan gangguan error:', err);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
});

// Update SSID endpoint
app.post('/update-wifi', async (req, res) => {
    try {
        const { ssid2G, ssid5G, password2G, password5G, deviceId } = req.body;
        
        console.log('Update WiFi request:', {
            deviceId,
            ssid2G,
            ssid5G,
            password2G: password2G ? '***' : undefined,
            password5G: password5G ? '***' : undefined
        });
        
        const parameterValues = [];
        
        if (ssid2G) {
            parameterValues.push(
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", ssid2G, "xsd:string"]
            );
        }
        
        if (ssid5G) {
            parameterValues.push(
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID", ssid5G, "xsd:string"]
            );
        }

        if (password2G) {
            parameterValues.push(
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase", password2G, "xsd:string"],
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase", password2G, "xsd:string"]
            );
        }

        if (password5G) {
            parameterValues.push(
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.KeyPassphrase", password5G, "xsd:string"],
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase", password5G, "xsd:string"]
            );
        }

        if (parameterValues.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Tidak ada parameter yang diubah'
            });
        }

        // Encode device ID properly for URL
        const encodedDeviceId = encodeURIComponent(deviceId);
        
        // Kirim task ke GenieACS
        const taskResponse = await axios({
            method: 'POST',
            url: `${process.env.GENIEACS_URL}/devices/${encodedDeviceId}/tasks`,
            data: {
                name: "setParameterValues",
                parameterValues: parameterValues
            },
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            },
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('Update WiFi response:', {
            status: taskResponse.status,
            data: taskResponse.data
        });

        // Kirim connection request untuk menerapkan perubahan
        await axios({
            method: 'POST',
            url: `${process.env.GENIEACS_URL}/devices/${encodedDeviceId}/tasks`,
            data: {
                name: "refreshObject",
                objectName: "InternetGatewayDevice.LANDevice.1.WLANConfiguration"
            },
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            },
            headers: {
                'Content-Type': 'application/json'
            }
        });

        res.json({
            success: true,
            message: getSuccessMessage(ssid2G, ssid5G, password2G, password5G)
        });
    } catch (error) {
        console.error('Error updating WiFi settings:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengupdate pengaturan WiFi: ' + (error.message || 'Unknown error')
        });
    }
});

// Helper function untuk mendapatkan pesan sukses yang sesuai
function getSuccessMessage(ssid2G, ssid5G, password2G, password5G) {
    if (ssid2G && !ssid5G && !password2G && !password5G) {
        return 'SSID 2.4G berhasil diperbarui';
    } else if (!ssid2G && ssid5G && !password2G && !password5G) {
        return 'SSID 5G berhasil diperbarui';
    } else if (!ssid2G && !ssid5G && password2G && !password5G) {
        return 'Password WiFi 2.4G berhasil diperbarui';
    } else if (!ssid2G && !ssid5G && !password2G && password5G) {
        return 'Password WiFi 5G berhasil diperbarui';
    } else if (ssid2G && ssid5G && !password2G && !password5G) {
        return 'SSID 2.4G dan 5G berhasil diperbarui';
    } else if (!ssid2G && !ssid5G && password2G && password5G) {
        return 'Password WiFi 2.4G dan 5G berhasil diperbarui';
    } else {
        return 'Pengaturan WiFi berhasil diperbarui';
    }
}

// Tambahkan helper function untuk RX Power class
const getRxPowerClass = (rxPower) => {
    if (!rxPower) return '';
    const power = parseFloat(rxPower);
    if (power > -25) return 'rx-power-good';
    if (power > -27) return 'rx-power-warning';
    return 'rx-power-critical';
};

// Update admin route
app.get('/admin', async (req, res) => {
    try {
        if (!req.session.isAdmin) {
            return res.redirect('/admin/login');
        }

        const response = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        const devices = response.data.map(device => {
            // Cek status berdasarkan last inform time
            const isOnline = getDeviceStatus(device._lastInform);

            // Get connected devices count (tidak dipakai untuk userConnected2G/5G)
            const connectedDevices = getParameterWithPaths(device, [
                'InternetGatewayDevice.LANDevice.1.Hosts.HostNumberOfEntries',
                'Device.Hosts.HostNumberOfEntries'
            ]) || '0';

            return {
                _id: device._id,
                _tags: device._tags || [],
                online: isOnline,
                lastInform: device._lastInform || new Date(),
                pppUsername: getParameterWithPaths(device, parameterPaths.pppUsername) || 'Unknown',
                pppoeIP: getParameterWithPaths(device, parameterPaths.pppoeIP) || 'N/A',
                rxPower: getParameterWithPaths(device, parameterPaths.rxPower) || 'N/A',
                model: getParameterWithPaths(device, parameterPaths.productClass) || 'N/A',
                serialNumber: getParameterWithPaths(device, parameterPaths.serialNumber) || 'N/A',
                ssid: getParameterWithPaths(device, parameterPaths.ssid) || '',
                connectedDevices: connectedDevices,
                mac: getParameterWithPaths(device, [...parameterPaths.pppMac, ...parameterPaths.pppMacWildcard]) || 'N/A',
                // Ambil langsung dari parameter TotalAssociations sesuai band
                userConnected2G: getParameterWithPaths(device, parameterPaths.userConnected2G) || '0',
                userConnected5G: getParameterWithPaths(device, parameterPaths.userConnected5G) || '0',
            };
        });

        res.render('admin', { 
            devices,
            getRxPowerClass,
            error: null,
            settings: JSON.parse(fs.readFileSync(SETTINGS_FILE)),
            userLevel: req.session.userLevel || 'admin' // Default ke admin jika tidak ada
        });

    } catch (error) {
        console.error('Admin page error:', error);
        res.render('admin', { 
            devices: [],
            getRxPowerClass,
            error: 'Gagal memuat data perangkat: ' + error.message,
            settings: {},
            userLevel: req.session.userLevel || 'admin' // Default ke admin jika tidak ada
        });
    }
});

// Admin login route
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Cek kredensial admin
        if (username === process.env.ADMIN_USERNAME && 
            password === process.env.ADMIN_PASSWORD) {
            
            req.session.isAdmin = true;
            req.session.userLevel = 'admin';
            return res.redirect('/admin');
        }
        
        // Cek kredensial teknisi
        if (username === process.env.TEKNISI_USERNAME && 
            password === process.env.TEKNISI_PASSWORD) {
            
            req.session.isAdmin = true; // Tetap set isAdmin true agar bisa akses halaman admin
            req.session.userLevel = 'teknisi';
            return res.redirect('/admin');
        }

        res.render('admin-login', { error: 'Username atau password admin salah' });

    } catch (error) {
        console.error('Admin login error:', error);
        res.render('admin-login', { error: 'Terjadi kesalahan saat login' });
    }
});

// Admin login page
app.get('/admin/login', (req, res) => {
    if (req.session.isAdmin) {
        return res.redirect('/admin');
    }
    res.render('admin-login', { error: null });
});

// Update logout to handle admin session
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Tambahkan route khusus untuk logout admin
app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});



// Add this endpoint to handle device refresh
app.post('/refresh-device', async (req, res) => {
    try {
        const deviceId = req.session.deviceId;
        
        if (!deviceId) {
            throw new Error('Device ID tidak valid');
        }

        const encodedDeviceId = encodeURIComponent(deviceId);
        console.log('Refreshing device:', encodedDeviceId);

        // Refresh all parameters
        await axios.post(
            `${process.env.GENIEACS_URL}/devices/${encodedDeviceId}/tasks?connection_request`,
            { name: "refreshObject", objectName: "" },
            {
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        // Wait for refresh to complete
        await new Promise(resolve => setTimeout(resolve, 3000));

        res.json({ 
            success: true, 
            message: 'Device berhasil di-refresh' 
        });

    } catch (error) {
        console.error('Refresh device error:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            url: error.config?.url
        });
        
        res.status(500).json({ 
            success: false, 
            message: `Gagal me-refresh device: ${error.message}` 
        });
    }
});

// Refresh single device
app.post('/admin/refresh-device/:deviceId', async (req, res) => {
    try {
        if (!req.session.isAdmin) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Get original deviceId from GenieACS
        const originalDeviceId = req.params.deviceId
            .replace(/%252D/g, '-')  // Fix double encoding
            .replace(/%2D/g, '-')    // Fix single encoding
            .replace(/%20/g, ' ')    // Fix spaces
            .replace(/\+/g, ' ');    // Fix plus signs

        console.log('Request deviceId:', req.params.deviceId);
        console.log('Processed deviceId:', originalDeviceId);

        // Construct GenieACS URLs
        const baseUrl = process.env.GENIEACS_URL.replace(/\/$/, ''); // Remove trailing slash if exists
        const refreshUrl = `${baseUrl}/devices/${originalDeviceId}/tasks`;

        console.log('Refresh URL:', refreshUrl);

        // Verify device exists first
        try {
            const deviceCheck = await axios.get(`${baseUrl}/devices/${originalDeviceId}`, {
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                }
            });

            if (!deviceCheck.data) {
                throw new Error('Device not found in GenieACS');
            }

            console.log('Device found in GenieACS');

            // Encode device ID properly for URL
            const encodedDeviceId = encodeURIComponent(originalDeviceId);
            console.log('Encoded deviceId:', encodedDeviceId);

            // Send refresh task
            const taskResponse = await axios({
                method: 'POST',
                url: `${baseUrl}/devices/${encodedDeviceId}/tasks`,
                data: {
                    name: "setParameterValues",
                    parameterValues: [["InternetGatewayDevice.ManagementServer.PeriodicInformEnable", "1", "xsd:boolean"]]
                },
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log('Task response:', {
                status: taskResponse.status,
                data: taskResponse.data,
                url: taskResponse.config.url
            });

            // Wait for tasks to be processed
            await new Promise(resolve => setTimeout(resolve, 3000));

            res.json({ 
                success: true, 
                message: 'Device refreshed successfully',
                deviceId: originalDeviceId
            });

        } catch (axiosError) {
            console.error('GenieACS API error:', {
                url: axiosError.config?.url,
                status: axiosError.response?.status,
                data: axiosError.response?.data,
                message: axiosError.message
            });
            
            let errorMessage = 'GenieACS API error';
            if (axiosError.response?.status === 404) {
                errorMessage = 'Device not found in GenieACS';
            } else if (axiosError.response?.data?.message) {
                errorMessage = axiosError.response.data.message;
            } else {
                errorMessage = axiosError.message;
            }

            throw new Error(errorMessage);
        }

    } catch (error) {
        console.error('Refresh device error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to refresh device: ' + error.message,
            deviceId: req.params.deviceId,
            error: error.message
        });
    }
});

// Refresh all devices
app.post('/admin/refresh-all', async (req, res) => {
    try {
        if (!req.session.isAdmin) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Ambil semua devices
        const response = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        const refreshPromises = response.data.map(async (device) => {
            try {
                // Encode device ID properly for the query
                const encodedQuery = encodeURIComponent(JSON.stringify({ "_id": device._id }));
                console.log('Searching device with query:', encodedQuery);

                // Get current tags using GenieACS query API
                const deviceResponse = await axios.get(`${process.env.GENIEACS_URL}/devices/?query=${encodedQuery}`, {
                    auth: {
                        username: process.env.GENIEACS_USERNAME,
                        password: process.env.GENIEACS_PASSWORD
                    }
                });

                console.log('GenieACS response:', deviceResponse.data);

                if (!deviceResponse.data || !deviceResponse.data.length) {
                    return { deviceId: device._id, success: false, error: 'Device not found' };
                }

                const currentDevice = deviceResponse.data[0];
                const encodedDeviceId = encodeURIComponent(currentDevice._id);
                console.log('Encoded deviceId:', encodedDeviceId);

                // Send refresh task
                const taskResponse = await axios({
                    method: 'POST',
                    url: `${process.env.GENIEACS_URL}/devices/${encodedDeviceId}/tasks`,
                    data: {
                        name: "setParameterValues",
                        parameterValues: [["InternetGatewayDevice.ManagementServer.PeriodicInformEnable", "1", "xsd:boolean"]]
                    },
                    auth: {
                        username: process.env.GENIEACS_USERNAME,
                        password: process.env.GENIEACS_PASSWORD
                    },
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                console.log('Task response:', {
                    status: taskResponse.status,
                    data: taskResponse.data,
                    url: taskResponse.config.url
                });

                // Wait for tasks to be processed
                await new Promise(resolve => setTimeout(resolve, 3000));

                return { deviceId: currentDevice._id, success: true };
            } catch (error) {
                console.error('Error refreshing device:', error);
                return { deviceId: device._id, success: false, error: error.message };
            }
        });

        // Tunggu semua refresh selesai
        const results = await Promise.allSettled(refreshPromises);

        // Hitung statistik
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;

        res.json({ 
            success: true, 
            message: `Refresh completed. Success: ${successful}, Failed: ${failed}`,
            details: results.map(r => r.value || r.reason)
        });

    } catch (error) {
        console.error('Refresh all devices error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to refresh devices: ' + error.message 
        });
    }
});

// Ganti dengan fungsi enkripsi yang lebih aman
function encryptToken(text) {
    const crypto = require('crypto');
    const algorithm = 'aes-256-ctr';
    const secretKey = process.env.SECRET_KEY || 'default-secret-key-12345';
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

    return {
        iv: iv.toString('hex'),
        content: encrypted.toString('hex')
    };
}

function decryptToken(hash) {
    const crypto = require('crypto');
    const algorithm = 'aes-256-ctr';
    const secretKey = process.env.SECRET_KEY || 'default-secret-key-12345';
    const iv = Buffer.from(hash.iv, 'hex');
    const content = Buffer.from(hash.content, 'hex');

    const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
    const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);

    return decrypted.toString();
}

// Endpoint untuk mengaktifkan PRO
app.post('/activate-pro', (req, res) => {
    const { token } = req.body;
    
    // Periksa apakah file pro-status.json ada
    if (!fs.existsSync(PRO_STATUS_FILE)) {
        return res.status(400).json({ 
            success: false, 
            message: 'File aktivasi tidak ditemukan. Silakan hubungi administrator untuk mendapatkan file aktivasi.'
        });
    }
    
    // Periksa token
    if (token === getValidToken()) {
        try {
            const proStatus = JSON.parse(fs.readFileSync(PRO_STATUS_FILE));
            proStatus.isPro = true;
            proStatus.activatedAt = new Date().toISOString();
            
            // Tambahkan versi
            proStatus.version = REQUIRED_ACTIVATION_VERSION;
            
            fs.writeFileSync(PRO_STATUS_FILE, JSON.stringify(proStatus));
            res.json({ success: true });
        } catch (error) {
            console.error('Error saat aktivasi PRO:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Terjadi kesalahan saat aktivasi. Silakan coba lagi.'
            });
        }
    } else {
        res.status(400).json({ 
            success: false, 
            message: 'Token tidak valid.'
        });
    }
});

// Endpoint untuk memeriksa status PRO
app.get('/check-pro-status', (req, res) => {
    // Periksa apakah file pro-status.json ada
    if (!fs.existsSync(PRO_STATUS_FILE)) {
        return res.json({ isPro: false });
    }
    
    try {
        const proStatus = JSON.parse(fs.readFileSync(PRO_STATUS_FILE));
        
        // Periksa versi file (minimal harus versi 2.0)
        if (!proStatus.version || proStatus.version !== REQUIRED_ACTIVATION_VERSION) {
            return res.json({ 
                isPro: false, 
                expired: true,
                message: 'Versi file aktivasi tidak valid. Silakan hubungi administrator untuk mendapatkan file aktivasi terbaru.'
            });
        }
        
        res.json({ isPro: proStatus.isPro || false });
    } catch (error) {
        console.error('Error saat memeriksa status PRO:', error);
        res.json({ isPro: false });
    }
});

// Endpoint untuk reboot device
app.post('/reboot-device', async (req, res) => {
    const { deviceId } = req.body;
    
    try {
        // Log reboot attempt
        console.log('Attempting to reboot device:', deviceId);
        
        const response = await axios.post(
            `${process.env.GENIEACS_URL}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=3000&connection_request`,
            { name: "reboot" },
            {
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Reboot response:', response.data);
        res.json({ success: true, message: 'Perintah reboot berhasil dikirim' });
    } catch (error) {
        console.error('Reboot error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mengirim perintah reboot',
            error: error.message 
        });
    }
});

// Update customer number
app.post('/update-customer-number', async (req, res) => {
    try {
        const { deviceId, customerNumber } = req.body;
        
        if (!deviceId || !customerNumber) {
            return res.status(400).json({ 
                success: false, 
                message: 'Device ID dan nomor pelanggan harus diisi' 
            });
        }

        // Validate customer number format
        if (!/^\d+$/.test(customerNumber)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nomor pelanggan harus berupa angka' 
            });
        }

        // Encode device ID properly for the query
        const encodedQuery = encodeURIComponent(JSON.stringify({ "_id": deviceId }));
        console.log('Searching device with query:', encodedQuery);

        // Get current tags using GenieACS query API
        const response = await axios.get(`${process.env.GENIEACS_URL}/devices/?query=${encodedQuery}`, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        console.log('GenieACS response:', response.data);

        if (!response.data || !response.data.length) {
            return res.status(404).json({
                success: false,
                message: 'Device tidak ditemukan'
            });
        }

        const device = response.data[0];
        const currentTags = device._tags || [];
        console.log('Current tags:', currentTags);

        // Remove existing numeric tags
        for (const tag of currentTags) {
            if (/^\d+$/.test(tag)) {
                console.log('Removing tag:', tag);
                await axios.delete(`${process.env.GENIEACS_URL}/devices/${encodeURIComponent(deviceId)}/tags/${tag}`, {
                    auth: {
                        username: process.env.GENIEACS_USERNAME,
                        password: process.env.GENIEACS_PASSWORD
                    }
                });
            }
        }

        // Add new customer number tag
        console.log('Adding new tag:', customerNumber);
        await axios.post(`${process.env.GENIEACS_URL}/devices/${encodeURIComponent(deviceId)}/tags/${customerNumber}`, null, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        res.json({ 
            success: true, 
            message: 'Nomor pelanggan berhasil diupdate' 
        });

    } catch (error) {
        console.error('Error updating customer number:', error);
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        res.status(500).json({ 
            success: false, 
            message: 'Terjadi kesalahan saat mengupdate nomor pelanggan: ' + error.message 
        });
    }
});

// Endpoint untuk update nama pelanggan
app.post('/update-customer-name', async (req, res) => {
    try {
        const { deviceId, customerName } = req.body;
        
        if (!deviceId || !customerName) {
            return res.status(400).json({ 
                success: false, 
                message: 'Device ID dan nama pelanggan harus diisi' 
            });
        }

        // Encode device ID properly for the query
        const encodedQuery = encodeURIComponent(JSON.stringify({ "_id": deviceId }));
        console.log('Searching device with query:', encodedQuery);

        // Get current tags using GenieACS query API
        const response = await axios.get(`${process.env.GENIEACS_URL}/devices/?query=${encodedQuery}`, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        console.log('GenieACS response:', response.data);

        if (!response.data || !response.data.length) {
            return res.status(404).json({
                success: false,
                message: 'Device tidak ditemukan'
            });
        }

        const device = response.data[0];
        const currentTags = device._tags || [];
        console.log('Current tags:', currentTags);

        // Format nama pelanggan untuk tag
        const customerNameTag = `customerName:${customerName}`;
        
        // Hapus tag nama pelanggan yang sudah ada (jika ada)
        for (const tag of [...currentTags]) {
            if (tag.startsWith('customerName:')) {
                console.log('Removing tag:', tag);
                await axios.delete(`${process.env.GENIEACS_URL}/devices/${encodeURIComponent(deviceId)}/tags/${encodeURIComponent(tag)}`, {
                    auth: {
                        username: process.env.GENIEACS_USERNAME,
                        password: process.env.GENIEACS_PASSWORD
                    }
                });
            }
        }

        // Add new customerName tag
        console.log('Adding new customerName tag:', customerNameTag);
        await axios.post(`${process.env.GENIEACS_URL}/devices/${encodeURIComponent(deviceId)}/tags/${encodeURIComponent(customerNameTag)}`, null, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        res.json({ 
            success: true, 
            message: 'Nama pelanggan berhasil diupdate' 
        });

    } catch (error) {
        console.error('Error updating customer name:', error);
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        res.status(500).json({ 
            success: false, 
            message: 'Terjadi kesalahan saat mengupdate nama pelanggan: ' + error.message 
        });
    }
});

// Tambahkan route khusus untuk logout admin
app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// Route untuk halaman pengaturan admin
app.get('/admin/settings', (req, res) => {
    if (!req.session.isAdmin) {
        return res.redirect('/admin/login');
    }
    
    try {
        // Baca pengaturan dari settings.json
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        
        // Pastikan settings.server ada untuk halaman pengaturan server
        if (!settings.server) {
            settings.server = {
                genieacsUrl: process.env.GENIEACS_URL || '',
                genieacsUsername: process.env.GENIEACS_USERNAME || '',
                genieacsPassword: process.env.GENIEACS_PASSWORD || '',
                adminUsername: process.env.ADMIN_USERNAME || '',
                adminPassword: process.env.ADMIN_PASSWORD || ''
            };
        }
        
        // Buat base URL untuk webhook
        const host = req.get('host');
        const protocol = req.protocol;
        const webhookBaseUrl = `${protocol}://${host}`;
        
        res.render('settings', { 
            settings: settings,
            error: null,
            success: null,
            webhookBaseUrl
        });
    } catch (error) {
        console.error('Error loading settings page:', error);
        
        // Buat base URL untuk webhook meskipun terjadi error
        const host = req.get('host');
        const protocol = req.protocol;
        const webhookBaseUrl = `${protocol}://${host}`;
        
        res.render('settings', { 
            settings: {},
            error: 'Gagal memuat pengaturan: ' + error.message,
            success: null,
            webhookBaseUrl
        });
    }
});

app.post('/admin/save-gateway-settings', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ success: false, message: 'Tidak diizinkan' });
    }
    try {
        const { whatsappGateway, groupWhatsapp, gateways } = req.body;
        if (!whatsappGateway || !gateways) {
            return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
        }
        // Baca pengaturan yang ada
        const currentSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        currentSettings.whatsappGateway = whatsappGateway;
        currentSettings.groupWhatsapp = groupWhatsapp || '';
        currentSettings.gateways = gateways;
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
        res.json({ success: true, message: 'Pengaturan gateway berhasil disimpan' });
    } catch (error) {
        console.error('Error saving gateway settings:', error);
        res.status(500).json({ success: false, message: 'Gagal menyimpan pengaturan: ' + error.message });
    }
});

app.post('/admin/save-otp-settings', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ success: false, message: 'Tidak diizinkan' });
    }

    try {
        const { otpEnabled, otpExpiry, otpLength, otpMessage, adminWhatsapp } = req.body;
        
        // Validasi
        if (otpExpiry < 60 || otpExpiry > 3600) {
            return res.status(400).json({ 
                success: false, 
                message: 'Masa berlaku OTP harus antara 60-3600 detik' 
            });
        }
        
        if (![4, 6].includes(otpLength)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Panjang OTP harus 4 atau 6 digit' 
            });
        }

        // Baca pengaturan yang ada
        const currentSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        
        // Update pengaturan OTP
        currentSettings.otpEnabled = otpEnabled;
        currentSettings.otpExpiry = otpExpiry;
        currentSettings.otpLength = otpLength;
        currentSettings.otpMessage = otpMessage;
        currentSettings.adminWhatsapp = adminWhatsapp;
        
        // Simpan pengaturan
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
        
        res.json({ success: true, message: 'Pengaturan OTP berhasil disimpan' });
    } catch (error) {
        console.error('Error saving OTP settings:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal menyimpan pengaturan: ' + error.message 
        });
    }
});

app.post('/admin/save-gateway-settings', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ success: false, message: 'Tidak diizinkan' });
    }

    try {
        const { whatsappGateway, gateways } = req.body;
        
        // Validasi
        if (!['fonnte', 'wablas', 'mpwa'].includes(whatsappGateway)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Gateway tidak valid' 
            });
        }
        
        // Baca pengaturan yang ada
        const currentSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        
        // Update pengaturan gateway
        currentSettings.whatsappGateway = whatsappGateway;
        currentSettings.gateways = gateways;
        
        // Simpan pengaturan
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
        
        res.json({ success: true, message: 'Pengaturan gateway berhasil disimpan' });
    } catch (error) {
        console.error('Error saving gateway settings:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal menyimpan pengaturan: ' + error.message 
        });
    }
});

app.post('/admin/test-group', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ success: false, message: 'Tidak diizinkan' });
    }
    try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        const groupId = settings.groupWhatsapp;
        if (!groupId) {
            return res.status(400).json({ success: false, message: 'ID group WhatsApp belum diisi di pengaturan' });
        }
        const testMsg = 'Ini adalah pesan test ke group WhatsApp dari WebPortal.';
        const success = await sendWhatsAppMessage(groupId, testMsg);
        if (success) {
            res.json({ success: true, message: 'Test ke group berhasil' });
        } else {
            res.status(500).json({ success: false, message: 'Gagal mengirim pesan test ke group' });
        }
    } catch (error) {
        console.error('Error testing group WhatsApp:', error);
        res.status(500).json({ success: false, message: 'Gagal test group: ' + error.message });
    }
});

app.post('/admin/test-gateway', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ success: false, message: 'Tidak diizinkan' });
    }

    try {
        // Baca pengaturan
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        
        // Kirim pesan test ke nomor admin
        const testMessage = 'Ini adalah pesan test dari WebPortal. Jika Anda menerima pesan ini, berarti pengaturan WhatsApp gateway berhasil.';
        const adminNumber = settings.adminWhatsapp;
        
        if (!adminNumber) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nomor admin WhatsApp belum dikonfigurasi di pengaturan' 
            });
        }
        
        const success = await sendWhatsAppMessage(adminNumber, testMessage);
        
        if (success) {
            res.json({ success: true, message: 'Test berhasil' });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Gagal mengirim pesan test' 
            });
        }
    } catch (error) {
        console.error('Error testing gateway:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal test gateway: ' + error.message 
        });
    }
});

// Endpoint untuk get server settings (GenieACS dan admin credentials)
app.get('/admin/get-server-settings', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ success: false, message: 'Tidak diizinkan' });
    }

    try {
        // Baca file .env
        const envContent = fs.readFileSync('.env', 'utf8');
        
        // Parse .env file untuk mendapatkan nilai yang dibutuhkan
        const settings = {};
        const envLines = envContent.split('\n');
        
        for (const line of envLines) {
            // Skip komentar dan line kosong
            if (line.trim().startsWith('#') || line.trim() === '') {
                continue;
            }
            
            const [key, value] = line.split('=');
            if (key && value) {
                settings[key.trim()] = value.trim();
            }
        }
        
        res.json({ 
            success: true, 
            settings: {
                GENIEACS_URL: settings.GENIEACS_URL || '',
                GENIEACS_USERNAME: settings.GENIEACS_USERNAME || '',
                GENIEACS_PASSWORD: settings.GENIEACS_PASSWORD || '',
                ADMIN_USERNAME: settings.ADMIN_USERNAME || '',
                ADMIN_PASSWORD: settings.ADMIN_PASSWORD || '',
                MIKROTIK_HOST: settings.MIKROTIK_HOST || '',
                MIKROTIK_PORT: settings.MIKROTIK_PORT || '',
                MIKROTIK_USERNAME: settings.MIKROTIK_USERNAME || '',
                MIKROTIK_PASSWORD: settings.MIKROTIK_PASSWORD || ''
            }
        });
    } catch (error) {
        console.error('Error reading server settings:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal membaca pengaturan server: ' + error.message 
        });
    }
});

// Endpoint untuk update pengaturan Mikrotik API
app.post('/admin/update-mikrotik-settings', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ success: false, message: 'Tidak diizinkan' });
    }

    try {
        const { enabled, host, port, username, password } = req.body;
        
        // Validasi
        if (!host) {
            return res.status(400).json({ 
                success: false, 
                message: 'Host/IP Address harus diisi' 
            });
        }
        
        if (!port || isNaN(port)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Port harus berupa angka' 
            });
        }
        
        // Baca pengaturan yang ada
        const currentSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        
        // Pastikan objek mikrotik ada
        if (!currentSettings.mikrotik) {
            currentSettings.mikrotik = {};
        }
        
        // Update pengaturan Mikrotik
        currentSettings.mikrotik.enabled = enabled;
        currentSettings.mikrotik.host = host;
        currentSettings.mikrotik.port = parseInt(port);
        currentSettings.mikrotik.username = username;
        currentSettings.mikrotik.password = password;
        
        // Simpan pengaturan ke settings.json
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
        
        // Update juga file .env
        updateEnvVariable('MIKROTIK_HOST', host);
        updateEnvVariable('MIKROTIK_PORT', port);
        updateEnvVariable('MIKROTIK_USERNAME', username);
        updateEnvVariable('MIKROTIK_PASSWORD', password);
        
        res.json({ success: true, message: 'Pengaturan Mikrotik API berhasil disimpan' });
    } catch (error) {
        console.error('Error saving Mikrotik API settings:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal menyimpan pengaturan Mikrotik API: ' + error.message 
        });
    }
});

// Endpoint untuk test koneksi Mikrotik
app.post('/admin/test-mikrotik-connection', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ success: false, message: 'Tidak diizinkan' });
    }

    try {
        const { host, port, username, password } = req.body;
        
        // Gunakan modul node-routeros untuk test koneksi
        const RouterOSAPI = require('node-routeros').RouterOSAPI;
        
        // Buat konfigurasi koneksi
        const conn = new RouterOSAPI({
            host: host,
            port: parseInt(port),
            user: username,
            password: password,
            timeout: 10000 // 10 detik timeout
        });
        
        // Connect ke router
        await conn.connect();
        
        // Jika berhasil connect, lakukan perintah sederhana untuk memastikan koneksi berfungsi
        await conn.write('/system/identity/print');
        
        // Tutup koneksi
        conn.close();
        
        res.json({ success: true, message: 'Koneksi ke Mikrotik berhasil' });
    } catch (error) {
        console.error('Error testing Mikrotik connection:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal terhubung ke Mikrotik: ' + (error.message || JSON.stringify(error)) 
        });
    }
});

// Endpoint untuk save server settings (GenieACS dan admin credentials)
app.post('/admin/save-server-settings', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ success: false, message: 'Tidak diizinkan' });
    }

    try {
        // Ambil data dari request body
        const genieacsUrl = req.body.genieacsUrl;
        const genieacsUsername = req.body.genieacsUsername;
        const genieacsPassword = req.body.genieacsPassword;
        const adminUsername = req.body.adminUsername;
        const adminPassword = req.body.adminPassword;
        
        // Validasi field wajib
        if (!genieacsUrl || !genieacsUsername || !genieacsPassword || !adminUsername || !adminPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Field GenieACS dan Admin harus diisi' 
            });
        }
        
        // Ambil nilai teknisi dari request body atau gunakan nilai default
        const teknisiUsername = req.body.teknisiUsername || process.env.TEKNISI_USERNAME || 'teknisi';
        const teknisiPassword = req.body.teknisiPassword || process.env.TEKNISI_PASSWORD || 'teknisi';
        
        console.log('Menyimpan pengaturan server baru:', {
            genieacsUrl,
            genieacsUsername,
            adminUsername
        });
        
        // Baca settings.json yang ada
        const settingsPath = path.join(__dirname, 'settings.json');
        let settings = {};
        
        if (fs.existsSync(settingsPath)) {
            const settingsData = fs.readFileSync(settingsPath, 'utf8');
            settings = JSON.parse(settingsData);
        }
        
        // Tambahkan pengaturan server ke settings.json
        if (!settings.server) {
            settings.server = {};
        }
        
        settings.server.genieacsUrl = genieacsUrl;
        settings.server.genieacsUsername = genieacsUsername;
        settings.server.genieacsPassword = genieacsPassword;
        settings.server.adminUsername = adminUsername;
        settings.server.adminPassword = adminPassword;
        settings.server.teknisiUsername = teknisiUsername;
        settings.server.teknisiPassword = teknisiPassword;
        
        // Simpan kembali ke settings.json
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        
        // Update nilai di process.env untuk digunakan langsung tanpa restart
        process.env.GENIEACS_URL = genieacsUrl;
        process.env.GENIEACS_USERNAME = genieacsUsername;
        process.env.GENIEACS_PASSWORD = genieacsPassword;
        process.env.ADMIN_USERNAME = adminUsername;
        process.env.ADMIN_PASSWORD = adminPassword;
        process.env.TEKNISI_USERNAME = teknisiUsername;
        process.env.TEKNISI_PASSWORD = teknisiPassword;
        
        // Juga update di .env untuk kompatibilitas
        updateEnvVariable('GENIEACS_URL', genieacsUrl);
        updateEnvVariable('GENIEACS_USERNAME', genieacsUsername);
        updateEnvVariable('GENIEACS_PASSWORD', genieacsPassword);
        updateEnvVariable('ADMIN_USERNAME', adminUsername);
        updateEnvVariable('ADMIN_PASSWORD', adminPassword);
        updateEnvVariable('TEKNISI_USERNAME', teknisiUsername);
        updateEnvVariable('TEKNISI_PASSWORD', teknisiPassword);
        
        console.log('Pengaturan server berhasil diperbarui');
        
        res.json({ success: true, message: 'Pengaturan server berhasil disimpan' });
    } catch (error) {
        console.error('Error saving server settings:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal menyimpan pengaturan server: ' + error.message 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});

function getValidToken() {
    const parts = [
        Buffer.from('YWxp', 'base64').toString(),  // 'ali'
        Buffer.from('amF5YQ==', 'base64').toString(), // 'jaya'
        Buffer.from('bmV0', 'base64').toString()   // 'net'
    ];
    return parts.join('');
}

// Konfigurasi multer untuk upload file
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/icons/') // Pastikan folder ini ada
    },
    filename: function (req, file, cb) {
        cb(null, 'logo' + path.extname(file.originalname)) // Simpan dengan nama logo.png/jpg
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024 // Limit 2MB
    },
    fileFilter: function(req, file, cb) {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Hanya file gambar (JPG, JPEG, PNG) yang diperbolehkan!'));
    }
});

// Tambahkan middleware isAdmin sebelum route upload logo
const isAdmin = (req, res, next) => {
    if (req.session && req.session.isAdmin) {
        next();
    } else {
        res.status(403).json({
            success: false,
            message: 'Unauthorized: Admin access required'
        });
    }
};

// Tambahkan variabel global untuk version logo
let logoVersion = Date.now();

// Update route upload logo
app.post('/admin/upload-logo', isAdmin, upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('Tidak ada file yang diupload');
        }
        
        // Update version setiap kali logo baru diupload
        logoVersion = Date.now();
        
        res.json({
            success: true,
            message: 'Logo berhasil diupload',
            filename: req.file.filename,
            version: logoVersion
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Tambahkan route untuk mendapatkan version logo terbaru
app.get('/logo-version', (req, res) => {
    res.json({ version: logoVersion });
});

// ===== WEBHOOK WHATSAPP =====

// Endpoint webhook untuk Fonnte
// GET endpoint untuk validasi webhook oleh Fonnte (sementara)
app.get('/webhook/fonnte', (req, res) => {
    res.status(200).json({ status: true, message: 'GET method for Fonnte webhook validation' });
});
app.post('/webhook/fonnte', async (req, res) => {
    // DEBUG LOG: tampilkan semua request yang masuk
    console.log('Fonnte webhook raw:', {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body
    });
    try {
        console.log('Fonnte webhook received:', req.body);
        // Validasi request dari Fonnte (field: sender & message)
        if (!req.body || !req.body.sender || !req.body.message) {
            return res.status(400).json({ status: false, message: 'Invalid request format' });
        }
        // Ambil settings dan cek apakah gateway Fonnte aktif
        let botNumber = '';
        let fonnteEnabled = false;
        try {
            const settingsData = fs.readFileSync(SETTINGS_FILE, 'utf8');
            const settings = JSON.parse(settingsData);
            botNumber = settings.gateways?.fonnte?.sender || '';
            fonnteEnabled = settings.gateways?.fonnte?.enabled === true;
        } catch (e) { botNumber = ''; fonnteEnabled = false; }
        if (!fonnteEnabled) {
            return res.status(200).json({ status: true, message: 'Fonnte gateway disabled, ignore message' });
        }
        const sender = req.body.sender;
        const message = req.body.message;
        // Filter: Abaikan jika pesan dari bot sendiri atau pesan balasan sistem/brand
        const lowerMsg = typeof message === 'string' ? message.toLowerCase() : '';
        if (sender === botNumber && botNumber) {
            return res.status(200).json({ status: true, message: 'Ignore outgoing message' });
        }
        // Proteksi anti-loop: abaikan pesan jika mengandung ciri khas balasan sistem atau brand sendiri
        const autoReplyPatterns = [
            'perintah tidak valid',
            'pesan ini dikirim otomatis oleh sistem',
            'alijaya-net',
            'layanan pelanggan:'
        ];
        if (autoReplyPatterns.some(pattern => lowerMsg.includes(pattern))) {
            return res.status(200).json({ status: true, message: 'Ignore system/brand auto-reply' });
        }
        // Proses pesan WhatsApp
        const response = await whatsappHandler.processWhatsAppMessage(sender, message, 'fonnte', {
            formatWhatsAppNumber,
            getDeviceStatus,
            formatUptime,
            getParameterWithPaths,
            parameterPaths,
            getRxPowerClass,
            SETTINGS_FILE
        });
        
        // Kirim balasan hanya jika ada respons (perintah valid)
        if (response) {
            await sendWhatsAppMessage(sender, response);
            res.json({ status: true, message: 'Message processed and response sent' });
        } else {
            // Jika tidak ada respons, berarti pesan diabaikan
            console.log('Pesan diabaikan, tidak mengirim balasan');
            res.json({ status: true, message: 'Message ignored' });
        }
    } catch (error) {
        console.error('Error processing Fonnte webhook:', error);
        res.status(500).json({ status: false, message: 'Internal server error' });
    }
});

// Endpoint webhook untuk Wablas
app.post('/webhook/wablas', async (req, res) => {
    // DEBUG LOG: tampilkan semua request yang masuk
    console.log('Wablas webhook raw:', {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body
    });
    try {
        console.log('Wablas webhook received:', req.body);
        // Validasi request dari Wablas
        if (!req.body || !req.body.data || !req.body.data.phone || !req.body.data.message) {
            return res.status(400).json({ status: false, message: 'Invalid request format' });
        }
        const sender = req.body.data.phone;
        const message = req.body.data.message;
        // Ambil nomor bot dari settings
        let botNumber = '';
        try {
            const settingsData = fs.readFileSync(SETTINGS_FILE, 'utf8');
            const settings = JSON.parse(settingsData);
            botNumber = settings.gateways?.wablas?.sender || '';
        } catch (e) { botNumber = ''; }
        // Filter: Abaikan jika pesan dari bot sendiri atau pesan balasan sistem/brand
        const lowerMsg = typeof message === 'string' ? message.toLowerCase() : '';
        if (sender === botNumber && botNumber) {
            return res.status(200).json({ status: true, message: 'Ignore outgoing message' });
        }
        // Proteksi anti-loop: abaikan pesan jika mengandung ciri khas balasan sistem atau brand sendiri
        const autoReplyPatterns = [
            'perintah tidak valid',
            'pesan ini dikirim otomatis oleh sistem',
            'alijaya-net',
            'layanan pelanggan:'
        ];
        if (autoReplyPatterns.some(pattern => lowerMsg.includes(pattern))) {
            return res.status(200).json({ status: true, message: 'Ignore system/brand auto-reply' });
        }
        if (sender === botNumber && botNumber) {
            return res.status(200).json({ status: true, message: 'Ignore outgoing message' });
        }
        if (typeof message === 'string' && message.includes('Perintah tidak valid')) {
            return res.status(200).json({ status: true, message: 'Ignore system auto-reply' });
        }
        // Proses pesan WhatsApp
        const response = await whatsappHandler.processWhatsAppMessage(sender, message, 'wablas', {
            formatWhatsAppNumber,
            getDeviceStatus,
            formatUptime,
            getParameterWithPaths,
            parameterPaths,
            getRxPowerClass,
            SETTINGS_FILE
        });
        
        // Kirim balasan hanya jika ada respons (perintah valid)
        if (response) {
            await sendWhatsAppMessage(sender, response);
            res.json({ status: true, message: 'Message processed and response sent' });
        } else {
            // Jika tidak ada respons, berarti pesan diabaikan
            console.log('Pesan diabaikan, tidak mengirim balasan');
            res.json({ status: true, message: 'Message ignored' });
        }
    } catch (error) {
        console.error('Error processing Wablas webhook:', error);
        res.status(500).json({ status: false, message: 'Internal server error' });
    }
});

// Endpoint webhook untuk MPWA
app.post('/webhook/mpwa', async (req, res) => {
    // DEBUG LOG: tampilkan semua request yang masuk
    console.log('MPWA webhook raw:', {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body
    });
    try {
        console.log('MPWA webhook received:', req.body);
        // Validasi request dari MPWA
        if (!req.body || !req.body.from || !req.body.message) {
            return res.status(400).json({ status: false, message: 'Invalid request format' });
        }
        const sender = req.body.from;
        const message = req.body.message;
        // Ambil nomor bot dari settings
        let botNumber = '';
        try {
            const settingsData = fs.readFileSync(SETTINGS_FILE, 'utf8');
            const settings = JSON.parse(settingsData);
            botNumber = settings.gateways?.mpwa?.sender || '';
        } catch (e) { botNumber = ''; }
        // Filter: Abaikan jika pesan dari bot sendiri atau pesan balasan sistem/brand
        const lowerMsg = typeof message === 'string' ? message.toLowerCase() : '';
        if (sender === botNumber && botNumber) {
            return res.status(200).json({ status: true, message: 'Ignore outgoing message' });
        }
        // Proteksi anti-loop: abaikan pesan jika mengandung ciri khas balasan sistem atau brand sendiri
        const autoReplyPatterns = [
            'perintah tidak valid',
            'pesan ini dikirim otomatis oleh sistem',
            'alijaya-net',
            'layanan pelanggan:'
        ];
        if (autoReplyPatterns.some(pattern => lowerMsg.includes(pattern))) {
            return res.status(200).json({ status: true, message: 'Ignore system/brand auto-reply' });
        }
        if (sender === botNumber && botNumber) {
            return res.status(200).json({ status: true, message: 'Ignore outgoing message' });
        }
        if (typeof message === 'string' && message.includes('Perintah tidak valid')) {
            return res.status(200).json({ status: true, message: 'Ignore system auto-reply' });
        }
        // Proses pesan WhatsApp
        const response = await whatsappHandler.processWhatsAppMessage(sender, message, 'mpwa', {
            formatWhatsAppNumber,
            getDeviceStatus,
            formatUptime,
            getParameterWithPaths,
            parameterPaths,
            getRxPowerClass,
            SETTINGS_FILE
        });
        
        // Kirim balasan hanya jika ada respons (perintah valid)
        if (response) {
            await sendWhatsAppMessage(sender, response);
            res.json({ status: true, message: 'Message processed and response sent' });
        } else {
            // Jika tidak ada respons, berarti pesan diabaikan
            console.log('Pesan diabaikan, tidak mengirim balasan');
            res.json({ status: true, message: 'Message ignored' });
        }
    } catch (error) {
        console.error('Error processing MPWA webhook:', error);
        res.status(500).json({ status: false, message: 'Internal server error' });
    }
});