// whatsapp-handler.js
// File untuk menangani pesan WhatsApp dan fungsi-fungsi terkait

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Import modul Mikrotik handler
const mikrotikHandler = require('./mikrotik-handler');

// Fungsi untuk mengirim notifikasi ke pelanggan
async function sendNotificationToCustomer(customerNumber, message, settings) {
    try {
        if (!customerNumber || !message) {
            console.error('Nomor pelanggan atau pesan tidak valid');
            return false;
        }
        
        console.log(`Mengirim notifikasi ke pelanggan ${customerNumber}: ${message}`);
        
        // Selalu baca file settings.json untuk mendapatkan pengaturan terbaru
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            // Gunakan settings yang diberikan sebagai fallback jika file tidak dapat dibaca
            const fileSettings = JSON.parse(fs.readFileSync(settingsFile));
            settings = fileSettings || settings || {};
            console.log('Settings berhasil dimuat ulang dari settings.json');
        } catch (err) {
            console.error('Error membaca settings.json:', err);
            // Gunakan settings yang diberikan jika ada, atau objek kosong
            settings = settings || {};
        }
        
        // Dapatkan pengaturan gateway WhatsApp
        const gateway = settings?.whatsappGateway || 'mpwa';
        // Di app.js, API key disimpan sebagai 'token'
        const apiKey = settings?.gateways?.[gateway]?.token || settings?.gateways?.[gateway]?.apiKey || process.env.MPWA_API_KEY || process.env.MPWA_TOKEN;
        const serverUrl = settings?.gateways?.[gateway]?.serverUrl || 'https://wa.parabolaku.id/send-message';
        const sender = settings?.gateways?.[gateway]?.sender || process.env.MPWA_SENDER || '';
        const footer = settings?.gateways?.[gateway]?.footer || settings?.ispName || 'WebPortal';
        
        if (!apiKey) {
            console.error('API key/token tidak ditemukan dalam pengaturan atau environment variables');
            return false;
        }
        
        console.log('Pengaturan WhatsApp gateway:', {
            gateway,
            serverUrl,
            sender,
            apiKeyExists: !!apiKey,
            footer
        });
        
        // Format nomor pelanggan/group untuk MPWA
        let formattedNumber = customerNumber.toString().trim();
        if (gateway === 'mpwa' && formattedNumber.includes('@g.us')) {
            // Jika group WhatsApp, kirim apa adanya
            console.log('Nomor tujuan terdeteksi group WhatsApp, tidak diubah:', formattedNumber);
        } else {
            // Untuk nomor personal, normalisasi ke format 62xxxxxxxxxx
            formattedNumber = formattedNumber.replace(/\D/g, '');
            if (formattedNumber.startsWith('0')) {
                formattedNumber = '62' + formattedNumber.substring(1);
            } else if (!formattedNumber.startsWith('62')) {
                formattedNumber = '62' + formattedNumber;
            }
            console.log(`Nomor yang diformat: ${formattedNumber}`);
        }
        
        // Kirim pesan menggunakan gateway yang dikonfigurasi
        if (gateway === 'mpwa') {
            // Buat payload sesuai dengan format yang diharapkan oleh API
            const payload = {
                api_key: apiKey,
                sender: sender,
                number: formattedNumber,
                message: message,
                footer: footer
            };
            
            console.log('Mengirim payload ke MPWA:', payload);
            
            const response = await axios.post(serverUrl, payload);
            
            console.log('Respons dari gateway WhatsApp:', response.data);
            return response.data?.status === true;
        } else {
            console.error('Gateway WhatsApp tidak didukung:', gateway);
            return false;
        }
    } catch (error) {
        console.error('Error mengirim notifikasi ke pelanggan:', error);
        return false;
    }
}

// Fungsi untuk memastikan huruf kapital dan karakter khusus dipertahankan
function preserveCase(text) {
    // Fungsi ini mengembalikan teks asli tanpa modifikasi
    // untuk memastikan huruf kapital dan karakter khusus dipertahankan
    const originalText = String(text);
    
    // Periksa apakah teks menggunakan format khusus dengan tanda kutip
    // Format: "Text Dengan Huruf Kapital"
    const quotedRegex = /"([^"]+)"/g;
    let matches = originalText.match(quotedRegex);
    
    if (matches && matches.length > 0) {
        // Ambil teks di dalam tanda kutip (hapus tanda kutip)
        let result = matches[0].slice(1, -1);
        console.log(`preserveCase: detected quoted format, extracted='${result}', containsUppercase=${/[A-Z]/.test(result)}`);
        return result;
    }
    
    console.log(`preserveCase: input='${originalText}', containsUppercase=${/[A-Z]/.test(originalText)}`);
    return originalText;
}

// Fungsi untuk memformat pesan WhatsApp dengan header dan footer yang menarik
function formatWhatsAppMessage(title, content, settings) {
    // Gunakan waktu lokal Indonesia (GMT+7/WIB)
    const currentDate = new Date();
    
    // Mengatur zona waktu Indonesia (GMT+7/WIB) secara eksplisit
    // Offset WIB adalah UTC+7 (7 jam * 60 menit * 60 detik * 1000 milidetik)
    const WIB_OFFSET = 7 * 60 * 60 * 1000;
    const utcTime = currentDate.getTime() + (currentDate.getTimezoneOffset() * 60 * 1000);
    const indonesiaTime = new Date(utcTime + WIB_OFFSET);
    
    const formattedDate = indonesiaTime.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // Format jam dengan format 24 jam (HH.mm)
    const hours = indonesiaTime.getHours().toString().padStart(2, '0');
    const minutes = indonesiaTime.getMinutes().toString().padStart(2, '0');
    // Gunakan format dengan titik sebagai pemisah (seperti 10.44)
    const formattedTime = `${hours}.${minutes}`;
    
    // Dapatkan nama ISP dari pesan OTP (jika ada)
    const otpMessage = settings?.otpMessage || '';
    const ispMatch = otpMessage.match(/([A-Za-z0-9-]+)$/); // Ambil kata terakhir dari pesan OTP
    const ispName = ispMatch ? ispMatch[0] : 'WebPortal';
    
    // Buat header yang menarik
    let message = "";
    message += "╭───「 *" + ispName + "* 」───╮\n";
    message += "│ " + formattedDate + "\n";
    message += "│ " + formattedTime + "\n";
    message += "╰────────────────╯\n\n";
    
    // Tambahkan judul pesan hanya jika judul tidak kosong
    if (title && title.trim() !== '') {
        message += "*" + title + "*\n";
        message += "┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n\n";
    }
    
    // Tambahkan konten pesan
    message += content;
    
    // Tambahkan footer
    message += "\n\n┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n";
    message += "_Pesan ini dikirim otomatis oleh sistem. Ketik *help* untuk bantuan._\n";
    message += "╭───「 *" + ispName + "* 」───╮\n";
    message += "│ Layanan Pelanggan:\n";
    message += "│ " + (settings?.adminWhatsapp || 'Admin') + "\n";
    message += "╰────────────────╯";
    
    return message;
}

// Konstanta untuk WhatsApp webhook
const WHATSAPP_COMMANDS = {
    HELP: ['help', 'bantuan', 'menu'],
    STATUS: ['status', 'cek', 'info'],
    REBOOT: ['reboot', 'restart', 'boot'],
    SSID_2G: ['ssid2g', 'ssid2'],
    SSID_5G: ['ssid5g', 'ssid5'],
    PASSWORD_2G: ['pass2g', 'password2g', 'pwd2g'],
    PASSWORD_5G: ['pass5g', 'password5g', 'pwd5g'],
    USER_INFO: ['userinfo', 'user', 'pelanggan'],
    CONNECTED_DEVICES: ['devices', 'perangkat', 'connected'],
    LIST_DEVICES: ['listdevices', 'daftarperangkat', 'listnomor'],
    // Perintah Mikrotik
    ADD_HOTSPOT: ['addhotspot', 'tambahhotspot', 'addhs'],
    DELETE_HOTSPOT: ['delhotspot', 'hapushotspot', 'delhs'],
    ADD_PPPOE: ['addpppoe', 'tambahpppoe', 'addppp'],
    DELETE_PPPOE: ['delpppoe', 'hapuspppoe', 'delppp'],
    SET_PROFILE: ['setprofile', 'gantiprofile', 'setppp'],
    LIST_PROFILES: ['listprofiles', 'daftarprofile', 'profiles'],
    LIST_HOTSPOT: ['listhotspot', 'daftarhotspot', 'hotspots'],
    LIST_PPPOE: ['listpppoe', 'daftarpppoe', 'pppoes'],
    LIST_OFFLINE_PPPOE: ['offlinepppoe', 'pppoeoffline', 'offlineppp'],
    // Perintah Monitoring Mikrotik
    ROUTER_RESOURCE: ['resource', 'sysinfo', 'routerinfo'],
    BANDWIDTH_USAGE: ['bandwidth', 'traffic', 'netmon']
};

// Konstanta untuk pesan WhatsApp
const WHATSAPP_MESSAGES = {
    // Fungsi untuk mendapatkan pesan dengan format yang menarik
    getFormattedMessage: function(title, content, settings) {
        return formatWhatsAppMessage(title, content, settings);
    },
    
    // Pesan selamat datang
    WELCOME: function(settings) {
        const content = "Selamat datang di layanan WhatsApp WebPortal. Ketik *help* untuk melihat daftar perintah.";
        return formatWhatsAppMessage("Selamat Datang", content, settings);
    },
    
    // Menu bantuan
    HELP: function(settings, isAdmin = false) {
        let content = "📱 *Perintah Pelanggan:*\n";
        content += "🔸 *status* - Cek status perangkat\n";
        content += "🔸 *ssid2g* [nama] - Ubah nama WiFi 2.4G\n";
        content += "🔸 *ssid5g* [nama] - Ubah nama WiFi 5G\n";
        content += "🔸 *pass2g* [password] - Ubah password WiFi 2.4G\n";
        content += "🔸 *pass5g* [password] - Ubah password WiFi 5G\n";
        content += "🔸 *devices* - Lihat perangkat terhubung\n";
        content += "🔸 *userinfo* - Lihat info pelanggan\n";
        
        // Hanya tampilkan perintah admin dan Mikrotik jika pengguna adalah admin
        if (isAdmin) {
            content += "\n🔴 *Khusus Admin:*\n";
            content += "🔸 *reboot* [no_pelanggan] - Restart perangkat\n";
            content += "🔸 *status* [no_pelanggan] - Cek status pelanggan\n";
            content += "🔸 *userinfo* [no_pelanggan] - Lihat info pelanggan\n";
            content += "🔸 *ssid2g* [no_pelanggan] [nama] - Ubah SSID 2.4G pelanggan\n";
            content += "🔸 *ssid5g* [no_pelanggan] [nama] - Ubah SSID 5G pelanggan\n";
            content += "🔸 *pass2g* [no_pelanggan] [password] - Ubah password WiFi 2.4G pelanggan\n";
            content += "🔸 *pass5g* [no_pelanggan] [password] - Ubah password WiFi 5G pelanggan\n";
            content += "🔸 *listdevices* - Lihat daftar semua perangkat dan nomor pelanggan\n\n";
            
            content += "🔵 *Perintah Mikrotik:*\n";
            content += "🔸 *addhotspot* [username] [password] [profile] - Tambah user hotspot\n";
            content += "🔸 *delhotspot* [username] - Hapus user hotspot\n";
            content += "🔸 *addpppoe* [username] [password] [profile] - Tambah secret PPPoE\n";
            content += "🔸 *delpppoe* [username] - Hapus secret PPPoE\n";
            content += "🔸 *setprofile* [username] [profile] - Ubah profile PPPoE\n";
            content += "🔸 *listprofiles* - Lihat daftar profile PPPoE\n";
            content += "🔸 *listhotspot* - Lihat daftar user hotspot yang aktif\n";
            content += "🔸 *listpppoe* - Lihat daftar secret PPPoE\n";
            content += "🔸 *offlinepppoe* - Lihat daftar user PPPoE yang offline\n";
            content += "\n🔵 *Monitoring Router:*\n";
            content += "🔸 *resource* - Lihat informasi resource router (CPU, memory, dll)\n";
            content += "🔸 *bandwidth* - Lihat penggunaan bandwidth saat ini\n";
        }
        
        return formatWhatsAppMessage("Menu Bantuan", content, settings);
    },
    
    // Pesan error dan notifikasi
    NOT_REGISTERED: function(settings) {
        const content = "❌ Maaf, nomor Anda belum terdaftar di sistem. Silakan hubungi admin untuk mendaftarkan nomor Anda.";
        return formatWhatsAppMessage("Tidak Terdaftar", content, settings);
    },
    
    ADMIN_ONLY: function(settings) {
        const content = "⛔ Maaf, perintah ini hanya dapat diakses oleh admin.";
        return formatWhatsAppMessage("Akses Ditolak", content, settings);
    },
    
    SUCCESS: function(param, value, settings) {
        // Pastikan nilai yang ditampilkan tetap mempertahankan huruf kapital dan karakter khusus
        // PENTING: Jangan ubah value menjadi huruf kecil atau modifikasi apapun
        const content = `✅ Berhasil mengubah ${param} menjadi: *${value}*`;
        return formatWhatsAppMessage("Berhasil", content, settings);
    },
    
    ERROR: function(error, settings) {
        const content = `❌ Maaf, terjadi kesalahan: ${error}`;
        return formatWhatsAppMessage("Error", content, settings);
    },
    
    INVALID_COMMAND: function(settings) {
        const content = "⚠️ Perintah tidak valid. Ketik *help* untuk melihat daftar perintah.";
        return formatWhatsAppMessage("Perintah Tidak Valid", content, settings);
    },
    
    REBOOT_SUCCESS: function(settings) {
        const content = "✅ Perangkat berhasil di-restart. Mohon tunggu beberapa menit hingga perangkat kembali online.";
        return formatWhatsAppMessage("Restart Berhasil", content, settings);
    },
    
    REBOOT_FAILED: function(error, settings) {
        const content = `❌ Gagal me-restart perangkat. Error: ${error}`;
        return formatWhatsAppMessage("Restart Gagal", content, settings);
    }
};

// Fungsi untuk mendapatkan deviceId berdasarkan nomor WhatsApp
async function getDeviceIdByWhatsApp(whatsappNumber, formatWhatsAppNumber) {
    try {
        // Format nomor WhatsApp untuk pencarian
        const formattedNumber = formatWhatsAppNumber(whatsappNumber);
        console.log(`Mencari perangkat untuk nomor WhatsApp: ${whatsappNumber}, format: ${formattedNumber}`);
        
        // Coba ambil dari GenieACS
        const genieacsUrl = process.env.GENIEACS_URL;
        const genieacsUsername = process.env.GENIEACS_USERNAME;
        const genieacsPassword = process.env.GENIEACS_PASSWORD;
        
        const auth = {
            username: genieacsUsername,
            password: genieacsPassword
        };
        
        // Buat beberapa kemungkinan format nomor untuk pencarian
        const possibleFormats = [
            formattedNumber,                // Format 62xxx
            formattedNumber.replace(/^62/, '0'), // Format 0xxx
            formattedNumber.replace(/^62/, '')   // Format tanpa awalan
        ];
        
        console.log('Mencoba format nomor:', possibleFormats);
        
        // Menggunakan pendekatan yang sama seperti di web portal
        console.log('Mengambil semua perangkat dari GenieACS...');
        const response = await axios.get(`${genieacsUrl}/devices`, {
            auth: auth,
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log(`Total perangkat: ${response.data.length}`);
        
        // Cari perangkat dengan tag yang cocok (pendekatan yang sama seperti di web portal)
        for (const format of possibleFormats) {
            console.log(`Mencari perangkat dengan tag: ${format}`);
            
            // Cari perangkat yang memiliki tag yang cocok dengan nomor pelanggan
            const device = response.data.find(d => {
                if (!d._tags) return false;
                
                // Debug: log tag perangkat
                console.log(`Perangkat ${d._id} memiliki tags:`, d._tags);
                
                // Cek jika tag adalah array (format lama)
                if (Array.isArray(d._tags)) {
                    return d._tags.includes(format);
                }
                
                // Cek jika tag adalah object (format baru)
                if (typeof d._tags === 'object') {
                    // Cek jika ada tag customerNumber yang cocok
                    if (d._tags.customerNumber === format) {
                        return true;
                    }
                    
                    // Cek jika ada tag yang merupakan nomor pelanggan
                    // Hanya cocokkan jika tag adalah nomor telepon (minimal 5 digit)
                    for (const tag in d._tags) {
                        if (tag.length >= 5 && /^\d+$/.test(tag) && tag === format) {
                            return true;
                        }
                    }
                }
                
                return false;
            });
            
            if (device) {
                console.log(`Perangkat ditemukan dengan tag ${format}:`, device._id);
                return device._id;
            }
        }
        
        // Jika tidak ditemukan dengan exact match, coba dengan partial match
        console.log('Mencoba dengan partial match...');
        for (const format of possibleFormats) {
            const device = response.data.find(d => {
                if (!d._tags) return false;
                
                // Cek jika tag adalah object (format baru)
                if (typeof d._tags === 'object') {
                    // Cek jika ada tag customerNumber yang cocok dengan partial match
                    if (d._tags.customerNumber && 
                       (d._tags.customerNumber.endsWith(format) || format.endsWith(d._tags.customerNumber))) {
                        return true;
                    }
                    
                    // Cek jika ada tag yang merupakan nomor pelanggan dengan partial match
                    for (const tag in d._tags) {
                        if (tag.length >= 5 && /^\d+$/.test(tag) && 
                           (tag.endsWith(format) || format.endsWith(tag))) {
                            return true;
                        }
                    }
                }
                
                return false;
            });
            
            if (device) {
                console.log(`Perangkat ditemukan dengan partial match ${format}:`, device._id);
                return device._id;
            }
        }
        
        console.log('Perangkat tidak ditemukan untuk nomor:', whatsappNumber);
        return null;
    } catch (error) {
        console.error('Error getting deviceId by WhatsApp number:', error);
        return null;
    }
}

// Fungsi untuk memeriksa apakah nomor adalah admin
function isAdminWhatsApp(whatsappNumber, formatWhatsAppNumber, settingsFile) {
    try {
        const settings = JSON.parse(fs.readFileSync(settingsFile));
        const adminNumber = formatWhatsAppNumber(settings.adminWhatsapp);
        const formattedNumber = formatWhatsAppNumber(whatsappNumber);
        
        return adminNumber === formattedNumber;
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

// Fungsi untuk mendapatkan status perangkat dalam format pesan
async function getDeviceStatusMessage(deviceId, genieacsUrl, auth, getDeviceStatus, formatUptime, getParameterWithPaths, parameterPaths) {
    try {
        // Ambil data perangkat dari GenieACS menggunakan query alih-alih akses langsung
        // Ini menghindari error 405 Method Not Allowed
        const query = encodeURIComponent(JSON.stringify({"_id": deviceId}));
        console.log(`Mencari perangkat dengan query: ${query}`);
        const response = await axios.get(`${genieacsUrl}/devices/?query=${query}`, { auth });
        
        // Endpoint query mengembalikan array, bukan objek tunggal
        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
            console.log('Perangkat tidak ditemukan dalam respons query');
            return "Perangkat tidak ditemukan.";
        }
        
        // Ambil perangkat pertama dari hasil query
        const device = response.data[0];
        console.log(`Perangkat ditemukan: ${device._id}`);
        console.log('Raw device data:', JSON.stringify(device, null, 2));
        
        // Ambil informasi status - perbaikan cara mendapatkan lastInform
        // Cek apakah _lastInform ada langsung di objek device (seperti di web portal)
        const lastInform = device._lastInform || device.lastInform?._value || 0;
        console.log(`Last Inform: ${lastInform}, type: ${typeof lastInform}`);
        
        // Gunakan fungsi getDeviceStatus yang sama dengan web portal
        const status = getDeviceStatus(lastInform);
        console.log(`Status perangkat: ${status ? 'Online' : 'Offline'}`);
        
        // Ambil parameter perangkat menggunakan parameterPaths dari app.js
        const serialNumber = getParameterWithPaths(device, parameterPaths.serialNumber) || 'N/A';
        const model = getParameterWithPaths(device, parameterPaths.productClass) || 'N/A';
        const uptime = getParameterWithPaths(device, parameterPaths.uptime);
        
        // Periksa jika uptime sudah dalam format string (1d 04:26:59) atau angka (seconds)
        let formattedUptime;
        if (uptime) {
            if (typeof uptime === 'string' && uptime.includes('d') && uptime.includes(':')) {
                // Uptime sudah dalam format string, gunakan langsung
                formattedUptime = uptime;
                console.log(`Menggunakan format uptime yang sudah ada: ${uptime}`);
            } else if (!isNaN(uptime)) {
                // Uptime dalam format angka (detik), konversi menggunakan formatUptime
                formattedUptime = formatUptime(uptime);
                console.log(`Mengkonversi uptime dari detik: ${uptime} -> ${formattedUptime}`);
            } else {
                // Format tidak dikenali
                formattedUptime = 'N/A';
                console.log(`Format uptime tidak dikenali: ${uptime}`);
            }
        } else {
            formattedUptime = 'N/A';
        }
        
        const ssid2G = getParameterWithPaths(device, parameterPaths.ssid2G) || 'N/A';
        const ssid5G = getParameterWithPaths(device, parameterPaths.ssid5G) || 'N/A';
        const rxPower = getParameterWithPaths(device, parameterPaths.rxPower);
        const rxPowerValue = rxPower ? parseFloat(rxPower).toFixed(2) + ' dBm' : 'N/A';
        const pppUsername = getParameterWithPaths(device, parameterPaths.pppUsername) || 'N/A';
        const macAddress = getParameterWithPaths(device, [...parameterPaths.pppMac, ...parameterPaths.pppMacWildcard]) || 'N/A';
        const userConnected2G = getParameterWithPaths(device, parameterPaths.userConnected2G) || '0';
        const userConnected5G = getParameterWithPaths(device, parameterPaths.userConnected5G) || '0';
        
        // Dapatkan nomor pelanggan dari tags - menggunakan pendekatan yang sama dengan web portal
        let customerNumber = 'N/A';
        if (device._tags) {
            console.log('Device tags:', device._tags);
            
            // Pendekatan 1: Cek jika tags adalah array (format lama)
            if (Array.isArray(device._tags)) {
                // Cari tag yang merupakan nomor telepon
                for (const tag of device._tags) {
                    if (tag && tag.length >= 5 && /^\d+$/.test(tag)) {
                        customerNumber = tag;
                        console.log(`Nomor pelanggan ditemukan dari array tags: ${customerNumber}`);
                        break;
                    }
                }
            } 
            // Pendekatan 2: Cek jika tags adalah object (format baru)
            else if (typeof device._tags === 'object') {
                // Cek jika ada tag customerNumber
                if (device._tags.customerNumber) {
                    customerNumber = device._tags.customerNumber;
                    console.log(`Nomor pelanggan ditemukan dari tag customerNumber: ${customerNumber}`);
                } else {
                    // Cek jika ada tag yang merupakan nomor telepon (minimal 5 digit)
                    for (const tag in device._tags) {
                        if (tag.length >= 5 && /^\d+$/.test(tag)) {
                            customerNumber = tag;
                            console.log(`Nomor pelanggan ditemukan dari tag key: ${customerNumber}`);
                            break;
                        }
                    }
                }
            }
        }
        
        // Format konten pesan
        let content = `Status: *${status ? 'Online ✅' : 'Offline ❌'}*\n`;
        content += `Model: ${model}\n`;
        content += `Serial Number: ${serialNumber}\n`;
        content += `Nomor Pelanggan: *${customerNumber}*\n`;
        content += `Username PPPoE: ${pppUsername}\n`;
        content += `MAC Address: ${macAddress}\n`;
        content += `Uptime: ${formattedUptime}\n\n`;
        content += `RX Power: ${rxPowerValue}\n\n`;
        content += `📶 *Informasi WiFi*\n`;
        content += `SSID 2.4G: *${ssid2G}*\n`;
        content += `SSID 5G: *${ssid5G}*\n`;
        content += `Perangkat Terhubung 2.4G: ${userConnected2G}\n`;
        content += `Perangkat Terhubung 5G: ${userConnected5G}\n`;
        
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (error) {
            console.error('Error reading settings:', error);
            settings = {};
        }
        
        // Format pesan dengan header dan footer
        const message = formatWhatsAppMessage('Status Perangkat', content, settings);
        
        return message;
    } catch (error) {
        console.error('Error getting device status:', error);
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (err) {
            console.error('Error reading settings:', err);
            settings = {};
        }
        
        return WHATSAPP_MESSAGES.ERROR(error.message, settings);
    }
}

// Fungsi untuk update pengaturan WiFi via WhatsApp
async function updateWifiSettingViaWhatsApp(deviceId, settingType, newValue, genieacsUrl, auth, isAdminRequest = false, customerNumber = null) {
    try {
        // Validasi input
        if (!deviceId || !settingType || !newValue) {
            return "Parameter tidak lengkap.";
        }
        
        console.log(`Update WiFi request via WhatsApp: ${settingType}=${newValue} for device ${deviceId}`);
        if (isAdminRequest && customerNumber) {
            console.log(`Request dari admin untuk pelanggan: ${customerNumber}`);
        }
        
        // Siapkan parameter untuk update
        let ssid2G, ssid5G, password2G, password5G;
        let paramName;
        
        // Log nilai asli yang diterima (untuk debugging)
        console.log(`Nilai asli yang diterima: '${newValue}' (tipe: ${typeof newValue})`, {
            containsUppercase: /[A-Z]/.test(newValue),
            containsSpecialChars: /[^a-zA-Z0-9]/.test(newValue)
        });
        
        // Tentukan parameter yang akan diupdate berdasarkan jenis pengaturan
        // PENTING: Pastikan nilai tidak diubah menjadi huruf kecil
        switch (settingType) {
            case 'ssid2G':
                // Simpan nilai asli tanpa modifikasi
                ssid2G = String(newValue);
                paramName = "SSID 2.4G";
                console.log(`Setting SSID 2.4G to: '${ssid2G}' (contains uppercase: ${/[A-Z]/.test(ssid2G)})`);
                break;
            case 'ssid5G':
                // Simpan nilai asli tanpa modifikasi
                ssid5G = String(newValue);
                paramName = "SSID 5G";
                console.log(`Setting SSID 5G to: '${ssid5G}' (contains uppercase: ${/[A-Z]/.test(ssid5G)})`);
                break;
            case 'password2G':
                // Simpan nilai asli tanpa modifikasi
                password2G = String(newValue);
                paramName = "Password WiFi 2.4G";
                console.log(`Setting Password 2.4G to: '${password2G}' (contains uppercase: ${/[A-Z]/.test(password2G)})`);
                break;
            case 'password5G':
                // Simpan nilai asli tanpa modifikasi
                password5G = String(newValue);
                paramName = "Password WiFi 5G";
                console.log(`Setting Password 5G to: '${password5G}' (contains uppercase: ${/[A-Z]/.test(password5G)})`);
                break;
            default:
                return "Jenis pengaturan tidak valid.";
        }
        
        // Buat array parameterValues seperti di web portal
        const parameterValues = [];
        
        // Tambahkan parameter yang akan diupdate
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
            return "Tidak ada parameter yang diubah.";
        }
        
        // Encode device ID untuk URL
        const encodedDeviceId = encodeURIComponent(deviceId);
        
        // Kirim task ke GenieACS seperti di web portal
        console.log('Mengirim task setParameterValues ke GenieACS...');
        const taskResponse = await axios({
            method: 'POST',
            url: `${genieacsUrl}/devices/${encodedDeviceId}/tasks`,
            data: {
                name: "setParameterValues",
                parameterValues: parameterValues
            },
            auth: auth,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Response dari GenieACS:', {
            status: taskResponse.status,
            data: taskResponse.data
        });
        
        // Kirim refreshObject untuk menerapkan perubahan
        console.log('Mengirim task refreshObject ke GenieACS...');
        await axios({
            method: 'POST',
            url: `${genieacsUrl}/devices/${encodedDeviceId}/tasks`,
            data: {
                name: "refreshObject",
                objectName: "InternetGatewayDevice.LANDevice.1.WLANConfiguration"
            },
            auth: auth,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (error) {
            console.error('Error reading settings:', error);
            settings = {};
        }
        
        // Jika ini adalah permintaan admin untuk pelanggan, kirim notifikasi ke pelanggan
        if (isAdminRequest && customerNumber) {
            try {
                // Pastikan settings memiliki informasi yang diperlukan
                if (!settings.gateways || !settings.gateways.mpwa) {
                    // Coba ambil dari environment variables
                    settings.gateways = settings.gateways || {};
                    settings.gateways.mpwa = settings.gateways.mpwa || {};
                    
                    // Di app.js, API key disimpan sebagai 'token'
                    if (!settings.gateways.mpwa.token) {
                        settings.gateways.mpwa.token = settings.gateways.mpwa.apiKey || process.env.MPWA_API_KEY || process.env.MPWA_TOKEN;
                    }
                    
                    if (!settings.gateways.mpwa.sender) {
                        settings.gateways.mpwa.sender = process.env.MPWA_SENDER || '';
                    }
                    
                    if (!settings.gateways.mpwa.serverUrl) {
                        settings.gateways.mpwa.serverUrl = 'https://wa.parabolaku.id/send-message';
                    }
                    
                    if (!settings.gateways.mpwa.footer) {
                        settings.gateways.mpwa.footer = settings.ispName || 'WebPortal';
                    }
                }
                
                // Log pengaturan untuk debug
                console.log('Pengaturan WhatsApp untuk notifikasi:', {
                    tokenExists: !!settings.gateways.mpwa.token,
                    sender: settings.gateways.mpwa.sender,
                    serverUrl: settings.gateways.mpwa.serverUrl,
                    footer: settings.gateways.mpwa.footer
                });
                
                // Buat pesan notifikasi
                let notificationTitle = "Perubahan Pengaturan WiFi";
                let notificationContent = `${paramName} perangkat Anda telah diubah oleh administrator.\n\n`;
                
                // Tambahkan detail perubahan (pertahankan huruf kapital dan karakter khusus)
                if (ssid2G) {
                    notificationContent += `SSID 2.4G baru: *${ssid2G}*\n`;
                }
                if (ssid5G) {
                    notificationContent += `SSID 5G baru: *${ssid5G}*\n`;
                }
                if (password2G) {
                    notificationContent += `Password WiFi 2.4G baru: *${password2G}*\n`;
                }
                if (password5G) {
                    notificationContent += `Password WiFi 5G baru: *${password5G}*\n`;
                }
                
                // Format pesan dengan header dan footer
                const formattedMessage = formatWhatsAppMessage(notificationTitle, notificationContent, settings);
                
                // Kirim notifikasi ke pelanggan
                console.log(`Mengirim notifikasi perubahan ${paramName} ke pelanggan ${customerNumber}`);
                
                // Pastikan nomor pelanggan valid
                if (customerNumber && customerNumber.length >= 5) {
                    const success = await sendNotificationToCustomer(customerNumber, formattedMessage, settings);
                    if (success) {
                        console.log(`Notifikasi berhasil dikirim ke pelanggan ${customerNumber}`);
                    } else {
                        console.error(`Gagal mengirim notifikasi ke pelanggan ${customerNumber}`);
                    }
                } else {
                    console.error(`Nomor pelanggan tidak valid: ${customerNumber}`);
                }
            } catch (notifError) {
                console.error('Error mengirim notifikasi ke pelanggan:', notifError);
                // Lanjutkan meskipun ada error saat mengirim notifikasi
            }
        }
        
        // Pastikan nilai yang ditampilkan di pesan sukses tetap mempertahankan huruf kapital dan karakter khusus
        // Log nilai yang akan ditampilkan di pesan sukses
        console.log(`Menampilkan pesan sukses dengan nilai: '${newValue}'`, {
            containsUppercase: /[A-Z]/.test(newValue),
            containsSpecialChars: /[^a-zA-Z0-9]/.test(newValue)
        });
        
        // PENTING: Buat pesan sukses secara langsung dengan nilai asli
        // Gunakan nilai asli yang diterima dari parameter, tanpa modifikasi apapun
        // Pastikan nilai tidak diubah menjadi huruf kecil di sepanjang alur pemrosesan
        const originalValue = String(newValue);
        console.log(`Nilai asli yang akan ditampilkan: '${originalValue}' (contains uppercase: ${/[A-Z]/.test(originalValue)})`);
        
        // Buat pesan sukses dengan nilai asli
        const content = `✅ Berhasil mengubah ${paramName} menjadi: *${originalValue}*`;
        return formatWhatsAppMessage("Berhasil", content, settings);
    } catch (error) {
        console.error('Error updating WiFi setting:', error);
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (err) {
            console.error('Error reading settings:', err);
            settings = {};
        }
        
        return WHATSAPP_MESSAGES.ERROR(error.message, settings);
    }
}

// Fungsi untuk reboot perangkat
async function rebootDevice(deviceId, genieacsUrl, auth) {
    try {
        if (!deviceId) {
            return "Device ID tidak valid.";
        }
        
        // Buat payload untuk reboot
        const payload = [{ name: "reboot" }];
        
        // Kirim request ke GenieACS
        await axios.post(
            `${genieacsUrl}/devices/${encodeURIComponent(deviceId)}/tasks`,
            payload,
            { auth }
        );
        
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (error) {
            console.error('Error reading settings:', error);
            settings = {};
        }
        
        return WHATSAPP_MESSAGES.REBOOT_SUCCESS(settings);
    } catch (error) {
        console.error('Error rebooting device:', error);
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (err) {
            console.error('Error reading settings:', err);
            settings = {};
        }
        
        return WHATSAPP_MESSAGES.REBOOT_FAILED(error.message, settings);
    }
}

// Fungsi untuk mendapatkan informasi perangkat terhubung
async function getConnectedDevicesMessage(deviceId, genieacsUrl, auth, getParameterWithPaths, parameterPaths) {
    try {
        // Ambil data perangkat dari GenieACS menggunakan query alih-alih akses langsung
        // Ini menghindari error 405 Method Not Allowed
        const query = encodeURIComponent(JSON.stringify({"_id": deviceId}));
        console.log(`Mencari perangkat dengan query: ${query}`);
        const response = await axios.get(`${genieacsUrl}/devices/?query=${query}`, { auth });
        
        // Endpoint query mengembalikan array, bukan objek tunggal
        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
            console.log('Perangkat tidak ditemukan dalam respons query');
            return "Perangkat tidak ditemukan.";
        }
        
        // Ambil perangkat pertama dari hasil query
        const device = response.data[0];
        console.log(`Perangkat ditemukan: ${device._id}`);
        
        // Coba dapatkan data perangkat terhubung
        const connectedDevices = [];
        
        // Coba ambil dari parameter yang umum digunakan
        const lanDeviceNumberOfEntries = getParameterWithPaths(device, [
            "InternetGatewayDevice.LANDevice.1.Hosts.HostNumberOfEntries",
            "Device.Hosts.HostNumberOfEntries"
        ]);
        
        if (lanDeviceNumberOfEntries) {
            const numEntries = parseInt(lanDeviceNumberOfEntries);
            
            for (let i = 1; i <= numEntries; i++) {
                const hostnamePaths = [
                    `InternetGatewayDevice.LANDevice.1.Hosts.Host.${i}.HostName`,
                    `Device.Hosts.Host.${i}.HostName`
                ];
                
                const macPaths = [
                    `InternetGatewayDevice.LANDevice.1.Hosts.Host.${i}.MACAddress`,
                    `Device.Hosts.Host.${i}.MACAddress`
                ];
                
                const ipPaths = [
                    `InternetGatewayDevice.LANDevice.1.Hosts.Host.${i}.IPAddress`,
                    `Device.Hosts.Host.${i}.IPAddress`
                ];
                
                const interfaceTypePaths = [
                    `InternetGatewayDevice.LANDevice.1.Hosts.Host.${i}.InterfaceType`,
                    `Device.Hosts.Host.${i}.InterfaceType`
                ];
                
                const hostname = getParameterWithPaths(device, hostnamePaths) || 'Unknown';
                const mac = getParameterWithPaths(device, macPaths) || 'N/A';
                const ip = getParameterWithPaths(device, ipPaths) || 'N/A';
                const interfaceType = getParameterWithPaths(device, interfaceTypePaths) || 'N/A';
                
                // Hanya tambahkan jika ada MAC address
                if (mac !== 'N/A') {
                    connectedDevices.push({
                        hostname,
                        mac,
                        ip,
                        interfaceType
                    });
                }
            }
        }
        
        // Format konten pesan
        let content = "";
        
        if (connectedDevices.length === 0) {
            content += "Tidak ada perangkat yang terhubung.";
        } else {
            content += `Total Perangkat Terhubung: *${connectedDevices.length}*\n\n`;
            connectedDevices.forEach((device, index) => {
                content += `📱 *Perangkat ${index + 1}*\n`;
                content += `Nama: ${device.hostname}\n`;
                content += `IP: ${device.ip}\n`;
                content += `MAC: ${device.mac}\n`;
                content += `Tipe: ${device.interfaceType}\n\n`;
            });
        }
        
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (error) {
            console.error('Error reading settings:', error);
            settings = {};
        }
        
        // Format pesan dengan header dan footer
        const message = formatWhatsAppMessage('Perangkat Terhubung', content, settings);
        
        return message;
    } catch (error) {
        console.error('Error getting connected devices:', error);
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (err) {
            console.error('Error reading settings:', err);
            settings = {};
        }
        
        return WHATSAPP_MESSAGES.ERROR(error.message, settings);
    }
}

// Fungsi untuk mendapatkan daftar perangkat dan nomor pelanggan
async function getDeviceListMessage(genieacsUrl, auth) {
    try {
        // Ambil semua perangkat dari GenieACS
        console.log('Mengambil daftar semua perangkat...');
        const response = await axios.get(`${genieacsUrl}/devices`, { auth });
        
        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
            return "Tidak ada perangkat yang ditemukan.";
        }
        
        console.log(`Total perangkat: ${response.data.length}`);
        
        // Kumpulkan informasi perangkat dan nomor pelanggan
        const deviceList = [];
        
        for (const device of response.data) {
            let customerNumber = 'N/A';
            let pppUsername = 'N/A';
            let pppoeIP = 'N/A';
            
            // Ambil nomor pelanggan dari tags
            if (device._tags) {
                // Cek jika ada tag customerNumber
                if (device._tags.customerNumber) {
                    customerNumber = device._tags.customerNumber;
                } else {
                    // Cek jika ada tag yang merupakan nomor telepon (minimal 5 digit)
                    for (const tag in device._tags) {
                        if (tag.length >= 5 && /^\d+$/.test(tag)) {
                            customerNumber = tag;
                            break;
                        }
                    }
                }
            }
            
            // Ambil PPPoE username
            if (device.InternetGatewayDevice?.WANDevice?.["1"]?.WANConnectionDevice?.["1"]?.WANPPPConnection?.["1"]?.Username?._value) {
                pppUsername = device.InternetGatewayDevice.WANDevice["1"].WANConnectionDevice["1"].WANPPPConnection["1"].Username._value;
            } else if (device.VirtualParameters?.pppoeUsername?._value) {
                pppUsername = device.VirtualParameters.pppoeUsername._value;
            } else if (device.VirtualParameters?.pppUsername?._value) {
                pppUsername = device.VirtualParameters.pppUsername._value;
            }
            
            // Ambil PPPoE IP
            if (device.InternetGatewayDevice?.WANDevice?.["1"]?.WANConnectionDevice?.["1"]?.WANPPPConnection?.["1"]?.ExternalIPAddress?._value) {
                pppoeIP = device.InternetGatewayDevice.WANDevice["1"].WANConnectionDevice["1"].WANPPPConnection["1"].ExternalIPAddress._value;
            } else if (device.VirtualParameters?.pppoeIP?._value) {
                pppoeIP = device.VirtualParameters.pppoeIP._value;
            } else if (device.VirtualParameters?.pppIP?._value) {
                pppoeIP = device.VirtualParameters.pppIP._value;
            }
            
            deviceList.push({
                id: device._id,
                customerNumber,
                pppUsername,
                pppoeIP
            });
        }
        
        // Urutkan berdasarkan nomor pelanggan
        deviceList.sort((a, b) => {
            if (a.customerNumber === 'N/A') return 1;
            if (b.customerNumber === 'N/A') return -1;
            return a.customerNumber.localeCompare(b.customerNumber);
        });
        
        // Format pesan
        let content = `*Daftar Perangkat dan Informasi Pelanggan*\n\n`;
        content += `Total Perangkat: ${deviceList.length}\n\n`;
        
        // Batasi jumlah perangkat yang ditampilkan untuk menghindari pesan terlalu panjang
        const maxDevicesToShow = 20;
        const shownDevices = deviceList.slice(0, maxDevicesToShow);
        
        for (let i = 0; i < shownDevices.length; i++) {
            const device = shownDevices[i];
            content += `${i+1}. *${device.customerNumber}*\n`;
            content += `   Username PPPoE: ${device.pppUsername}\n`;
            content += `   IP PPPoE: ${device.pppoeIP}\n\n`;
        }
        
        if (deviceList.length > maxDevicesToShow) {
            content += `...dan ${deviceList.length - maxDevicesToShow} perangkat lainnya.\n`;
        }
        
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (error) {
            console.error('Error reading settings:', error);
            settings = {};
        }
        
        // Format pesan dengan header dan footer
        const message = formatWhatsAppMessage('Daftar Perangkat', content, settings);
        
        return message;
    } catch (error) {
        console.error('Error getting device list:', error);
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (err) {
            console.error('Error reading settings:', err);
            settings = {};
        }
        
        return WHATSAPP_MESSAGES.ERROR(error.message, settings);
    }
}

// Fungsi untuk mendapatkan informasi pengguna
async function getUserInfoMessage(deviceId, genieacsUrl, auth, getParameterWithPaths, parameterPaths, getRxPowerClass) {
    try {
        // Ambil data perangkat dari GenieACS menggunakan query alih-alih akses langsung
        // Ini menghindari error 405 Method Not Allowed
        const query = encodeURIComponent(JSON.stringify({"_id": deviceId}));
        console.log(`Mencari perangkat dengan query: ${query}`);
        const response = await axios.get(`${genieacsUrl}/devices/?query=${query}`, { auth });
        
        // Endpoint query mengembalikan array, bukan objek tunggal
        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
            console.log('Perangkat tidak ditemukan dalam respons query');
            return "Perangkat tidak ditemukan.";
        }
        
        // Ambil perangkat pertama dari hasil query
        const device = response.data[0];
        console.log(`Perangkat ditemukan: ${device._id}`);
        
        // Ambil parameter perangkat menggunakan parameterPaths dari app.js
        const serialNumber = getParameterWithPaths(device, parameterPaths.serialNumber) || 'N/A';
        const model = getParameterWithPaths(device, parameterPaths.productClass) || 'N/A';
        const pppUsername = getParameterWithPaths(device, parameterPaths.pppUsername) || 'N/A';
        const pppPassword = getParameterWithPaths(device, parameterPaths.pppPassword) || 'N/A';
        const ipAddress = getParameterWithPaths(device, parameterPaths.pppoeIP) || 'N/A';
        const macAddress = getParameterWithPaths(device, [...parameterPaths.pppMac, ...parameterPaths.pppMacWildcard]) || 'N/A';
        const rxPower = getParameterWithPaths(device, parameterPaths.rxPower);
        const rxPowerValue = rxPower ? parseFloat(rxPower).toFixed(2) + ' dBm' : 'N/A';
        const rxPowerClass = rxPower ? getRxPowerClass(parseFloat(rxPower)) : 'N/A';
        const ssid2G = getParameterWithPaths(device, parameterPaths.ssid2G) || 'N/A';
        const ssid5G = getParameterWithPaths(device, parameterPaths.ssid5G) || 'N/A';
        const userConnected2G = getParameterWithPaths(device, parameterPaths.userConnected2G) || '0';
        const userConnected5G = getParameterWithPaths(device, parameterPaths.userConnected5G) || '0';
        const uptime = getParameterWithPaths(device, parameterPaths.uptime);
        // Periksa jika uptime sudah dalam format string (1d 04:26:59) atau angka (seconds)
        let formattedUptime;
        if (uptime) {
            if (typeof uptime === 'string' && uptime.includes('d') && uptime.includes(':')) {
                // Uptime sudah dalam format string, gunakan langsung
                formattedUptime = uptime;
                console.log(`Menggunakan format uptime yang sudah ada: ${uptime}`);
            } else if (!isNaN(uptime)) {
                // Uptime dalam format angka (detik), konversi menggunakan formatUptime
                formattedUptime = formatUptime(uptime);
                console.log(`Mengkonversi uptime dari detik: ${uptime} -> ${formattedUptime}`);
            } else {
                // Format tidak dikenali
                formattedUptime = 'N/A';
                console.log(`Format uptime tidak dikenali: ${uptime}`);
            }
        } else {
            formattedUptime = 'N/A';
        }
        
        // Dapatkan nomor pelanggan dari tags sesuai dengan format yang digunakan di dashboard.ejs
        let customerNumber = 'N/A';
        
        // Berdasarkan kode di dashboard.ejs dan app.js, nomor pelanggan disimpan sebagai tag numerik
        // di dalam array device._tags
        if (device._tags && Array.isArray(device._tags)) {
            // Cari tag yang berupa angka (format yang digunakan di dashboard.ejs)
            const numericTag = device._tags.find(tag => /^\d+$/.test(tag));
            if (numericTag) {
                customerNumber = numericTag;
                console.log(`Nomor pelanggan ditemukan di _tags (array) sebagai tag numerik: ${customerNumber}`);
            }
        } 
        // Jika _tags adalah objek (bukan array), coba cari di properti objek
        else if (device._tags && typeof device._tags === 'object') {
            // Cek jika ada tag yang merupakan nomor telepon (minimal 5 digit)
            for (const tag in device._tags) {
                if (/^\d+$/.test(tag)) {
                    customerNumber = tag;
                    console.log(`Nomor pelanggan ditemukan di _tags (objek) sebagai properti numerik: ${customerNumber}`);
                    break;
                }
            }
        }
        
        // Jika masih N/A, coba cek di properti customerNumber khusus
        if (customerNumber === 'N/A') {
            // Cek di properti customerNumber jika ada
            if (device.customerNumber) {
                customerNumber = device.customerNumber;
                console.log(`Nomor pelanggan ditemukan di device.customerNumber: ${customerNumber}`);
            } 
            // Cek di Tags.CustomerNumber._value jika ada
            else if (device.Tags?.CustomerNumber?._value) {
                customerNumber = device.Tags.CustomerNumber._value;
                console.log(`Nomor pelanggan ditemukan di Tags.CustomerNumber._value: ${customerNumber}`);
            }
            // Cek di VirtualParameters jika ada
            else if (device.VirtualParameters?.CustomerNumber?._value) {
                customerNumber = device.VirtualParameters.CustomerNumber._value;
                console.log(`Nomor pelanggan ditemukan di VirtualParameters.CustomerNumber._value: ${customerNumber}`);
            }
        }
        
        console.log(`Hasil akhir nomor pelanggan: ${customerNumber}`);
        
        // Format konten pesan
        let content = `💻 *Informasi Perangkat*\n`;
        content += `Model: ${model}\n`;
        content += `Serial Number: ${serialNumber}\n`;
        content += `Nomor Pelanggan: *${customerNumber}*\n`;
        content += `MAC Address: ${macAddress}\n`;
        content += `Uptime: ${formattedUptime}\n\n`;
        
        content += `🔑 *Informasi Akun*\n`;
        content += `Username PPPoE: ${pppUsername}\n`;
        content += `Password PPPoE: ${pppPassword}\n`;
        content += `IP Address: ${ipAddress}\n\n`;
        
        content += `📶 *Informasi Sinyal*\n`;
        content += `RX Power: ${rxPowerValue}\n`;
        content += `Kualitas Sinyal: ${rxPowerClass}\n\n`;
        
        content += `📱 *Informasi WiFi*\n`;
        content += `SSID 2.4G: *${ssid2G}*\n`;
        content += `SSID 5G: *${ssid5G}*\n`;
        content += `Perangkat Terhubung 2.4G: ${userConnected2G}\n`;
        content += `Perangkat Terhubung 5G: ${userConnected5G}\n`;
        
        // Tambahkan daftar perangkat terhubung jika ada
        let connectedDevices = [];
        
        // Coba ambil data perangkat terhubung dari device
        if (device.InternetGatewayDevice?.LANDevice?.['1']?.Hosts?.Host) {
            const hosts = device.InternetGatewayDevice.LANDevice['1'].Hosts.Host;
            
            // Proses data host
            for (const index in hosts) {
                if (!isNaN(index)) { // Hanya proses indeks numerik
                    const host = hosts[index];
                    
                    if (host) {
                        const lastSeen = host.X_BROADCOM_COM_LastActive?._value || 
                                        host.LastActive?._value || 
                                        new Date().toISOString();
                                        
                        const isActive = new Date() - new Date(lastSeen) < (60 * 60 * 1000); // 1 jam
                        
                        connectedDevices.push({
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
            
            console.log(`Berhasil memproses ${connectedDevices.length} perangkat terhubung`);
        }
        
        // Tambahkan daftar perangkat terhubung jika ada
        if (connectedDevices.length > 0) {
            content += `\n📱 *Daftar Perangkat Terhubung*\n`;
            
            connectedDevices.forEach((device, index) => {
                content += `\n${index + 1}. ${device.hostName}\n`;
                content += `   IP: ${device.ipAddress}\n`;
                content += `   MAC: ${device.macAddress}\n`;
                content += `   Status: ${device.activeStatus}\n`;
            });
        }
        
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (error) {
            console.error('Error reading settings:', error);
            settings = {};
        }
        
        // Dapatkan tanggal dan waktu saat ini untuk header pesan
        const now = new Date();
        // Gunakan header kosong untuk menghindari duplikasi tanggal dan waktu
        // karena fungsi formatWhatsAppMessage sudah menambahkan header dengan tanggal dan waktu
        const customHeader = ""; // Kosongkan header karena sudah ada di formatWhatsAppMessage
        
        // Format pesan dengan header dan footer
        const message = formatWhatsAppMessage(customHeader, content, settings);
        
        return message;
    } catch (error) {
        console.error('Error getting user info:', error);
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (err) {
            console.error('Error reading settings:', err);
            settings = {};
        }
        
        return WHATSAPP_MESSAGES.ERROR(error.message, settings);
    }
}

// Fungsi utama untuk memproses pesan WhatsApp
async function processWhatsAppMessage(sender, message, gateway, deps) {
    try {
        console.log(`Processing WhatsApp message from ${sender}: ${message}`);
        
        const {
            formatWhatsAppNumber,
            getDeviceStatus,
            formatUptime,
            getParameterWithPaths,
            parameterPaths,
            getRxPowerClass,
            SETTINGS_FILE
        } = deps;
        
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (error) {
            console.error('Error reading settings:', error);
            settings = {};
        }
        
        // Periksa apakah pesan kosong
        if (!message || message.trim() === '') {
            // Abaikan pesan kosong
            console.log('Mengabaikan pesan kosong');
            return null;
        }
        
        // Simpan pesan asli untuk mempertahankan huruf kapital dan karakter khusus
        const originalMessage = message.trim();
        
        // Pisahkan perintah dan parameter (perintah dalam huruf kecil, parameter tetap asli)
        const commandLowerCase = originalMessage.toLowerCase().split(' ')[0];
        const originalParts = originalMessage.split(' ');
        
        // PENTING: Jangan ubah parameter menjadi huruf kecil
        // Simpan parameter asli dengan huruf kapital dan karakter khusus
        const originalParams = originalParts.length > 1 ? originalParts.slice(1).join(' ') : '';
        
        // Untuk kompatibilitas dengan kode yang sudah ada
        // Hanya perintah yang diubah menjadi huruf kecil, parameter tetap asli
        const command = commandLowerCase;
        // PENTING: Gunakan parameter asli, bukan versi huruf kecil
        const params = originalParams;
        
        // Setup GenieACS credentials
        const genieacsUrl = process.env.GENIEACS_URL;
        const auth = {
            username: process.env.GENIEACS_USERNAME,
            password: process.env.GENIEACS_PASSWORD
        };
        
        // Periksa apakah sender terdaftar di sistem
        let deviceId = await getDeviceIdByWhatsApp(sender, formatWhatsAppNumber);
        const isAdmin = isAdminWhatsApp(sender, formatWhatsAppNumber, SETTINGS_FILE);
        
        // Jika bukan admin dan tidak terdaftar, tolak
        if (!deviceId && !isAdmin) {
            return WHATSAPP_MESSAGES.NOT_REGISTERED(settings);
        }
        
        // Periksa apakah pesan adalah perintah yang valid
        // Buat array dari semua perintah yang valid
        const allValidCommands = Object.values(WHATSAPP_COMMANDS).flat();
        
        // Periksa apakah command ada dalam daftar perintah yang valid
        const isValidCommand = allValidCommands.includes(command);
        
        // Jika bukan perintah yang valid, abaikan pesan
        if (!isValidCommand) {
            console.log(`Mengabaikan pesan yang bukan perintah valid: ${command}`);
            return null;
        }
        
        // Proses perintah
        if (WHATSAPP_COMMANDS.HELP.includes(command)) {
            return WHATSAPP_MESSAGES.HELP(settings, isAdmin);
        }
        
        // Perintah status - cek status perangkat
        else if (WHATSAPP_COMMANDS.STATUS.includes(command)) {
            // Jika admin dan ada parameter nomor pelanggan
            if (isAdmin && params) {
                // Cari deviceId berdasarkan nomor pelanggan
                const customerDeviceId = await getDeviceIdByWhatsApp(params, formatWhatsAppNumber);
                if (customerDeviceId) {
                    deviceId = customerDeviceId;
                } else {
                    return WHATSAPP_MESSAGES.getFormattedMessage('Pelanggan Tidak Ditemukan', `Pelanggan dengan nomor ${params} tidak ditemukan.`, settings);
                }
            }
            
            if (!deviceId) {
                return WHATSAPP_MESSAGES.NOT_REGISTERED(settings);
            }
            
            // Ambil status perangkat
            return await getDeviceStatusMessage(deviceId, genieacsUrl, auth, getDeviceStatus, formatUptime, getParameterWithPaths, parameterPaths);
        }
        
        // Perintah untuk mengubah SSID 2.4G
        else if (WHATSAPP_COMMANDS.SSID_2G.includes(command)) {
            if (!params) {
                return WHATSAPP_MESSAGES.getFormattedMessage('Informasi', "Mohon berikan nama SSID 2.4G baru. Contoh: *ssid2g NamaWiFiBaru*", settings);
            }
            
            // Jika admin dan format perintah: ssid2g [nomor_pelanggan] [ssid_baru]
            if (isAdmin && originalParams.split(' ').length > 1) {
                const customerNumber = originalParams.split(' ')[0];
                // Gunakan parameter asli untuk mempertahankan huruf kapital dan karakter khusus
                // Ambil nilai asli tanpa diubah menjadi huruf kecil
                // Pisahkan nomor pelanggan dari nilai SSID
                // PENTING: Gunakan originalParts (bukan parts yang sudah di-lowercase)
                const newSsid = preserveCase(originalParts.slice(2).join(' '));
                console.log(`Admin setting SSID 2.4G with preserved case: '${newSsid}'`);
                
                // Cari deviceId berdasarkan nomor pelanggan
                const customerDeviceId = await getDeviceIdByWhatsApp(customerNumber, formatWhatsAppNumber);
                if (customerDeviceId) {
                    deviceId = customerDeviceId;
                    return await updateWifiSettingViaWhatsApp(deviceId, 'ssid2G', newSsid, genieacsUrl, auth, true, customerNumber);
                } else {
                    return WHATSAPP_MESSAGES.getFormattedMessage('Pelanggan Tidak Ditemukan', `Pelanggan dengan nomor ${customerNumber} tidak ditemukan.`, settings);
                }
            }
            
            if (!deviceId) {
                return WHATSAPP_MESSAGES.NOT_REGISTERED(settings);
            }
            
            // Update SSID 2.4G dengan mempertahankan huruf kapital dan karakter khusus
            // PENTING: Gunakan originalParts (bukan parts yang sudah di-lowercase)
            const ssidValueRaw = originalParts.slice(1).join(' '); // Ambil semua kecuali perintah
            const ssidValue = preserveCase(ssidValueRaw);
            console.log(`User setting SSID 2.4G with preserved case: '${ssidValue}'`);
            console.log(`Original input: '${ssidValueRaw}', After preserveCase: '${ssidValue}'`);
            return await updateWifiSettingViaWhatsApp(deviceId, 'ssid2G', ssidValue, genieacsUrl, auth);
        }
        
        // Perintah untuk mengubah SSID 5G
        else if (WHATSAPP_COMMANDS.SSID_5G.includes(command)) {
            if (!params) {
                return WHATSAPP_MESSAGES.getFormattedMessage('Informasi', "Mohon berikan nama SSID 5G baru. Contoh: *ssid5g NamaWiFiBaru*", settings);
            }
            
            // Jika admin dan format perintah: ssid5g [nomor_pelanggan] [ssid_baru]
            if (isAdmin && originalParams.split(' ').length > 1) {
                const customerNumber = originalParams.split(' ')[0];
                // Gunakan parameter asli untuk mempertahankan huruf kapital dan karakter khusus
                // Ambil nilai asli tanpa diubah menjadi huruf kecil
                // Pisahkan nomor pelanggan dari nilai SSID
                // PENTING: Gunakan originalParts (bukan parts yang sudah di-lowercase)
                const newSsid = preserveCase(originalParts.slice(2).join(' '));
                console.log(`Admin setting SSID 2.4G with preserved case: '${newSsid}'`);
                
                // Cari deviceId berdasarkan nomor pelanggan
                const customerDeviceId = await getDeviceIdByWhatsApp(customerNumber, formatWhatsAppNumber);
                if (customerDeviceId) {
                    deviceId = customerDeviceId;
                    return await updateWifiSettingViaWhatsApp(deviceId, 'ssid5G', newSsid, genieacsUrl, auth, true, customerNumber);
                } else {
                    return WHATSAPP_MESSAGES.getFormattedMessage('Pelanggan Tidak Ditemukan', `Pelanggan dengan nomor ${customerNumber} tidak ditemukan.`, settings);
                }
            }
            
            if (!deviceId) {
                return WHATSAPP_MESSAGES.NOT_REGISTERED(settings);
            }
            
            // Update SSID 5G dengan mempertahankan huruf kapital dan karakter khusus
            // PENTING: Gunakan originalParts (bukan parts yang sudah di-lowercase)
            const ssidValueRaw = originalParts.slice(1).join(' '); // Ambil semua kecuali perintah
            const ssidValue = preserveCase(ssidValueRaw);
            console.log(`User setting SSID 5G with preserved case: '${ssidValue}'`);
            console.log(`Original input: '${ssidValueRaw}', After preserveCase: '${ssidValue}'`);
            return await updateWifiSettingViaWhatsApp(deviceId, 'ssid5G', ssidValue, genieacsUrl, auth);
        }
        
        // Perintah untuk mengubah password WiFi 2.4G
        else if (WHATSAPP_COMMANDS.PASSWORD_2G.includes(command)) {
            if (!params) {
                return WHATSAPP_MESSAGES.getFormattedMessage('Informasi', "Mohon berikan password WiFi 2.4G baru. Contoh: *pass2g PasswordBaru*", settings);
            }
            
            // Jika admin dan format perintah: pass2g [nomor_pelanggan] [password_baru]
            if (isAdmin && originalParams.split(' ').length > 1) {
                const customerNumber = originalParams.split(' ')[0];
                // Gunakan parameter asli untuk mempertahankan huruf kapital dan karakter khusus
                // Ambil nilai asli tanpa diubah menjadi huruf kecil
                // Pisahkan nomor pelanggan dari nilai password
                // PENTING: Gunakan originalParts (bukan parts yang sudah di-lowercase)
                const newPassword = preserveCase(originalParts.slice(2).join(' '));
                console.log(`Admin setting password with preserved case: '${newPassword}'`);
                
                // Cari deviceId berdasarkan nomor pelanggan
                const customerDeviceId = await getDeviceIdByWhatsApp(customerNumber, formatWhatsAppNumber);
                if (customerDeviceId) {
                    deviceId = customerDeviceId;
                    return await updateWifiSettingViaWhatsApp(deviceId, 'password2G', newPassword, genieacsUrl, auth, true, customerNumber);
                } else {
                    return WHATSAPP_MESSAGES.getFormattedMessage('Pelanggan Tidak Ditemukan', `Pelanggan dengan nomor ${customerNumber} tidak ditemukan.`, settings);
                }
            }
            
            if (!deviceId) {
                return WHATSAPP_MESSAGES.NOT_REGISTERED(settings);
            }
            
            // Update Password 2.4G dengan mempertahankan huruf kapital dan karakter khusus
            // PENTING: Gunakan originalParts (bukan parts yang sudah di-lowercase)
            const passwordValueRaw = originalParts.slice(1).join(' '); // Ambil semua kecuali perintah
            const passwordValue = preserveCase(passwordValueRaw);
            console.log(`User setting Password 2.4G with preserved case: '${passwordValue}'`);
            console.log(`Original input: '${passwordValueRaw}', After preserveCase: '${passwordValue}'`);
            return await updateWifiSettingViaWhatsApp(deviceId, 'password2G', passwordValue, genieacsUrl, auth);
        }
        
        // Perintah untuk mengubah password WiFi 5G
        else if (WHATSAPP_COMMANDS.PASSWORD_5G.includes(command)) {
            if (!params) {
                return WHATSAPP_MESSAGES.getFormattedMessage('Informasi', "Mohon berikan password WiFi 5G baru. Contoh: *pass5g PasswordBaru*", settings);
            }
            
            // Jika admin dan format perintah: pass5g [nomor_pelanggan] [password_baru]
            if (isAdmin && originalParams.split(' ').length > 1) {
                const customerNumber = originalParams.split(' ')[0];
                // Gunakan parameter asli untuk mempertahankan huruf kapital dan karakter khusus
                // Ambil nilai asli tanpa diubah menjadi huruf kecil
                // Pisahkan nomor pelanggan dari nilai password
                // PENTING: Gunakan originalParts (bukan parts yang sudah di-lowercase)
                const newPassword = preserveCase(originalParts.slice(2).join(' '));
                console.log(`Admin setting password with preserved case: '${newPassword}'`);
                
                // Cari deviceId berdasarkan nomor pelanggan
                const customerDeviceId = await getDeviceIdByWhatsApp(customerNumber, formatWhatsAppNumber);
                if (customerDeviceId) {
                    deviceId = customerDeviceId;
                    return await updateWifiSettingViaWhatsApp(deviceId, 'password5G', newPassword, genieacsUrl, auth, true, customerNumber);
                } else {
                    return WHATSAPP_MESSAGES.getFormattedMessage('Pelanggan Tidak Ditemukan', `Pelanggan dengan nomor ${customerNumber} tidak ditemukan.`, settings);
                }
            }
            
            if (!deviceId) {
                return WHATSAPP_MESSAGES.NOT_REGISTERED(settings);
            }
            
            // Update password WiFi 5G dengan mempertahankan huruf kapital dan karakter khusus
            // PENTING: Gunakan originalParts (bukan parts yang sudah di-lowercase)
            const passwordValue = originalParts.slice(1).join(' '); // Ambil semua kecuali perintah
            console.log(`User setting password 5G with preserved case: '${passwordValue}'`);
            return await updateWifiSettingViaWhatsApp(deviceId, 'password5G', passwordValue, genieacsUrl, auth);
        }
        
        // Perintah untuk melihat perangkat terhubung
        else if (WHATSAPP_COMMANDS.CONNECTED_DEVICES.includes(command)) {
            // Jika admin dan ada parameter nomor pelanggan
            if (isAdmin && params) {
                // Cari deviceId berdasarkan nomor pelanggan
                const customerDeviceId = await getDeviceIdByWhatsApp(params, formatWhatsAppNumber);
                if (customerDeviceId) {
                    deviceId = customerDeviceId;
                } else {
                    return WHATSAPP_MESSAGES.getFormattedMessage('Pelanggan Tidak Ditemukan', `Pelanggan dengan nomor ${params} tidak ditemukan.`, settings);
                }
            }
            
            if (!deviceId) {
                return WHATSAPP_MESSAGES.NOT_REGISTERED(settings);
            }
            
            // Ambil daftar perangkat terhubung
            return await getConnectedDevicesMessage(deviceId, genieacsUrl, auth, getParameterWithPaths, parameterPaths);
        }
        
        // Perintah untuk melihat daftar perangkat dan nomor pelanggan (khusus admin)
        else if (WHATSAPP_COMMANDS.LIST_DEVICES.includes(command)) {
            // Hanya admin yang boleh menggunakan perintah ini
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY(settings);
            }
            
            // Ambil daftar semua perangkat dan nomor pelanggan
            return await getDeviceListMessage(genieacsUrl, auth);
        }
        
        // Perintah untuk reboot perangkat (khusus admin)
        else if (WHATSAPP_COMMANDS.REBOOT.includes(command)) {
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY(settings);
            }
            
            // Admin harus menyediakan nomor pelanggan
            if (!params) {
                return "Mohon berikan nomor pelanggan yang akan di-reboot. Contoh: *reboot 081234567890*";
            }
            
            // Cari deviceId berdasarkan nomor pelanggan
            const customerDeviceId = await getDeviceIdByWhatsApp(params, formatWhatsAppNumber);
            if (!customerDeviceId) {
                return `Pelanggan dengan nomor ${params} tidak ditemukan.`;
            }
            
            // Reboot perangkat
            return await rebootDevice(customerDeviceId, genieacsUrl, auth);
        }
        
        // Perintah untuk melihat informasi pengguna (khusus admin)
        else if (WHATSAPP_COMMANDS.USER_INFO.includes(command)) {
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY;
            }
            
            // Admin harus menyediakan nomor pelanggan
            if (!params) {
                return "Mohon berikan nomor pelanggan. Contoh: *userinfo 081234567890*";
            }
            
            // Cari deviceId berdasarkan nomor pelanggan
            const customerDeviceId = await getDeviceIdByWhatsApp(params, formatWhatsAppNumber);
            if (!customerDeviceId) {
                return `Pelanggan dengan nomor ${params} tidak ditemukan.`;
            }
            
            // Ambil informasi pengguna
            return await getUserInfoMessage(customerDeviceId, genieacsUrl, auth, getParameterWithPaths, parameterPaths, getRxPowerClass);
        }
        
        // Perintah Mikrotik - Tambah user hotspot
        else if (WHATSAPP_COMMANDS.ADD_HOTSPOT.includes(command)) {
            // Hanya admin yang boleh menggunakan perintah ini
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY(settings);
            }
            
            // Format perintah: addhotspot username password [profile]
            const parts = params.split(' ');
            if (parts.length < 2) {
                return WHATSAPP_MESSAGES.getFormattedMessage('Informasi', 'Format perintah salah. Gunakan: *addhotspot username password [profile]*', settings);
            }
            
            const username = parts[0];
            const password = parts[1];
            const profile = parts.length > 2 ? parts[2] : 'default';
            
            try {
                const result = await mikrotikHandler.addHotspotUser(username, password, profile);
                return WHATSAPP_MESSAGES.getFormattedMessage(
                    result.success ? 'Berhasil' : 'Gagal', 
                    result.message, 
                    settings
                );
            } catch (error) {
                console.error('Error adding hotspot user:', error);
                return WHATSAPP_MESSAGES.getFormattedMessage('Gagal', `Gagal menambahkan user hotspot: ${error.message || JSON.stringify(error)}`, settings);
            }
        }
        
        // Perintah Mikrotik - Hapus user hotspot
        else if (WHATSAPP_COMMANDS.DELETE_HOTSPOT.includes(command)) {
            // Hanya admin yang boleh menggunakan perintah ini
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY(settings);
            }
            
            // Format perintah: delhotspot username
            if (!params) {
                return WHATSAPP_MESSAGES.getFormattedMessage('Informasi', 'Format perintah salah. Gunakan: *delhotspot username*', settings);
            }
            
            const username = params.trim();
            
            try {
                const result = await mikrotikHandler.deleteHotspotUser(username);
                return WHATSAPP_MESSAGES.getFormattedMessage(
                    result.success ? 'Berhasil' : 'Gagal', 
                    result.message, 
                    settings
                );
            } catch (error) {
                console.error('Error deleting hotspot user:', error);
                return WHATSAPP_MESSAGES.getFormattedMessage('Gagal', `Gagal menghapus user hotspot: ${error.message || JSON.stringify(error)}`, settings);
            }
        }
        
        // Perintah Mikrotik - Tambah secret PPPoE
        else if (WHATSAPP_COMMANDS.ADD_PPPOE.includes(command)) {
            // Hanya admin yang boleh menggunakan perintah ini
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY(settings);
            }
            
            // Format perintah: addpppoe username password [profile]
            const parts = params.split(' ');
            if (parts.length < 2) {
                return WHATSAPP_MESSAGES.getFormattedMessage('Informasi', 'Format perintah salah. Gunakan: *addpppoe username password [profile]*', settings);
            }
            
            const username = parts[0];
            const password = parts[1];
            const profile = parts.length > 2 ? parts[2] : 'default';
            
            try {
                const result = await mikrotikHandler.addPPPoESecret(username, password, profile);
                return WHATSAPP_MESSAGES.getFormattedMessage(
                    result.success ? 'Berhasil' : 'Gagal', 
                    result.message, 
                    settings
                );
            } catch (error) {
                console.error('Error adding PPPoE secret:', error);
                return WHATSAPP_MESSAGES.getFormattedMessage('Gagal', `Gagal menambahkan secret PPPoE: ${error.message || JSON.stringify(error)}`, settings);
            }
        }
        
        // Perintah Mikrotik - Hapus secret PPPoE
        else if (WHATSAPP_COMMANDS.DELETE_PPPOE.includes(command)) {
            // Hanya admin yang boleh menggunakan perintah ini
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY(settings);
            }
            
            // Format perintah: delpppoe username
            if (!params) {
                return WHATSAPP_MESSAGES.getFormattedMessage('Informasi', 'Format perintah salah. Gunakan: *delpppoe username*', settings);
            }
            
            const username = params.trim();
            
            try {
                const result = await mikrotikHandler.deletePPPoESecret(username);
                return WHATSAPP_MESSAGES.getFormattedMessage(
                    result.success ? 'Berhasil' : 'Gagal', 
                    result.message, 
                    settings
                );
            } catch (error) {
                console.error('Error deleting PPPoE secret:', error);
                return WHATSAPP_MESSAGES.getFormattedMessage('Gagal', `Gagal menghapus secret PPPoE: ${error.message || JSON.stringify(error)}`, settings);
            }
        }
        
        // Perintah Mikrotik - Ubah profile PPPoE
        else if (WHATSAPP_COMMANDS.SET_PROFILE.includes(command)) {
            // Hanya admin yang boleh menggunakan perintah ini
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY(settings);
            }
            
            // Format perintah: setprofile username profile
            const parts = params.split(' ');
            if (parts.length < 2) {
                return WHATSAPP_MESSAGES.getFormattedMessage('Informasi', 'Format perintah salah. Gunakan: *setprofile username profile*', settings);
            }
            
            const username = parts[0];
            const profile = parts[1];
            
            try {
                const result = await mikrotikHandler.setPPPoEProfile(username, profile);
                return WHATSAPP_MESSAGES.getFormattedMessage(
                    result.success ? 'Berhasil' : 'Gagal', 
                    result.message, 
                    settings
                );
            } catch (error) {
                console.error('Error setting PPPoE profile:', error);
                return WHATSAPP_MESSAGES.getFormattedMessage('Gagal', `Gagal mengubah profile PPPoE: ${error.message || JSON.stringify(error)}`, settings);
            }
        }
        
        // Perintah Mikrotik - Lihat daftar profile PPPoE
        else if (WHATSAPP_COMMANDS.LIST_PROFILES.includes(command)) {
            // Hanya admin yang boleh menggunakan perintah ini
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY(settings);
            }
            
            try {
                const result = await mikrotikHandler.listPPPoEProfiles();
                return WHATSAPP_MESSAGES.getFormattedMessage(
                    'Daftar Profile PPPoE', 
                    result.message, 
                    settings
                );
            } catch (error) {
                console.error('Error listing PPPoE profiles:', error);
                return WHATSAPP_MESSAGES.getFormattedMessage('Gagal', `Gagal mendapatkan daftar profile PPPoE: ${error.message || JSON.stringify(error)}`, settings);
            }
        }
        
        // Perintah Mikrotik - Lihat daftar user hotspot
        else if (WHATSAPP_COMMANDS.LIST_HOTSPOT.includes(command)) {
            // Hanya admin yang boleh menggunakan perintah ini
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY(settings);
            }
            
            try {
                const result = await mikrotikHandler.listHotspotUsers();
                return WHATSAPP_MESSAGES.getFormattedMessage(
                    'Daftar User Hotspot', 
                    result.message, 
                    settings
                );
            } catch (error) {
                console.error('Error listing hotspot users:', error);
                return WHATSAPP_MESSAGES.getFormattedMessage('Gagal', `Gagal mendapatkan daftar user hotspot: ${error.message || JSON.stringify(error)}`, settings);
            }
        }
        
        // Perintah Mikrotik - Lihat daftar secret PPPoE
        else if (WHATSAPP_COMMANDS.LIST_PPPOE.includes(command)) {
            // Hanya admin yang boleh menggunakan perintah ini
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY(settings);
            }
            
            try {
                const result = await mikrotikHandler.listPPPoESecrets();
                return WHATSAPP_MESSAGES.getFormattedMessage(
                    'Daftar Secret PPPoE', 
                    result.message, 
                    settings
                );
            } catch (error) {
                console.error('Error listing PPPoE secrets:', error);
                return WHATSAPP_MESSAGES.getFormattedMessage('Gagal', `Gagal mendapatkan daftar secret PPPoE: ${error.message || JSON.stringify(error)}`, settings);
            }
        }
        
        // Perintah Mikrotik - Lihat daftar user PPPoE yang offline
        else if (WHATSAPP_COMMANDS.LIST_OFFLINE_PPPOE.includes(command)) {
            // Hanya admin yang boleh menggunakan perintah ini
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY(settings);
            }
            
            try {
                const result = await mikrotikHandler.listOfflinePPPoEUsers();
                return WHATSAPP_MESSAGES.getFormattedMessage(
                    'Daftar User PPPoE Offline', 
                    result.message, 
                    settings
                );
            } catch (error) {
                console.error('Error listing offline PPPoE users:', error);
                return WHATSAPP_MESSAGES.getFormattedMessage('Gagal', `Gagal mendapatkan daftar user PPPoE offline: ${error.message || JSON.stringify(error)}`, settings);
            }
        }
        
        // Perintah Mikrotik - Lihat informasi resource router
        else if (WHATSAPP_COMMANDS.ROUTER_RESOURCE.includes(command)) {
            // Hanya admin yang boleh menggunakan perintah ini
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY(settings);
            }
            
            try {
                const result = await mikrotikHandler.getRouterResource();
                return WHATSAPP_MESSAGES.getFormattedMessage(
                    'Informasi Resource Router', 
                    result.message, 
                    settings
                );
            } catch (error) {
                console.error('Error getting router resource:', error);
                return WHATSAPP_MESSAGES.getFormattedMessage('Gagal', `Gagal mendapatkan informasi resource router: ${error.message || JSON.stringify(error)}`, settings);
            }
        }
        
        // Perintah Mikrotik - Lihat penggunaan bandwidth
        else if (WHATSAPP_COMMANDS.BANDWIDTH_USAGE.includes(command)) {
            // Hanya admin yang boleh menggunakan perintah ini
            if (!isAdmin) {
                return WHATSAPP_MESSAGES.ADMIN_ONLY(settings);
            }
            
            try {
                const result = await mikrotikHandler.getBandwidthUsage();
                return WHATSAPP_MESSAGES.getFormattedMessage(
                    'Informasi Bandwidth Router', 
                    result.message, 
                    settings
                );
            } catch (error) {
                console.error('Error getting bandwidth usage:', error);
                return WHATSAPP_MESSAGES.getFormattedMessage('Gagal', `Gagal mendapatkan informasi bandwidth router: ${error.message || JSON.stringify(error)}`, settings);
            }
        }
        
        // Perintah tidak dikenali
        else {
            return WHATSAPP_MESSAGES.INVALID_COMMAND(settings);
        }
    } catch (error) {
        console.error('Error processing WhatsApp message:', error);
        // Baca pengaturan untuk header dan footer
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (err) {
            console.error('Error reading settings:', err);
            settings = {};
        }
        
        return WHATSAPP_MESSAGES.ERROR(error.message, settings);
    }
}

module.exports = {
    WHATSAPP_COMMANDS,
    WHATSAPP_MESSAGES,
    getDeviceIdByWhatsApp,
    isAdminWhatsApp,
    getDeviceStatusMessage,
    updateWifiSettingViaWhatsApp,
    rebootDevice,
    getConnectedDevicesMessage,
    getUserInfoMessage,
    getDeviceListMessage,
    sendNotificationToCustomer,
    processWhatsAppMessage
};
