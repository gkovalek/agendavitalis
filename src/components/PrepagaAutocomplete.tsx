import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CENTRO_ID } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';

interface Prepaga {
  id: string;
  nombre: string;
}

interface Props {
  value: string | null;
  onSelect: (id: string | null, nombre: string) => void;
}

export function PrepagaAutocomplete({ value, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Prepaga[]>([]);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<Prepaga[]>([]);
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('prepagas').select('id, nombre').order('nombre').then(({ data }) => {
      setAll(data ?? []);
    });
  }, []);

  useEffect(() => {
    if (query.length > 0) {
      setResults(all.filter(p => p.nombre.toLowerCase().includes(query.toLowerCase())));
      setOpen(true);
    } else {
      setResults([]);
      setOpen(false);
    }
  }, [query, all]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleCreate = async () => {
    if (!query.trim()) return;
    const { data, error } = await supabase
      .from('prepagas')
      .insert({ nombre: query.trim() })
      .select('id, nombre')
      .single();
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (data) {
      setAll(prev => [...prev, data]);
      onSelect(data.id, data.nombre);
      setQuery(data.nombre);
      setOpen(false);
    }
  };

  return (
    <div className="space-y-1 relative" ref={ref}>
      <Label>Obra Social</Label>
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); onSelect(null, ''); }}
        placeholder="Buscar obra social..."
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
          {results.map(p => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors text-foreground"
              onClick={() => { onSelect(p.id, p.nombre); setQuery(p.nombre); setOpen(false); }}
            >
              {p.nombre}
            </button>
          ))}
          {results.length === 0 && query.length > 0 && (
            <div className="p-2">
              <p className="text-xs text-muted-foreground mb-1">No se encontró "{query}"</p>
              <Button type="button" size="sm" variant="outline" className="w-full" onClick={handleCreate}>
                <Plus className="w-3 h-3 mr-1" /> Crear "{query}"
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
