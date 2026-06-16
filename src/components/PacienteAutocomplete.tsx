import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';

export interface PacienteOption {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
}

interface Props {
  onSelect: (paciente: PacienteOption | null) => void;
  placeholder?: string;
  initialValue?: string;
}

export function PacienteAutocomplete({ onSelect, placeholder = 'Buscar por nombre, apellido o DNI...', initialValue = '' }: Props) {
  const { centroId } = useAuth();
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<PacienteOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const search = async (q: string) => {
    if (!centroId || q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);

    const isNumeric = /^\d+$/.test(q.trim());
    let query_builder = supabase
      .from('pacientes')
      .select('id, nombre, apellido, dni')
      .eq('centro_id', centroId)
      .limit(8);

    if (isNumeric) {
      query_builder = query_builder.ilike('dni', `%${q.trim()}%`);
    } else {
      // Buscar en nombre o apellido
      query_builder = query_builder.or(`nombre.ilike.%${q.trim()}%,apellido.ilike.%${q.trim()}%`);
    }

    const { data } = await query_builder.order('apellido');
    setResults((data ?? []) as PacienteOption[]);
    setOpen(true);
    setLoading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onSelect(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (p: PacienteOption) => {
    setQuery(`${p.apellido}, ${p.nombre}`);
    setOpen(false);
    onSelect(p);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={handleChange}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder={placeholder}
          className="pl-9 pr-8"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-[200] top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-56 overflow-auto">
          {results.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p)}
              className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-accent transition-colors flex items-baseline gap-2"
            >
              <span className="font-medium text-foreground">
                {p.apellido.toUpperCase()}, {p.nombre}
              </span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                DI: {p.dni}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && query.trim().length >= 2 && !loading && (
        <div className="absolute z-[200] top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md px-3 py-2">
          <p className="text-[12px] text-muted-foreground">No se encontraron pacientes</p>
        </div>
      )}
    </div>
  );
}
