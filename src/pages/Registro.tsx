import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PLAN_PRECIO_USD, type Plan } from '@/hooks/use-plan';

const BG       = '#050c18';
const CARD_BG  = 'rgba(255,255,255,0.03)';
const CARD_BD  = 'rgba(255,255,255,0.08)';
const ACCENT   = '#00ADBB';
const INPUT_BG = 'rgba(255,255,255,0.05)';
const INPUT_BD = 'rgba(255,255,255,0.1)';
const TEXT     = '#e8eaf0';
const MUTED    = 'rgba(255,255,255,0.45)';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const PROVINCIAS = [
  'Buenos Aires','CABA','Córdoba','Santa Fe','Mendoza','Tucumán',
  'Entre Ríos','Salta','Misiones','Chaco','Corrientes','Santiago del Estero',
  'San Juan','Jujuy','Río Negro','Neuquén','Formosa','Chubut','San Luis',
  'Catamarca','La Rioja','La Pampa','Santa Cruz','Tierra del Fuego',
];

const CATEGORIAS_FISCAL = [
  'Responsable Inscripto','Monotributista','Consumidor Final','Exento',
];

const DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const TITULOS     = ['Dr.','Dra.','Lic.','Kinesiólogo/a','Prof.','Otro'];

const PLANES_DEF: { id: Plan; label: string }[] = [
  { id: 'basico',      label: 'Básico'      },
  { id: 'intermedio',  label: 'Intermedio'  },
  { id: 'premium',     label: 'Premium'     },
];

interface HorarioDia  { activo: boolean; desde: string; hasta: string; }
interface Profesional { nombre: string; apellido: string; titulo: string; email: string; }
interface Servicio    { nombre: string; duracion: string; precio: string; }

function formatCuit(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d;
  if (d.length <= 10) return `${d.slice(0,2)}-${d.slice(2)}`;
  return `${d.slice(0,2)}-${d.slice(2,10)}-${d.slice(10)}`;
}

const inputStyle = {
  background: INPUT_BG, border: `1px solid ${INPUT_BD}`, borderRadius: 8,
  padding: '10px 12px', color: TEXT, fontSize: 14, outline: 'none',
  width: '100%', boxSizing: 'border-box' as const,
};
const labelStyle = { fontSize: 12, color: MUTED as string, fontWeight: 500, display: 'block', marginBottom: 4 };

function SInput({ label, value, onChange, type='text', placeholder='', required=false, error='', ...rest }: {
  label?: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; error?: string;
  [k: string]: unknown;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      {label && <label style={labelStyle}>{label}{required && <span style={{color:ACCENT}}> *</span>}</label>}
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ ...inputStyle, border:`1px solid ${focused ? ACCENT : error ? '#f87171' : INPUT_BD}`, transition:'border-color .15s' }}
        {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
      />
      {error && <span style={{ fontSize:11, color:'#f87171' }}>{error}</span>}
    </div>
  );
}

function SSelect({ label, value, onChange, options, required=false, error='' }: {
  label?: string; value: string; onChange: (v: string) => void;
  options: string[]; required?: boolean; error?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      {label && <label style={labelStyle}>{label}{required && <span style={{color:ACCENT}}> *</span>}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ background:'#0d1b2e', border:`1px solid ${focused ? ACCENT : error ? '#f87171' : INPUT_BD}`, borderRadius:8, padding:'10px 12px', color: value ? TEXT : MUTED, fontSize:14, outline:'none', width:'100%', boxSizing:'border-box', cursor:'pointer' }}
      >
        <option value="" disabled style={{ color: MUTED }}>Seleccioná…</option>
        {options.map(o => <option key={o} value={o} style={{ background:'#0d1b2e', color: TEXT }}>{o}</option>)}
      </select>
      {error && <span style={{ fontSize:11, color:'#f87171' }}>{error}</span>}
    </div>
  );
}

function ProvinciasInput({ value, onChange, error='' }: { value: string; onChange: (v: string) => void; error?: string }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState(value);
  const ref               = useRef<HTMLDivElement>(null);
  const filtered          = PROVINCIAS.filter(p => p.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <label style={labelStyle}>Provincia <span style={{color:ACCENT}}>*</span></label>
      <input value={query} placeholder="Escribí para filtrar…"
        onChange={e => { setQuery(e.target.value); setOpen(true); onChange(''); }}
        onFocus={() => setOpen(true)}
        style={{ ...inputStyle, border:`1px solid ${error ? '#f87171' : open ? ACCENT : INPUT_BD}` }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position:'absolute', zIndex:50, top:'100%', left:0, right:0, marginTop:4, background:'#0d1b2e', border:`1px solid ${CARD_BD}`, borderRadius:8, maxHeight:180, overflowY:'auto' }}>
          {filtered.map(p => (
            <div key={p} onMouseDown={() => { onChange(p); setQuery(p); setOpen(false); }}
              style={{ padding:'8px 12px', fontSize:14, color: TEXT, cursor:'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background='rgba(0,173,187,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background='transparent')}
            >{p}</div>
          ))}
        </div>
      )}
      {error && <span style={{ fontSize:11, color:'#f87171' }}>{error}</span>}
    </div>
  );
}

export default function Registro() {
  const navigate = useNavigate();
  const [step, setStep]             = useState(1);
  const [loading, setLoading]       = useState(false);
  const [globalError, setGlobalError] = useState('');

  // ── step 1: cuenta + facturación ──
  const [nombre, setNombre]         = useState('');
  const [apellido, setApellido]     = useState('');
  const [dni, setDni]               = useState('');
  const [cuit, setCuit]             = useState('');
  const [catFiscal, setCatFiscal]   = useState('');
  const [provincia, setProvincia]   = useState('');
  const [ciudad, setCiudad]         = useState('');
  const [direccion, setDireccion]   = useState('');
  const [plan, setPlan]             = useState<Plan>('intermedio');
  const [cantProf, setCantProf]     = useState('1');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors1, setErrors1]       = useState<Record<string,string>>({});

  // ── step 2: centro ──
  const defaultHorarios: Record<string, HorarioDia> = {};
  DIAS_SEMANA.forEach(d => { defaultHorarios[d] = { activo: d !== 'Domingo' && d !== 'Sábado', desde:'08:00', hasta:'18:00' }; });
  const [nombreCentro, setNombreCentro]   = useState('');
  const [horarios, setHorarios]           = useState<Record<string, HorarioDia>>(defaultHorarios);
  const [profesionales, setProfesionales] = useState<Profesional[]>([{ nombre:'', apellido:'', titulo:'', email:'' }]);
  const [servicios, setServicios]         = useState<Servicio[]>([{ nombre:'', duracion:'60', precio:'' }]);
  const [errors2, setErrors2]             = useState<Record<string,string>>({});

  const precioTotal = PLAN_PRECIO_USD[plan] * (parseInt(cantProf) || 1);

  function validateStep1(): boolean {
    const e: Record<string,string> = {};
    if (!nombre.trim())    e.nombre    = 'Requerido';
    if (!apellido.trim())  e.apellido  = 'Requerido';
    if (!dni.trim())       e.dni       = 'Requerido';
    if (!cuit.trim())      e.cuit      = 'Requerido';
    if (!catFiscal)        e.catFiscal = 'Requerido';
    if (!provincia)        e.provincia = 'Requerido';
    if (!ciudad.trim())    e.ciudad    = 'Requerido';
    if (!direccion.trim()) e.direccion = 'Requerido';
    if (!email.trim() || !email.includes('@')) e.email = 'Email inválido';
    if (password.length < 8)           e.password   = 'Mínimo 8 caracteres';
    if (password !== confirmPwd)       e.confirmPwd = 'Las contraseñas no coinciden';
    const cp = parseInt(cantProf);
    if (!cp || cp < 1)                 e.cantProf   = 'Mínimo 1';
    setErrors1(e);
    return Object.keys(e).length === 0;
  }

  function validateStep2(): boolean {
    const e: Record<string,string> = {};
    if (!nombreCentro.trim()) e.nombreCentro = 'Requerido';
    profesionales.forEach((p, i) => { if (!p.nombre.trim()) e[`prof_nombre_${i}`] = 'Requerido'; });
    servicios.forEach((s, i) => { if (!s.nombre.trim()) e[`serv_nombre_${i}`] = 'Requerido'; });
    setErrors2(e);
    return Object.keys(e).length === 0;
  }

  function nextStep() {
    if (step === 1 && !validateStep1()) return;
    setStep(2);
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  async function handleFinalize() {
    if (!validateStep2()) return;
    setLoading(true);
    setGlobalError('');

    const registroData = {
      nombre, apellido, dni, cuit, catFiscal, provincia, ciudad, direccion,
      plan, cantProf: parseInt(cantProf) || 1,
      email, password,
      nombreCentro, horarios,
      profesionales: profesionales.filter(p => p.nombre.trim()),
      servicios: servicios.filter(s => s.nombre.trim()).map(s => ({
        nombre: s.nombre,
        duracion_minutos: parseInt(s.duracion) || 60,
        precio_particular: parseFloat(s.precio) || 0,
      })),
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/registro-pago`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          registroData,
          amount: precioTotal,
          planLabel: PLANES_DEF.find(p => p.id === plan)?.label ?? plan,
          origin: window.location.origin,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.checkout_url) throw new Error(json.error ?? 'No se pudo iniciar el pago');

      window.location.href = json.checkout_url;
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Error desconocido');
      setLoading(false);
    }
  }

  function addProf()  { setProfesionales(prev => [...prev, { nombre:'', apellido:'', titulo:'', email:'' }]); }
  function removeProf(i: number) { setProfesionales(prev => prev.filter((_, idx) => idx !== i)); }
  function updateProf(i: number, key: keyof Profesional, val: string) {
    setProfesionales(prev => prev.map((p, idx) => idx === i ? { ...p, [key]: val } : p));
  }
  function addServ()  { setServicios(prev => [...prev, { nombre:'', duracion:'60', precio:'' }]); }
  function removeServ(i: number) { setServicios(prev => prev.filter((_, idx) => idx !== i)); }
  function updateServ(i: number, key: keyof Servicio, val: string) {
    setServicios(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s));
  }

  const STEPS = ['Tu cuenta', 'Tu centro'];

  const stepperEl = (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', marginBottom:32 }}>
      {STEPS.map((label, idx) => {
        const n = idx + 1;
        const done = step > n; const active = step === n;
        return (
          <div key={n} style={{ display:'flex', alignItems:'center' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background: done ? ACCENT : active ? `${ACCENT}22` : 'rgba(255,255,255,0.05)', border:`2px solid ${done||active ? ACCENT : 'rgba(255,255,255,0.12)'}`, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .25s' }}>
                {done
                  ? <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>
                  : <span style={{ fontSize:13, fontWeight:700, color: active ? ACCENT : MUTED }}>{n}</span>}
              </div>
              <span style={{ fontSize:11, color: active ? ACCENT : done ? ACCENT : MUTED, fontWeight: active ? 600 : 400 }}>{label}</span>
            </div>
            {idx < STEPS.length - 1 && <div style={{ width:80, height:2, background: step > n ? ACCENT : 'rgba(255,255,255,0.1)', margin:'0 8px 20px', transition:'background .25s' }} />}
          </div>
        );
      })}
    </div>
  );

  // ── Step 1 ──
  const step1Content = (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Plan selector — solo nombre + precio */}
      <div>
        <label style={labelStyle}>Plan <span style={{color:ACCENT}}>*</span></label>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginTop:4 }}>
          {PLANES_DEF.map(p => (
            <button key={p.id} type="button" onClick={() => setPlan(p.id)}
              style={{ background: plan===p.id ? `${ACCENT}15` : CARD_BG, border:`2px solid ${plan===p.id ? ACCENT : CARD_BD}`, borderRadius:10, padding:'14px 10px', cursor:'pointer', textAlign:'center', transition:'all .15s' }}
            >
              <div style={{ fontSize:14, fontWeight:700, color: plan===p.id ? ACCENT : TEXT, marginBottom:6 }}>{p.label}</div>
              <div style={{ fontSize:18, fontWeight:800, color: TEXT }}>
                ${PLAN_PRECIO_USD[p.id].toLocaleString('es-AR')}
              </div>
              <div style={{ fontSize:10, color: MUTED, marginTop:2 }}>ARS / prof / mes</div>
            </button>
          ))}
        </div>
      </div>

      {/* Cantidad de profesionales */}
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <label style={labelStyle}>Cantidad de profesionales <span style={{color:ACCENT}}>*</span></label>
        <input type="number" min={1} value={cantProf} onChange={e => setCantProf(e.target.value)} style={{ ...inputStyle, maxWidth:120 }} />
        {errors1.cantProf && <span style={{ fontSize:11, color:'#f87171' }}>{errors1.cantProf}</span>}
      </div>

      {/* Resumen de cobro */}
      <div style={{ background:`${ACCENT}10`, border:`1px solid ${ACCENT}33`, borderRadius:10, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:13, color: MUTED }}>Total mensual</span>
        <span style={{ fontSize:20, fontWeight:800, color: ACCENT }}>${precioTotal.toLocaleString('es-AR')} ARS</span>
      </div>

      <div style={{ borderTop:`1px solid ${CARD_BD}`, paddingTop:16, marginTop:4 }}>
        <p style={{ fontSize:12, color: MUTED, marginBottom:12, fontWeight:600, textTransform:'uppercase', letterSpacing:1 }}>Datos de facturación</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <SInput label="Nombre" value={nombre} onChange={setNombre} required error={errors1.nombre} />
        <SInput label="Apellido" value={apellido} onChange={setApellido} required error={errors1.apellido} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <SInput label="DNI" value={dni} onChange={setDni} placeholder="00000000" required error={errors1.dni} />
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <label style={labelStyle}>CUIT <span style={{color:ACCENT}}>*</span></label>
          <input value={cuit} placeholder="XX-XXXXXXXX-X" onChange={e => setCuit(formatCuit(e.target.value))} style={inputStyle} />
          {errors1.cuit && <span style={{ fontSize:11, color:'#f87171' }}>{errors1.cuit}</span>}
        </div>
      </div>
      <SSelect label="Categoría fiscal" value={catFiscal} onChange={setCatFiscal} options={CATEGORIAS_FISCAL} required error={errors1.catFiscal} />
      <ProvinciasInput value={provincia} onChange={setProvincia} error={errors1.provincia} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <SInput label="Ciudad" value={ciudad} onChange={setCiudad} required error={errors1.ciudad} />
        <SInput label="Dirección" value={direccion} onChange={setDireccion} required error={errors1.direccion} />
      </div>

      <div style={{ borderTop:`1px solid ${CARD_BD}`, paddingTop:16, marginTop:4 }}>
        <p style={{ fontSize:12, color: MUTED, marginBottom:12, fontWeight:600, textTransform:'uppercase', letterSpacing:1 }}>Acceso a la app</p>
      </div>

      <SInput label="Email" type="email" value={email} onChange={setEmail} required placeholder="tu@email.com" error={errors1.email} />

      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <label style={labelStyle}>Contraseña <span style={{color:ACCENT}}>*</span></label>
        <div style={{ position:'relative' }}>
          <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" style={{ ...inputStyle, paddingRight:40 }} />
          <button type="button" onClick={() => setShowPwd(v => !v)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color: MUTED, padding:0, fontSize:16 }}>{showPwd ? '🙈' : '👁'}</button>
        </div>
        {errors1.password && <span style={{ fontSize:11, color:'#f87171' }}>{errors1.password}</span>}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <label style={labelStyle}>Confirmar contraseña <span style={{color:ACCENT}}>*</span></label>
        <div style={{ position:'relative' }}>
          <input type={showConfirm ? 'text' : 'password'} value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Repetí tu contraseña" style={{ ...inputStyle, paddingRight:40 }} />
          <button type="button" onClick={() => setShowConfirm(v => !v)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color: MUTED, padding:0, fontSize:16 }}>{showConfirm ? '🙈' : '👁'}</button>
        </div>
        {errors1.confirmPwd && <span style={{ fontSize:11, color:'#f87171' }}>{errors1.confirmPwd}</span>}
      </div>
    </div>
  );

  // ── Step 2 ──
  const step2Content = (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <label style={labelStyle}>Nombre del centro <span style={{color:ACCENT}}>*</span></label>
        <input value={nombreCentro} onChange={e => setNombreCentro(e.target.value)} placeholder="Ej: Centro Kinesiológico del Sur" style={inputStyle} />
        {errors2.nombreCentro && <span style={{ fontSize:11, color:'#f87171' }}>{errors2.nombreCentro}</span>}
      </div>

      <div>
        <label style={{ ...labelStyle, marginBottom:10 }}>Horarios de atención</label>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {DIAS_SEMANA.map(dia => {
            const h = horarios[dia];
            return (
              <div key={dia} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', minWidth:110 }}>
                  <input type="checkbox" checked={h.activo} onChange={e => setHorarios(prev => ({ ...prev, [dia]: { ...prev[dia], activo: e.target.checked } }))} style={{ accentColor: ACCENT, width:14, height:14 }} />
                  <span style={{ fontSize:13, color: h.activo ? TEXT : MUTED }}>{dia}</span>
                </label>
                {h.activo && (
                  <>
                    <input type="time" value={h.desde} onChange={e => setHorarios(prev => ({ ...prev, [dia]: { ...prev[dia], desde: e.target.value } }))} style={{ ...inputStyle, width:120, padding:'6px 8px' }} />
                    <span style={{ color: MUTED, fontSize:12 }}>a</span>
                    <input type="time" value={h.hasta} onChange={e => setHorarios(prev => ({ ...prev, [dia]: { ...prev[dia], hasta: e.target.value } }))} style={{ ...inputStyle, width:120, padding:'6px 8px' }} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label style={{ ...labelStyle, marginBottom:10 }}>Profesionales</label>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {profesionales.map((p, i) => (
            <div key={i} style={{ background: CARD_BG, border:`1px solid ${CARD_BD}`, borderRadius:10, padding:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <span style={{ fontSize:12, color: MUTED }}>Profesional {i + 1}</span>
                {profesionales.length > 1 && <button type="button" onClick={() => removeProf(i)} style={{ background:'none', border:'none', color:'#f87171', cursor:'pointer', fontSize:12 }}>Eliminar</button>}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={labelStyle}>Nombre</label>
                  <input value={p.nombre} onChange={e => updateProf(i,'nombre',e.target.value)} style={inputStyle} />
                  {errors2[`prof_nombre_${i}`] && <span style={{ fontSize:11, color:'#f87171' }}>{errors2[`prof_nombre_${i}`]}</span>}
                </div>
                <div><label style={labelStyle}>Apellido</label><input value={p.apellido} onChange={e => updateProf(i,'apellido',e.target.value)} style={inputStyle} /></div>
                <div>
                  <label style={labelStyle}>Título</label>
                  <select value={p.titulo} onChange={e => updateProf(i,'titulo',e.target.value)} style={{ ...inputStyle, background:'#0d1b2e', cursor:'pointer' }}>
                    <option value="">Seleccioná…</option>
                    {TITULOS.map(t => <option key={t} value={t} style={{ background:'#0d1b2e' }}>{t}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>Email profesional</label><input type="email" value={p.email} onChange={e => updateProf(i,'email',e.target.value)} style={inputStyle} /></div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addProf} style={{ marginTop:10, background:'none', border:`1px dashed ${CARD_BD}`, borderRadius:8, padding:'8px 14px', color: ACCENT, fontSize:13, cursor:'pointer', width:'100%' }}>+ Agregar profesional</button>
      </div>

      <div>
        <label style={{ ...labelStyle, marginBottom:10 }}>Servicios</label>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {servicios.map((s, i) => (
            <div key={i} style={{ background: CARD_BG, border:`1px solid ${CARD_BD}`, borderRadius:10, padding:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <span style={{ fontSize:12, color: MUTED }}>Servicio {i + 1}</span>
                {servicios.length > 1 && <button type="button" onClick={() => removeServ(i)} style={{ background:'none', border:'none', color:'#f87171', cursor:'pointer', fontSize:12 }}>Eliminar</button>}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:10 }}>
                <div>
                  <label style={labelStyle}>Nombre del servicio</label>
                  <input value={s.nombre} onChange={e => updateServ(i,'nombre',e.target.value)} style={inputStyle} />
                  {errors2[`serv_nombre_${i}`] && <span style={{ fontSize:11, color:'#f87171' }}>{errors2[`serv_nombre_${i}`]}</span>}
                </div>
                <div><label style={labelStyle}>Duración (min)</label><input type="number" min={5} value={s.duracion} onChange={e => updateServ(i,'duracion',e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Precio ($)</label><input type="number" min={0} value={s.precio} onChange={e => updateServ(i,'precio',e.target.value)} style={inputStyle} /></div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addServ} style={{ marginTop:10, background:'none', border:`1px dashed ${CARD_BD}`, borderRadius:8, padding:'8px 14px', color: ACCENT, fontSize:13, cursor:'pointer', width:'100%' }}>+ Agregar servicio</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background: BG, color: TEXT, fontFamily:'system-ui,sans-serif' }}>
      <div style={{ borderBottom:`1px solid ${CARD_BD}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:12 }}>
        <Link to="/" style={{ fontSize:13, color: MUTED, textDecoration:'none' }}>← Volver</Link>
        <span style={{ fontWeight:800, letterSpacing:3, fontSize:13, color: TEXT }}>VITALIS</span>
      </div>

      <div style={{ maxWidth:620, margin:'0 auto', padding:'36px 20px 60px' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <h1 style={{ fontSize:22, fontWeight:700, margin:'0 0 6px', color: TEXT }}>Crear tu cuenta Vitalis</h1>
          <p style={{ fontSize:14, color: MUTED, margin:0 }}>Completá los 2 pasos y comenzá a usar la app</p>
        </div>

        {stepperEl}

        <div style={{ background: CARD_BG, border:`1px solid ${CARD_BD}`, borderRadius:14, padding:'28px 28px 24px' }}>
          <h2 style={{ fontSize:15, fontWeight:700, color: TEXT, margin:'0 0 20px' }}>
            {step === 1 ? 'Elegí tu plan y completá tus datos' : 'Configuración del centro'}
          </h2>

          {step === 1 ? step1Content : step2Content}

          {globalError && (
            <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:8, fontSize:13, color:'#f87171' }}>
              {globalError}
            </div>
          )}

          <div style={{ display:'flex', justifyContent:'space-between', marginTop:24, gap:10 }}>
            {step > 1
              ? <button type="button" onClick={() => { setStep(1); window.scrollTo({top:0,behavior:'smooth'}); }} style={{ background:'none', border:`1px solid ${CARD_BD}`, borderRadius:8, padding:'10px 20px', color: MUTED, fontSize:14, cursor:'pointer' }}>Anterior</button>
              : <div />
            }
            {step === 1 ? (
              <button type="button" onClick={nextStep} style={{ background: ACCENT, border:'none', borderRadius:8, padding:'10px 28px', color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                Siguiente →
              </button>
            ) : (
              <button type="button" onClick={handleFinalize} disabled={loading}
                style={{ background: ACCENT, border:'none', borderRadius:8, padding:'10px 28px', color:'#fff', fontSize:14, fontWeight:600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, display:'flex', alignItems:'center', gap:8 }}
              >
                {loading && <span style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }} />}
                {loading ? 'Procesando…' : 'Ir al pago →'}
              </button>
            )}
          </div>

          {step === 1 && (
            <p style={{ textAlign:'center', marginTop:16, fontSize:12, color: MUTED }}>
              ¿Ya tenés cuenta?{' '}
              <Link to="/login" style={{ color: ACCENT, textDecoration:'none' }}>Iniciá sesión</Link>
            </p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(0.6); }
        input::placeholder { color: rgba(255,255,255,0.3); }
        select option { background: #0d1b2e; }
      `}</style>
    </div>
  );
}
