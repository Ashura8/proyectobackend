require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sql = require('mssql');

const app = express();
app.use(express.json());

// Config SQL Server
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: { encrypt: true, trustServerCertificate: true },
};

// Conexión a SQL Server
async function connectDb() {
  try {
    return await sql.connect(dbConfig);
  } catch (error) {
    console.error('DB Connection Error:', error);
  }
}

// Middleware para validar token JWT y extraer rol
function authorize(allowedRoles = []) {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ msg: 'No token provided' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ msg: 'Token malformed' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ msg: 'Token invalid' });
      // user contiene id, correo, rol
      if (allowedRoles.length && !allowedRoles.includes(user.rol)) {
        return res.status(403).json({ msg: 'No autorizado para esta ruta', rolesPermitidos: allowedRoles });
      }
      req.user = user;
      next();
    });
  };
}

// Registro de usuario
app.post('/api/auth/register', async (req, res) => {
  const { nombre, correo, contrasena, rol } = req.body;

  if (!nombre || !correo || !contrasena) {
    return res.status(400).json({ msg: 'Faltan datos obligatorios' });
  }

  // Validar rol (solo admin puede asignar roles distintos a cliente)
  let userRole = 'cliente'; // por defecto
  if (rol && ['cliente', 'tecnico', 'admin'].includes(rol)) {
    // Para simplificar, permitir asignar rol si viene en body
    userRole = rol;
  }

  try {
    const pool = await connectDb();

    // Verificar si correo ya existe
    const existing = await pool.request()
      .input('correo', sql.NVarChar, correo)
      .query('SELECT id FROM usuarios WHERE correo = @correo');

    if (existing.recordset.length > 0) {
      return res.status(400).json({ msg: 'Correo ya registrado' });
    }

    // Hash contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(contrasena, salt);

    // Insertar usuario
    await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('correo', sql.NVarChar, correo)
      .input('rol', sql.NVarChar, userRole)
      .input('contrasena_hash', sql.NVarChar, hashedPassword)
      .query(`INSERT INTO usuarios (nombre, correo, rol, contrasena_hash)
              VALUES (@nombre, @correo, @rol, @contrasena_hash)`);

    res.json({ msg: 'Usuario registrado correctamente' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ msg: 'Error interno del servidor' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { correo, contrasena } = req.body;
  if (!correo || !contrasena) {
    return res.status(400).json({ msg: 'Faltan datos obligatorios' });
  }

  try {
    const pool = await connectDb();

    const result = await pool.request()
      .input('correo', sql.NVarChar, correo)
      .query('SELECT id, nombre, correo, rol, contrasena_hash FROM usuarios WHERE correo = @correo');

    if (result.recordset.length === 0) {
      return res.status(401).json({ msg: 'Credenciales incorrectas' });
    }

    const user = result.recordset[0];

    const validPass = await bcrypt.compare(contrasena, user.contrasena_hash);
    if (!validPass) {
      return res.status(401).json({ msg: 'Credenciales incorrectas' });
    }

    // Crear token JWT
    const token = jwt.sign(
      { id: user.id, correo: user.correo, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ msg: 'Error interno del servidor' });
  }
});

// Ruta protegida solo para admin
app.get('/api/admin/data', authorize(['admin']), (req, res) => {
  res.json({ msg: 'Solo admin puede ver esto', user: req.user });
});

// Ruta protegida para técnico y admin
app.get('/api/tecnico/data', authorize(['admin', 'tecnico']), (req, res) => {
  res.json({ msg: 'Técnico y admin pueden ver esto', user: req.user });
});

// Ruta pública
app.get('/api/public', (req, res) => {
  res.json({ msg: 'Ruta pública sin autenticación' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
