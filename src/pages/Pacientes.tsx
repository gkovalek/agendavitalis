import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Search, UserPlus, Loader2, ArrowLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PacienteProfile } from '@/components/PacienteProfile';
import { useIsMobile } from '@/hooks/use-mobile';

interface Paciente {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  celular: string;
  email: string;
  fecha_nacimiento: string;
  obra_social_id: string | null;
}

export default function Pacientes() {
  const { centroId } = useAuth();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => { fetchPacientes(); }, [centroId]);

  const fetchPacientes = async () => {
    if (!centroId) return;
    setLoading(true);
    const { data } = await supabase.from('pacientes').select('*').eq('centro_id', centroId).order('apellido', { ascending: true });
    setPacientes(data ?? []);
    setLoading(false);
  };

  const filtered = pacientes.filter((p) => {
    const term = search.toLowerCase();
    return (p.nombre?.toLowerCase().includes(term)) || (p.apellido?.toLowerCase().includes(term)) || (p.dni?.includes(term)) || (p.celular?.includes(term));
  });

  if (selectedId) {
    return (
      <div className="animate-fade-in">
        <Button variant="ghost" className="mb-4" onClick={() => setSelectedId(null)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Pacientes
        </Button>
        <PacienteProfile pacienteId={selectedId} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Pacientes</h1>
          <p className="text-sm text-muted-foreground">{pacientes.length} pacientes registrados</p>
        </div>
        <Button onClick={() => navigate('/pacientes/nuevo')} className="w-full sm:w-auto">
          <UserPlus className="h-4 w-4 mr-2" /> Nuevo Paciente
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nombre, DNI o celular..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:px-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No se encontraron pacientes</p>
          ) : isMobile ? (
            <div className="divide-y">
              {filtered.map((p) => (
                <button key={p.id} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors" onClick={() => setSelectedId(p.id)}>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{p.apellido}, {p.nombre}</p>
                    <p className="text-xs text-muted-foreground">DNI {p.dni} · {p.celular}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Apellido</TableHead><TableHead>Nombre</TableHead><TableHead>DNI</TableHead><TableHead className="hidden md:table-cell">Celular</TableHead><TableHead className="hidden lg:table-cell">Email</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedId(p.id)}>
                      <TableCell className="font-medium">{p.apellido}</TableCell>
                      <TableCell>{p.nombre}</TableCell>
                      <TableCell>{p.dni}</TableCell>
                      <TableCell className="hidden md:table-cell">{p.celular}</TableCell>
                      <TableCell className="hidden lg:table-cell">{p.email}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
