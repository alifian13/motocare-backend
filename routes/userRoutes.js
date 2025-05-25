// userRoutes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const { User, Vehicle, sequelize } = require('../models'); // Pastikan model diimpor dengan benar
// Pastikan path ke authMiddleware dan database.js/sequelize instance sudah benar
const authMiddleware = require('../utils/authMiddleware'); // Jika di folder middleware
// const authMiddleware = require('../utils/authMiddleware'); // Jika di folder utils
const multer = require('multer');
const path = require('path');
// const fs = require('fs'); // Jika Anda perlu menghapus file (misalnya saat error)

const router = express.Router();

// --- Konfigurasi Multer (Sudah Benar) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Pastikan folder ini ada, atau buat secara dinamis jika perlu
    const uploadPath = 'uploads/profile_pictures/';
    // fs.mkdirSync(uploadPath, { recursive: true }); // Untuk membuat folder jika belum ada
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, req.user.id + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  }
}).single('profilePicture');

function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb('Error: Hanya gambar (jpeg, jpg, png, gif) yang diperbolehkan!');
  }
}

// --- Fungsi Helper untuk Logo (Sudah Benar) ---
function getLogoUrl(brand, model) {
  let logoUrl = null;
  const brandLower = brand.toLowerCase();
  const modelLower = model.toLowerCase();

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
    if (modelLower.includes('nexii') || modelLower.includes('nex ii') || modelLower.includes('nex 2')) logoUrl = '/logos/suzuki_nexii.png';
  }
  return logoUrl;
}

// --- User Registration ---
// POST /api/users/register
router.post('/register', async (req, res) => {
  const {
    name, email, password, address,
    plate_number, brand, model, current_odometer, last_service_date
  } = req.body;

  if (!name || !email || !password || !plate_number || !brand || !model) {
    return res.status(400).json({ message: 'Kolom wajib tidak boleh kosong.' });
  }

  const t = await sequelize.transaction(); // Mulai transaksi

  try {
    const existingUser = await User.findOne({ where: { email: email } }, { transaction: t });
    if (existingUser) {
      await t.rollback();
      return res.status(409).json({ message: 'Email sudah terdaftar.' });
    }

    // 1. Buat user terlebih dahulu
    const newUser = await User.create({
      name,
      email,
      password_hash: password, // Password mentah, akan di-hash oleh hook User.beforeCreate
      address: address || null,
    }, { transaction: t });

    // 2. Dapatkan URL logo
    const logoUrlForVehicle = getLogoUrl(brand, model);

    // 3. Baru buat kendaraan menggunakan newUser.user_id
    const newVehicle = await Vehicle.create({
      user_id: newUser.user_id, // Gunakan user_id dari newUser yang baru dibuat
      plate_number,
      brand,
      model,
      current_odometer: current_odometer || 0,
      last_service_date: last_service_date || null,
      logo_url: logoUrlForVehicle,
      last_odometer_update: new Date(),
    }, { transaction: t });

    await t.commit(); // Commit transaksi jika semua berhasil

    res.status(201).json({
      message: 'Pengguna dan kendaraan berhasil didaftarkan!',
      user: {
        user_id: newUser.user_id,
        name: newUser.name,
        email: newUser.email,
        address: newUser.address
      },
      vehicle: {
        vehicle_id: newVehicle.vehicle_id,
        plate_number: newVehicle.plate_number,
        brand: newVehicle.brand,
        model: newVehicle.model,
        logo_url: newVehicle.logo_url
      }
    });

  } catch (error) {
    await t.rollback(); // Rollback jika ada error
    console.error('Error registrasi:', error);
    if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
      const messages = error.errors.map(e => e.message);
      return res.status(400).json({ message: 'Validasi gagal atau data duplikat.', errors: messages });
    }
    res.status(500).json({ message: 'Error server saat registrasi.', error: error.message });
  }
});

// --- User Login (Sudah Benar) ---
router.post('/login', async (req, res) => {
  // ... (kode login Anda yang sudah ada, terlihat sudah benar)
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password wajib diisi.' });
  }

  try {
    const user = await User.findOne({ where: { email: email } });

    if (!user) {
      return res.status(401).json({ message: 'Kredensial tidak valid (email salah).' });
    }

    const isMatch = await user.isValidPassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Kredensial tidak valid (password salah).' });
    }

    const payload = {
      user: {
        id: user.user_id,
        name: user.name,
        email: user.email
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) {
            console.error("Error signing JWT:", err);
            return res.status(500).json({ message: 'Gagal membuat token.' });
        }
        // Kirim data user yang relevan (tanpa password)
        res.json({
          message: 'Login berhasil!',
          token,
          user: { // Pastikan data user yang dikirim relevan dan aman
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            address: user.address,
            photo_url: user.photo_url // Kirim juga photo_url jika ada
          }
        });
      }
    );
  } catch (error) {
    console.error('Error login:', error);
    res.status(500).json({ message: 'Error server saat login.', error: error.message });
  }
});

// --- Endpoint Profil (Sudah Benar) ---
router.get('/profile', authMiddleware, async (req, res) => { /* ... kode Anda ... */ });
router.put('/profile', authMiddleware, async (req, res) => { /* ... kode Anda ... */ });
router.post('/profile/picture', authMiddleware, (req, res) => { /* ... kode Anda ... */ });


module.exports = router;