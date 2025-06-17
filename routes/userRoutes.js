// routes/userRoutes.js

const express = require('express');
const jwt = require('jsonwebtoken');
const { User, Vehicle, ServiceHistory, sequelize } = require('../models');
const authMiddleware = require('../utils/authMiddleware');
const multer = require('multer');
const path = require('path');
const { generateInitialSchedules } = require('../utils/maintenanceScheduler');

const router = express.Router();

// =================================================================
// --- KONFIGURASI MULTER (SATU KALI & TERPUSAT) ---
// =================================================================

// 1. Konfigurasi Penyimpanan File
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Pastikan folder 'uploads/profile_pictures' ada di root backend Anda
    const uploadPath = 'uploads/profile_pictures/';
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Buat nama file yang unik menggunakan ID user dari token
    const userId = req.user.id; 
    cb(null, `user-${userId}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

// 2. Fungsi untuk Filter Tipe File (Hanya Gambar)
function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb('Error: Hanya file gambar (jpeg, jpg, png, gif) yang diizinkan!');
  }
}

// 3. Inisialisasi Multer dengan Konfigurasi di atas
// Variabel 'upload' ini akan kita gunakan sebagai middleware
const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // Batas ukuran file 2MB
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  }
});


// =================================================================
// --- FUNGSI HELPER & RUTE-RUTE ---
// =================================================================

// --- Fungsi Helper untuk Logo ---
function getLogoUrl(brand, model) {
  let logoUrl = null;
  const brandLower = brand ? brand.toLowerCase() : '';
  const modelLower = model ? model.toLowerCase() : '';

  if (brandLower === 'honda') {
    if (modelLower.includes('beat')) logoUrl = '/logos/honda_beat.png';
    else if (modelLower.includes('vario')) logoUrl = '/logos/honda_vario.png';
    else if (modelLower.includes('pcx')) logoUrl = '/logos/honda_pcx.png';
    else if (modelLower.includes('scoopy')) logoUrl = '/logos/honda_scoopy.png';
  } else if (brandLower === 'yamaha') {
    if (modelLower.includes('aerox')) logoUrl = '/logos/yamaha_aerox.png';
    else if (modelLower.includes('nmax')) logoUrl = '/logos/yamaha_nmax.png';
    else if (modelLower.includes('lexi')) logoUrl = '/logos/yamaha_lexi.png';
  } else if (brandLower === 'suzuki') {
    if (modelLower.includes('nex ii') || modelLower.includes('nex 2')) logoUrl = '/logos/suzuki_nexii.png';
  }
  return logoUrl;
}

// --- User Registration ---
router.post('/register', async (req, res) => {
    const {
        name, email, password, address,
        plate_number, brand, model, current_odometer, last_service_date
    } = req.body;

    if (!name || !email || !password || !plate_number || !brand || !model || current_odometer === undefined) {
        return res.status(400).json({ message: 'Data pengguna dan kendaraan utama tidak boleh kosong.' });
    }

    const t = await sequelize.transaction();

    try {
        const existingUser = await User.findOne({ where: { email: email } }, { transaction: t });
        if (existingUser) {
            await t.rollback();
            return res.status(409).json({ message: 'Email sudah terdaftar.' });
        }

        const newUser = await User.create({
            name,
            email,
            password_hash: password,
            address: address || null,
        }, { transaction: t });

        const logoUrlForVehicle = getLogoUrl(brand, model);

        const newVehicle = await Vehicle.create({
            user_id: newUser.user_id,
            plate_number,
            brand,
            model,
            current_odometer: parseInt(current_odometer, 10) || 0,
            last_service_date: last_service_date || null,
            logo_url: logoUrlForVehicle,
            last_odometer_update: new Date(),
        }, { transaction: t });

        const receivedInitialServices = req.body.initialServices;
        if (receivedInitialServices && Array.isArray(receivedInitialServices) && receivedInitialServices.length > 0) {
            for (const service of receivedInitialServices) {
                if (service.service_type && service.odometer_at_service !== undefined && service.service_date) {
                    await ServiceHistory.create({
                        vehicle_id: newVehicle.vehicle_id,
                        ...service
                    }, { transaction: t });
                }
            }
        }

        await generateInitialSchedules(newVehicle.vehicle_id, t);
        await t.commit();
        
        const payload = { user: { id: newUser.user_id, name: newUser.name, email: newUser.email } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            message: 'Pengguna dan kendaraan berhasil didaftarkan!',
            user: { user_id: newUser.user_id, name: newUser.name, email: newUser.email, address: newUser.address, photo_url: newUser.photo_url },
            vehicle: { vehicle_id: newVehicle.vehicle_id, plate_number: newVehicle.plate_number, brand: newVehicle.brand, model: newVehicle.model, current_odometer: newVehicle.current_odometer, logo_url: newVehicle.logo_url },
            token
        });

    } catch (error) {
        if (t && !t.finished && !t.rolledBack) {
            await t.rollback();
        }
        console.error('Error registrasi:', error);
        if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
            const messages = error.errors.map(e => e.message);
            return res.status(400).json({ message: 'Validasi gagal atau data duplikat.', errors: messages });
        }
        res.status(500).json({ message: 'Error server saat registrasi.', error: error.message });
    }
});


// --- User Login ---
router.post('/login', async (req, res) => {
    // ... (Logika login Anda yang sudah ada, tidak perlu diubah) ...
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email dan password wajib diisi.' });
    }
    try {
        const user = await User.findOne({ where: { email: email } });
        if (!user) {
            return res.status(401).json({ message: 'Kredensial tidak valid.' });
        }
        const isMatch = await user.isValidPassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Kredensial tidak valid.' });
        }
        const payload = { user: { id: user.user_id, name: user.name, email: user.email } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({
            message: 'Login berhasil!',
            token,
            user: {
                user_id: user.user_id,
                name: user.name,
                email: user.email,
                address: user.address,
                photo_url: user.photo_url
            }
        });
    } catch (error) {
        console.error('Error login:', error);
        res.status(500).json({ message: 'Error server saat login.', error: error.message });
    }
});

// --- Get User Profile ---
router.get('/profile', authMiddleware, async (req, res) => {
    // ... (Logika get profile Anda yang sudah ada, tidak perlu diubah) ...
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: ['user_id', 'name', 'email', 'address', 'photo_url', 'createdAt', 'updatedAt']
        });
        if (!user) {
            return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
        }
        res.json(user);
    } catch (error) {
        console.error('Error mengambil profil:', error);
        res.status(500).json({ message: 'Error server saat mengambil profil.', error: error.message });
    }
});

// --- Update User Profile (Nama, Alamat) ---
router.put('/profile/update', authMiddleware, async (req, res) => {
    // ... (Logika update profile Anda yang sudah ada, tidak perlu diubah) ...
    const { name, address } = req.body;
    const userId = req.user.id;

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
        }

        if (name !== undefined) user.name = name;
        if (address !== undefined) user.address = address;

        await user.save();
        res.json({ message: 'Profil berhasil diperbarui.', user: { name: user.name, address: user.address, email: user.email, photo_url: user.photo_url } });
    } catch (error) {
        console.error('Error update profil:', error);
        res.status(500).json({ message: 'Error server saat update profil.', error: error.message });
    }
});


// --- RUTE UPLOAD FOTO PROFIL (YANG DIPERBAIKI) ---
// Middleware `upload.single('profile_picture')` digunakan di sini
router.post('/profile/upload-picture', authMiddleware, upload.single('profile_picture'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Tidak ada file gambar yang diunggah.' });
    }

    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
        }

        // Simpan path relatif ke database
        const filePath = `/uploads/profile_pictures/${req.file.filename}`;
        user.photo_url = filePath;
        await user.save();

        res.status(200).json({
            message: 'Foto profil berhasil diunggah!',
            filePath: filePath
        });

    } catch (error) {
        console.error('Error saat menyimpan path foto profil:', error);
        res.status(500).json({ message: 'Gagal menyimpan foto profil ke database.' });
    }
}, (error, req, res, next) => {
    // Error handler khusus untuk menangkap error dari multer (misal: tipe file salah)
    res.status(400).json({ message: error.message });
});


module.exports = router;