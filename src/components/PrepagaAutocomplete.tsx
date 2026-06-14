import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';

interface ObraSocial { id: string; nombre: string; codigo: string; }

interface Props {
  value: string | null;
  onSelect: (id: string | null, nombre: string) => void;
  placeholder?: string;
}

export function PrepagaAutocomplete({ value, onSelect, placeholder = 'Buscar obra social...' }: Props) {
  const { centroId } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ObraSocial[]>([]);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<ObraSocial[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Cargar todas las obras sociales activas del centro
  useEffect(() => {
    if (!centroId) return;
    supabase
      .from('obras_sociales')
      .select('id, nombre, codigo')
      .eq('activa', true)
      .order('nombre')
      .then(({ data }) => setAll(data ?? []));
  }, [centroId]);

  // Cuando cambia el valor externo, mostrar el nombre en el input
  useEffect(() => {
    if (value && all.length > 0) {
      const found = all.find(o => o.id === value);
      if (found) setQuery(found.nombre);
    } else if (!value) {
      setQuery('');
    }
  }, [value, all]);

  // Filtrar por query
  useEffect(() => {
    if (query.length > 0 && open) {
      setResults(
        all.filter(o =>
          o.nombre.toLowerCase().includes(query.toLowerCase()) ||
          o.codigo.toLowerCase().includes(query.toLowerCase())
        )
      );
    } else {
      setResults([]);
    }
  }, [query, all, open]);

  // Cerrar al clickear afuera
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    onSelect(null, '');
  };

  return (
    <div className="relative" ref={ref}>
      <Input
        value={query}
        onChange={handleChange}
        onFocus={() => { if (query.length > 0) setOpen(true); }}
        placeholder={placeholder}
        className="h-9 text-[13px]"
      />
      {open && results.length > 0 && (
        <div className="absolute z-[200] top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-52 overflow-auto">
          {results.map(o => (
            <button
              key={o.id}
              type="button"
              className="w-full text-left px-3 py-2 text-[13px] hover:bg-accent transition-colors text-foreground flex items-center justify-between gap-2"
              onClick={() => { onSelect(o.id, o.nombre); setQuery(o.nombre); setOpen(false); }}
            >
              <span>{o.nombre}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{o.codigo}</span>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && query.length > 1 && (
        <div className="absolute z-[200] top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md px-3 py-2">
          <p className="text-[12px] text-muted-foreground">No se encontró "{query}" — verificá en Gestión de Obras Sociales</p>
        </div>
      )}
    </div>
  );
}
