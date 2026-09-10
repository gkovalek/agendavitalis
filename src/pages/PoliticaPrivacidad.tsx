import { Link } from 'react-router-dom';

export default function PoliticaPrivacidad() {
  return (
    <div className="min-h-screen bg-[#EDF6F4]">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link to="/landing" className="text-[#00ADBB] font-bold text-xl tracking-tight">Vitalis</Link>
          <span className="text-gray-300">|</span>
          <span className="text-gray-600 text-sm">Política de Privacidad</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div className="bg-white rounded-2xl shadow-sm p-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Política de Privacidad</h1>
            <p className="text-gray-500 text-sm mt-1">Última actualización: 1 de septiembre de 2026</p>
          </div>

          <Section title="1. Responsable del tratamiento">
            <p>
              <strong>Vitalis</strong> (en adelante "Vitalis", "nosotros" o "nuestro") es responsable del tratamiento de los datos personales recabados a través del sitio web <strong>agendavitalis.app</strong> y de la plataforma de gestión de centros de salud.
            </p>
            <p>Contacto: <a href="mailto:info@agendavitalis.app" className="text-[#00ADBB] hover:underline">info@agendavitalis.app</a></p>
          </Section>

          <Section title="2. Datos que recopilamos">
            <p>Recopilamos los siguientes tipos de datos personales:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Datos de registro:</strong> nombre, apellido, correo electrónico, teléfono y datos del centro de salud.</li>
              <li><strong>Datos de pacientes:</strong> nombre, apellido, fecha de nacimiento, obra social, teléfono, correo electrónico e historia clínica (gestionados por el centro de salud responsable).</li>
              <li><strong>Datos de pago:</strong> procesados a través de MercadoPago. No almacenamos datos de tarjetas de crédito/débito.</li>
              <li><strong>Datos de uso:</strong> información sobre cómo interactuás con la plataforma (páginas visitadas, acciones realizadas).</li>
              <li><strong>Datos de comunicación:</strong> mensajes de WhatsApp enviados a través de nuestro asistente virtual.</li>
              <li><strong>Cookies y tecnologías de seguimiento:</strong> incluido el Píxel de Meta para medir el rendimiento publicitario.</li>
            </ul>
          </Section>

          <Section title="3. Finalidad del tratamiento">
            <ul className="list-disc pl-6 space-y-1">
              <li>Proveer y mejorar los servicios de la plataforma.</li>
              <li>Gestionar la agenda, turnos e historia clínica de pacientes.</li>
              <li>Procesar pagos y emitir comprobantes.</li>
              <li>Enviar recordatorios de turnos por correo electrónico o WhatsApp.</li>
              <li>Medir el rendimiento de campañas publicitarias (mediante cookies y el Píxel de Meta).</li>
              <li>Cumplir con obligaciones legales y regulatorias.</li>
            </ul>
          </Section>

          <Section title="4. Base legal del tratamiento">
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Ejecución del contrato:</strong> para proveer los servicios contratados.</li>
              <li><strong>Interés legítimo:</strong> para mejorar la plataforma y medir el rendimiento publicitario.</li>
              <li><strong>Consentimiento:</strong> para el envío de comunicaciones de marketing y el uso de cookies no esenciales.</li>
              <li><strong>Cumplimiento legal:</strong> cuando la normativa vigente lo requiere.</li>
            </ul>
          </Section>

          <Section title="5. Uso del Píxel de Meta (Facebook)">
            <p>
              Nuestro sitio web utiliza el Píxel de Meta (ID: 1047029454902440) para medir la efectividad de nuestras campañas publicitarias en Facebook e Instagram. Esta tecnología recopila información sobre las acciones que los usuarios realizan en nuestro sitio, como visitas a páginas o registros completados.
            </p>
            <p>
              Los datos recopilados por el Píxel de Meta se procesan de acuerdo con la <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer" className="text-[#00ADBB] hover:underline">Política de privacidad de Meta</a>.
            </p>
            <p>Podés optar por no ser rastreado desactivando las cookies de terceros en la configuración de tu navegador o mediante las herramientas de opt-out de Meta.</p>
          </Section>

          <Section title="6. Compartición de datos con terceros">
            <p>Compartimos datos con los siguientes terceros, únicamente en la medida necesaria para proveer los servicios:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Supabase:</strong> almacenamiento de base de datos y autenticación.</li>
              <li><strong>MercadoPago:</strong> procesamiento de pagos.</li>
              <li><strong>Meta Platforms:</strong> medición publicitaria mediante el Píxel de Meta.</li>
              <li><strong>Resend:</strong> envío de correos electrónicos transaccionales.</li>
              <li><strong>Evolution API / Twilio:</strong> envío de mensajes de WhatsApp.</li>
              <li><strong>Anthropic:</strong> procesamiento del asistente virtual con inteligencia artificial.</li>
            </ul>
            <p>No vendemos ni cedemos datos personales a terceros con fines comerciales propios.</p>
          </Section>

          <Section title="7. Cookies">
            <p>Utilizamos cookies y tecnologías similares para:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Cookies esenciales:</strong> necesarias para el funcionamiento de la plataforma (sesión de usuario).</li>
              <li><strong>Cookies analíticas:</strong> para entender cómo se usa la plataforma.</li>
              <li><strong>Cookies publicitarias:</strong> Píxel de Meta para medir el rendimiento de anuncios.</li>
            </ul>
            <p>Podés gestionar las cookies desde la configuración de tu navegador.</p>
          </Section>

          <Section title="8. Retención de datos">
            <p>
              Conservamos los datos personales durante el tiempo necesario para cumplir con las finalidades descritas en esta política, y como mínimo durante el tiempo exigido por la legislación aplicable (Argentina: Ley 25.326 de Protección de Datos Personales).
            </p>
            <p>Los datos de historia clínica se conservan conforme a la normativa de salud vigente.</p>
          </Section>

          <Section title="9. Tus derechos">
            <p>De acuerdo con la Ley 25.326 (Argentina) y normativas equivalentes, tenés derecho a:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Acceso:</strong> solicitar qué datos tenemos sobre vos.</li>
              <li><strong>Rectificación:</strong> corregir datos inexactos.</li>
              <li><strong>Cancelación/Eliminación:</strong> solicitar la eliminación de tus datos.</li>
              <li><strong>Oposición:</strong> oponerte al tratamiento de tus datos para determinadas finalidades.</li>
            </ul>
            <p>
              Para ejercer estos derechos, escribinos a <a href="mailto:info@agendavitalis.app" className="text-[#00ADBB] hover:underline">info@agendavitalis.app</a>.
            </p>
          </Section>

          <Section title="10. Seguridad">
            <p>
              Implementamos medidas técnicas y organizativas apropiadas para proteger los datos personales contra acceso no autorizado, pérdida o destrucción, incluyendo cifrado en tránsito (TLS/HTTPS) y en reposo, control de acceso basado en roles y monitoreo de seguridad.
            </p>
          </Section>

          <Section title="11. Transferencias internacionales">
            <p>
              Algunos de nuestros proveedores (Supabase, Anthropic, Resend) pueden procesar datos en servidores ubicados fuera de Argentina. Nos aseguramos de que estas transferencias cumplan con la normativa aplicable y que existan garantías adecuadas de protección.
            </p>
          </Section>

          <Section title="12. Cambios a esta política">
            <p>
              Podemos actualizar esta Política de Privacidad periódicamente. Notificaremos cambios significativos por correo electrónico o mediante un aviso destacado en la plataforma. La fecha de última actualización siempre estará indicada al inicio de este documento.
            </p>
          </Section>

          <Section title="13. Contacto">
            <p>
              Para consultas sobre esta política o el tratamiento de tus datos personales, contactanos en:
            </p>
            <p><a href="mailto:info@agendavitalis.app" className="text-[#00ADBB] hover:underline">info@agendavitalis.app</a></p>
          </Section>
        </div>

        <div className="text-center">
          <Link to="/terminos" className="text-[#00ADBB] hover:underline text-sm">Ver Términos y Condiciones →</Link>
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
