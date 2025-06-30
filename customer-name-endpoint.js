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
        const currentTags = device._tags || {};
        console.log('Current tags:', currentTags);

        // Remove existing customerName tag if exists
        if (currentTags.customerName) {
            console.log('Removing tag: customerName');
            await axios.delete(`${process.env.GENIEACS_URL}/devices/${encodeURIComponent(deviceId)}/tags/customerName`, {
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                }
            });
        }

        // Add new customerName tag
        console.log('Adding new customerName tag:', customerName);
        await axios.post(`${process.env.GENIEACS_URL}/devices/${encodeURIComponent(deviceId)}/tags/customerName/${encodeURIComponent(customerName)}`, null, {
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
