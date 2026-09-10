import { Link } from 'react-router-dom';

export default function Terminos() {
  return (
    <div className="min-h-screen bg-[#EDF6F4]">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link to="/landing" className="text-[#00ADBB] font-bold text-xl tracking-tight">Vitalis</Link>
          <span className="text-gray-300">|</span>
          <span className="text-gray-600 text-sm">Términos y Condiciones</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div className="bg-white rounded-2xl shadow-sm p-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Términos y Condiciones</h1>
            <p className="text-gray-500 text-sm mt-1">Última actualización: 1 de septiembre de 2026</p>
          </div>

          <Section title="1. Aceptación de los términos">
            <p>
              Al acceder y utilizar la plataforma Vitalis (<strong>agendavitalis.app</strong>), aceptás los presentes Términos y Condiciones. Si no estás de acuerdo con alguno de estos términos, no utilices la plataforma.
            </p>
          </Section>

          <Section title="2. Descripción del servicio">
            <p>
              Vitalis es una plataforma SaaS (Software como Servicio) de gestión para centros de salud que incluye:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Sistema de agenda y turnos online</li>
              <li>Historia clínica digital</li>
              <li>Gestión de obras sociales y cobros</li>
              <li>Portal público de reservas para pacientes</li>
              <li>Asistente virtual por WhatsApp con inteligencia artificial</li>
              <li>Módulos de reportes y análisis financiero</li>
            </ul>
          </Section>

          <Section title="3. Registro y cuenta">
            <p>
              Para utilizar la plataforma, el centro de salud debe registrarse proporcionando información veraz y actualizada. El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso y de todas las actividades realizadas desde su cuenta.
            </p>
            <p>Vitalis se reserva el derecho de suspender o cancelar cuentas que violen estos términos.</p>
          </Section>

          <Section title="4. Planes y pagos">
            <p>
              El acceso a Vitalis está sujeto al pago de una suscripción mensual o semestral según el plan elegido (Starter, Profesional o Premium). Los precios vigentes se informan en <Link to="/landing#precios" className="text-[#00ADBB] hover:underline">agendavitalis.app/landing</Link>.
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Los pagos se procesan a través de MercadoPago.</li>
              <li>Las suscripciones se renuevan automáticamente salvo cancelación previa.</li>
              <li>No se realizan reembolsos por períodos parciales.</li>
              <li>Vitalis puede modificar los precios con 30 días de aviso previo.</li>
            </ul>
          </Section>

          <Section title="5. Datos de pacientes y responsabilidad">
            <p>
              El centro de salud es responsable como "responsable del tratamiento" de los datos personales de sus pacientes ingresados en la plataforma, conforme a la Ley 25.326 de Protección de Datos Personales de Argentina.
            </p>
            <p>
              Vitalis actúa como "encargado del tratamiento" y se compromete a procesar dichos datos únicamente según las instrucciones del centro y a implementar medidas de seguridad adecuadas.
            </p>
          </Section>

          <Section title="6. Uso aceptable">
            <p>El usuario se compromete a no:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Utilizar la plataforma para actividades ilegales o no autorizadas.</li>
              <li>Intentar acceder a datos de otros centros o usuarios.</li>
              <li>Introducir virus, malware o cualquier código malicioso.</li>
              <li>Realizar ingeniería inversa o intentar reproducir el software.</li>
              <li>Revender o sublicenciar el acceso a la plataforma a terceros.</li>
            </ul>
          </Section>

          <Section title="7. Disponibilidad del servicio">
            <p>
              Vitalis se compromete a mantener una disponibilidad del servicio del 99% mensual. Podrán realizarse interrupciones programadas para mantenimiento, con aviso previo siempre que sea posible.
            </p>
            <p>No garantizamos disponibilidad ininterrumpida en casos de fuerza mayor, fallas de terceros proveedores o causas fuera de nuestro control.</p>
          </Section>

          <Section title="8. Propiedad intelectual">
            <p>
              Todos los derechos de propiedad intelectual sobre la plataforma Vitalis, incluyendo código fuente, diseño, marca y contenidos propios, son propiedad exclusiva de Vitalis. El uso de la plataforma no otorga al usuario ningún derecho sobre dichos elementos.
            </p>
          </Section>

          <Section title="9. Limitación de responsabilidad">
            <p>
              Vitalis no será responsable por daños indirectos, incidentales, especiales o consecuentes derivados del uso o la imposibilidad de uso de la plataforma. La responsabilidad total de Vitalis frente al cliente no superará el monto abonado en los últimos 3 meses de servicio.
            </p>
          </Section>

          <Section title="10. Cancelación del servicio">
            <p>
              El usuario puede cancelar su suscripción en cualquier momento contactando a <a href="mailto:info@agendavitalis.app" className="text-[#00ADBB] hover:underline">info@agendavitalis.app</a>. La cuenta permanecerá activa hasta el final del período abonado.
            </p>
            <p>
              Vitalis puede cancelar el servicio por incumplimiento de estos términos, con notificación previa salvo en casos de violación grave.
            </p>
          </Section>

          <Section title="11. Modificaciones">
            <p>
              Vitalis se reserva el derecho de modificar estos Términos y Condiciones. Los cambios significativos serán notificados con al menos 15 días de anticipación. El uso continuado de la plataforma tras la notificación implica la aceptación de los nuevos términos.
            </p>
          </Section>

          <Section title="12. Ley aplicable y jurisdicción">
            <p>
              Estos términos se rigen por las leyes de la República Argentina. Para cualquier controversia, las partes se someten a la jurisdicción de los tribunales ordinarios de la Ciudad de Buenos Aires.
            </p>
          </Section>

          <Section title="13. Contacto">
            <p>
              Para consultas sobre estos términos: <a href="mailto:info@agendavitalis.app" className="text-[#00ADBB] hover:underline">info@agendavitalis.app</a>
            </p>
          </Section>
        </div>

        <div className="text-center">
          <Link to="/politica-privacidad" className="text-[#00ADBB] hover:underline text-sm">Ver Política de Privacidad →</Link>
        </div>
      </main>

      <footer className="text-center py-6 text-gray-400 text-xs">
        © {new Date().getFullYear()} Vitalis. Todos los derechos reservados.
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-2">{title}</h2>
      <div className="text-gray-600 text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
