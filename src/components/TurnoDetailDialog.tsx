import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { TURNO_ESTADOS, TurnoEstado } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, X, Phone, CreditCard, CalendarDays, Stethoscope, Banknote, ArrowLeftRight, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PrepagaAutocomplete } from '@/components/PrepagaAutocomplete';

interface TurnoBasic {
  id: string;
  fecha: string;
  hora_inicio: string;
  estado: TurnoEstado;
  profesional_id: string;
  paciente_id: string;
  servicio_id?: string | null;
  paciente?: { nombre: string; apellido: string };
}

interface FullDetail {
  paciente: {
    id: string;
    nombre: string;
    apellido: string;
    dni: string;
    celular: string;
    fecha_nacimiento: string | null;
    prepaga_id: string | null;
    numero_afiliado: string | null;
    prepaga?: { id: string; nombre: string } | null;
  };
  servicio: { id: string; nombre: string; costo_base: number } | null;
  tratamiento: { id: string; total_sesiones: number; sesiones_consumidas: number } | null;
  caja: { monto_efectivo: number; monto_transferencia: number; monto_prepaga: number } | null;
  sesionesFinalizadas: number;
}

interface Props {
  turno: TurnoBasic | null;
  onClose: () => void;
  onUpdated: () => void;
}

export function TurnoDetailDialog({ turno, onClose, onUpdated }: Props) {
  const { centroId } = useAuth();
  const { toast } = useToast();

  const [detail, setDetail] = useState<FullDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Campos editables
  const [estado, setEstado] = useState<TurnoEstado>('reservado');
  const [prepagaId, setPrepagaId] = useState<string | null>(null);
  const [nroCredencial, setNroCredencial] = useState('');
  const [montoEfectivo, setMontoEfectivo] = useState(0);
  const [montoTransferencia, setMontoTransferencia] = useState(0);
  const [montoPrepaga, setMontoPrepaga] = useState(0);

  useEffect(() => {
    if (!turno || !centroId) return;
    setLoading(true);
    setDetail(null);

    Promise.all([
      supabase.from('pacientes')
        .select('id, nombre, apellido, dni, celular, fecha_nacimiento, prepaga_id, numero_afiliado, prepaga:prepagas(id, nombre)')
        .eq('id', turno.paciente_id).single(),

      turno.servicio_id
        ? supabase.from('servicios').select('id, nombre, costo_base').eq('id', turno.servicio_id).single()
        : Promise.resolve({ data: null }),

      supabase.from('turnos').select('tratamiento_id, tratamiento:tratamientos(id, total_sesiones, sesiones_consumidas)')
        .eq('id', turno.id).single(),

      supabase.from('caja_movimientos').select('monto_efectivo, monto_transferencia, monto_prepaga')
        .eq('turno_id', turno.id).maybeSingle(),

      turno.servicio_id
        ? supabase.from('turnos').select('id', { count: 'exact', head: true })
            .eq('paciente_id', turno.paciente_id)
            .eq('servicio_id', turno.servicio_id)
            .eq('estado', 'finalizado')
        : Promise.resolve({ count: 0 }),
    ]).then(([pacRes, servRes, turnoRes, cajaRes, sesRes]) => {
      const pac = pacRes.data as any;
      if (!pac) { setLoading(false); return; }

      const det: FullDetail = {
        paciente: pac,
        servicio: (servRes as any).data ?? null,
        tratamiento: (turnoRes.data as any)?.tratamiento ?? null,
        caja: (cajaRes as any).data ?? null,
        sesionesFinalizadas: (sesRes as any).count ?? 0,
      };

      setDetail(det);
      setEstado(turno.estado);
      setPrepagaId(pac.prepaga_id);
      setNroCredencial(pac.numero_afiliado ?? '');
      setMontoEfectivo((cajaRes as any).data?.monto_efectivo ?? 0);
      setMontoTransferencia((cajaRes as any).data?.monto_transferencia ?? 0);
      setMontoPrepaga((cajaRes as any).data?.monto_prepaga ?? 0);
      setLoading(false);
    });
  }, [turno?.id]);

  const handleSave = async () => {
    if (!turno || !detail) return;
    setSaving(true);

    const ops: Promise<any>[] = [
      supabase.from('turnos').update({ estado }).eq('id', turno.id),
      supabase.from('pacientes').update({
        prepaga_id: prepagaId,
        numero_afiliado: nroCredencial || null,
      }).eq('id', detail.paciente.id),
    ];

    const totalPago = montoEfectivo + montoTransferencia + montoPrepaga;
    if (totalPago > 0) {
      if (detail.caja) {
        ops.push(supabase.from('caja_movimientos').update({
          monto_efectivo: montoEfectivo,
          monto_transferencia: montoTransferencia,
          monto_prepaga: montoPrepaga,
        }).eq('turno_id', turno.id));
      } else {
        ops.push(supabase.from('caja_movimientos').insert({
          turno_id: turno.id,
          centro_id: centroId,
          paciente_id: detail.paciente.id,
          profesional_id: turno.profesional_id,
          fecha: turno.fecha,
          monto_efectivo: montoEfectivo,
          monto_transferencia: montoTransferencia,
          monto_prepaga: montoPrepaga,
        }));
      }
    }

    await Promise.all(ops);
    setSaving(false);
    toast({ title: 'Turno actualizado' });
    onUpdated();
  };

  const formatFecha = (s: string | null) => {
    if (!s) return '—';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  };

  const nroSesion = detail
    ? detail.sesionesFinalizadas + (turno?.estado === 'finalizado' ? 0 : 1)
    : null;

  return (
    <Dialog open={!!turno} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="p-0 max-w-lg overflow-hidden gap-0">
        {/* Header verde estilo Calu */}
        <div className="bg-[#0F6E56] text-white px-5 py-4 relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          {detail ? (
            <>
              <p className="text-[18px] font-bold leading-tight tracking-tight uppercase">
                {detail.paciente.apellido}, {detail.paciente.nombre}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[12px] text-white/80">
                <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" />DNI {detail.paciente.dni}</span>
                {detail.paciente.celular && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{detail.paciente.celular}</span>}
                {detail.paciente.fecha_nacimiento && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />Nac. {formatFecha(detail.paciente.fecha_nacimiento)}</span>}
              </div>
              <div className="mt-1.5 text-[11px] text-white/60">
                {turno?.fecha} — {turno?.hora_inicio?.substring(0, 5)} hs
              </div>
            </>
          ) : (
            <p className="text-[16px] font-bold">Detalle del Turno</p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : detail ? (
          <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">

            {/* Obra social + credencial */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Building2 className="w-3 h-3" />Obra social
                </Label>
                <PrepagaAutocomplete
                  value={prepagaId}
                  onSelect={(id) => setPrepagaId(id)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Nro. credencial</Label>
                <Input
                  value={nroCredencial}
                  onChange={e => setNroCredencial(e.target.value)}
                  placeholder="—"
                  className="h-9 text-[13px]"
                />
              </div>
            </div>

            {/* Servicio + sesiones */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Stethoscope className="w-3 h-3" />Servicio
                </Label>
                <p className="text-[13px] font-medium text-foreground py-1">
                  {detail.servicio?.nombre ?? '—'}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Sesiones</Label>
                <div className="py-1">
                  {detail.tratamiento ? (
                    <p className="text-[13px] font-medium text-foreground">
                      Sesión {nroSesion} / {detail.tratamiento.total_sesiones}
                    </p>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">
                      {detail.sesionesFinalizadas > 0
                        ? `${detail.sesionesFinalizadas} sesión${detail.sesionesFinalizadas !== 1 ? 'es' : ''} prev.`
                        : 'Sin tratamiento'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Precio + pagos */}
            <div>
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-2">
                <Banknote className="w-3 h-3" />Pagos
              </Label>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                {detail.servicio?.costo_base != null && (
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground">Precio del servicio</span>
                    <span className="font-semibold text-foreground">${detail.servicio.costo_base.toLocaleString('es-AR')}</span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Banknote className="w-3 h-3" />Efectivo
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={montoEfectivo || ''}
                      onChange={e => setMontoEfectivo(Number(e.target.value))}
                      placeholder="0"
                      className="h-8 text-[12px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <ArrowLeftRight className="w-3 h-3" />Transferencia
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={montoTransferencia || ''}
                      onChange={e => setMontoTransferencia(Number(e.target.value))}
                      placeholder="0"
                      className="h-8 text-[12px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Building2 className="w-3 h-3" />Obra social
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={montoPrepaga || ''}
                      onChange={e => setMontoPrepaga(Number(e.target.value))}
                      placeholder="0"
                      className="h-8 text-[12px]"
                    />
                  </div>
                </div>
                {(montoEfectivo + montoTransferencia + montoPrepaga) > 0 && (
                  <div className="flex items-center justify-between text-[12px] pt-1 border-t">
                    <span className="text-muted-foreground">Total cobrado</span>
                    <span className="font-bold text-[#0F6E56]">
                      ${(montoEfectivo + montoTransferencia + montoPrepaga).toLocaleString('es-AR')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Estado */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Estado</Label>
              <Select value={estado} onValueChange={v => setEstado(v as TurnoEstado)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TURNO_ESTADOS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: val.color }} />
                        {val.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground text-sm">No se pudo cargar el turno</div>
        )}

        {/* Footer */}
        {detail && (
          <div className="flex justify-end gap-2 px-5 py-3 border-t bg-background">
            <Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
            <Button
              size="sm"
              className="bg-[#0F6E56] hover:bg-[#0a5c48] text-white"
              onClick={handleSave}
              disabled={saving}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Guardar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
