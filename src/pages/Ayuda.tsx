import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, Clock, BookOpen, Settings, Users, Calendar, Heart, Stethoscope, Building2, Wallet, MessageSquare, Bot, CreditCard, User } from 'lucide-react';

interface Paso {
  texto: string;
}

interface Tutorial {
  id: string;
  titulo: string;
  dificultad: 'Básico' | 'Intermedio';
  tiempo: string;
  pasos: Paso[];
}

interface Seccion {
  id: string;
  titulo: string;
  icono: React.ReactNode;
  tutoriales: Tutorial[];
}

const SECCIONES: Seccion[] = [
  {
    id: 'primeros-pasos',
    titulo: 'Primeros pasos',
    icono: <BookOpen className="w-4 h-4" />,
    tutoriales: [
      {
        id: 'configurar-centro',
        titulo: 'Cómo configurar tu centro por primera vez',
        dificultad: 'Básico',
        tiempo: '5 min',
        pasos: [
          { texto: 'Ingresá a Vitalis con tu cuenta de administrador.' },
          { texto: 'Hacé clic en el ícono de engranaje (⚙️) en la barra superior para acceder a Configuración.' },
          { texto: 'Completá los datos de tu centro: nombre, dirección, teléfono y horario de atención.' },
          { texto: 'Subí el logo de tu centro si lo tenés disponible.' },
          { texto: 'Guardá los cambios. Tu centro ya está listo para operar.' },
        ],
      },
      {
        id: 'agregar-profesional',
        titulo: 'Cómo agregar tu primer profesional',
        dificultad: 'Básico',
        tiempo: '3 min',
        pasos: [
          { texto: 'En el menú superior, ingresá a Agendas → Profesionales.' },
          { texto: 'Hacé clic en el botón "Nuevo profesional".' },
          { texto: 'Completá el nombre, especialidad y datos de contacto del profesional.' },
          { texto: 'Asigná los servicios que puede brindar ese profesional.' },
          { texto: 'Guardá. El profesional ya aparecerá disponible en la agenda.' },
        ],
      },
      {
        id: 'crear-servicios',
        titulo: 'Cómo crear tus servicios',
        dificultad: 'Básico',
        tiempo: '3 min',
        pasos: [
          { texto: 'Ingresá a Agendas → Servicios desde el menú superior.' },
          { texto: 'Hacé clic en "Nuevo servicio".' },
          { texto: 'Ingresá el nombre del servicio (ej: Kinesiología, Masaje deportivo).' },
          { texto: 'Definí la duración en minutos y el precio de referencia.' },
          { texto: 'Guardá el servicio. Ya podés asignarlo a profesionales y turnos.' },
        ],
      },
    ],
  },
  {
    id: 'agenda',
    titulo: 'Gestión de agenda',
    icono: <Calendar className="w-4 h-4" />,
    tutoriales: [
      {
        id: 'agendar-turno',
        titulo: 'Cómo agendar un turno para un paciente',
        dificultad: 'Básico',
        tiempo: '2 min',
        pasos: [
          { texto: 'Ingresá a Agendas → Gestión de Agendas.' },
          { texto: 'Seleccioná el profesional y el día deseado en el calendario.' },
          { texto: 'Hacé clic en el horario disponible (aparece en blanco).' },
          { texto: 'Buscá o ingresá el nombre del paciente.' },
          { texto: 'Seleccioná el servicio y confirmá el turno. Se guardará automáticamente.' },
        ],
      },
      {
        id: 'cancelar-reagendar',
        titulo: 'Cómo cancelar o reagendar un turno',
        dificultad: 'Básico',
        tiempo: '2 min',
        pasos: [
          { texto: 'En la agenda, hacé clic sobre el turno que querés modificar.' },
          { texto: 'Se abrirá un panel con los detalles del turno.' },
          { texto: 'Para cancelar: hacé clic en "Cancelar turno" y confirmá.' },
          { texto: 'Para reagendar: hacé clic en "Editar", cambiá el día/horario y guardá.' },
          { texto: 'Si tenés recordatorios activos, el paciente recibirá una notificación automática.' },
        ],
      },
      {
        id: 'agenda-semanal',
        titulo: 'Cómo ver la agenda semanal / mensual',
        dificultad: 'Básico',
        tiempo: '2 min',
        pasos: [
          { texto: 'Ingresá a Agendas → Gestión de Agendas.' },
          { texto: 'En la parte superior derecha, buscá los botones de vista: Día / Semana / Mes.' },
          { texto: 'Hacé clic en "Semana" para ver todos los turnos de la semana actual.' },
          { texto: 'Hacé clic en "Mes" para tener una vista general del mes.' },
          { texto: 'Podés filtrar por profesional usando el selector de la parte superior.' },
        ],
      },
    ],
  },
  {
    id: 'pacientes',
    titulo: 'Pacientes',
    icono: <Users className="w-4 h-4" />,
    tutoriales: [
      {
        id: 'registrar-paciente',
        titulo: 'Cómo registrar un nuevo paciente',
        dificultad: 'Básico',
        tiempo: '3 min',
        pasos: [
          { texto: 'Ingresá a Pacientes → Nuevo paciente desde el menú superior.' },
          { texto: 'Completá los datos básicos: nombre, apellido, DNI y fecha de nacimiento.' },
          { texto: 'Agregá un teléfono de contacto (necesario para enviar recordatorios por WhatsApp).' },
          { texto: 'Opcionalmente ingresá la obra social y el número de afiliado.' },
          { texto: 'Guardá. El paciente quedará registrado en la base de datos del centro.' },
        ],
      },
      {
        id: 'historia-clinica',
        titulo: 'Cómo acceder a la historia clínica',
        dificultad: 'Básico',
        tiempo: '2 min',
        pasos: [
          { texto: 'Ingresá a Pacientes → Base de pacientes.' },
          { texto: 'Buscá al paciente por nombre o DNI.' },
          { texto: 'Hacé clic en su nombre para abrir su ficha.' },
          { texto: 'Dentro de la ficha, encontrarás la pestaña "Historia clínica".' },
          { texto: 'Allí verás todas las evoluciones y archivos adjuntos del paciente.' },
        ],
      },
      {
        id: 'cargar-evolucion',
        titulo: 'Cómo cargar una evolución clínica',
        dificultad: 'Intermedio',
        tiempo: '3 min',
        pasos: [
          { texto: 'Abrí la historia clínica del paciente (ver tutorial anterior).' },
          { texto: 'Hacé clic en "Nueva evolución".' },
          { texto: 'Ingresá la fecha y el profesional que atiende.' },
          { texto: 'Escribí el texto de la evolución: motivo de consulta, examen, tratamiento y próximos pasos.' },
          { texto: 'Guardá. La evolución quedará registrada con fecha y hora.' },
        ],
      },
      {
        id: 'adjuntar-archivos',
        titulo: 'Cómo adjuntar archivos (radiografías, informes)',
        dificultad: 'Intermedio',
        tiempo: '3 min',
        pasos: [
          { texto: 'Abrí la historia clínica del paciente.' },
          { texto: 'Hacé clic en "Adjuntar archivo" o en el ícono de clip dentro de una evolución.' },
          { texto: 'Seleccioná el archivo desde tu computadora (PDF, JPG, PNG).' },
          { texto: 'Podés agregar una descripción al archivo para identificarlo fácilmente.' },
          { texto: 'El archivo quedará vinculado a la historia clínica del paciente.' },
        ],
      },
    ],
  },
  {
    id: 'tratamientos',
    titulo: 'Tratamientos',
    icono: <Heart className="w-4 h-4" />,
    tutoriales: [
      {
        id: 'crear-tratamiento',
        titulo: 'Cómo crear un tratamiento con múltiples sesiones',
        dificultad: 'Intermedio',
        tiempo: '5 min',
        pasos: [
          { texto: 'Ingresá a Agendas → Tratamientos desde el menú.' },
          { texto: 'Hacé clic en "Nuevo tratamiento".' },
          { texto: 'Seleccioná el paciente y el profesional a cargo.' },
          { texto: 'Definí la cantidad de sesiones y la frecuencia (por ejemplo, 2 veces por semana).' },
          { texto: 'El sistema generará automáticamente los turnos correspondientes en la agenda.' },
          { texto: 'Podés ajustar fechas individuales si alguna no conviene.' },
        ],
      },
      {
        id: 'evolucion-tratamiento',
        titulo: 'Cómo registrar la evolución de un tratamiento',
        dificultad: 'Intermedio',
        tiempo: '3 min',
        pasos: [
          { texto: 'Ingresá a Agendas → Tratamientos y seleccioná el tratamiento activo.' },
          { texto: 'Verás el listado de sesiones. Hacé clic en la sesión que se realizó.' },
          { texto: 'Marcá la sesión como realizada y agregá una nota de evolución.' },
          { texto: 'Podés ver el progreso general del tratamiento en el panel de resumen.' },
          { texto: 'Guardá. La evolución quedará asociada a esa sesión específica.' },
        ],
      },
    ],
  },
  {
    id: 'obras-sociales',
    titulo: 'Obras Sociales',
    icono: <Building2 className="w-4 h-4" />,
    tutoriales: [
      {
        id: 'registrar-prestacion',
        titulo: 'Cómo registrar una prestación por obra social',
        dificultad: 'Intermedio',
        tiempo: '3 min',
        pasos: [
          { texto: 'Ingresá a Obras Sociales → Gestión de obras sociales.' },
          { texto: 'Seleccioná la obra social correspondiente al paciente.' },
          { texto: 'Hacé clic en "Registrar prestación".' },
          { texto: 'Seleccioná el paciente, el profesional, el servicio y la fecha de atención.' },
          { texto: 'Ingresá el código de prestación y el monto si corresponde.' },
          { texto: 'Guardá. La prestación quedará registrada para incluir en la liquidación.' },
        ],
      },
      {
        id: 'generar-liquidacion',
        titulo: 'Cómo generar una liquidación',
        dificultad: 'Intermedio',
        tiempo: '5 min',
        pasos: [
          { texto: 'Ingresá a Obras Sociales → Liquidación mensual.' },
          { texto: 'Seleccioná la obra social y el período a liquidar (mes y año).' },
          { texto: 'Revisá el listado de prestaciones incluidas en el período.' },
          { texto: 'Hacé clic en "Generar liquidación".' },
          { texto: 'Descargá el archivo para presentarlo a la obra social.' },
        ],
      },
    ],
  },
  {
    id: 'caja',
    titulo: 'Caja y pagos',
    icono: <Wallet className="w-4 h-4" />,
    tutoriales: [
      {
        id: 'registrar-cobro',
        titulo: 'Cómo registrar un cobro en caja',
        dificultad: 'Básico',
        tiempo: '2 min',
        pasos: [
          { texto: 'Ingresá a Caja → Caja del día desde el menú.' },
          { texto: 'Hacé clic en "Nuevo cobro" o seleccioná un turno del día para cobrarlo.' },
          { texto: 'Seleccioná el paciente y el concepto a cobrar.' },
          { texto: 'Ingresá el monto y el medio de pago (efectivo, transferencia, débito, etc.).' },
          { texto: 'Confirmá el cobro. Quedará registrado en el movimiento del día.' },
        ],
      },
      {
        id: 'resumen-dia',
        titulo: 'Cómo ver el resumen del día',
        dificultad: 'Básico',
        tiempo: '2 min',
        pasos: [
          { texto: 'Ingresá a Caja → Caja del día.' },
          { texto: 'En la parte superior verás un resumen con el total cobrado del día.' },
          { texto: 'Podés filtrar por medio de pago para ver cuánto entraste en efectivo, transferencia, etc.' },
          { texto: 'El listado inferior muestra cada movimiento registrado con hora y concepto.' },
        ],
      },
      {
        id: 'exportar-eerr',
        titulo: 'Cómo exportar el Estado de Resultados',
        dificultad: 'Intermedio',
        tiempo: '3 min',
        pasos: [
          { texto: 'Ingresá a Caja → Estado de Resultados (EERR) desde el menú.' },
          { texto: 'Seleccioná el rango de fechas que querés analizar.' },
          { texto: 'Verás el resumen de ingresos y egresos del período.' },
          { texto: 'Hacé clic en "Exportar" para descargar el informe en formato Excel o PDF.' },
          { texto: 'Podés compartirlo con tu contador directamente desde ahí.' },
        ],
      },
    ],
  },
  {
    id: 'recordatorios',
    titulo: 'Recordatorios WhatsApp',
    icono: <MessageSquare className="w-4 h-4" />,
    tutoriales: [
      {
        id: 'recordatorios-automaticos',
        titulo: 'Cómo configurar recordatorios automáticos',
        dificultad: 'Intermedio',
        tiempo: '5 min',
        pasos: [
          { texto: 'Ingresá a Recordatorios → Recordatorios de turno desde el menú.' },
          { texto: 'Activá la función de recordatorios automáticos con el switch correspondiente.' },
          { texto: 'Definí con cuánta anticipación querés enviar el recordatorio (24h o 48h antes).' },
          { texto: 'Personalizá el texto del mensaje si lo deseás.' },
          { texto: 'Guardá. A partir de ahora los pacientes recibirán un WhatsApp antes de cada turno.' },
        ],
      },
      {
        id: 'recordatorio-manual',
        titulo: 'Cómo enviar un recordatorio manual',
        dificultad: 'Básico',
        tiempo: '2 min',
        pasos: [
          { texto: 'Ingresá a Recordatorios → Recordatorios de turno.' },
          { texto: 'Buscá el turno del paciente al que querés enviarle el recordatorio.' },
          { texto: 'Hacé clic en el botón de WhatsApp junto al turno.' },
          { texto: 'Se abrirá WhatsApp Web con el mensaje prearmado.' },
          { texto: 'Enviá el mensaje directamente desde WhatsApp.' },
        ],
      },
    ],
  },
  {
    id: 'bot-whatsapp',
    titulo: 'Asistente IA WhatsApp',
    icono: <Bot className="w-4 h-4" />,
    tutoriales: [
      {
        id: 'como-funciona-bot',
        titulo: 'Cómo funciona el bot',
        dificultad: 'Básico',
        tiempo: '3 min',
        pasos: [
          { texto: 'El Asistente IA de WhatsApp responde automáticamente los mensajes de tus pacientes.' },
          { texto: 'Puede informar sobre servicios, horarios y permitir reservar turnos sin que intervenga ningún humano.' },
          { texto: 'Funciona las 24 horas, todos los días, sin importar si el centro está cerrado.' },
          { texto: 'Si el bot no sabe responder algo, deriva el mensaje al equipo del centro.' },
          { texto: 'Para activarlo, asegurate de tener conectado el número de WhatsApp del centro en Configuración.' },
        ],
      },
      {
        id: 'cargar-faqs',
        titulo: 'Cómo cargar preguntas frecuentes (FAQ)',
        dificultad: 'Intermedio',
        tiempo: '5 min',
        pasos: [
          { texto: 'Ingresá a la sección FAQ desde el menú (o desde Mi perfil si sos profesional).' },
          { texto: 'Hacé clic en "Nueva pregunta frecuente".' },
          { texto: 'Escribí la pregunta tal como la formularía un paciente.' },
          { texto: 'Ingresá la respuesta clara y detallada.' },
          { texto: 'Guardá. El bot ya usará esa información para responder consultas similares.' },
        ],
      },
      {
        id: 'configurar-bot-servicios',
        titulo: 'Cómo configurar los servicios del bot',
        dificultad: 'Intermedio',
        tiempo: '5 min',
        pasos: [
          { texto: 'Ingresá a Configuración del centro.' },
          { texto: 'Buscá la sección "Asistente WhatsApp" o "Bot de reservas".' },
          { texto: 'Activá los servicios que querés que el bot ofrezca para reservas online.' },
          { texto: 'Definí el horario de atención que el bot va a informar.' },
          { texto: 'Guardá los cambios. El bot ya ofrecerá esos servicios a los pacientes que consulten.' },
        ],
      },
    ],
  },
  {
    id: 'mercadopago',
    titulo: 'MercadoPago',
    icono: <CreditCard className="w-4 h-4" />,
    tutoriales: [
      {
        id: 'conectar-mp',
        titulo: 'Cómo conectar tu cuenta de MercadoPago',
        dificultad: 'Intermedio',
        tiempo: '5 min',
        pasos: [
          { texto: 'Ingresá a Mi perfil desde el menú de usuario (esquina superior derecha).' },
          { texto: 'Buscá la sección "MercadoPago".' },
          { texto: 'Hacé clic en "Conectar con MercadoPago".' },
          { texto: 'Se abrirá una ventana de MercadoPago para autorizar la conexión. Iniciá sesión con tu cuenta de MP.' },
          { texto: 'Una vez autorizado, volverás a Vitalis con la cuenta conectada. Verás el estado "Conectado".' },
        ],
      },
      {
        id: 'cobro-anticipado',
        titulo: 'Cómo habilitar el cobro anticipado en reservas',
        dificultad: 'Intermedio',
        tiempo: '3 min',
        pasos: [
          { texto: 'Asegurate de tener tu cuenta de MercadoPago conectada (ver tutorial anterior).' },
          { texto: 'Ingresá a Configuración del centro.' },
          { texto: 'Buscá la opción "Cobro anticipado al reservar" o "Pago online".' },
          { texto: 'Activala y definí si el pago será obligatorio u opcional.' },
          { texto: 'Guardá. A partir de ahora los pacientes podrán pagar cuando reservan su turno online.' },
        ],
      },
    ],
  },
  {
    id: 'mi-perfil',
    titulo: 'Mi perfil',
    icono: <User className="w-4 h-4" />,
    tutoriales: [
      {
        id: 'cambiar-contrasena',
        titulo: 'Cómo cambiar mi contraseña',
        dificultad: 'Básico',
        tiempo: '2 min',
        pasos: [
          { texto: 'Hacé clic en tu nombre en la esquina superior derecha.' },
          { texto: 'Seleccioná "Mi perfil" del menú desplegable.' },
          { texto: 'Buscá la sección "Seguridad" o "Cambiar contraseña".' },
          { texto: 'Ingresá tu contraseña actual y luego la nueva contraseña dos veces.' },
          { texto: 'Guardá los cambios. Usarás la nueva contraseña a partir de ahora.' },
        ],
      },
      {
        id: 'gestionar-datos',
        titulo: 'Cómo gestionar mis datos',
        dificultad: 'Básico',
        tiempo: '2 min',
        pasos: [
          { texto: 'Ingresá a Mi perfil desde el menú de usuario.' },
          { texto: 'En la sección "Datos personales" podés actualizar tu nombre y datos de contacto.' },
          { texto: 'Si sos profesional, también podés ver tus servicios asignados.' },
          { texto: 'Guardá cualquier cambio que hagas.' },
        ],
      },
    ],
  },
];

function TutorialCard({ tutorial }: { tutorial: Tutorial }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card transition-all">
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-accent/50 transition-colors gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          {abierto
            ? <ChevronDown className="w-4 h-4 shrink-0 text-[#00ADBB]" />
            : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
          }
          <span className="text-[13px] font-medium text-foreground truncate">{tutorial.titulo}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            tutorial.dificultad === 'Básico'
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-amber-500/15 text-amber-400'
          }`}>
            {tutorial.dificultad}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="w-3 h-3" />{tutorial.tiempo}
          </span>
        </div>
      </button>

      {abierto && (
        <div className="px-4 pb-4 pt-1 border-t border-border">
          <ol className="space-y-2 mt-2">
            {tutorial.pasos.map((paso, i) => (
              <li key={i} className="flex gap-3 text-[13px] text-muted-foreground leading-relaxed">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[#00ADBB]/15 text-[#00ADBB] text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{paso.texto}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function Ayuda() {
  const [busqueda, setBusqueda] = useState('');
  const [seccionActiva, setSeccionActiva] = useState('primeros-pasos');

  const seccionesFiltradas = useMemo(() => {
    if (!busqueda.trim()) return SECCIONES;
    const q = busqueda.toLowerCase();
    return SECCIONES
      .map(s => ({
        ...s,
        tutoriales: s.tutoriales.filter(t => t.titulo.toLowerCase().includes(q)),
      }))
      .filter(s => s.tutoriales.length > 0);
  }, [busqueda]);

  const seccionesParaMostrar = busqueda.trim() ? seccionesFiltradas : SECCIONES;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[#00ADBB]/15 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-[#00ADBB]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Centro de ayuda</h1>
            <p className="text-xs text-muted-foreground">Tutoriales paso a paso para usar Vitalis</p>
          </div>
        </div>

        {/* Buscador */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar tutorial..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#00ADBB]/40 focus:border-[#00ADBB]/60 transition-colors"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        {!busqueda.trim() && (
          <aside className="w-52 shrink-0 border-r border-border overflow-y-auto py-3">
            {SECCIONES.map(s => (
              <button
                key={s.id}
                onClick={() => {
                  setSeccionActiva(s.id);
                  document.getElementById(`seccion-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-[12.5px] text-left transition-colors ${
                  seccionActiva === s.id
                    ? 'text-[#00ADBB] bg-[#00ADBB]/10 font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <span className={seccionActiva === s.id ? 'text-[#00ADBB]' : 'text-muted-foreground/60'}>
                  {s.icono}
                </span>
                {s.titulo}
              </button>
            ))}
          </aside>
        )}

        {/* Contenido */}
        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
          {seccionesParaMostrar.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-foreground">Sin resultados</p>
              <p className="text-xs text-muted-foreground mt-1">Probá con otras palabras clave.</p>
            </div>
          ) : (
            seccionesParaMostrar.map(seccion => (
              <section key={seccion.id} id={`seccion-${seccion.id}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-[#00ADBB]">{seccion.icono}</div>
                  <h2 className="text-sm font-semibold text-foreground">{seccion.titulo}</h2>
                  <div className="flex-1 h-px bg-border ml-1" />
                </div>
                <div className="space-y-2">
                  {seccion.tutoriales.map(t => (
                    <TutorialCard key={t.id} tutorial={t} />
                  ))}
                </div>
              </section>
            ))
          )}
        </main>
      </div>
    </div>
  );
}
