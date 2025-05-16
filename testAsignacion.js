// testAsignacion.js
const fetch = require('node-fetch');

const URL_ASIGNAR = 'http://localhost:3000/api/servicios/asignar';
const URL_VERIFICAR = 'http://localhost:3000/api/servicios/detalle';
const serviciosSeleccionados = [1, 2]; // IDs de servicios a asignar
const trabajador = 'carlos@empresa.com';

(async () => {
    console.log('⏳ Intentando asignar servicios...');

    try {
        // 1️⃣ Enviar la solicitud de asignación
        const response = await fetch(URL_ASIGNAR, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                servicios: serviciosSeleccionados,
                trabajador,
            }),
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✅ Asignación realizada correctamente:', data.mensaje);

            // 2️⃣ Verificar el estado en la base de datos
            console.log('⏳ Verificando estado en la base de datos...');

            for (const id of serviciosSeleccionados) {
                const res = await fetch(`${URL_VERIFICAR}/${id}`);
                const detalle = await res.json();

                if (detalle.atendido_por === trabajador && detalle.estado === 'En proceso') {
                    console.log(`✅ Servicio ${id} asignado correctamente a ${trabajador}`);
                } else {
                    console.log(`❌ Servicio ${id} no se actualizó correctamente.`);
                }
            }
        } else {
            console.log('❌ Error en la asignación:', data.error || 'Error desconocido');
        }
    } catch (error) {
        console.error('❌ Error al probar la asignación:', error.message);
    }
})();
