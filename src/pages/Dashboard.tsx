import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Users, Clock, CheckCircle } from 'lucide-react';

interface TurnoResumen {
  total: number;
  confirmados: number;
  pendientes: number;
}

export default function Dashboard() {
  const [totalPacientes, setTotalPacientes] = useState(0);
  const [turnosHoy, setTurnosHoy] = useState<TurnoResumen>({ total: 0, confirmados: 0, pendientes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const today = new Date().toISOString().split('T')[0];

      const [pacientesRes, turnosRes] = await Promise.all([
        supabase.from('pacientes').select('id', { count: 'exact', head: true }),
        supabase.from('turnos').select('*').gte('fecha', today).lte('fecha', today),
      ]);

      setTotalPacientes(pacientesRes.count ?? 0);

      const turnos = turnosRes.data ?? [];
      setTurnosHoy({
        total: turnos.length,
        confirmados: turnos.filter((t: any) => t.estado === 'confirmado').length,
        pendientes: turnos.filter((t: any) => t.estado === 'pendiente').length,
      });

      setLoading(false);
    };

    fetchData();
  }, []);

  const stats = [
    {
      title: 'Turnos Hoy',
      value: turnosHoy.total,
      icon: Calendar,
      description: 'Total de turnos agendados',
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      title: 'Confirmados',
      value: turnosHoy.confirmados,
      icon: CheckCircle,
      description: 'Turnos confirmados hoy',
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      title: 'Pendientes',
      value: turnosHoy.pendientes,
      icon: Clock,
      description: 'Esperando confirmación',
      color: 'text-warning',
      bg: 'bg-warning/10',
    },
    {
      title: 'Pacientes',
      value: totalPacientes,
      icon: Users,
      description: 'Pacientes registrados',
      color: 'text-info',
      bg: 'bg-info/10',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Panel Principal</h1>
        <p className="text-muted-foreground">Resumen del día — {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {loading ? '—' : stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
