// Backend optimizado para el sistema de gestión de inventario y servicios

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const sql = require('mssql');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuración de la base de datos
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// Inicialización de Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD
    }
});

// =========================
// 🚀 RUTAS API
// =========================

// 🔹 MÓDULO INVENTARIO
app.get('/api/inventario', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query('SELECT * FROM inventario');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener inventario', details: err.message || err });
    }
});

app.post('/api/inventario', async (req, res) => {
    const { tipo_producto, nombre_producto, marca, modelo, estado_producto, ubicacion, fecha_ingreso, fecha_ultimo_mantenimiento, observaciones } = req.body;
    if (!tipo_producto || !nombre_producto || !estado_producto || !ubicacion || !fecha_ingreso) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('tipo_producto', sql.VarChar, tipo_producto)
            .input('nombre_producto', sql.VarChar, nombre_producto)
            .input('marca', sql.VarChar, marca || null)
            .input('modelo', sql.VarChar, modelo || null)
            .input('estado_producto', sql.VarChar, estado_producto)
            .input('ubicacion', sql.VarChar, ubicacion)
            .input('fecha_ingreso', sql.DateTime, fecha_ingreso)
            .input('fecha_ultimo_mantenimiento', sql.DateTime, fecha_ultimo_mantenimiento || null)
            .input('observaciones', sql.Text, observaciones || null)
            .query('INSERT INTO inventario (tipo_producto, nombre_producto, marca, modelo, estado_producto, ubicacion, fecha_ingreso, fecha_ultimo_mantenimiento, observaciones) VALUES (@tipo_producto, @nombre_producto, @marca, @modelo, @estado_producto, @ubicacion, @fecha_ingreso, @fecha_ultimo_mantenimiento, @observaciones)');
        res.status(201).json({ message: 'Producto agregado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al agregar producto', details: error.message || error.toString() });
    }
});

// 🔹 MÓDULO CORREOS
app.post('/api/correos/enviar', async (req, res) => {
    const { destinatario, departamento, mensaje } = req.body;
    try {
        await transporter.sendMail({
            from: process.env.EMAIL,
            to: destinatario,
            subject: `Soporte Técnico - ${departamento}`,
            text: mensaje
        });
        res.status(200).json({ message: 'Correo enviado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al enviar correo', details: error.message || error.toString() });
    }
});

// 🔹 REGISTRAR SOLICITUD Y SERVICIO RELACIONADO
app.post('/api/solicitudes/registrar', async (req, res) => {
    const { departamento, tipoFalla, mensaje, reportadoPor } = req.body;

    if (!departamento || !tipoFalla || !mensaje || !reportadoPor) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    try {
        const pool = await sql.connect(dbConfig);
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        const resultSolicitud = await transaction.request()
            .input('departamento', sql.VarChar, departamento)
            .input('tipoFalla', sql.VarChar, tipoFalla)
            .input('mensaje', sql.Text, mensaje)
            .input('reportadoPor', sql.VarChar, reportadoPor)
            .input('estado', sql.VarChar, 'Pendiente')
            .input('fechaRegistro', sql.DateTime, new Date())
            .query(`
                INSERT INTO solicitudes (departamento, tipoFalla, mensaje, reportadoPor, estado, fechaRegistro)
                OUTPUT INSERTED.id
                VALUES (@departamento, @tipoFalla, @mensaje, @reportadoPor, @estado, @fechaRegistro)
            `);

        const idSolicitud = resultSolicitud.recordset[0].id;

        await transaction.request()
            .input('id_solicitud', sql.Int, idSolicitud)
            .input('estado', sql.VarChar, 'Pendiente')
            .query(`
                INSERT INTO servicios (id_solicitud, estado)
                VALUES (@id_solicitud, @estado)
            `);

        await transaction.commit();

        res.status(201).json({ message: 'Solicitud y servicio registrados correctamente', idSolicitud });
    } catch (error) {
        res.status(500).json({ error: 'Error al registrar la solicitud y el servicio', details: error.message || error.toString() });
    }
});

// 🔹 MÓDULO SERVICIOS - Obtener detalle de un servicio
app.get('/api/servicios/detalle/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await sql.connect(dbConfig);
        const result = await sql.query(`
            SELECT 
                s.id, s.estado, s.atendido_por, s.materiales_usados, s.fecha_atencion, s.tiempo_tardado,
                sol.departamento, sol.tipoFalla, sol.mensaje, sol.reportadoPor, sol.estado AS estado_solicitud, sol.fechaRegistro
            FROM 
                servicios s
            JOIN 
                solicitudes sol ON s.id_solicitud = sol.id
            WHERE 
                s.id = ${id}
        `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Servicio no encontrado' });
        }

        res.status(200).json(result.recordset[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener detalle del servicio', details: error.message || error.toString() });
    }
});

// 🔹 MÓDULO SERVICIOS - Obtener lista de servicios con datos relacionados
app.get('/api/servicios', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query(`
            SELECT 
                s.id,
                s.estado,
                s.atendido_por,
                s.materiales_usados,
                s.fecha_atencion,
                s.tiempo_tardado,
                sol.departamento,
                sol.tipoFalla,
                sol.mensaje AS mensaje_solicitud,
                sol.reportadoPor,
                inv.nombre_producto AS nombre_equipo,
                ce.destinatario AS correo_destinatario
            FROM 
                servicios s
            LEFT JOIN 
                solicitudes sol ON s.id_solicitud = sol.id
            LEFT JOIN 
                inventario inv ON s.id_inventario = inv.id
            LEFT JOIN 
                correos_enviados ce ON s.id_correo = ce.id
        `);

        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener servicios', details: err.message });
    }
});

// 🔹 ASIGNACIÓN DE SERVICIOS
app.post('/api/servicios/asignar', async (req, res) => {
    const { servicios, trabajador } = req.body;

    if (!servicios || servicios.length === 0 || !trabajador) {
        return res.status(400).json({ error: 'Faltan datos obligatorios para la asignación.' });
    }

    try {
        const pool = await sql.connect(dbConfig);
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        for (const id of servicios) {
            await transaction.request()
                .input('trabajador', sql.VarChar, trabajador)
                .input('id', sql.Int, id)
                .query(`
                    UPDATE servicios
                    SET atendido_por = @trabajador, estado = 'En Proceso'
                    WHERE id = @id
                `);
        }
        await transaction.commit();

        res.status(200).json({ mensaje: 'Servicios asignados correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al asignar servicios', details: error.message || error.toString() });
    }
});

// =========================
// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`🌐 Servidor escuchando en http://localhost:${PORT}`);
});
