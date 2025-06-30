// mikrotik-handler.js
// File untuk menangani koneksi dan operasi Mikrotik API

const RouterOSAPI = require('node-routeros').RouterOSAPI;
const fs = require('fs');
const path = require('path');

// Fungsi untuk membuat koneksi ke Mikrotik
async function createMikrotikConnection() {
    try {
        // Baca pengaturan dari settings.json - selalu baca ulang untuk mendapatkan pengaturan terbaru
        let settings;
        try {
            const settingsFile = path.join(process.cwd(), 'settings.json');
            settings = JSON.parse(fs.readFileSync(settingsFile));
        } catch (err) {
            console.error('Error membaca settings.json:', err);
            settings = {};
        }
        
        // Gunakan pengaturan dari settings.json jika tersedia, jika tidak gunakan .env
        const mikrotikSettings = settings?.mikrotik || {};
        const host = mikrotikSettings.host || process.env.MIKROTIK_HOST || '192.168.8.1';
        const port = mikrotikSettings.port || process.env.MIKROTIK_PORT || 8728;
        const username = mikrotikSettings.username || process.env.MIKROTIK_USERNAME || 'admin';
        const password = mikrotikSettings.password || process.env.MIKROTIK_PASSWORD || 'password';
        const enabled = mikrotikSettings.enabled !== undefined ? mikrotikSettings.enabled : true;
        
        if (!enabled) {
            throw new Error('Mikrotik API dinonaktifkan dalam pengaturan');
        }

        console.log(`Connecting to Mikrotik at ${host}:${port} with username ${username}`);
        
        // Buat konfigurasi koneksi menggunakan node-routeros
        const conn = new RouterOSAPI({
            host: host,
            port: parseInt(port),
            user: username,
            password: password,
            timeout: 10000 // 10 detik timeout
        });
        
        // Connect ke router
        await conn.connect();
        console.log('Connected to Mikrotik');
        
        return conn;
    } catch (error) {
        console.error('Error creating Mikrotik connection:', error);
        throw error;
    }
}

// Fungsi untuk menambahkan user hotspot
async function addHotspotUser(username, password, profile = 'default') {
    let conn;
    try {
        conn = await createMikrotikConnection();
        
        // Tambahkan user hotspot
        await conn.write('/ip/hotspot/user/add', [
            '=name=' + username,
            '=password=' + password,
            '=profile=' + profile
        ]);
        
        console.log(`Hotspot user ${username} added successfully`);
        
        // Tutup koneksi
        conn.close();
        
        return {
            success: true,
            message: `Username : ${username}\nPassword : ${password}\nProfile  : ${profile}`
        };
    } catch (error) {
        console.error('Error in addHotspotUser:', error);
        
        // Tutup koneksi jika masih terbuka
        if (conn) {
            try {
                conn.close();
            } catch (e) {
                console.error('Error closing connection:', e);
            }
        }
        
        return {
            success: false,
            message: `Gagal menambahkan user hotspot: ${error.message || JSON.stringify(error)}`
        };
    }
}

// Fungsi untuk menghapus user hotspot
async function deleteHotspotUser(username) {
    let conn;
    try {
        conn = await createMikrotikConnection();
        
        // Cari user hotspot berdasarkan username
        const users = await conn.write('/ip/hotspot/user/print', [
            '?name=' + username
        ]);
        
        // Jika user ditemukan
        if (users && users.length > 0) {
            const userId = users[0]['.id'];
            
            // Hapus user berdasarkan ID
            await conn.write('/ip/hotspot/user/remove', [
                '=.id=' + userId
            ]);
            
            console.log(`Hotspot user ${username} deleted successfully`);
            
            // Tutup koneksi
            conn.close();
            
            return {
                success: true,
                message: `User hotspot ${username} berhasil dihapus`
            };
        } else {
            console.error(`Hotspot user ${username} not found`);
            
            // Tutup koneksi
            conn.close();
            
            return {
                success: false,
                message: `User hotspot ${username} tidak ditemukan`
            };
        }
    } catch (error) {
        console.error('Error in deleteHotspotUser:', error);
        
        // Tutup koneksi jika masih terbuka
        if (conn) {
            try {
                conn.close();
            } catch (e) {
                console.error('Error closing connection:', e);
            }
        }
        
        return {
            success: false,
            message: `Gagal menghapus user hotspot: ${error.message || JSON.stringify(error)}`
        };
    }
}

// Fungsi untuk menambahkan secret PPPoE
async function addPPPoESecret(username, password, profile = 'default', localAddress = '', remoteAddress = '') {
    let conn;
    try {
        conn = await createMikrotikConnection();
        
        // Siapkan parameter untuk penambahan secret PPPoE
        const params = [
            '=name=' + username,
            '=password=' + password,
            '=profile=' + profile,
            '=service=pppoe'
        ];
        
        // Tambahkan local-address dan remote-address jika disediakan
        if (localAddress) params.push('=local-address=' + localAddress);
        if (remoteAddress) params.push('=remote-address=' + remoteAddress);
        
        // Tambahkan secret PPPoE
        await conn.write('/ppp/secret/add', params);
        
        console.log(`PPPoE secret ${username} added successfully`);
        
        // Tutup koneksi
        conn.close();
        
        return {
            success: true,
            message: `Username : ${username}\nPassword : ${password}\nProfile  : ${profile}`
        };
    } catch (error) {
        console.error('Error in addPPPoESecret:', error);
        
        // Tutup koneksi jika masih terbuka
        if (conn) {
            try {
                conn.close();
            } catch (e) {
                console.error('Error closing connection:', e);
            }
        }
        
        return {
            success: false,
            message: `Gagal menambahkan secret PPPoE: ${error.message || JSON.stringify(error)}`
        };
    }
}

// Fungsi untuk menghapus secret PPPoE
async function deletePPPoESecret(username) {
    let conn;
    try {
        conn = await createMikrotikConnection();
        
        // Cari secret PPPoE berdasarkan username
        const secrets = await conn.write('/ppp/secret/print', [
            '?name=' + username
        ]);
        
        // Jika secret ditemukan
        if (secrets && secrets.length > 0) {
            const secretId = secrets[0]['.id'];
            
            // Hapus secret berdasarkan ID
            await conn.write('/ppp/secret/remove', [
                '=.id=' + secretId
            ]);
            
            console.log(`PPPoE secret ${username} deleted successfully`);
            
            // Tutup koneksi
            conn.close();
            
            return {
                success: true,
                message: `Secret PPPoE ${username} berhasil dihapus`
            };
        } else {
            console.error(`PPPoE secret ${username} not found`);
            
            // Tutup koneksi
            conn.close();
            
            return {
                success: false,
                message: `Secret PPPoE ${username} tidak ditemukan`
            };
        }
    } catch (error) {
        console.error('Error in deletePPPoESecret:', error);
        
        // Tutup koneksi jika masih terbuka
        if (conn) {
            try {
                conn.close();
            } catch (e) {
                console.error('Error closing connection:', e);
            }
        }
        
        return {
            success: false,
            message: `Gagal menghapus secret PPPoE: ${error.message || JSON.stringify(error)}`
        };
    }
}

// Fungsi untuk mengubah profile PPPoE
async function setPPPoEProfile(username, newProfile) {
    let conn;
    try {
        conn = await createMikrotikConnection();
        
        // Cari secret PPPoE berdasarkan username
        const secrets = await conn.write('/ppp/secret/print', [
            '?name=' + username
        ]);
        
        // Jika secret ditemukan
        if (secrets && secrets.length > 0) {
            const secretId = secrets[0]['.id'];
            
            // Update profile berdasarkan ID
            await conn.write('/ppp/secret/set', [
                '=.id=' + secretId,
                '=profile=' + newProfile
            ]);
            
            console.log(`PPPoE profile for ${username} updated to ${newProfile} successfully`);
            
            // Cari dan hapus sesi aktif untuk user ini agar terhubung kembali dengan profile baru
            try {
                // Cari active connection untuk username ini
                const activeConnections = await conn.write('/ppp/active/print', [
                    '?name=' + username
                ]);
                
                if (activeConnections && activeConnections.length > 0) {
                    // Hapus semua sesi aktif untuk username ini
                    for (const connection of activeConnections) {
                        await conn.write('/ppp/active/remove', [
                            '=.id=' + connection['.id']
                        ]);
                        console.log(`Active PPPoE session for ${username} has been terminated`);
                    }
                    
                    // Tambahkan informasi ke pesan sukses dengan format yang lebih terstruktur
                    const successMessage = `Username : ${username}\nProfile : ${newProfile}\n\nSesi aktif telah dihapus, perangkat akan terhubung kembali dengan profile baru.`;
                    
                    // Tutup koneksi
                    conn.close();
                    
                    return {
                        success: true,
                        message: successMessage
                    };
                }
            } catch (sessionError) {
                console.error('Error terminating active sessions:', sessionError);
                // Lanjutkan meskipun gagal menghapus sesi
            }
            
            // Tutup koneksi
            conn.close();
            
            return {
                success: true,
                message: `Username : ${username}\nProfile : ${newProfile}`
            };
        } else {
            console.error(`PPPoE secret ${username} not found`);
            
            // Tutup koneksi
            conn.close();
            
            return {
                success: false,
                message: `Secret PPPoE ${username} tidak ditemukan`
            };
        }
    } catch (error) {
        console.error('Error in setPPPoEProfile:', error);
        
        // Tutup koneksi jika masih terbuka
        if (conn) {
            try {
                conn.close();
            } catch (e) {
                console.error('Error closing connection:', e);
            }
        }
        
        return {
            success: false,
            message: `Gagal mengubah profile PPPoE: ${error.message || JSON.stringify(error)}`
        };
    }
}

// Fungsi untuk mendapatkan daftar profile PPPoE
async function listPPPoEProfiles() {
    let conn;
    try {
        conn = await createMikrotikConnection();
        
        // Dapatkan daftar profile PPPoE
        const profiles = await conn.write('/ppp/profile/print');
        
        // Tutup koneksi
        conn.close();
        
        if (profiles && profiles.length > 0) {
            const formattedProfiles = profiles.map(profile => ({
                name: profile.name,
                localAddress: profile['local-address'] || '',
                remoteAddress: profile['remote-address'] || '',
                rateLimit: profile['rate-limit'] || ''
            }));
            
            console.log(`Found ${formattedProfiles.length} PPPoE profiles`);
            
            let message = `*Daftar Profile PPPoE*\n\n`;
            formattedProfiles.forEach(profile => {
                message += `📌 *${profile.name}*\n`;
                if (profile.rateLimit) message += `   Rate Limit: ${profile.rateLimit}\n`;
                if (profile.localAddress) message += `   Local Address: ${profile.localAddress}\n`;
                if (profile.remoteAddress) message += `   Remote Address: ${profile.remoteAddress}\n`;
                message += `\n`;
            });
            
            return {
                success: true,
                message: message,
                profiles: formattedProfiles
            };
        } else {
            return {
                success: true,
                message: `Tidak ada profile PPPoE yang ditemukan`,
                profiles: []
            };
        }
    } catch (error) {
        console.error('Error in listPPPoEProfiles:', error);
        
        // Tutup koneksi jika masih terbuka
        if (conn) {
            try {
                conn.close();
            } catch (e) {
                console.error('Error closing connection:', e);
            }
        }
        
        return {
            success: false,
            message: `Gagal mendapatkan daftar profile PPPoE: ${error.message || JSON.stringify(error)}`
        };
    }
}

// Fungsi untuk mendapatkan daftar user hotspot yang aktif
async function listHotspotUsers() {
    let conn;
    try {
        conn = await createMikrotikConnection();
        
        // Dapatkan daftar user hotspot yang aktif
        const activeUsers = await conn.write('/ip/hotspot/active/print');
        
        console.log(`Found ${activeUsers ? activeUsers.length : 0} active hotspot users`);
        
        if (activeUsers && activeUsers.length > 0) {
            // Dapatkan informasi tambahan untuk setiap user aktif
            const formattedUsers = activeUsers.map(user => ({
                name: user.user || user.name,
                address: user.address || '',
                uptime: user.uptime || '0s',
                macAddress: user['mac-address'] || '',
                loginBy: user['login-by'] || '',
                comment: user.comment || ''
            }));
            
            let message = `*Daftar User Hotspot Aktif*\n\n`;
            message += `Total user aktif: ${formattedUsers.length}\n\n`;
            
            formattedUsers.forEach(user => {
                message += `👤 *${user.name}*\n`;
                message += `   IP Address: ${user.address}\n`;
                message += `   Uptime: ${user.uptime}\n`;
                if (user.macAddress) message += `   MAC: ${user.macAddress}\n`;
                if (user.loginBy) message += `   Login via: ${user.loginBy}\n`;
                
                // Cek apakah comment berisi format tanggal (apr/18/2025 14:55:20)
                if (user.comment) {
                    const dateRegex = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\/\d{1,2}\/\d{4}\s\d{1,2}:\d{1,2}:\d{1,2}/i;
                    if (dateRegex.test(user.comment)) {
                        message += `   Masa aktif: ${user.comment}\n`;
                    } else {
                        message += `   Ket: ${user.comment}\n`;
                    }
                }
                
                message += `\n`;
            });
            
            // Tutup koneksi
            conn.close();
            
            return {
                success: true,
                message: message,
                users: formattedUsers
            };
        } else {
            // Tutup koneksi
            conn.close();
            
            return {
                success: true,
                message: `Tidak ada user hotspot yang aktif saat ini`,
                users: []
            };
        }
    } catch (error) {
        console.error('Error in listHotspotUsers:', error);
        
        // Tutup koneksi jika masih terbuka
        if (conn) {
            try {
                conn.close();
            } catch (e) {
                console.error('Error closing connection:', e);
            }
        }
        
        return {
            success: false,
            message: `Gagal mendapatkan daftar user hotspot aktif: ${error.message || JSON.stringify(error)}`
        };
    }
}

// Fungsi untuk mendapatkan daftar secret PPPoE
async function listPPPoESecrets() {
    let conn;
    try {
        conn = await createMikrotikConnection();
        
        // Dapatkan daftar secret PPPoE
        const secrets = await conn.write('/ppp/secret/print');
        
        // Tutup koneksi
        conn.close();
        
        if (secrets && secrets.length > 0) {
            const formattedSecrets = secrets.map(secret => ({
                name: secret.name,
                profile: secret.profile,
                service: secret.service,
                disabled: secret.disabled === 'true',
                comment: secret.comment || ''
            }));
            
            console.log(`Found ${formattedSecrets.length} PPPoE secrets`);
            
            let message = `*Daftar Secret PPPoE*\n\n`;
            formattedSecrets.forEach(secret => {
                message += `🔑 *${secret.name}*\n`;
                message += `   Profile: ${secret.profile}\n`;
                message += `   Service: ${secret.service}\n`;
                message += `   Status: ${secret.disabled ? 'Disabled' : 'Enabled'}\n`;
                
                // Cek apakah comment berisi format tanggal (apr/18/2025 14:55:20)
                if (secret.comment) {
                    const dateRegex = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\/\d{1,2}\/\d{4}\s\d{1,2}:\d{1,2}:\d{1,2}/i;
                    if (dateRegex.test(secret.comment)) {
                        message += `   Masa aktif: ${secret.comment}\n`;
                    } else {
                        message += `   Ket: ${secret.comment}\n`;
                    }
                }
                
                message += `\n`;
            });
            
            return {
                success: true,
                message: message,
                secrets: formattedSecrets
            };
        } else {
            return {
                success: true,
                message: `Tidak ada secret PPPoE yang ditemukan`,
                secrets: []
            };
        }
    } catch (error) {
        console.error('Error in listPPPoESecrets:', error);
        
        // Tutup koneksi jika masih terbuka
        if (conn) {
            try {
                conn.close();
            } catch (e) {
                console.error('Error closing connection:', e);
            }
        }
        
        return {
            success: false,
            message: `Gagal mendapatkan daftar secret PPPoE: ${error.message || JSON.stringify(error)}`
        };
    }
}

// Fungsi untuk mendapatkan daftar user PPPoE yang offline
async function listOfflinePPPoEUsers() {
    let conn;
    try {
        conn = await createMikrotikConnection();
        
        // Dapatkan semua secret PPPoE
        const allSecrets = await conn.write('/ppp/secret/print', [
            '?service=pppoe'
        ]);
        
        // Dapatkan semua koneksi PPPoE aktif
        const activeConnections = await conn.write('/ppp/active/print', [
            '?service=pppoe'
        ]);
        
        // Tutup koneksi
        conn.close();
        
        // Filter secret yang tidak ada di koneksi aktif (offline)
        const activeUsernames = activeConnections.map(conn => conn.name);
        const offlineSecrets = allSecrets.filter(secret => 
            !activeUsernames.includes(secret.name) && 
            secret.disabled !== 'true'
        );
        
        console.log(`Found ${offlineSecrets.length} offline PPPoE users`);
        
        if (offlineSecrets.length > 0) {
            const formattedSecrets = offlineSecrets.map(secret => ({
                name: secret.name,
                profile: secret.profile,
                lastLogout: secret['last-logged-out'] || 'Unknown',
                comment: secret.comment || ''
            }));
            
            let message = `*Daftar User PPPoE Offline*\n\n`;
            formattedSecrets.forEach(secret => {
                message += `🔴 *${secret.name}*\n`;
                message += `   Profile: ${secret.profile}\n`;
                if (secret.lastLogout && secret.lastLogout !== 'Unknown') {
                    message += `   Terakhir Online: ${secret.lastLogout}\n`;
                }
                if (secret.comment) {
                    message += `   Keterangan: ${secret.comment}\n`;
                }
                message += `\n`;
            });
            
            return {
                success: true,
                message: message,
                offlineUsers: formattedSecrets
            };
        } else {
            return {
                success: true,
                message: `Semua user PPPoE sedang online. Tidak ada user yang offline.`,
                offlineUsers: []
            };
        }
    } catch (error) {
        console.error('Error in listOfflinePPPoEUsers:', error);
        
        // Tutup koneksi jika masih terbuka
        if (conn) {
            try {
                conn.close();
            } catch (e) {
                console.error('Error closing connection:', e);
            }
        }
        
        return {
            success: false,
            message: `Gagal mendapatkan daftar user PPPoE offline: ${error.message || JSON.stringify(error)}`
        };
    }
}

// Fungsi untuk mendapatkan informasi resource router Mikrotik
async function getRouterResource() {
    let conn;
    try {
        conn = await createMikrotikConnection();
        
        // Dapatkan informasi resource
        const resource = await conn.write('/system/resource/print');
        
        // Dapatkan informasi health (suhu, voltase, dll)
        const health = await conn.write('/system/health/print');
        
        // Dapatkan informasi uptime
        const identity = await conn.write('/system/identity/print');
        
        // Dapatkan informasi interface
        const interfaces = await conn.write('/interface/print', [
            '?running=true'
        ]);
        
        // Tutup koneksi
        conn.close();
        
        if (resource && resource.length > 0) {
            const resourceInfo = resource[0];
            const healthInfo = health && health.length > 0 ? health[0] : {};
            const identityInfo = identity && identity.length > 0 ? identity[0] : {};
            
            // Format CPU load dan memory usage
            const cpuLoad = resourceInfo['cpu-load'] ? `${resourceInfo['cpu-load']}%` : 'N/A';
            const memoryUsed = resourceInfo['free-memory'] && resourceInfo['total-memory'] ? 
                Math.round((1 - resourceInfo['free-memory'] / resourceInfo['total-memory']) * 100) : 'N/A';
            const diskUsed = resourceInfo['free-hdd-space'] && resourceInfo['total-hdd-space'] ? 
                Math.round((1 - resourceInfo['free-hdd-space'] / resourceInfo['total-hdd-space']) * 100) : 'N/A';
            
            // Format uptime
            const uptime = resourceInfo.uptime || 'N/A';
            
            // Format active interfaces
            const activeInterfacesCount = interfaces ? interfaces.length : 0;
            
            let interfaceList = '';
            if (interfaces && interfaces.length > 0) {
                interfaces.slice(0, 5).forEach(iface => {
                    interfaceList += `      - ${iface.name}${iface.comment ? ` (${iface.comment})` : ''}\n`;
                });
                
                if (interfaces.length > 5) {
                    interfaceList += `      - ... dan ${interfaces.length - 5} interface lainnya\n`;
                }
            }
            
            // Buat pesan
            let message = `*Informasi Resource Router*\n\n`;
            message += `💻 *Router:* ${identityInfo.name || 'Mikrotik Router'}\n\n`;
            message += `🔥 *CPU & Memory:*\n`;
            message += `   - CPU Load: ${cpuLoad}\n`;
            message += `   - Memory Usage: ${memoryUsed}%\n`;
            message += `   - Disk Usage: ${diskUsed}%\n\n`;
            
            message += `🕒 *Uptime:* ${uptime}\n\n`;
            
            if (healthInfo) {
                message += `🧡 *Health:*\n`;
                if (healthInfo.temperature) message += `   - Temperature: ${healthInfo.temperature}°C\n`;
                if (healthInfo.voltage) message += `   - Voltage: ${healthInfo.voltage}V\n`;
                if (healthInfo['cpu-temperature']) message += `   - CPU Temp: ${healthInfo['cpu-temperature']}°C\n`;
                message += `\n`;
            }
            
            message += `📶 *Network:*\n`;
            message += `   - Active Interfaces: ${activeInterfacesCount}\n`;
            if (interfaceList) {
                message += `${interfaceList}\n`;
            }
            
            return {
                success: true,
                message: message,
                resource: {
                    cpuLoad,
                    memoryUsed,
                    diskUsed,
                    uptime,
                    temperature: healthInfo.temperature,
                    voltage: healthInfo.voltage,
                    activeInterfaces: activeInterfacesCount
                }
            };
        } else {
            return {
                success: false,
                message: `Tidak dapat mendapatkan informasi resource router`
            };
        }
    } catch (error) {
        console.error('Error in getRouterResource:', error);
        
        // Tutup koneksi jika masih terbuka
        if (conn) {
            try {
                conn.close();
            } catch (e) {
                console.error('Error closing connection:', e);
            }
        }
        
        return {
            success: false,
            message: `Gagal mendapatkan informasi resource router: ${error.message || JSON.stringify(error)}`
        };
    }
}

// Fungsi untuk mendapatkan informasi bandwidth usage
async function getBandwidthUsage() {
    let conn;
    try {
        conn = await createMikrotikConnection();
        
        // Dapatkan daftar interface
        const interfaces = await conn.write('/interface/print');
        
        // Tutup koneksi setelah mendapatkan daftar interface
        conn.close();
        
        if (interfaces && interfaces.length > 0) {
            // Filter interface yang ingin ditampilkan (maksimal 5)
            // Prioritaskan interface yang penting seperti ether1, wlan, dll
            const mainInterfaces = [];
            
            // Cari interface WAN (biasanya ether1)
            const wanInterface = interfaces.find(iface => 
                iface.name === 'ether1' || 
                (iface.comment && iface.comment.toLowerCase().includes('wan'))
            );
            if (wanInterface) mainInterfaces.push(wanInterface);
            
            // Cari interface wireless
            const wlanInterfaces = interfaces.filter(iface => 
                iface.type === 'wlan' || 
                iface.name.startsWith('wlan')
            ).slice(0, 1); // Ambil maksimal 1 interface wireless
            mainInterfaces.push(...wlanInterfaces);
            
            // Cari interface PPPoE
            const pppoeInterfaces = interfaces.filter(iface => 
                iface.name.startsWith('pppoe-out')
            ).slice(0, 1); // Ambil maksimal 1 interface PPPoE
            mainInterfaces.push(...pppoeInterfaces);
            
            // Tambahkan interface ethernet lainnya jika masih kurang dari 5
            const etherInterfaces = interfaces.filter(iface => 
                iface.type === 'ether' && 
                iface.name !== 'ether1' && 
                !mainInterfaces.includes(iface)
            ).slice(0, 5 - mainInterfaces.length);
            mainInterfaces.push(...etherInterfaces);
            
            // Tambahkan interface bridge jika masih kurang dari 5
            if (mainInterfaces.length < 5) {
                const bridgeInterfaces = interfaces.filter(iface => 
                    iface.type === 'bridge' && 
                    !mainInterfaces.includes(iface)
                ).slice(0, 5 - mainInterfaces.length);
                mainInterfaces.push(...bridgeInterfaces);
            }
            
            // Jika masih kurang dari 5, tambahkan interface lainnya
            if (mainInterfaces.length < 5) {
                const otherInterfaces = interfaces.filter(iface => 
                    !mainInterfaces.includes(iface) && 
                    iface.running === 'true'
                ).slice(0, 5 - mainInterfaces.length);
                mainInterfaces.push(...otherInterfaces);
            }
            
            let message = `*Informasi Bandwidth Router*\n\n`;
            
            // Jika tidak ada interface yang ditemukan
            if (mainInterfaces.length === 0) {
                message += `Tidak ada interface yang tersedia untuk monitoring bandwidth.\n`;
                return {
                    success: true,
                    message: message
                };
            }
            
            // Buat koneksi baru untuk setiap interface untuk menghindari ambiguitas
            for (const iface of mainInterfaces) {
                try {
                    // Buat koneksi baru untuk setiap interface
                    const newConn = await createMikrotikConnection();
                    
                    try {
                        // Gunakan .id untuk mengidentifikasi interface secara unik
                        const ifaceStats = await newConn.write('/interface/monitor-traffic', [
                            `=interface=${iface['.id']}`,
                            '=once='
                        ]);
                        
                        if (ifaceStats && ifaceStats.length > 0) {
                            const stat = ifaceStats[0];
                            
                            // Konversi ke format yang lebih mudah dibaca
                            const rxSpeed = formatBitsPerSecond(stat['rx-bits-per-second'] || 0);
                            const txSpeed = formatBitsPerSecond(stat['tx-bits-per-second'] || 0);
                            
                            message += `📰 *${iface.name}*${iface.comment ? ` (${iface.comment})` : ''}:\n`;
                            message += `   - Download: ${rxSpeed}\n`;
                            message += `   - Upload: ${txSpeed}\n\n`;
                        }
                    } catch (statError) {
                        console.error(`Error getting stats for ${iface.name}:`, statError);
                    } finally {
                        // Tutup koneksi setelah selesai
                        try {
                            newConn.close();
                        } catch (closeError) {
                            console.error(`Error closing connection for ${iface.name}:`, closeError);
                        }
                    }
                } catch (connError) {
                    console.error(`Error creating connection for ${iface.name}:`, connError);
                }
            }
            
            return {
                success: true,
                message: message
            };
        } else {
            return {
                success: false,
                message: `Tidak dapat mendapatkan daftar interface router`
            };
        }
    } catch (error) {
        console.error('Error in getBandwidthUsage:', error);
        
        // Tutup koneksi jika masih terbuka
        if (conn) {
            try {
                conn.close();
            } catch (e) {
                console.error('Error closing connection:', e);
            }
        }
        
        return {
            success: false,
            message: `Gagal mendapatkan informasi bandwidth router: ${error.message || JSON.stringify(error)}`
        };
    }
}

// Helper function untuk memformat bits per second
function formatBitsPerSecond(bps) {
    if (bps < 1000) {
        return `${bps.toFixed(1)} bps`;
    } else if (bps < 1000000) {
        return `${(bps / 1000).toFixed(1)} Kbps`;
    } else if (bps < 1000000000) {
        return `${(bps / 1000000).toFixed(1)} Mbps`;
    } else {
        return `${(bps / 1000000000).toFixed(1)} Gbps`;
    }
}

module.exports = {
    addHotspotUser,
    deleteHotspotUser,
    addPPPoESecret,
    deletePPPoESecret,
    setPPPoEProfile,
    listPPPoEProfiles,
    listHotspotUsers,
    listPPPoESecrets,
    listOfflinePPPoEUsers,
    getRouterResource,
    getBandwidthUsage
};
